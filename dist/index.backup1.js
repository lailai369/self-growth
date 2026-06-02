import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ChatLogger } from "./chat-logger";
import { PreferenceExtractor } from "./preference-extractor";
import { TaskTracker } from "./task-tracker";
import { SkillGenerator } from "./skill-generator";
import { SkillOptimizer } from "./skill-optimizer";
import { DailyReviewer } from "./daily-review";
import { MemoryManager } from "./memory-manager";
import * as fs from 'fs/promises';
import { readFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { loadActivation } from './payment';
import { SyncClient } from './sync-client';
const CONFIG = {
    LLM_BASE_URL: 'http://127.0.0.1:18789/v1',
    CLOUD_URL: 'http://115.28.208.50:3000',
    LLM_TIMEOUT_MS: 10000,
    MAX_LONG_TERM_GOALS: 20,
    SKILL_COUNT_CACHE_TTL_MS: 30000,
    CONTEXT_MAX_ITEMS: 5,
};
function tokenize(text) {
    return new Set(text.toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1));
}
function jaccardSimilarity(a, b) {
    const setA = tokenize(a);
    const setB = tokenize(b);
    if (setA.size === 0 || setB.size === 0)
        return 0;
    let intersection = 0;
    for (const w of setA) {
        if (setB.has(w))
            intersection++;
    }
    return intersection / (setA.size + setB.size - intersection);
}
function extractText(msg) {
    if (!msg?.content)
        return '';
    if (typeof msg.content === 'string')
        return msg.content;
    if (Array.isArray(msg.content))
        return msg.content.map((c) => c.text || '').join('');
    if (typeof msg.content === 'object')
        return msg.content.text || '';
    return '';
}
let _state = null;
let _initPromise = null;
function getBasePath() {
    return path.resolve(__dirname, '..');
}
function getSkillsPath() {
    const p = path.join(getBasePath(), 'skills');
    try {
        mkdirSync(p, { recursive: true });
    }
    catch { }
    return p;
}
async function ensureInit() {
    if (_state)
        return true;
    if (!_initPromise) {
        _initPromise = (async () => {
            const basePath = getBasePath();
            const skillsPath = getSkillsPath();
            const chatLogger = new ChatLogger(path.join(basePath, 'chat_logs'));
            const preferenceExtractor = new PreferenceExtractor();
            const taskTracker = new TaskTracker(path.join(basePath, 'memory'));
            const skillGenerator = new SkillGenerator(skillsPath);
            const skillOptimizer = new SkillOptimizer(skillsPath);
            const dailyReviewer = new DailyReviewer(chatLogger, preferenceExtractor, taskTracker, skillOptimizer, CONFIG.LLM_BASE_URL, '', path.join(basePath, 'memory'));
            const memoryManager = new MemoryManager(path.join(basePath, 'memory'));
            let personality = "";
            try {
                personality = readFileSync(path.join(basePath, "PERSONALITY.md"), "utf-8");
            }
            catch { }
            skillGenerator.manageLifecycle();
            await memoryManager.boot();
            memoryManager.autoDegrade();
            loadActivation(basePath).then(a => {
                if (a.plan !== 'free')
                    new SyncClient({ serverUrl: CONFIG.CLOUD_URL, localPath: basePath, interval: 10 * 60 * 1000 }).start(basePath);
            }).catch(() => { });
            _state = {
                chatLogger, taskTracker, skillGenerator, skillOptimizer,
                dailyReviewer, memoryManager, basePath, skillsPath,
                personality, cachedSkillCount: 0, skillCountCacheTime: 0,
            };
            console.log("[Self-Growth] ✅ 初始化完成");
            setTimeout(async () => {
                const rp = path.join(basePath, "memory", ".last_review_date");
                const today = new Date().toISOString().split("T")[0];
                try {
                    if ((await fs.readFile(rp, "utf-8")).trim() !== today) {
                        await dailyReviewer.runDailyReview();
                        await fs.writeFile(rp, today, "utf-8");
                    }
                }
                catch {
                    await dailyReviewer.runDailyReview().catch(() => { });
                    await fs.writeFile(rp, today, "utf-8").catch(() => { });
                }
            }, 5000);
        })();
    }
    await _initPromise;
    return true;
}
async function llmFetch(prompt, maxTokens = 500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.LLM_TIMEOUT_MS);
    try {
        const res = await fetch(`${CONFIG.LLM_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer openclaw"
            },
            body: JSON.stringify({ messages: [{ role: "user", content: prompt }], temperature: 0.1, max_tokens: maxTokens }),
            signal: controller.signal,
        });
        const data = await res.json();
        return data?.choices?.[0]?.message?.content?.trim() || "";
    }
    catch (err) {
        if (err.name !== 'AbortError')
            console.warn("[Self-Growth] ⚠️ LLM 失败:", err.message);
        return "";
    }
    finally {
        clearTimeout(timer);
    }
}
function parseInsightTags(text) {
    const results = [];
    const parts = text.split('[INSIGHT]');
    for (let i = 1; i < parts.length; i++) {
        const endIdx = parts[i].indexOf('[/INSIGHT]');
        if (endIdx === -1)
            continue;
        const content = parts[i].substring(0, endIdx).trim();
        if (content.length > 1 && content.length < 100) {
            results.push({
                text: content,
                type: /事实|发现|注意|情况/.test(content) ? 'fact' : /决定|计划|打算|以后|流程|步骤/.test(content) ? 'decision' : 'preference',
                source: 'agent_insight',
            });
        }
    }
    return results;
}
async function loadLongTermGoals(basePath) {
    try {
        return (await fs.readFile(path.join(basePath, 'memory', 'long_term_goals.md'), 'utf-8')).split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
    }
    catch {
        return [];
    }
}
async function saveLongTermGoals(basePath, newGoals) {
    if (newGoals.length === 0)
        return;
    const goals = await loadLongTermGoals(basePath);
    for (const goal of newGoals) {
        if (!goals.some(g => g.replace(/\s+/g, '') === goal.replace(/\s+/g, '')))
            goals.push(goal);
    }
    if (goals.length > CONFIG.MAX_LONG_TERM_GOALS)
        goals.splice(0, goals.length - CONFIG.MAX_LONG_TERM_GOALS);
    await fs.writeFile(path.join(basePath, 'memory', 'long_term_goals.md'), `# 长期目标\n\n${goals.map(g => `- ${g}`).join('\n')}\n`, 'utf-8');
}
async function loadSkillNames(skillsPath) {
    try {
        return (await fs.readdir(skillsPath, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
    }
    catch {
        return [];
    }
}
async function readSkillContent(skillsPath, name) {
    try {
        return (await fs.readFile(path.join(skillsPath, name, 'SKILL.md'), 'utf-8')).substring(0, 1500);
    }
    catch {
        return '';
    }
}
async function retrievePreferencesAndLessons(basePath, contextText) {
    const prefs = await fs.readFile(path.join(basePath, 'memory/compiled/preferences.md'), 'utf-8').catch(() => '');
    const lessons = await fs.readFile(path.join(basePath, 'memory/compiled/lessons.md'), 'utf-8').catch(() => '');
    const combined = [prefs, lessons].filter(Boolean).join('\n\n');
    if (!combined.trim())
        return '';
    const answer = await llmFetch(`从以下偏好和教训中选出与用户问题最相关的内容。\n\n用户问题：${contextText.substring(0, 300)}\n\n${combined}\n\n返回最相关的内容（原文），每条一行。如果都不相关，返回"无"。`, 600);
    return answer && answer !== '无' ? answer : '';
}
async function unifiedReflection(userText, agentText) {
    const answer = await llmFetch(`分析对话，提取偏好/教训/长期目标。\n用户: ${userText.substring(0, 300)}\nAgent: ${agentText.substring(0, 500)}\n\n格式：\n[偏好] 内容\n[教训] 内容\n[长期] 内容\n无则输出"无"。`, 500);
    const result = { preferences: [], lessons: [], longTermGoals: [] };
    if (!answer)
        return result;
    for (const line of answer.split('\n')) {
        if (line.startsWith('[长期]'))
            result.longTermGoals.push({ text: line.slice(4).trim() });
        else if (line.startsWith('[偏好]'))
            result.preferences.push({ text: line.slice(4).trim(), type: 'preference', source: 'llm_reflection' });
        else if (line.startsWith('[教训]'))
            result.lessons.push({ text: line.trim(), type: 'fact', source: 'error_lesson' });
    }
    return result;
}
export default definePluginEntry({
    id: "self-growth",
    name: "Self Growth Engine",
    description: "让 Agent 具备自我成长、复盘与技能进化能力的插件",
    register(api) {
        console.log("[Self-Growth] 💓 register 调用成功！");
        api.registerTool({
            name: "daily_analyze_tool", label: "每日复盘分析",
            description: "对指定日期的对话进行复盘分析",
            parameters: { type: "object", properties: { date: { type: "string" }, focus: { type: "string" } }, required: ["date"] },
            async execute(_runId, params) {
                await ensureInit();
                const p = params;
                const result = await _state.dailyReviewer.runDailyReview();
                return { details: result, content: [{ type: "text", text: `📅 复盘日期：${p.date}\n\n复盘任务已执行完成。` }] };
            }
        });
        api.registerTool({
            name: "record_session_insight", label: "记录会话洞察",
            description: "将当前会话的关键洞察记录下来",
            parameters: { type: "object", properties: { insight: { type: "string" }, type: { type: "string", enum: ["preference", "fact", "skill_idea"] } }, required: ["insight"] },
            async execute(_runId, params) {
                await ensureInit();
                const p = params;
                const t = (p.type === "fact" || p.type === "skill_idea" || p.type === "preference") ? (p.type === "skill_idea" ? "decision" : p.type) : "preference";
                await _state.memoryManager.addPreference({ text: p.insight, type: t, source: "agent_reflection" });
                return { details: { recorded: true }, content: [{ type: "text", text: "✅ 已记录。" }] };
            }
        });
        ensureInit().catch(() => { });
        api.on("session_start", (event) => {
            if (!_state)
                return;
            try {
                _state.chatLogger.onSessionStart(event.sessionKey);
            }
            catch { }
        });
        api.on("before_prompt_build", async (event) => {
            if (!_state)
                return {};
            try {
                const s = _state;
                const userMessage = event.messages?.[event.messages.length - 1]?.content || "";
                const contextText = typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);
                const [prefLessons, memories, skillNames, goals] = await Promise.all([
                    retrievePreferencesAndLessons(s.basePath, contextText),
                    s.memoryManager.getRelevantMemories(contextText, 5),
                    loadSkillNames(s.skillsPath),
                    loadLongTermGoals(s.basePath),
                ]);
                const skillContents = [];
                if (skillNames.length > 0) {
                    const scored = skillNames
                        .map(name => ({ name, score: jaccardSimilarity(contextText, name) }))
                        .filter(x => x.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 2);
                    for (const sk of scored) {
                        const content = await readSkillContent(s.skillsPath, sk.name);
                        if (content)
                            skillContents.push({ name: sk.name, content });
                    }
                }
                const parts = [];
                if (s.personality)
                    parts.push(s.personality);
                if (memories && memories !== "（暂无用户偏好记录）")
                    parts.push(memories);
                if (prefLessons)
                    parts.push(prefLessons);
                if (goals.length > 0)
                    parts.push(`## 🎯 长期目标\n${goals.map(g => `- ${g}`).join('\n')}`);
                skillContents.forEach(sk => parts.push(`## 📋 技能：${sk.name}\n\n> ⚠️ 请严格按以下技能步骤执行\n\n${sk.content}`));
                const stats = s.memoryManager.getPreferenceStats();
                if (Date.now() - s.skillCountCacheTime > CONFIG.SKILL_COUNT_CACHE_TTL_MS) {
                    s.cachedSkillCount = s.skillGenerator.listGenerated().length;
                    s.skillCountCacheTime = Date.now();
                }
                parts.push(`> ⚠️ 禁止读取 MEMORY.md`, `> 📂 对话记忆: ${s.basePath}/chat_logs/`, `> 📊 ${stats.total} 条偏好 | ${s.cachedSkillCount} 个技能`, `> ⚠️ 技能库路径: ${s.skillsPath}`, `> 🌐 首次使用请访问: ${CONFIG.CLOUD_URL.replace(':3000', '')}/setup.html 完成注册`);
                return { systemPrompt: parts.join("\n") };
            }
            catch {
                return {};
            }
        });
        api.on("agent_end", async (event) => {
            if (!_state)
                return;
            try {
                const s = _state;
                if (!event.messages || event.messages.length < 2)
                    return;
                let userMessage = null, agentMessage = null;
                for (let i = event.messages.length - 1; i >= 0; i--) {
                    const msg = event.messages[i];
                    if (!agentMessage && (msg.role === "assistant" || msg.role === "agent"))
                        agentMessage = msg;
                    else if (!userMessage && msg.role === "user")
                        userMessage = msg;
                    if (userMessage && agentMessage)
                        break;
                }
                if (!userMessage || !agentMessage) {
                    userMessage = event.messages[event.messages.length - 2];
                    agentMessage = event.messages[event.messages.length - 1];
                }
                const userText = extractText(userMessage);
                const agentText = extractText(agentMessage).replace(/^[\s\S]*?<\/think>\s*/g, "").trim();
                if (userText) {
                    s.chatLogger.logUserMessage(userText);
                    s.taskTracker.addTask(userText.substring(0, 30), [userText.substring(0, 50)], "对话任务");
                }
                if (agentText)
                    s.chatLogger.logAgentMessage(agentText);
                if (userText) {
                    unifiedReflection(userText, agentText).then(async (r) => {
                        if (r.preferences.length > 0)
                            await s.memoryManager.addPreferences(r.preferences);
                        if (r.lessons.length > 0)
                            await s.memoryManager.addPreferences(r.lessons);
                        if (r.longTermGoals.length > 0)
                            await saveLongTermGoals(s.basePath, r.longTermGoals.map(g => g.text));
                    }).catch(() => { });
                }
                if (agentText) {
                    for (const ins of parseInsightTags(agentText)) {
                        await s.memoryManager.addPreference(ins);
                    }
                }
                if (event.toolCalls?.length > 0) {
                    const usedSkills = new Set();
                    for (const tc of event.toolCalls) {
                        if (tc.name && !["daily_analyze_tool", "record_session_insight"].includes(tc.name) && !usedSkills.has(tc.name)) {
                            s.skillGenerator.markUsed(tc.name);
                            s.skillOptimizer.recordExecution(tc.name, true, 0);
                            usedSkills.add(tc.name);
                        }
                    }
                }
                if (userText && agentText) {
                    const cleanText = userText.replace(/^\[.*?\]\s*/, "");
                    s.skillGenerator.evaluateAndGenerate({
                        taskName: cleanText.replace(/[\\/:*?"<>|\n\r]/g, '').substring(0, 20) || "未命名任务",
                        steps: [cleanText.substring(0, 50), agentText.substring(0, 50)],
                        category: "自动生成", toolCallCount: 0, turnCount: event.turns || 0,
                    });
                }
                s.skillOptimizer.evaluateAndCleanup().catch(() => { });
            }
            catch (err) {
                console.error("[Self-Growth] ❌ agent_end 异常:", err?.message || err);
            }
        });
        console.log("[Self-Growth] ✅ 注册完成");
    }
});
//# sourceMappingURL=index.backup1.js.map
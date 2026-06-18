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
import { loadActivation, saveActivation } from './payment';
import { loginAndGetToken } from './auth-client';
import { SyncClient } from './sync-client';
import { homedir } from 'os';
import { execSync } from 'child_process';
const CONFIG = {
    LLM_BASE_URL: 'http://127.0.0.1:18789/v1',
    CLOUD_URL: 'http://yulailai.com',
    LLM_TIMEOUT_MS: 10000,
    SKILL_COUNT_CACHE_TTL_MS: 30000,
    CURRENT_VERSION: '3.0.0',
    GITHUB_REPO: 'lailai369/self-growth',
};
function tokenize(text) {
    const result = new Set();
    const chinese = text.match(/[\u4e00-\u9fa5]/g);
    if (chinese)
        chinese.forEach(c => result.add(c));
    const words = text.toLowerCase().replace(/[\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    words.forEach(w => result.add(w));
    return result;
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
let _isProcessingEnd = false;
const _processedSessionKeys = new Map();
let _lastReflectionTime = 0;
let _state = null;
let _initPromise = null;
function getBasePath() {
    // 优先环境变量，否则用 ~/openclaw/extensions/self-growth
    const openclawHome = process.env.OPENCLAW_HOME || path.join(homedir(), 'openclaw');
    const extPath = path.join(openclawHome, 'extensions', 'self-growth');
    try {
        mkdirSync(extPath, { recursive: true });
    }
    catch { }
    return extPath;
}
function getSkillsPath() {
    const p = path.join(getBasePath(), 'skills');
    try {
        mkdirSync(p, { recursive: true });
    }
    catch { }
    return p;
}
async function checkForUpdates(basePath) {
    const sources = [
        `https://yulailai.com/version.json`,
        `https://api.github.com/repos/${CONFIG.GITHUB_REPO}/releases/latest`,
    ];
    for (const url of sources) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            const latest = data?.version || data?.tag_name?.replace('v', '') || '';
            if (latest && latest !== CONFIG.CURRENT_VERSION) {
                console.log(`\n[Self-Growth] 📢 新版本 ${latest} 可用！当前: ${CONFIG.CURRENT_VERSION}`);
                console.log(`[Self-Growth] 📢 更新命令:\n  cd ${basePath} && git pull && npx tsc && openclaw plugins install . --force && openclaw gateway restart\n`);
                return;
            }
        }
        catch { }
    }
}
async function syncMemoryFromCloud(basePath, email) {
    try {
        const auth = await loginAndGetToken(CONFIG.CLOUD_URL, email, basePath);
        if (!auth)
            return;
        // 从云端恢复偏好数据
        const types = ['preference', 'habit', 'fact', 'decision', 'lesson', 'skill'];
        const allItems = [];
        for (const type of types) {
            try {
                const res = await fetch(`${CONFIG.CLOUD_URL}/api/sync/pull?type=${type}`, {
                    headers: { 'Authorization': `Bearer ${auth.token}` },
                    signal: AbortSignal.timeout(10000),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.items) {
                        allItems.push(...data.items);
                    }
                }
            }
            catch { }
        }
        if (allItems.length > 0) {
            const typeLabels = {
                preference: '偏好', habit: '习惯', fact: '事实',
                decision: '决定', lesson: '教训', skill: '技能',
            };
            const groups = {};
            for (const item of allItems) {
                const t = item.type || 'preference';
                if (!groups[t])
                    groups[t] = [];
                groups[t].push(item);
            }
            let markdown = `# 用户偏好\n\n> 自动同步于 ${new Date().toISOString()}\n\n`;
            for (const [type, items] of Object.entries(groups)) {
                markdown += `## ${typeLabels[type] || type}\n\n`;
                for (const item of items) {
                    let text = '';
                    try {
                        text = JSON.parse(item.content || '{}').text || item.content || '';
                    }
                    catch {
                        text = item.content || '';
                    }
                    const stars = '★'.repeat(item.confidence || 1);
                    markdown += `- [${stars}] ${text}\n`;
                }
                markdown += '\n';
            }
            const prefsPath = path.join(basePath, 'memory', 'user_preferences.md');
            await fs.mkdir(path.dirname(prefsPath), { recursive: true });
            await fs.writeFile(prefsPath, markdown);
        }
    }
    catch { }
}
async function pollForActivation(basePath, deviceId, oldEmail) {
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${CONFIG.CLOUD_URL}/api/auth/poll?deviceId=${encodeURIComponent(deviceId)}`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data.ready) {
                if (oldEmail && oldEmail !== data.email) {
                    console.log('[Self-Growth] 🧹 检测到账号切换，清空本地数据...');
                    const dirs = ['memory', 'chat_logs'];
                    for (const dir of dirs) {
                        try {
                            const dirPath = path.join(basePath, dir);
                            const entries = await fs.readdir(dirPath, { withFileTypes: true, recursive: true });
                            for (const entry of entries) {
                                if (entry.isFile())
                                    await fs.unlink(path.join(dirPath, entry.name)).catch(() => { });
                            }
                        }
                        catch { }
                    }
                    try {
                        const skillsDir = path.join(basePath, 'skills');
                        const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true });
                        for (const entry of skillEntries) {
                            if (entry.isDirectory())
                                await fs.rm(path.join(skillsDir, entry.name), { recursive: true }).catch(() => { });
                        }
                    }
                    catch { }
                }
                await saveActivation(basePath, {
                    plan: data.plan || 'free',
                    license: data.token || '',
                    activatedAt: new Date().toISOString(),
                    expiresAt: null,
                    deviceId: data.deviceId || deviceId,
                    email: data.email || '',
                });
                console.log('[Self-Growth] ✅ 激活成功，payment.json 已自动生成');
                return true;
            }
        }
        catch { }
        await new Promise(r => setTimeout(r, 3000));
    }
    return false;
}
async function ensureInit() {
    // 自部署：如果不在 extensions/self-growth 下，自动复制
    const currentDir = path.resolve(__dirname, '..');
    const home = process.env.OPENCLAW_HOME || path.join(homedir(), 'openclaw');
    const targetDir = path.join(home, 'extensions', 'self-growth');
    if (currentDir !== targetDir) {
        try {
            execSync(`xcopy "${currentDir}" "${targetDir}" /E /Y /Q /I`);
            console.log('[Self-Growth] 🔄 已自动部署到:', targetDir);
            console.log('[Self-Growth] 🔄 请重启 OpenClaw 使插件生效');
            process.exit(0);
        }
        catch { }
    }
    if (_state)
        return true;
    if (!_initPromise) {
        _initPromise = (async () => {
            const basePath = getBasePath();
            const skillsPath = getSkillsPath();
            checkForUpdates(basePath).catch(() => { });
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
            let isPro = false;
            let email = '';
            let expiresAt = '';
            let deviceId = '';
            let token = '';
            try {
                const activation = await loadActivation(basePath);
                token = activation?.license || '';
                deviceId = activation?.deviceId || '';
                email = activation?.email || '';
            }
            catch { }
            if (!token && deviceId) {
                console.log('[Self-Growth] ⏳ 等待网页登录激活...');
                const activated = await pollForActivation(basePath, deviceId, email);
                if (activated) {
                    const activation = await loadActivation(basePath);
                    token = activation?.license || '';
                    email = activation?.email || '';
                }
            }
            if (token) {
                try {
                    const res = await fetch(`${CONFIG.CLOUD_URL}/api/auth/verify?deviceId=${encodeURIComponent(deviceId)}`, {
                        signal: AbortSignal.timeout(5000),
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        isPro = data?.plan === 'pro' || data?.plan === 'enterprise';
                        expiresAt = data?.expiresAt || '';
                    }
                    if (email)
                        await syncMemoryFromCloud(basePath, email);
                }
                catch { }
            }
            if (!email && !token && deviceId) {
                console.log("\n╔══════════════════════════════════════╗");
                console.log("║  🌐 首次使用请注册/登录：          ║");
                console.log(`║  https://yulailai.com/setup.html?deviceId=${deviceId}  ║`);
                console.log("╚══════════════════════════════════════╝\n");
                try {
                    require('child_process').exec(`start https://yulailai.com/setup.html?deviceId=${deviceId}`);
                }
                catch { }
            }
            if (isPro && expiresAt) {
                const expDate = new Date(expiresAt);
                const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / 86400000);
                if (daysLeft <= 7 && daysLeft > 0) {
                    console.log(`\n╔══════════════════════════════════════╗`);
                    console.log(`║  ⚠️  Pro 套餐还剩 ${daysLeft} 天到期！       ║`);
                    console.log(`║  🌐 续费链接：                      ║`);
                    console.log(`║  https://yulailai.com/setup.html    ║`);
                    console.log(`╚══════════════════════════════════════╝\n`);
                    try {
                        require('child_process').exec('start https://yulailai.com/setup.html');
                    }
                    catch { }
                }
                if (daysLeft <= 0) {
                    console.log(`\n[Self-Growth] ⚠️ Pro 套餐已过期，降级为 Free\n`);
                    isPro = false;
                }
            }
            if (isPro) {
                try {
                    new SyncClient({ serverUrl: CONFIG.CLOUD_URL, localPath: basePath, interval: 10 * 60 * 1000 }).start(basePath);
                    console.log("[Self-Growth] SyncClient 已启动");
                }
                catch (e) {
                    console.log("[Self-Growth] SyncClient 启动失败:", e?.message);
                }
            }
            _state = {
                chatLogger, taskTracker, skillGenerator, skillOptimizer,
                dailyReviewer, memoryManager, basePath, skillsPath,
                personality, deviceId, cachedSkillCount: 0, skillCountCacheTime: 0,
                isPro,
            };
            console.log(`[Self-Growth] ✅ 初始化完成 (${isPro ? 'Pro' : 'Free'})`);
            if (isPro) {
                setTimeout(async () => {
                    const rp = path.join(basePath, "memory", ".last_review_date");
                    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
                    let lastDate = '';
                    try {
                        lastDate = (await fs.readFile(rp, "utf-8")).trim();
                    }
                    catch { }
                    if (lastDate !== yesterday) {
                        console.log(`[Self-Growth] 📅 补跑昨日复盘: ${yesterday}`);
                        try {
                            await dailyReviewer.runDailyReview();
                        }
                        catch { }
                        await fs.writeFile(rp, yesterday, "utf-8").catch(() => { });
                    }
                }, 10000);
            }
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
                "Authorization": "Bearer 28b671e57e72c23a6a7aaae025bde6cbc7501784c5f7a370"
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
async function unifiedReflection(userText, agentText) {
    const answer = await llmFetch(`分析以下对话，提取内容。

用户: ${userText.substring(0, 300)}
Agent: ${agentText.substring(0, 500)}

格式：
[偏好] 用户习惯或喜好
[教训] Agent犯的错误或需要改进的地方
[长期] 长期目标或长期任务
[经验] 成功完成的事项、可复用的做法
[中断任务] 任务名 | 当前进度 | 关键上下文

[中断任务] 判断规则：
1. 上一个任务没有闭环（无"完成""好了""搞定"等结束语），自动视为中断
2. 用户说中断词（过会说、暂时放、过后再、先跳过、以后处理等）
3. 话题突然切换，上一个任务没完成
4. 用户直接离开或沉默结束
符合任一条件就提取。每行一条。无则输出"无"。`, 600);
    const result = {
        preferences: [], lessons: [], longTermGoals: [],
        experiences: [], interruptedTasks: []
    };
    if (!answer)
        return result;
    for (const line of answer.split('\n')) {
        if (line.startsWith('[长期]'))
            result.longTermGoals.push({ text: line.slice(4).trim(), type: 'decision', source: 'llm_reflection' });
        else if (line.startsWith('[偏好]'))
            result.preferences.push({ text: line.slice(4).trim(), type: 'preference', source: 'llm_reflection' });
        else if (line.startsWith('[教训]'))
            result.lessons.push({ text: line.trim(), type: 'fact', source: 'error_lesson' });
        else if (line.startsWith('[经验]'))
            result.experiences.push({ text: line.trim(), type: 'fact', source: 'experience' });
        else if (line.startsWith('[中断任务]'))
            result.interruptedTasks.push({ text: line.slice(6).trim() });
    }
    return result;
}
async function saveInterruptedTasks(basePath, taskText) {
    const filePath = path.join(basePath, 'memory', 'interrupted_tasks.md');
    const date = new Date().toISOString().split('T')[0];
    const entry = `- [${date}] ${taskText}\n`;
    let existing = '';
    try {
        existing = await fs.readFile(filePath, 'utf-8');
    }
    catch { }
    if (existing.includes(taskText.substring(0, 30)))
        return;
    await fs.writeFile(filePath, existing + entry, 'utf-8');
}
function readInterruptedTasks(basePath) {
    try {
        return readFileSync(path.join(basePath, 'memory', 'interrupted_tasks.md'), 'utf-8').trim();
    }
    catch {
        return '';
    }
}
async function removeInterruptedTask(basePath, taskText) {
    const filePath = path.join(basePath, 'memory', 'interrupted_tasks.md');
    try {
        let content = await fs.readFile(filePath, 'utf-8');
        content = content.split('\n').filter(l => !l.includes(taskText)).join('\n');
        await fs.writeFile(filePath, content.trim() + '\n', 'utf-8');
    }
    catch { }
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
                if (!_state.isPro) {
                    return { details: {}, content: [{ type: "text", text: "🔒 每日复盘是 Pro 功能，请升级套餐。访问 https://yulailai.com/setup.html" }] };
                }
                const p = params;
                const result = await _state.dailyReviewer.runDailyReview();
                return { details: result, content: [{ type: "text", text: `📅 复盘日期：${p.date}\n\n复盘任务已执行完成。` }] };
            }
        });
        api.registerTool({
            name: "record_session_insight", label: "记录会话洞察",
            description: "将当前会话的关键洞察记录下来",
            parameters: { type: "object", properties: { insight: { type: "string" }, type: { type: "string", enum: ["preference", "fact", "skill_idea", "experience", "lesson", "long_term"] } }, required: ["insight"] },
            async execute(_runId, params) {
                await ensureInit();
                const p = params;
                const t = p.type === "long_term" ? "decision" : (p.type === "fact" || p.type === "skill_idea" || p.type === "preference" || p.type === "experience" || p.type === "lesson") ? (p.type === "skill_idea" ? "decision" : p.type) : "preference";
                await _state.memoryManager.addPreference({ text: p.insight, type: t, source: "agent_reflection" });
                return { details: { recorded: true }, content: [{ type: "text", text: "✅ 已记录。" }] };
            }
        });
        api.registerTool({
            name: "manage_interrupted_task",
            label: "管理中断任务",
            description: "添加、完成或列出中断任务",
            parameters: { type: "object", properties: { action: { type: "string", enum: ["add", "complete", "list"] }, task: { type: "string" } }, required: ["action"] },
            async execute(_runId, params) {
                await ensureInit();
                const p = params;
                const basePath = getBasePath();
                if (p.action === "add" && p.task) {
                    await saveInterruptedTasks(basePath, p.task);
                    return { details: { recorded: true }, content: [{ type: "text", text: "✅ 任务已暂存。" }] };
                }
                if (p.action === "complete" && p.task) {
                    await removeInterruptedTask(basePath, p.task);
                    return { details: { recorded: true }, content: [{ type: "text", text: "✅ 任务已完成。" }] };
                }
                if (p.action === "list") {
                    const tasks = readInterruptedTasks(basePath);
                    return { details: { tasks }, content: [{ type: "text", text: tasks || "暂无中断任务。" }] };
                }
                return { details: {}, content: [{ type: "text", text: "❌ 无效操作。" }] };
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
                // 检测"登录"关键词，自动弹网页
                if (/登录\s*self.growth|登录账号|登陆/.test(contextText)) {
                    const url = `https://yulailai.com/setup.html?deviceId=${s.deviceId}`;
                    try {
                        require('child_process').exec(`start ${url}`);
                    }
                    catch { }
                    return { systemPrompt: `已在浏览器打开登录页面：${url}` };
                }
                let memoryBlock = '';
                try {
                    memoryBlock = readFileSync(path.join(s.basePath, 'memory/compiled/memory.md'), 'utf-8');
                }
                catch {
                    try {
                        const prefs = readFileSync(path.join(s.basePath, 'memory/compiled/preferences.md'), 'utf-8');
                        const lessons = readFileSync(path.join(s.basePath, 'memory/compiled/lessons.md'), 'utf-8');
                        memoryBlock = [prefs, lessons].filter(Boolean).join('\n\n');
                    }
                    catch { }
                }
                const skillNames = await loadSkillNames(s.skillsPath);
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
                const interruptedTasks = readInterruptedTasks(s.basePath);
                const parts = [];
                if (s.personality)
                    parts.push(s.personality);
                if (s.isPro) {
                    parts.push(`## 🧭 自主执行协议

收到任何任务时，按以下流程自主完成：

### 第一步：任务连续性检测
- 检查是否有未完成任务被中断，如有，先提醒用户
### 第二步：意图理解（内部思考）
### 第三步：目标定义（内部思考）
### 第四步：搜索 Skill 文件
- 有匹配 → 严格按 Skill 执行
- 无匹配 → 继续第五步
### 第五步：任务分解
📋 执行计划：确认后执行。
### 第六步：自主执行
- 逐步执行，错误自动修复，临时脚本执行完必须删除
### 第七步：闭环验证
- 自检目标是否达成
`);
                }
                if (memoryBlock)
                    parts.push(memoryBlock);
                if (interruptedTasks) {
                    parts.push(`## ⏸️ 未完成任务提醒

以下任务尚未完成，请在回复末尾提醒用户：
${interruptedTasks}

- 用户询问"还有什么任务"时列出
- 用户选择继续某项时，读取进度继续执行
- 任务完成后用 manage_interrupted_task 标记完成
`);
                }
                skillContents.forEach(sk => parts.push(`## 📋 技能：${sk.name}\n\n> ⚠️ 请严格按以下技能步骤执行\n\n${sk.content}`));
                const stats = s.memoryManager.getPreferenceStats();
                if (Date.now() - s.skillCountCacheTime > CONFIG.SKILL_COUNT_CACHE_TTL_MS) {
                    s.cachedSkillCount = s.skillGenerator.listGenerated().length;
                    s.skillCountCacheTime = Date.now();
                }
                parts.push(`> ⚠️ 禁止读取 MEMORY.md`, `> 📂 对话记忆: ${s.basePath}/chat_logs/`, `> 📊 ${stats.total} 条偏好 | ${s.cachedSkillCount} 个技能`, `> ⚠️ 技能库路径: ${s.skillsPath}`, `> 🌐 账户管理: ${CONFIG.CLOUD_URL.replace(':3000', '')}/setup.html （登录/注册/升级套餐）`);
                return { systemPrompt: parts.join("\n") };
            }
            catch {
                return {};
            }
        });
        api.on("agent_end", async (event) => {
            if (_isProcessingEnd)
                return;
            const sessionKey = event.sessionKey || event.session_key || 'default';
            const now = Date.now();
            const lastProcessed = _processedSessionKeys.get(sessionKey) || 0;
            if (now - lastProcessed < 3000)
                return;
            _processedSessionKeys.set(sessionKey, now);
            _isProcessingEnd = true;
            if (event.isError) {
                _isProcessingEnd = false;
                return;
            }
            if (!_state) {
                _isProcessingEnd = false;
                return;
            }
            try {
                const s = _state;
                if (!event.messages || event.messages.length < 2) {
                    _isProcessingEnd = false;
                    return;
                }
                let userText = '';
                for (let i = event.messages.length - 1; i >= 0; i--) {
                    if (event.messages[i].role === 'user') {
                        userText = typeof event.messages[i].content === 'string' ? event.messages[i].content : extractText(event.messages[i]);
                        break;
                    }
                }
                const lastMsg = event.messages[event.messages.length - 1];
                const rawAgentText = typeof lastMsg.content === 'string' ? lastMsg.content : extractText(lastMsg);
                const agentText = rawAgentText.replace(/<\/think>/gi, '').trim();
                if (userText) {
                    s.chatLogger.logUserMessage(userText);
                    s.taskTracker.addTask(userText.substring(0, 30), [userText.substring(0, 50)], "对话任务");
                }
                if (agentText)
                    s.chatLogger.logAgentMessage(agentText);
                if (userText && now - _lastReflectionTime > 10000) {
                    _lastReflectionTime = now;
                    unifiedReflection(userText, agentText).then(async (r) => {
                        if (r.preferences.length > 0)
                            await s.memoryManager.addPreferences(r.preferences);
                        if (r.lessons.length > 0)
                            await s.memoryManager.addPreferences(r.lessons);
                        if (r.experiences.length > 0)
                            await s.memoryManager.addPreferences(r.experiences);
                        if (r.longTermGoals.length > 0)
                            await s.memoryManager.addPreferences(r.longTermGoals);
                        if (r.interruptedTasks.length > 0) {
                            for (const t of r.interruptedTasks)
                                await saveInterruptedTasks(s.basePath, t.text);
                        }
                    }).catch(() => { });
                }
                if (agentText) {
                    for (const ins of parseInsightTags(agentText)) {
                        await s.memoryManager.addPreference(ins);
                    }
                }
                if (s.isPro && event.toolCalls?.length > 0) {
                    const usedSkills = new Set();
                    for (const tc of event.toolCalls) {
                        if (tc.name && !["daily_analyze_tool", "record_session_insight", "manage_interrupted_task"].includes(tc.name) && !usedSkills.has(tc.name)) {
                            s.skillGenerator.markUsed(tc.name);
                            s.skillOptimizer.recordExecution(tc.name, true, 0);
                            usedSkills.add(tc.name);
                        }
                    }
                }
                // 旧的技能自动生成已删除，改为每日复盘阶段三 LLM 判断
                // skillGenerator.evaluateAndGenerate 不再在 agent_end 中调用
                s.skillOptimizer.evaluateAndCleanup().catch(() => { });
            }
            catch (err) {
                console.error("[Self-Growth] ❌ agent_end 异常:", err?.message || err);
            }
            finally {
                _isProcessingEnd = false;
            }
        });
        api.on("before_compaction", (event) => {
            const messages = event.messages || [];
            if (messages.length < 5)
                return;
            const recentAgentMsgs = messages.filter((m) => m.role === 'assistant' || m.role === 'agent').slice(-10);
            const progressLines = [];
            for (const m of recentAgentMsgs) {
                const text = typeof m.content === 'string' ? m.content : extractText(m);
                const steps = text.match(/✅.*完成|📋.*计划|步骤\d+\/\d+/g);
                if (steps)
                    progressLines.push(...steps);
            }
            const firstUserMsg = messages.find((m) => m.role === 'user');
            const taskDescription = firstUserMsg ? (typeof firstUserMsg.content === 'string' ? firstUserMsg.content.substring(0, 200) : extractText(firstUserMsg).substring(0, 200)) : '';
            return {
                compactionPrompt: `## 📊 任务执行进度摘要\n\n### 原始任务\n${taskDescription}\n\n### 已完成步骤\n${progressLines.length > 0 ? progressLines.join('\n') : '（正在进行中）'}\n\n### 当前状态\n- 请根据以上进度摘要继续执行任务\n- 记住已完成的部分，不要重复执行\n- 继续未完成的步骤，直到任务闭环\n`
            };
        });
        console.log("[Self-Growth] ✅ 注册完成");
    }
});
//# sourceMappingURL=index.js.map
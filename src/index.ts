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
};

function tokenize(text: string): Set<string> {
  const result = new Set<string>();
  const chinese = text.match(/[\u4e00-\u9fa5]/g);
  if (chinese) chinese.forEach(c => result.add(c));
  const words = text.toLowerCase().replace(/[\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  words.forEach(w => result.add(w));
  return result;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  return intersection / (setA.size + setB.size - intersection);
}

function extractText(msg: any): string {
  if (!msg?.content) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((c: any) => c.text || '').join('');
  if (typeof msg.content === 'object') return (msg.content as any).text || '';
  return '';
}

let _isProcessingEnd = false;
const _processedSessionKeys = new Map<string, number>();
const _reflectedHashes = new Set<string>();
let _lastLlmCallTime = 0;
const MIN_LLM_INTERVAL_MS = 2000;

let _state: {
  chatLogger: ChatLogger;
  taskTracker: TaskTracker;
  skillGenerator: SkillGenerator;
  skillOptimizer: SkillOptimizer;
  dailyReviewer: DailyReviewer;
  memoryManager: MemoryManager;
  basePath: string;
  skillsPath: string;
  personality: string;
  cachedSkillCount: number;
  skillCountCacheTime: number;
} | null = null;
let _initPromise: Promise<void> | null = null;

function getBasePath(): string {
  return path.resolve(__dirname, '..');
}

function getSkillsPath(): string {
  const p = path.join(getBasePath(), 'skills');
  try { mkdirSync(p, { recursive: true }); } catch {}
  return p;
}

async function ensureInit(): Promise<boolean> {
  if (_state) return true;
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
      try { personality = readFileSync(path.join(basePath, "PERSONALITY.md"), "utf-8"); } catch {}

      skillGenerator.manageLifecycle();
      await memoryManager.boot();
      memoryManager.autoDegrade();

      loadActivation(basePath).then(a => {
        if (a.plan !== 'free') new SyncClient({ serverUrl: CONFIG.CLOUD_URL, localPath: basePath, interval: 10 * 60 * 1000 }).start(basePath);
      }).catch(() => {});

      _state = {
        chatLogger, taskTracker, skillGenerator, skillOptimizer,
        dailyReviewer, memoryManager, basePath, skillsPath,
        personality, cachedSkillCount: 0, skillCountCacheTime: 0,
      };
      console.log("[Self-Growth] ✅ 初始化完成");

      setTimeout(async () => {
        const rp = path.join(basePath, "memory", ".last_review_date");
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        let lastDate = '';
        try { lastDate = (await fs.readFile(rp, "utf-8")).trim(); } catch {}

        if (lastDate !== yesterday) {
          console.log(`[Self-Growth] 📅 补跑昨日复盘: ${yesterday}`);
          try { await dailyReviewer.runDailyReview(); } catch {}
          await fs.writeFile(rp, yesterday, "utf-8").catch(() => {});
        }
      }, 10000);
    })();
  }
  await _initPromise;
  return true;
}

async function llmFetch(prompt: string, maxTokens: number = 500): Promise<string> {
  const elapsed = Date.now() - _lastLlmCallTime;
  if (elapsed < MIN_LLM_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_LLM_INTERVAL_MS - elapsed));
  }
  _lastLlmCallTime = Date.now();

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
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || "";
  } catch (err: any) {
    if (err.name !== 'AbortError') console.warn("[Self-Growth] ⚠️ LLM 失败:", err.message);
    return "";
  } finally { clearTimeout(timer); }
}

function parseInsightTags(text: string): Array<{ text: string; type: 'preference' | 'fact' | 'decision'; source: string }> {
  const results: Array<{ text: string; type: 'preference' | 'fact' | 'decision'; source: string }> = [];
  const parts = text.split('[INSIGHT]');
  for (let i = 1; i < parts.length; i++) {
    const endIdx = parts[i].indexOf('[/INSIGHT]');
    if (endIdx === -1) continue;
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

async function loadLongTermGoals(basePath: string): Promise<string[]> {
  try { return (await fs.readFile(path.join(basePath, 'memory', 'long_term_goals.md'), 'utf-8')).split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim()); } catch { return []; }
}

async function saveLongTermGoals(basePath: string, newGoals: string[]): Promise<void> {
  if (newGoals.length === 0) return;
  const goals = await loadLongTermGoals(basePath);
  for (const goal of newGoals) {
    if (!goals.some(g => g.replace(/\s+/g, '') === goal.replace(/\s+/g, ''))) goals.push(goal);
  }
  if (goals.length > CONFIG.MAX_LONG_TERM_GOALS) goals.splice(0, goals.length - CONFIG.MAX_LONG_TERM_GOALS);
  await fs.writeFile(path.join(basePath, 'memory', 'long_term_goals.md'), `# 长期目标\n\n${goals.map(g => `- ${g}`).join('\n')}\n`, 'utf-8');
}

async function loadSkillNames(skillsPath: string): Promise<string[]> {
  try { return (await fs.readdir(skillsPath, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; }
}

async function readSkillContent(skillsPath: string, name: string): Promise<string> {
  try { return (await fs.readFile(path.join(skillsPath, name, 'SKILL.md'), 'utf-8')).substring(0, 1500); } catch { return ''; }
}

async function unifiedReflection(userText: string, agentText: string) {
  const answer = await llmFetch(`分析对话，提取以下四类内容。\n用户: ${userText.substring(0, 300)}\nAgent: ${agentText.substring(0, 500)}\n\n格式：\n[偏好] 用户习惯或喜好\n[教训] Agent犯的错误或需要改进的地方\n[长期] 长期目标或长期任务\n[经验] 成功完成的事项、可复用的做法\n无则输出"无"。`, 500);
  const result = { preferences: [] as any[], lessons: [] as any[], longTermGoals: [] as any[], experiences: [] as any[] };
  if (!answer) return result;
  for (const line of answer.split('\n')) {
    if (line.startsWith('[长期]')) result.longTermGoals.push({ text: line.slice(4).trim() });
    else if (line.startsWith('[偏好]')) result.preferences.push({ text: line.slice(4).trim(), type: 'preference', source: 'llm_reflection' });
    else if (line.startsWith('[教训]')) result.lessons.push({ text: line.trim(), type: 'fact', source: 'error_lesson' });
    else if (line.startsWith('[经验]')) result.experiences.push({ text: line.trim(), type: 'fact', source: 'experience' });
  }
  return result;
}

async function safeUnifiedReflection(userText: string, agentText: string) {
  const hash = `${userText.substring(0, 100)}|${agentText.substring(0, 100)}`;
  if (_reflectedHashes.has(hash)) return null;
  _reflectedHashes.add(hash);
  if (_reflectedHashes.size > 200) {
    const it = _reflectedHashes.values();
    for (let i = 0; i < 100; i++) _reflectedHashes.delete(it.next().value!);
  }
  return unifiedReflection(userText, agentText);
}

export default definePluginEntry({
  id: "self-growth",
  name: "Self Growth Engine",
  description: "让 Agent 具备自我成长、复盘与技能进化能力的插件",

  register(api: any) {
    console.log("[Self-Growth] 💓 register 调用成功！");

    api.registerTool({
      name: "daily_analyze_tool", label: "每日复盘分析",
      description: "对指定日期的对话进行复盘分析",
      parameters: { type: "object", properties: { date: { type: "string" }, focus: { type: "string" } }, required: ["date"] },
      async execute(_runId: any, params: any) {
        await ensureInit();
        const p = params as { date: string; focus?: string };
        const result = await _state!.dailyReviewer.runDailyReview();
        return { details: result, content: [{ type: "text" as const, text: `📅 复盘日期：${p.date}\n\n复盘任务已执行完成。` }] };
      }
    });

    api.registerTool({
      name: "record_session_insight", label: "记录会话洞察",
      description: "将当前会话的关键洞察记录下来",
      parameters: { type: "object", properties: { insight: { type: "string" }, type: { type: "string", enum: ["preference", "fact", "skill_idea", "experience", "lesson"] } }, required: ["insight"] },
      async execute(_runId: any, params: any) {
        await ensureInit();
        const p = params as { insight: string; type?: string };
        const t = (p.type === "fact" || p.type === "skill_idea" || p.type === "preference" || p.type === "experience" || p.type === "lesson") ? (p.type === "skill_idea" ? "decision" : p.type) : "preference";
        await _state!.memoryManager.addPreference({ text: p.insight, type: t as any, source: "agent_reflection" });
        return { details: { recorded: true }, content: [{ type: "text" as const, text: "✅ 已记录。" }] };
      }
    });

    ensureInit().catch(() => {});

    api.on("session_start", (event: any) => {
      if (!_state) return;
      try { _state.chatLogger.onSessionStart(event.sessionKey); } catch {}
    });

    api.on("before_prompt_build", async (event: any) => {
      if (!_state) return {};
      try {
        const s = _state;
        const userMessage = event.messages?.[event.messages.length - 1]?.content || "";
        const contextText = typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);

        let memoryBlock = '';
        try {
          memoryBlock = readFileSync(path.join(s.basePath, 'memory/compiled/memory.md'), 'utf-8');
        } catch {
          try {
            const prefs = readFileSync(path.join(s.basePath, 'memory/compiled/preferences.md'), 'utf-8');
            const lessons = readFileSync(path.join(s.basePath, 'memory/compiled/lessons.md'), 'utf-8');
            memoryBlock = [prefs, lessons].filter(Boolean).join('\n\n');
          } catch {}
        }

        const skillNames = await loadSkillNames(s.skillsPath);
        const skillContents: Array<{ name: string; content: string }> = [];
        if (skillNames.length > 0) {
          const scored = skillNames
            .map(name => ({ name, score: jaccardSimilarity(contextText, name) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 2);
          for (const sk of scored) {
            const content = await readSkillContent(s.skillsPath, sk.name);
            if (content) skillContents.push({ name: sk.name, content });
          }
        }

        const goals = await loadLongTermGoals(s.basePath);

        const parts: string[] = [];
        if (s.personality) parts.push(s.personality);

        // 本轮思考指南：引导 Agent 像人一样主动思考
        parts.push(`## 🧭 本轮思考指南
在回复用户之前，先自问：
1. 用户的长期目标是什么？本轮对话能推动哪一步？
2. 根据用户的人格和习惯，我需要提醒他什么？
3. 有没有比用户要求更好的替代方案？如果有，提出建议。

不要机械回答，像助手一样主动思考。
`);

        if (memoryBlock) parts.push(memoryBlock);
        if (goals.length > 0) parts.push(`## 🎯 长期目标\n${goals.map(g => `- ${g}`).join('\n')}`);
        skillContents.forEach(sk => parts.push(`## 📋 技能：${sk.name}\n\n> ⚠️ 请严格按以下技能步骤执行\n\n${sk.content}`));

        const stats = s.memoryManager.getPreferenceStats();
        if (Date.now() - s.skillCountCacheTime > CONFIG.SKILL_COUNT_CACHE_TTL_MS) {
          s.cachedSkillCount = s.skillGenerator.listGenerated().length;
          s.skillCountCacheTime = Date.now();
        }

        parts.push(
          `> ⚠️ 禁止读取 MEMORY.md`,
          `> 📂 对话记忆: ${s.basePath}/chat_logs/`,
          `> 📊 ${stats.total} 条偏好 | ${s.cachedSkillCount} 个技能`,
          `> ⚠️ 技能库路径: ${s.skillsPath}`,
          `> 🌐 首次使用请访问: ${CONFIG.CLOUD_URL.replace(':3000', '')}/setup.html 完成注册`
        );
        return { systemPrompt: parts.join("\n") };
      } catch { return {}; }
    });

    api.on("agent_end", async (event: any) => {
      if (_isProcessingEnd) return;
      const sessionKey = event.sessionKey || event.session_key || 'default';
      const now = Date.now();
      const lastProcessed = _processedSessionKeys.get(sessionKey) || 0;
      if (now - lastProcessed < 3000) return;
      _processedSessionKeys.set(sessionKey, now);
      _isProcessingEnd = true;

      if (event.isError) { _isProcessingEnd = false; return; }

      if (!_state) { _isProcessingEnd = false; return; }
      try {
        const s = _state;
        if (!event.messages || event.messages.length < 2) { _isProcessingEnd = false; return; }

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

        if (userText) { s.chatLogger.logUserMessage(userText); s.taskTracker.addTask(userText.substring(0, 30), [userText.substring(0, 50)], "对话任务"); }
        if (agentText) s.chatLogger.logAgentMessage(agentText);

        if (userText) {
          safeUnifiedReflection(userText, agentText).then(async r => {
            if (!r) return;
            if (r.preferences.length > 0) await s.memoryManager.addPreferences(r.preferences);
            if (r.lessons.length > 0) await s.memoryManager.addPreferences(r.lessons);
            if (r.experiences.length > 0) await s.memoryManager.addPreferences(r.experiences);
            if (r.longTermGoals.length > 0) await saveLongTermGoals(s.basePath, r.longTermGoals.map(g => g.text));
          }).catch(() => {});
        }

        if (agentText) {
          for (const ins of parseInsightTags(agentText)) {
            await s.memoryManager.addPreference(ins);
          }
        }

        if (event.toolCalls?.length > 0) {
          const usedSkills = new Set<string>();
          for (const tc of event.toolCalls) {
            if (tc.name && !["daily_analyze_tool", "record_session_insight"].includes(tc.name) && !usedSkills.has(tc.name)) {
              s.skillGenerator.markUsed(tc.name); s.skillOptimizer.recordExecution(tc.name, true, 0); usedSkills.add(tc.name);
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

        s.skillOptimizer.evaluateAndCleanup().catch(() => {});
      } catch (err) {
        console.error("[Self-Growth] ❌ agent_end 异常:", (err as any)?.message || err);
      } finally {
        _isProcessingEnd = false;
      }
    });

    console.log("[Self-Growth] ✅ 注册完成");
  }
});
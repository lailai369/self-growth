import { ChatLogger } from './chat-logger';
import { PreferenceExtractor, Preference } from './preference-extractor';
import { TaskTracker, TaskRecord } from './task-tracker';
import { SkillOptimizer } from './skill-optimizer';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DailyReviewReport {
  date: string;
  summary: string;
  insights: string[];
  topics: string[];
  skillsGenerated: string[];
  newPreferences: Preference[];
}

export class DailyReviewer {
  private chatLogger: ChatLogger;
  private preferenceExtractor: PreferenceExtractor;
  private taskTracker: TaskTracker;
  private skillOptimizer: SkillOptimizer;
  private llmUrl: string;
  private snapshotDir: string;
  private compiledDir: string;
  private rawMemoryPath: string;
  private serverUrl: string;

  constructor(
    chatLogger: ChatLogger,
    preferenceExtractor: PreferenceExtractor,
    taskTracker: TaskTracker,
    skillOptimizer: SkillOptimizer,
    llmUrl: string,
    _llmModel: string,
    storageDir: string
  ) {
    this.chatLogger = chatLogger;
    this.preferenceExtractor = preferenceExtractor;
    this.taskTracker = taskTracker;
    this.skillOptimizer = skillOptimizer;
    this.llmUrl = llmUrl;
    this.snapshotDir = path.join(storageDir, 'snapshots');
    this.compiledDir = path.join(storageDir, 'compiled');
    this.rawMemoryPath = path.join(storageDir, 'user_preferences.md');
    this.serverUrl = process.env.YULAI_SERVER || 'http://localhost:3000';
  }

  async runDailyReview(): Promise<DailyReviewReport> {
    const today = this.formatDate(new Date());
    console.log(`[DailyReviewer] ⏰ 开始每日自动复盘: ${today}`);

    const report: DailyReviewReport = {
      date: today, summary: '', insights: [], topics: [], skillsGenerated: [], newPreferences: []
    };

    let recentLogs = '';
    let readyTasksSnapshot: TaskRecord[] = [];

    try {
      console.log('[DailyReviewer] 📸 正在创建原始数据快照...');
      await fs.mkdir(this.snapshotDir, { recursive: true });
      recentLogs = await this.chatLogger.scanRecent(1);
      if (recentLogs && recentLogs !== '暂无最近聊天记录') {
        await fs.writeFile(path.join(this.snapshotDir, `${today}_logs.txt`), recentLogs, 'utf-8');
      }
      readyTasksSnapshot = this.taskTracker.getReadyTasks();
      if (readyTasksSnapshot.length > 0) {
        await fs.writeFile(path.join(this.snapshotDir, `${today}_tasks.json`), JSON.stringify(readyTasksSnapshot, null, 2), 'utf-8');
      }
      console.log('[DailyReviewer] ✅ 快照完成，开始复盘流程');
    } catch (error) {
      console.error('[DailyReviewer] ⚠️ 快照失败，但继续复盘流程:', error);
    }

    // 阶段一：文字复盘
    try {
      console.log('[DailyReviewer] 📝 阶段一：文字复盘...');
      if (recentLogs && recentLogs !== '暂无最近聊天记录') {
        const reviewResult = await this.callLLM(this.buildReviewPrompt(recentLogs), 800);
        const parsed = this.parseReviewResult(today, reviewResult);
        report.summary = parsed.summary;
        report.insights = parsed.insights;
        report.topics = parsed.topics;
        await this.chatLogger.log(`📝 每日自我复盘\n【今日总结】${parsed.summary}\n【新发现】${parsed.insights.join('；') || '无'}\n【待改进】${parsed.topics.join('；') || '无'}`, 'System');
      } else {
        report.summary = '今日暂无对话记录';
      }
    } catch (error) {
      console.error('[DailyReviewer] ❌ 阶段一失败，继续阶段二:', error);
      report.summary = '文字复盘暂时不可用';
    }

    // 阶段二：偏好提取
    try {
      console.log('[DailyReviewer] 🧠 阶段二：偏好提取...');
      const logsForExtract = recentLogs || await this.chatLogger.scanRecent(1);
      if (logsForExtract && logsForExtract !== '暂无最近聊天记录') {
        const preferences = await this.preferenceExtractor.extractBatch(logsForExtract);
        report.newPreferences = preferences;
        if (preferences.length > 0) console.log(`[DailyReviewer] 发现 ${preferences.length} 条新偏好`);
      }
    } catch (error) {
      console.error('[DailyReviewer] ❌ 阶段二失败，继续阶段三:', error);
    }

    // 阶段三：技能生成（LLM 判断）
    try {
      console.log('[DailyReviewer] 🛠️ 阶段三：技能生成...');
      const logsForSkill = recentLogs || await this.chatLogger.scanRecent(1);
      if (logsForSkill && logsForSkill !== '暂无最近聊天记录') {
        const prompt = `分析以下对话日志，判断是否有任务值得生成 Skill 文件。

判断标准：
1. 流程复杂度：是否需要3步以上？步骤间是否有依赖？
2. 复用频率：历史上是否出现过多次？
3. 标准化程度：每次执行流程是否基本相同？
4. 错误成本：做错了后果严重吗？

对话日志：
${logsForSkill.slice(0, 4000)}

返回 JSON：[{"taskName":"任务名","score":4,"reason":"流程复杂且重复多次","steps":["步骤1","步骤2"]}]
评分≥3才需要生成。如果没有，返回 []。只返回 JSON：`;

        const answer = await this.callLLM(prompt, 500);
        if (answer) {
          try {
            const parsed = JSON.parse((answer || '[]').match(/\[[\s\S]*\]/)?.[0] || '[]');
            const toGenerate = (parsed || []).filter((s: any) => s.score >= 3);
            if (toGenerate.length > 0) {
              console.log(`[DailyReviewer] 发现 ${toGenerate.length} 个可生成的新技能`);
              report.skillsGenerated = await this.skillOptimizer.batchGenerateFromLLM(toGenerate);
            } else {
              console.log('[DailyReviewer] 今日没有需要生成的新技能');
            }
          } catch {
            console.log('[DailyReviewer] 技能生成评估失败，跳过');
          }
        }
      }
    } catch (error) {
      console.error('[DailyReviewer] ❌ 阶段三失败:', error);
    }

    // 阶段四：技能自动优化
    try {
      console.log('[DailyReviewer] 🔧 阶段四：技能自动优化...');
      const logsForOptimize = recentLogs || await this.chatLogger.scanRecent(7);
      if (logsForOptimize && logsForOptimize !== '暂无最近聊天记录') {
        const optimizedCount = await this.skillOptimizer.evaluateAndOptimize(logsForOptimize);
        if (optimizedCount > 0) console.log(`[DailyReviewer] 🎯 优化了 ${optimizedCount} 个技能`);
      }
    } catch (error) {
      console.error('[DailyReviewer] ❌ 阶段四失败:', error);
    }

    // 阶段四点五：记忆编译
    try {
      console.log('[DailyReviewer] 🗂️ 阶段四点五：记忆编译...');
      await this.compileMemories(recentLogs);
    } catch (error) {
      console.error('[DailyReviewer] ❌ 阶段四点五失败:', error);
    }

    // 阶段五：插件自我反思
    try {
      console.log('[DailyReviewer] 💭 阶段五：插件自我反思...');
      const logsForReflection = recentLogs || await this.chatLogger.scanRecent(7);
      if (logsForReflection && logsForReflection !== '暂无最近聊天记录') {
        const reflection = await this.callLLM(`你是一个插件自我反思助手。分析以下对话日志，思考 self-growth 插件还有哪些可以改进的地方：\n1. 有没有用户的偏好或习惯没有被插件捕捉到？\n2. 插件的哪些功能可能不够好用？\n3. 有没有可以新增的功能来更好地服务用户？\n\n对话日志：\n${logsForReflection.slice(0, 4000)}\n\n请给出1-3条具体的改进建议，每条一行：`, 500);
        if (reflection) {
          try {
            await fetch(`${this.serverUrl}/api/suggestion/report`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ suggestion: reflection, plugin_version: '3.0.0', agent: 'OpenClaw', timestamp: new Date().toISOString() })
            });
          } catch { /* ignore */ }
        }
      }
    } catch (error) {
      console.error('[DailyReviewer] ❌ 阶段五失败:', error);
    }

    try { await this.pruneOldPreferences(); } catch {}

    this.taskTracker.reset();
    console.log(`[DailyReviewer] ✅ 每日复盘完成: ${today}`);
    return report;
  }

  private async compileMemories(recentLogs: string): Promise<void> {
    let rawMemory = '';
    try { rawMemory = await fs.readFile(this.rawMemoryPath, 'utf-8'); } catch {}

    const chatLogs = recentLogs || await this.chatLogger.scanRecent(1) || '';
    if (chatLogs.length < 50 && rawMemory.length < 100) return;

    await fs.mkdir(this.compiledDir, { recursive: true });

    let oldMemory = '';
    const memoryPath = path.join(this.compiledDir, 'memory.md');
    try { oldMemory = await fs.readFile(memoryPath, 'utf-8'); } catch {}

    const prompt = `你是用户的数字记忆中枢。请根据以下对话日志和偏好记录，生成结构化记忆。

## 要求

### 输出格式（严格按此结构，不要添加其他内容）：

## 📋 工作记忆
### 进行中的项目
- 项目名：当前进度、待解决问题、上次操作日期

## ✅ 经验（成功经验，可复用）
### [分类名称]
- [日期] 具体经验。来源：做了什么

## ⚠️ 教训（犯过的错，下次避开）
### [分类名称]
- [日期] 具体教训。来源：什么场景下发生的

## 👤 用户人格
### 沟通风格
- 具体偏好

### 技术偏好
- 具体偏好

### 决策模式
- 具体习惯

### 工作习惯
- 具体习惯

## 🗣️ 沟通模式（用户说A = 真实意图是B）
- 用户说"xxx"时 = 实际希望我做xxx
- 从对话中提取用户的语言习惯和真实意图的对应关系
- 每条必须来源于实际对话，有具体例子

## 规则
1. 同类经验教训合并，相似内容去重，只保留最精炼的版本
2. 每条必须包含日期和来源
3. 用户人格从对话中的互动模式、反馈、纠正中提取
4. 沟通模式从用户的表达方式和后续反应中推断
5. 如果某区块没有新内容，保留旧内容不变
6. 所有内容必须来源于数据，不要编造
7. 经验是成功完成的、可复用的做法；教训是犯错后总结的、下次要避开的

## 旧记忆（有则合并，无则忽略）：
${oldMemory.slice(0, 3000)}

## 今日对话日志：
${chatLogs.slice(0, 4000)}

## 偏好记录：
${rawMemory.slice(0, 3000)}

请输出完整的 memory.md 内容：`;

    const compiled = await this.callLLM(prompt, 3000);
    if (!compiled) return;

    await fs.writeFile(memoryPath, compiled.trim(), 'utf-8');
    console.log('[DailyReviewer] 📦 结构化记忆已更新: memory.md');
  }

  private async pruneOldPreferences(): Promise<void> {
    try {
      const content = await fs.readFile(this.rawMemoryPath, 'utf-8');
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const lines = content.split('\n');
      const kept: string[] = [];
      let removed = 0;
      for (const line of lines) {
        const dateMatch = line.match(/\[(\d{4}-\d{2}-\d{2})\]/);
        if (dateMatch) {
          if (now - new Date(dateMatch[1]).getTime() > sevenDaysMs) { removed++; continue; }
        }
        kept.push(line);
      }
      if (removed > 0) {
        await fs.writeFile(this.rawMemoryPath, kept.join('\n'), 'utf-8');
        console.log(`[DailyReviewer] 🧹 清理了 ${removed} 条超过7天的偏好记录`);
      }
    } catch {}
  }

  private buildReviewPrompt(logs: string): string {
    return `分析以下今天的对话日志，完成三件事：\n1. 总结今天的关键对话主题和重要结论（不超过 3 句话）\n2. 发现用户的新偏好或习惯变化（如果有）\n3. 指出今天对话中可以改进的地方\n\n对话日志：\n${logs.slice(0, 4000)}\n\n返回格式：\n【今日总结】...\n【新发现】...（如果没有写"无"）\n【待改进】...（如果没有写"无"）`;
  }

  private parseReviewResult(date: string, result: string | null): { summary: string; insights: string[]; topics: string[] } {
    if (!result) return { summary: '复盘分析暂时不可用', insights: [], topics: [] };
    const summary = this.extractSection(result, '今日总结');
    const insights = this.extractSection(result, '新发现').split(/[；;，,]/).map(s => s.trim()).filter(s => s.length > 0 && s !== '无');
    const topics = this.extractSection(result, '待改进').split(/[；;，,]/).map(s => s.trim()).filter(s => s.length > 0 && s !== '无');
    return { summary: summary || '复盘分析完成', insights, topics };
  }

  private extractSection(text: string, sectionName: string): string {
    const match = text.match(new RegExp(`【${sectionName}】([\\s\\S]*?)(?=【|$)`, 'i'));
    return match ? match[1].trim() : '';
  }

  private async callLLM(prompt: string, maxTokens: number = 800): Promise<string | null> {
    try {
      const response = await fetch(`${this.llmUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer 28b671e57e72c23a6a7aaae025bde6cbc7501784c5f7a370'
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: maxTokens })
      });
      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || null;
    } catch {
      return null;
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
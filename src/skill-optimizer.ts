import * as fs from 'fs/promises';
import * as path from 'path';

export interface TaskRecord {
  name: string;
  category: string;
  count: number;
  steps: string[];
  history: Array<{ time: string; steps: string[] }>;
  readyForSkill: boolean;
  runIds: string[];
}

export interface DiagnosisResult {
  problemsFound: boolean;
  diagnosis: string;
  patchInstruction: string;
}

interface SkillScoreRecord {
  recentScores: number[];
  optimizeCount: number;
  usageCount: number;
  lastUsed: number;
}

export interface UpgradeSuggestion {
  skillName: string;
  currentScore: number;
  suggestion: string;
  generatedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export class SkillOptimizer {
  private skillsDir: string;
  private llmUrl: string;
  private llmModel: string;
  private scores: Map<string, SkillScoreRecord>;
  private pendingUpgradesPath: string;

  constructor(
    storageDir: string = './memory',
    llmUrl: string = 'http://127.0.0.1:1234/v1',
    llmModel: string = 'qwen/qwen3.5-9b'
  ) {
    this.skillsDir = path.join(storageDir, 'skills');
    this.llmUrl = llmUrl;
    this.llmModel = llmModel;
    this.scores = new Map();
    this.pendingUpgradesPath = path.join(this.skillsDir, 'pending_upgrades.json');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
  }

  async generateSkill(taskRecord: TaskRecord): Promise<string> {
    const skillName = taskRecord.name;
    const skillDir = path.join(this.skillsDir, skillName);
    const skillFilePath = path.join(skillDir, 'SKILL.md');

    await fs.mkdir(skillDir, { recursive: true });

    const content = this.buildSkillMarkdown(skillName, taskRecord);

    try {
      await fs.writeFile(skillFilePath, content, 'utf-8');
      console.log(`[SkillOptimizer] ✨ 成功生成 SKILL.md: ${skillFilePath}`);
      return skillFilePath;
    } catch (error) {
      console.error(`[SkillOptimizer] ❌ 生成 SKILL.md 失败 [${skillName}]:`, error);
      throw error;
    }
  }

  async batchGenerate(readyTasks: TaskRecord[]): Promise<string[]> {
    const generatedFiles: string[] = [];
    for (const task of readyTasks) {
      try {
        const filePath = await this.generateSkill(task);
        generatedFiles.push(filePath);
      } catch (error) {
        console.warn(`[SkillOptimizer] ⚠️ 跳过任务 [${task.name}]:`, error);
      }
    }
    return generatedFiles;
  }

  async batchGenerateFromLLM(tasks: Array<{ taskName: string; steps: string[]; reason: string }>): Promise<string[]> {
    const generatedFiles: string[] = [];
    for (const task of tasks) {
      try {
        const taskRecord: TaskRecord = {
          name: task.taskName,
          category: "自动生成",
          count: 1,
          steps: task.steps,
          history: [{ time: new Date().toISOString(), steps: task.steps }],
          readyForSkill: true,
          runIds: []
        };
        const filePath = await this.generateSkill(taskRecord);
        generatedFiles.push(filePath);
      } catch (error) {
        console.warn(`[SkillOptimizer] ⚠️ 跳过任务 [${task.taskName}]:`, error);
      }
    }
    return generatedFiles;
  }

  async listGenerated(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .filter(e => {
          const skillFile = path.join(this.skillsDir, e.name, 'SKILL.md');
          return fs.access(skillFile).then(() => true).catch(() => false);
        })
        .map(e => e.name);
    } catch {
      return [];
    }
  }

  async getExistingSkill(skillName: string): Promise<string | null> {
    const skillFilePath = path.join(this.skillsDir, skillName, 'SKILL.md');
    try {
      return await fs.readFile(skillFilePath, 'utf-8');
    } catch {
      return null;
    }
  }

  recordExecution(skillName: string, success: boolean, durationMs: number, hadManualFix: boolean = false): boolean {
    if (!this.scores.has(skillName)) {
      this.scores.set(skillName, { recentScores: [], optimizeCount: 0, usageCount: 0, lastUsed: Date.now() });
    }

    const record = this.scores.get(skillName)!;
    record.usageCount += 1;
    record.lastUsed = Date.now();

    let score = 100;
    if (!success) score -= 30;
    if (durationMs > 60000) score -= 15;
    if (hadManualFix) score -= 25;

    record.recentScores.push(score);
    if (record.recentScores.length > 10) {
      record.recentScores.shift();
    }

    const recent = record.recentScores;
    if (recent.length >= 3 && recent.slice(-3).every(s => s < 80)) {
      return true;
    }
    return false;
  }

  async calculateComprehensiveScore(skillName: string): Promise<{ total: number; reuse: number; quality: number; structure: number }> {
    const record = this.scores.get(skillName) || { recentScores: [], optimizeCount: 0, usageCount: 0, lastUsed: 0 };
    const content = await this.getExistingSkill(skillName);

    let reuse = 0;
    if (record.usageCount >= 10) reuse += 20;
    else if (record.usageCount >= 5) reuse += 15;
    else if (record.usageCount >= 1) reuse += 10;
    const daysSinceUsed = (Date.now() - record.lastUsed) / 86400000;
    if (daysSinceUsed < 7) reuse += 10;
    else if (daysSinceUsed < 30) reuse += 5;
    if (daysSinceUsed < 1) reuse += 10;

    let quality = 0;
    const recentScores = record.recentScores.slice(-10);
    if (recentScores.length > 0) {
      const avgScore = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
      quality = Math.round(avgScore * 0.4);
    } else {
      quality = 20;
    }

    let structure = 0;
    if (content) {
      if (/## 🔄 核心工作流/.test(content)) structure += 5;
      if (/## ✅ 完成标准/.test(content)) structure += 5;
      if (/## ⚠️ 注意事项|## 🚫 不适用/.test(content)) structure += 5;
      if (content.split('\n').filter(l => /^\d+\./.test(l.trim())).length >= 3) structure += 5;
    }

    return { total: reuse + quality + structure, reuse, quality, structure };
  }

  async evaluateAndCleanup(): Promise<UpgradeSuggestion[]> {
    const skillNames = await this.listGenerated();
    const suggestions: UpgradeSuggestion[] = [];
    const now = Date.now();

    for (const skillName of skillNames) {
      const score = await this.calculateComprehensiveScore(skillName);
      const record = this.scores.get(skillName);

      if (score.total < 50) {
        const skillDir = path.join(this.skillsDir, skillName);
        try { await fs.rm(skillDir, { recursive: true }); } catch {}
        console.log(`[SkillOptimizer] 🗑️ 技能评分过低(${score.total}分)，已删除: ${skillName}`);
        continue;
      }

      if (score.total < 80) {
        const content = await this.getExistingSkill(skillName);
        if (content && this.parseStatus(content) === 'watch') {
          const skillDir = path.join(this.skillsDir, skillName);
          try { await fs.rm(skillDir, { recursive: true }); } catch {}
          console.log(`[SkillOptimizer] 🗑️ 观察期技能评分不足(${score.total}分)，已删除: ${skillName}`);
          continue;
        }
      }

      const daysSinceUsed = (now - (record?.lastUsed || 0)) / 86400000;
      if (record && record.usageCount >= 3 && daysSinceUsed <= 7 && score.total >= 50 && score.total < 80) {
        const suggestion = await this.generateUpgradeSuggestion(skillName, score.total);
        suggestions.push(suggestion);
        console.log(`[SkillOptimizer] 💡 生成升级建议: ${skillName}（评分:${score.total} 使用:${record.usageCount}次）`);
      }
    }

    if (suggestions.length > 0) {
      await fs.writeFile(this.pendingUpgradesPath, JSON.stringify(suggestions, null, 2), 'utf-8');
    } else {
      try { await fs.unlink(this.pendingUpgradesPath); } catch {}
    }

    return suggestions;
  }

  private async generateUpgradeSuggestion(skillName: string, currentScore: number): Promise<UpgradeSuggestion> {
    const content = await this.getExistingSkill(skillName);
    let suggestion = `建议优化"${skillName}"技能（当前评分${currentScore}），可考虑：简化冗余步骤、补充完成标准、添加不适用场景说明。`;

    if (content) {
      try {
        const prompt = `分析以下技能文件，给出1-2条具体的优化建议（每条约20字）：
${content.substring(0, 1500)}

评分较低的原因可能有：步骤冗余、缺少完成标准、缺少边界说明。请直接输出建议：`;
        const llmSuggestion = await this.callLLM(prompt, 200);
        if (llmSuggestion) suggestion = llmSuggestion;
      } catch {}
    }

    return { skillName, currentScore, suggestion, generatedAt: new Date().toISOString(), status: 'pending' };
  }

  async getPendingUpgrades(): Promise<UpgradeSuggestion[]> {
    try {
      const data = await fs.readFile(this.pendingUpgradesPath, 'utf-8');
      return JSON.parse(data);
    } catch { return []; }
  }

  async updateUpgradeStatus(skillName: string, status: 'approved' | 'rejected'): Promise<void> {
    const upgrades = await this.getPendingUpgrades();
    const updated = upgrades.filter(u => u.skillName !== skillName);
    if (updated.length === 0) {
      try { await fs.unlink(this.pendingUpgradesPath); } catch {}
    } else {
      await fs.writeFile(this.pendingUpgradesPath, JSON.stringify(updated, null, 2), 'utf-8');
    }
  }

  getAverageScore(skillName: string): number {
    const record = this.scores.get(skillName);
    if (!record || record.recentScores.length === 0) return 100;
    const recent = record.recentScores.slice(-5);
    return recent.reduce((sum, s) => sum + s, 0) / recent.length;
  }

  resetScores(skillName: string): void {
    const record = this.scores.get(skillName);
    if (record) { record.recentScores = []; record.optimizeCount += 1; }
  }

  async detectChanges(skillName: string, recentLogs: string): Promise<string | null> {
    const prompt = `分析以下对话日志，判断"${skillName}"技能的使用模式是否发生了变化。如果有变化，简要说明；如果没有，回复"无变化"。\n\n对话日志：\n${recentLogs.slice(0, 3000)}`;
    const response = await this.callLLM(prompt, 300);
    return response && response !== '无变化' ? response : null;
  }

  async diagnoseAndPatch(skillName: string, skillContent: string, recentLogs: string): Promise<DiagnosisResult> {
    const prompt = `分析以下日志，诊断"${skillName}"技能的缺陷：\n1. 哪些步骤经常失败？原因是什么？\n2. 用户在对话中如何进行手动修正？\n3. 提供精确的修改方案，只修改有问题的部分。\n\n旧版 SKILL.md：\n${skillContent.slice(0, 3000)}\n\n最近对话日志：\n${recentLogs.slice(0, 3000)}\n\n返回 JSON：{"problemsFound": true/false, "diagnosis": "...", "patchInstruction": "..."}`;
    const response = await this.callLLM(prompt, 1000);
    try { return JSON.parse(response || '{}') as DiagnosisResult; }
    catch { return { problemsFound: false, diagnosis: '', patchInstruction: '' }; }
  }

  async applyPatch(skillPath: string, patchInstruction: string): Promise<boolean> {
    if (!patchInstruction) return false;
    try {
      const oldContent = await fs.readFile(skillPath, 'utf-8');
      const prompt = `根据以下指令修改 SKILL.md 文件。保留 YAML frontmatter 不变，只修改 Markdown 正文。\n原始文件：\n${oldContent}\n\n修改指令：\n${patchInstruction}\n\n返回完整的、可直接保存的 SKILL.md 内容。`;
      let newContent = await this.callLLM(prompt, 3000);
      if (newContent && newContent.length > 200) {
        const frontmatterEnd = oldContent.indexOf('---', 4);
        if (frontmatterEnd !== -1) {
          const oldFrontmatter = oldContent.substring(0, frontmatterEnd + 3);
          const newFrontmatterEnd = newContent.indexOf('---', 4);
          if (newFrontmatterEnd !== -1) {
            const newFrontmatter = newContent.substring(0, newFrontmatterEnd + 3);
            newContent = oldFrontmatter + newContent.substring(newFrontmatter.length);
          }
        }
        await fs.writeFile(skillPath, newContent, 'utf-8');
        return true;
      }
    } catch (error) { console.error('[SkillOptimizer] ❌ 修复失败:', error); }
    return false;
  }

  async evaluateAndOptimize(recentLogs: string): Promise<number> {
    const skillNames = await this.listGenerated();
    let optimizedCount = 0;
    for (const skillName of skillNames) {
      const avgScore = this.getAverageScore(skillName);
      if (avgScore >= 80) continue;
      const skillContent = await this.getExistingSkill(skillName);
      if (!skillContent) continue;
      try {
        const diagnosis = await this.diagnoseAndPatch(skillName, skillContent, recentLogs);
        if (!diagnosis.problemsFound) continue;
        const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
        const patched = await this.applyPatch(skillPath, diagnosis.patchInstruction);
        if (patched) { this.resetScores(skillName); optimizedCount++; }
      } catch (err) { console.error(`[SkillOptimizer] ❌ 技能 "${skillName}" 优化失败:`, err); }
    }
    console.log(`[SkillOptimizer] 📊 本轮共优化 ${optimizedCount} 个技能`);
    return optimizedCount;
  }

  private parseStatus(content: string): string {
    const match = content.match(/status: (.+)/);
    return match ? match[1].trim() : 'active';
  }

  private buildSkillMarkdown(name: string, record: TaskRecord): string {
    const stepsMarkdown = this.optimizeSteps(record.steps)
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n');

    return `---
name: ${name}
description: >
  自动生成的技能。触发条件：用户提到'执行${name}'或相关描述时，自动调用此技能。
  此技能由 self-growth 插件自动生成，基于用户 ${record.count} 次执行此任务的流程。
category: ${record.category}
user-invocable: true
disable-model-invocation: false
---

# ${name}

## 🎯 触发条件
当用户提到执行"${name}"任务时，自动调用此技能。

## 🔄 核心工作流
${stepsMarkdown}

## ✅ 完成标准
- 所有步骤已按顺序执行完毕
- 每步结果已向用户汇报

## 📤 输出与交付
- 每步执行完成后，简要汇报结果
- 全部完成后，输出任务总结

## 📝 技能信息
- **生成时间**: ${new Date().toISOString()}
- **任务类别**: ${record.category}
- **步骤数量**: ${record.steps.length}
- **执行次数**: ${record.count}
- **生成插件**: self-growth
`;
  }

  private optimizeSteps(steps: string[]): string[] {
    if (!steps || steps.length === 0) return [];
    let optimized = steps.map(step => step.trim()).filter(step => step.length > 0);
    return Array.from(new Set(optimized));
  }

  private async callLLM(prompt: string, maxTokens: number = 800): Promise<string | null> {
    try {
      const response = await fetch(`${this.llmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: maxTokens
        })
      });
      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || null;
    } catch (error) {
      console.error('[SkillOptimizer] LLM 调用失败:', error);
      return null;
    }
  }
}
import * as fs from 'fs';
import * as path from 'path';

export class SkillGenerator {
  private readonly outputDir: string;

  constructor(workspacePath: string) {
    this.outputDir = workspacePath;
    this.ensureDirectoryExists(this.outputDir);
  }

  generate(taskName: string, steps: string[], category: string): string {
    const skillDirName = this.convertToFolderName(taskName);
    const skillDir = path.join(this.outputDir, skillDirName);
    this.ensureDirectoryExists(skillDir);

    const skillContent = this.buildSkillContent(taskName, steps, category);
    const skillFilePath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillFilePath, skillContent, 'utf-8');

    console.log(`✅ Skill 已生成: ${skillFilePath}`);
    return skillFilePath;
  }

  listGenerated(): string[] {
    if (!fs.existsSync(this.outputDir)) return [];
    return fs.readdirSync(this.outputDir, { withFileTypes: true })
      .filter(dirent => {
        if (!dirent.isDirectory()) return false;
        const skillFile = path.join(this.outputDir, dirent.name, 'SKILL.md');
        return fs.existsSync(skillFile);
      })
      .map(dirent => dirent.name);
  }

  evaluateAndGenerate(taskContext: {
    taskName: string;
    steps: string[];
    category: string;
    toolCallCount: number;
    turnCount: number;
  }): boolean {
    const sameTaskCount = this.countSimilarTask(taskContext.taskName);
    const isRepeated = sameTaskCount >= 5;
    const userRequested = /生成技能|记下这个流程|保存这个任务|记住这个流程/.test(taskContext.taskName);

    if (!isRepeated && !userRequested) {
      console.log(`[SkillGenerator] ℹ️ 不满足生成条件（相似:${sameTaskCount}次）`);
      return false;
    }

    const existing = this.listGenerated();
    const taskLower = taskContext.taskName.toLowerCase().replace(/\s+/g, '');
    for (const name of existing) {
      const nameLower = name.toLowerCase().replace(/\s+/g, '');
      if (nameLower.includes(taskLower.substring(0, 6)) || taskLower.includes(nameLower.substring(0, 6))) {
        const skillPath = path.join(this.outputDir, name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          let content = fs.readFileSync(skillPath, 'utf-8');
          content = content.replace(/last_used: .*/g, `last_used: ${new Date().toISOString()}`);
          content = content.replace(/status: .*/g, `status: active`);
          fs.writeFileSync(skillPath, content, 'utf-8');
          console.log(`[SkillGenerator] 🔄 技能已更新: ${name}`);
        }
        return true;
      }
    }

    this.generate(taskContext.taskName, taskContext.steps, taskContext.category);
    console.log(`[SkillGenerator] 🎓 自动生成新技能: ${taskContext.taskName}（相似:${sameTaskCount}次）`);
    return true;
  }

  /**
   * 标准化裸 .md 文件：移入子文件夹，补全 SKILL.md 的 frontmatter
   */
  normalizeSkillFiles(): void {
    if (!fs.existsSync(this.outputDir)) return;

    const entries = fs.readdirSync(this.outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      if (entry.name === 'SKILL.md') continue;

      const oldPath = path.join(this.outputDir, entry.name);
      const skillName = entry.name.replace(/\.md$/, '');
      const folderName = this.convertToFolderName(skillName);
      const skillDir = path.join(this.outputDir, folderName);

      try {
        const content = fs.readFileSync(oldPath, 'utf-8');

        if (content.startsWith('---')) {
          // 已有 frontmatter，逐个补全缺失字段
          this.ensureDirectoryExists(skillDir);
          let updated = content;
          const lines = updated.split('\n');
          const hasStatus = lines.some(l => l.startsWith('status:'));
          const hasCreated = lines.some(l => l.startsWith('created:'));
          const hasLastUsed = lines.some(l => l.startsWith('last_used:'));

          if (!hasStatus) {
            updated = updated.replace('---\n', `---\nstatus: active\n`);
          }
          if (!hasCreated) {
            updated = updated.replace('---\n', `---\ncreated: ${new Date().toISOString()}\n`);
          }
          if (!hasLastUsed) {
            updated = updated.replace('---\n', `---\nlast_used: ${new Date().toISOString()}\n`);
          }

          const newPath = path.join(skillDir, 'SKILL.md');
          fs.writeFileSync(newPath, updated, 'utf-8');
          fs.unlinkSync(oldPath);
          console.log(`[SkillGenerator] 📦 标准化技能文件: ${entry.name} → ${folderName}/SKILL.md`);
        } else {
          // 没有 frontmatter，补全后移入
          this.ensureDirectoryExists(skillDir);
          const fullContent = `---
name: ${skillName}
description: >
  Agent 生成的技能文件，由 self-growth 插件自动标准化。
category: 未分类
user-invocable: true
disable-model-invocation: false
status: active
created: ${new Date().toISOString()}
last_used: ${new Date().toISOString()}
---

# ${skillName}

${content}`;
          const newPath = path.join(skillDir, 'SKILL.md');
          fs.writeFileSync(newPath, fullContent, 'utf-8');
          fs.unlinkSync(oldPath);
          console.log(`[SkillGenerator] 📦 标准化技能文件（已补全 frontmatter）: ${entry.name} → ${folderName}/SKILL.md`);
        }
      } catch (err) {
        console.error(`[SkillGenerator] ⚠️ 标准化失败 [${entry.name}]:`, err);
      }
    }
  }

  private countSimilarTask(taskName: string): number {
    const existing = this.listGenerated();
    const taskLower = taskName.toLowerCase().replace(/\s+/g, '').substring(0, 6);
    let count = 1;
    for (const name of existing) {
      const nameLower = name.toLowerCase().replace(/\s+/g, '');
      if (nameLower.includes(taskLower) || taskLower.includes(nameLower)) {
        count++;
      }
    }
    return count;
  }

  manageLifecycle(): void {
    this.normalizeSkillFiles();

    const now = Date.now();
    const skillNames = this.listGenerated();

    for (const name of skillNames) {
      const skillPath = path.join(this.outputDir, name, 'SKILL.md');
      try {
        const content = fs.readFileSync(skillPath, 'utf-8');
        const lastUsed = this.parseLastUsed(content, skillPath);
        const unusedDays = (now - lastUsed) / 86400000;

        if (unusedDays < 0) {
          this.markUsed(name);
          console.log(`[SkillGenerator] ⚠️ 技能时间异常，已重置为今天: ${name}`);
          continue;
        }

        const currentStatus = this.parseStatus(content);

        if (unusedDays > 90) {
          const skillDir = path.join(this.outputDir, name);
          fs.rmSync(skillDir, { recursive: true });
          console.log(`[SkillGenerator] 🗑️ 技能已删除（${Math.round(unusedDays)}天未使用）: ${name}`);
        } else if (unusedDays > 30 && currentStatus !== 'watch') {
          this.updateStatus(skillPath, 'watch');
          console.log(`[SkillGenerator] 👀 技能进入观察期（${Math.round(unusedDays)}天未使用）: ${name}`);
        }
      } catch (err) {
        console.error(`[SkillGenerator] ⚠️ 管理技能失败 [${name}]:`, err);
      }
    }
  }

  markUsed(skillName: string): void {
    const folderName = this.convertToFolderName(skillName);
    const skillPath = path.join(this.outputDir, folderName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return;

    let content = fs.readFileSync(skillPath, 'utf-8');
    content = content.replace(/last_used: .*/g, `last_used: ${new Date().toISOString()}`);
    content = content.replace(/status: .*/g, `status: active`);
    fs.writeFileSync(skillPath, content, 'utf-8');
  }

  private parseLastUsed(content: string, filePath?: string): number {
    const match = content.match(/last_used: (.+)/);
    if (match) {
      const d = new Date(match[1]);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    const createdMatch = content.match(/生成时间: (.+)/);
    if (createdMatch) {
      const d = new Date(createdMatch[1]);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    if (filePath) {
      try {
        const stat = fs.statSync(filePath);
        return stat.mtimeMs;
      } catch {}
    }
    return Date.now();
  }

  private parseStatus(content: string): string {
    const match = content.match(/status: (.+)/);
    return match ? match[1].trim() : 'active';
  }

  private updateStatus(skillPath: string, status: string): void {
    let content = fs.readFileSync(skillPath, 'utf-8');
    if (content.includes('status:')) {
      content = content.replace(/status: .*/g, `status: ${status}`);
    } else {
      content = content.replace(/生成插件: self-growth/, `status: ${status}\n生成插件: self-growth`);
    }
    fs.writeFileSync(skillPath, content, 'utf-8');
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private convertToFolderName(taskName: string): string {
    return taskName.length > 40 ? taskName.substring(0, 40) : taskName;
  }

  private buildSkillContent(taskName: string, steps: string[], category: string): string {
    const stepsMarkdown = steps
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n');

    return `---
name: ${taskName}
description: >
  自动生成的技能。此技能由 self-growth 插件自动生成。
category: ${category}
user-invocable: true
disable-model-invocation: false
status: active
created: ${new Date().toISOString()}
last_used: ${new Date().toISOString()}
---

# ${taskName}

## 🔄 核心工作流
${stepsMarkdown}

## ✅ 完成标准
- 所有步骤已按顺序执行完毕

## 📝 技能信息
- **生成时间**: ${new Date().toISOString()}
- **任务类别**: ${category}
- **状态**: active
- **生成插件**: self-growth
`;
  }
}
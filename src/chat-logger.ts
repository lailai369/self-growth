import * as fs from 'fs';
import * as path from 'path';

export class ChatLogger {
  private logDir: string;
  private retentionDays: number;

  constructor(logDir: string = './chat_logs', retentionDays: number = 30) {
    this.logDir = logDir;
    this.retentionDays = retentionDays;
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  onSessionStart(sessionKey: string): void {
    const timestamp = this.formatTimestamp(new Date());
    const entry = `**[${timestamp}] [System]**\n会话开始: ${sessionKey}\n\n`;
    this.appendToLogFile(entry);
  }

  log(content: string, source: string = 'Agent'): void {
    const timestamp = this.formatTimestamp(new Date());
    const entry = `**[${timestamp}] [${source}]**\n${content}\n\n`;
    this.appendToLogFile(entry);
  }

  logUserMessage(content: string): void {
    this.log(content, 'User');
  }

  logAgentMessage(content: string): void {
    this.log(content, 'Agent');
  }

  scanRecent(days: number = 30): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result: string[] = [];
    const files = this.getLogFiles();
    for (const file of files) {
      const fileDate = this.parseDateFromFilename(file);
      if (fileDate && fileDate >= cutoff) {
        const content = fs.readFileSync(path.join(this.logDir, file), 'utf-8');
        result.push(`## ${file.replace('.md', '')}\n\n${content}`);
      }
    }
    return result.length > 0 ? result.join('\n\n') : '暂无最近聊天记录';
  }

  cleanup(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    const files = this.getLogFiles();
    for (const file of files) {
      const fileDate = this.parseDateFromFilename(file);
      if (fileDate && fileDate < cutoff) {
        fs.unlinkSync(path.join(this.logDir, file));
      }
    }
  }

  private appendToLogFile(content: string): void {
    const today = this.formatDate(new Date());
    const logFile = path.join(this.logDir, `${today}.md`);
    fs.appendFileSync(logFile, content, 'utf-8');
  }

  private getLogFiles(): string[] {
    try { return fs.readdirSync(this.logDir).filter(f => f.endsWith('.md')).sort(); } catch { return []; }
  }

  private parseDateFromFilename(filename: string): Date | null {
    const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
    if (!match) return null;
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatTimestamp(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${this.formatDate(date)} ${h}:${min}:${s}`;
  }
}
import * as fs from 'fs';
import * as path from 'path';
export class ChatLogger {
    logDir;
    retentionDays;
    constructor(logDir = './chat_logs', retentionDays = 30) {
        this.logDir = logDir;
        this.retentionDays = retentionDays;
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    onSessionStart(sessionKey) {
        const timestamp = this.formatTimestamp(new Date());
        const entry = `**[${timestamp}] [System]**\n会话开始: ${sessionKey}\n\n`;
        this.appendToLogFile(entry);
    }
    log(content, source = 'Agent') {
        const timestamp = this.formatTimestamp(new Date());
        const entry = `**[${timestamp}] [${source}]**\n${content}\n\n`;
        this.appendToLogFile(entry);
    }
    logUserMessage(content) {
        this.log(content, 'User');
    }
    logAgentMessage(content) {
        this.log(content, 'Agent');
    }
    scanRecent(days = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const result = [];
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
    cleanup() {
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
    appendToLogFile(content) {
        const today = this.formatDate(new Date());
        const logFile = path.join(this.logDir, `${today}.md`);
        fs.appendFileSync(logFile, content, 'utf-8');
    }
    getLogFiles() {
        try {
            return fs.readdirSync(this.logDir).filter(f => f.endsWith('.md')).sort();
        }
        catch {
            return [];
        }
    }
    parseDateFromFilename(filename) {
        const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
        if (!match)
            return null;
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    formatTimestamp(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${this.formatDate(date)} ${h}:${min}:${s}`;
    }
}
//# sourceMappingURL=chat-logger.js.map
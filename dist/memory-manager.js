import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskTracker } from './task-tracker';
import { SkillOptimizer } from './skill-optimizer';
import { DailyReviewer } from './daily-review';
import { ChatLogger } from './chat-logger';
import { PreferenceExtractor } from './preference-extractor';
export class MemoryManager {
    storageDir;
    llmUrl;
    llmModel;
    chatLogger;
    preferenceExtractor;
    taskTracker;
    skillOptimizer;
    dailyReviewer;
    preferences = [];
    preferenceFilePath;
    fileHeader = `# 用户偏好记忆

> 📝 本文件由 self-growth 插件自动维护
> ⚠️ 你可以手动编辑，但请注意格式
> 📅 最后更新：{{lastUpdated}}

---

`;
    typeLabels = {
        preference: '偏好',
        habit: '习惯',
        fact: '事实',
        decision: '决定'
    };
    constructor(storageDir = './memory', llmUrl = 'http://127.0.0.1:1234/v1', llmModel = 'qwen/qwen3.5-9b') {
        this.storageDir = storageDir;
        this.llmUrl = llmUrl;
        this.llmModel = llmModel;
        this.preferenceFilePath = path.join(this.storageDir, 'user_preferences.md');
        this.chatLogger = new ChatLogger(this.storageDir);
        this.preferenceExtractor = new PreferenceExtractor(this.llmUrl);
        this.taskTracker = new TaskTracker(this.storageDir);
        this.skillOptimizer = new SkillOptimizer(this.storageDir, this.llmUrl, this.llmModel);
        this.dailyReviewer = new DailyReviewer(this.chatLogger, this.preferenceExtractor, this.taskTracker, this.skillOptimizer, this.llmUrl, this.llmModel, this.storageDir);
    }
    async boot() {
        console.log('[MemoryManager] 🚀 正在启动 self-growth 记忆中枢...');
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
            console.log(`[MemoryManager] 📂 存储目录已就绪: ${this.storageDir}`);
            await Promise.all([
                this.taskTracker.init(),
                this.skillOptimizer.init(),
                this.loadPreferences()
            ]);
            console.log('[MemoryManager] ✅ 记忆中枢启动完成，自我进化系统已激活！\n');
        }
        catch (error) {
            console.error('[MemoryManager] ❌ 启动过程中发生严重错误:', error);
            throw error;
        }
    }
    async shutdown() {
        console.log('[MemoryManager] 🛑 正在关闭记忆中枢...');
        await this.writePreferences();
        console.log('[MemoryManager] ✅ 记忆中枢已安全关闭。');
    }
    getActiveTasks() {
        return this.taskTracker.getActiveTasks();
    }
    async triggerDailyReview() {
        console.log('[MemoryManager] ⏳ 收到手动触发复盘指令...');
        return await this.dailyReviewer.runDailyReview();
    }
    async addPreference(preference) {
        const now = Date.now();
        const existingIndex = this.preferences.findIndex((existing) => {
            const a = existing.text.trim().replace(/\s+/g, '');
            const b = preference.text.trim().replace(/\s+/g, '');
            return a === b || (a.length > 2 && b.length > 2 &&
                (a.includes(b) || b.includes(a)) &&
                Math.abs(a.length - b.length) / Math.max(a.length, b.length) < 0.3);
        });
        if (existingIndex !== -1) {
            const existing = this.preferences[existingIndex];
            existing.occurrences += 1;
            existing.lastMentioned = now;
            if (existing.confidence < 5) {
                existing.confidence = Math.min(5, Math.floor(existing.occurrences / 2) + 1);
            }
            console.log(`[MemoryManager] ⬆️ 偏好升级: [${existing.confidence}★] ${existing.text}`);
            await this.writePreferences();
            return true;
        }
        if (this.preferences.length >= 100) {
            const removed = this.preferences.shift();
            console.log(`[MemoryManager] 🧹 已满100条，移除最早记录: ${removed?.text}`);
        }
        if (this.preferences.length >= 50) {
            console.warn(`[MemoryManager] ⚠️ 偏好已达 ${this.preferences.length} 条，建议清理旧偏好`);
        }
        const scored = {
            ...preference,
            confidence: 1,
            occurrences: 1,
            lastMentioned: now
        };
        this.preferences.push(scored);
        await this.writePreferences();
        console.log(`[MemoryManager] ✅ 新增记忆 [${scored.confidence}★]: [${this.typeLabels[preference.type] || preference.type}] ${preference.text}`);
        return true;
    }
    autoDegrade() {
        const now = Date.now();
        let degraded = 0;
        for (const pref of this.preferences) {
            const daysSinceMention = (now - pref.lastMentioned) / 86400000;
            if (daysSinceMention > 30 && pref.confidence > 1) {
                pref.confidence -= 1;
                pref.lastMentioned = now;
                degraded++;
            }
        }
        if (degraded > 0) {
            console.log(`[MemoryManager] 📉 ${degraded} 条偏好因长期未提及被降星`);
            this.writePreferences();
        }
    }
    async addPreferences(preferences) {
        let addedCount = 0;
        for (const pref of preferences) {
            const added = await this.addPreference(pref);
            if (added)
                addedCount++;
        }
        if (addedCount > 0) {
            console.log(`[MemoryManager] 📊 批量添加完成: ${addedCount}/${preferences.length} 条`);
        }
        return addedCount;
    }
    getPreferences(type) {
        if (type) {
            return this.preferences.filter((p) => p.type === type);
        }
        return [...this.preferences];
    }
    searchPreferences(query) {
        const lowerQuery = query.toLowerCase();
        return this.preferences.filter((p) => p.text.toLowerCase().includes(lowerQuery));
    }
    async removePreference(text) {
        const index = this.preferences.findIndex((p) => p.text.trim() === text.trim());
        if (index === -1)
            return false;
        const removed = this.preferences.splice(index, 1)[0];
        await this.writePreferences();
        console.log(`[MemoryManager] 🗑️ 已删除记忆: ${removed.text}`);
        return true;
    }
    async clearPreferences() {
        this.preferences = [];
        await this.writePreferences();
        console.log('[MemoryManager] 🧹 所有偏好记忆已清空');
    }
    getPreferenceStats() {
        const byType = {};
        for (const pref of this.preferences) {
            byType[pref.type] = (byType[pref.type] || 0) + 1;
        }
        return {
            total: this.preferences.length,
            byType,
            lastUpdated: new Date().toISOString()
        };
    }
    getPreferencesForRetrieval() {
        return this.preferences.map(p => ({
            text: p.text,
            confidence: p.confidence,
            type: p.type
        }));
    }
    formatPreferencesForContext(maxItems) {
        if (this.preferences.length === 0) {
            return '（暂无用户偏好记录）';
        }
        const sorted = [...this.preferences].sort((a, b) => b.confidence - a.confidence);
        let items = sorted;
        if (maxItems && maxItems > 0) {
            items = sorted.slice(0, maxItems);
        }
        const lines = items.map((p) => {
            const stars = '★'.repeat(p.confidence) + '☆'.repeat(5 - p.confidence);
            const label = this.typeLabels[p.type] || p.type;
            return `- [${label}] [${stars}] ${p.text}`;
        });
        return `## 用户偏好记忆\n\n${lines.join('\n')}`;
    }
    async getRelevantMemories(context, limit = 5) {
        if (this.preferences.length === 0) {
            return "（暂无用户偏好记录）";
        }
        const highConf = this.preferences.filter(p => p.confidence >= 4);
        const lowConf = this.preferences.filter(p => p.confidence < 4);
        if (this.preferences.length <= 10) {
            return this.formatSorted(highConf, lowConf, limit);
        }
        try {
            const allSorted = [...this.preferences].sort((a, b) => b.confidence - a.confidence);
            const memoryList = allSorted
                .map((p, i) => `${i + 1}. [${p.confidence}★] [${this.typeLabels[p.type] || p.type}] ${p.text}`)
                .join('\n');
            const prompt = `从以下记忆列表中选出与用户问题最相关的 ${limit} 条记忆，只返回编号（如：2,5,7）。
高星级表示该记忆被多次提及，应优先选择。

用户问题：${context}

记忆列表：
${memoryList}

最相关记忆编号：`;
            const res = await fetch(`${this.llmUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.llmModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 50
                })
            });
            const data = await res.json();
            const answer = data?.choices?.[0]?.message?.content?.trim() || '';
            const indices = (answer.match(/\d+/g) || []).map(Number);
            const selected = indices
                .filter((i) => i >= 1 && i <= allSorted.length)
                .map((i) => allSorted[i - 1]);
            if (selected.length === 0) {
                return this.formatSorted(highConf, lowConf, limit);
            }
            return this.formatResult(selected);
        }
        catch {
            return this.formatSorted(highConf, lowConf, limit);
        }
    }
    formatSorted(high, low, limit) {
        const combined = [...high, ...low].slice(0, limit);
        return this.formatResult(combined);
    }
    formatResult(items) {
        const lessons = items.filter(p => p.text.startsWith('[教训]'));
        const normalPrefs = items.filter(p => !p.text.startsWith('[教训]'));
        let result = '';
        if (lessons.length > 0) {
            result += `## ⚠️ 错误教训（务必避免重复）\n\n${lessons.map(p => `- ${p.text}`).join('\n')}\n\n`;
        }
        if (normalPrefs.length > 0) {
            result += `## 👤 用户偏好（与当前话题相关）\n\n${normalPrefs.map(p => `- [${p.confidence}★] [${this.typeLabels[p.type] || p.type}] ${p.text}`).join('\n')}`;
        }
        return result.trim();
    }
    async loadPreferences() {
        try {
            await fs.access(this.preferenceFilePath);
            const content = await fs.readFile(this.preferenceFilePath, 'utf-8');
            this.preferences = this.parsePreferencesFromMarkdown(content);
            console.log(`[MemoryManager] 📂 已加载 ${this.preferences.length} 条偏好记忆`);
        }
        catch {
            console.log('[MemoryManager] 📝 user_preferences.md 不存在，将创建新文件');
            this.preferences = [];
            await this.writePreferences();
        }
    }
    async writePreferences() {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const header = this.fileHeader.replace('{{lastUpdated}}', now);
        const body = this.formatPreferencesToMarkdown();
        const content = header + body;
        const tmpPath = this.preferenceFilePath + '.tmp';
        try {
            await fs.writeFile(tmpPath, content, 'utf-8');
            await fs.rename(tmpPath, this.preferenceFilePath);
        }
        catch (error) {
            console.error('[MemoryManager] ❌ 写入偏好文件失败:', error);
            try {
                await fs.unlink(tmpPath);
            }
            catch { /* ignore */ }
        }
    }
    formatPreferencesToMarkdown() {
        if (this.preferences.length === 0) {
            return `*暂无记录的用户偏好。当你在对话中表达偏好、习惯或决定时，我会自动记录在这里。*\n`;
        }
        const groups = {};
        for (const pref of this.preferences) {
            if (!groups[pref.type])
                groups[pref.type] = [];
            groups[pref.type].push(pref);
        }
        const typeOrder = ['preference', 'habit', 'fact', 'decision'];
        const sortedTypes = Object.keys(groups).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));
        let markdown = '';
        markdown += `## 📊 统计\n\n`;
        markdown += `- **总计**：${this.preferences.length} 条记忆\n`;
        for (const type of sortedTypes) {
            const label = this.typeLabels[type] || type;
            markdown += `- **${label}**：${groups[type].length} 条\n`;
        }
        markdown += '\n---\n\n';
        for (const type of sortedTypes) {
            const label = this.typeLabels[type] || type;
            const emoji = this.getTypeEmoji(type);
            markdown += `## ${emoji} ${label}\n\n`;
            for (const pref of groups[type]) {
                const stars = '★'.repeat(pref.confidence) + '☆'.repeat(5 - pref.confidence);
                markdown += `- [${stars}] ${pref.text}\n`;
            }
            markdown += '\n';
        }
        return markdown;
    }
    parsePreferencesFromMarkdown(content) {
        const preferences = [];
        const lines = content.split('\n');
        let currentType = null;
        for (const line of lines) {
            const typeMatch = line.match(/^##\s+(?:[^\s]+\s+)?(.+)$/);
            if (typeMatch) {
                const headingText = typeMatch[1].trim();
                for (const [key, label] of Object.entries(this.typeLabels)) {
                    if (headingText === label) {
                        currentType = key;
                        break;
                    }
                }
                continue;
            }
            if (line.startsWith('## 📊') || line.startsWith('---') || line.startsWith('>')) {
                currentType = null;
                continue;
            }
            if (currentType && line.trim().startsWith('- ')) {
                const text = line.trim().substring(2).trim();
                if (text && !text.includes('*暂无') && !text.includes('**总计**') && !text.startsWith('**')) {
                    const starMatch = text.match(/\[(★+)(☆+)?\]/);
                    const confidence = starMatch ? starMatch[1].length : 1;
                    const cleanText = text.replace(/\[[★☆]+\]\s*/, '');
                    preferences.push({
                        text: cleanText,
                        type: currentType,
                        source: 'user_preferences.md',
                        confidence,
                        occurrences: confidence,
                        lastMentioned: Date.now()
                    });
                }
            }
        }
        return preferences;
    }
    getTypeEmoji(type) {
        const emojis = {
            preference: '🎯',
            habit: '🔄',
            fact: '📋',
            decision: '✅'
        };
        return emojis[type] || '📌';
    }
}
//# sourceMappingURL=memory-manager.js.map
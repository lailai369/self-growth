import * as fs from 'fs/promises';
import * as path from 'path';
import { loadActivation } from './payment';
import { getCachedToken, loginAndGetToken } from './auth-client';
export class SyncClient {
    config;
    timer = null;
    constructor(config) {
        this.config = config;
    }
    async start(basePath) {
        const activation = await loadActivation(basePath);
        if (activation.plan === 'free') {
            console.log('[SyncClient] 免费版，手动同步模式');
            return;
        }
        this.timer = setInterval(() => this.sync(basePath), this.config.interval);
        console.log(`[SyncClient] 自动同步已启动 (间隔: ${this.config.interval / 1000}s)`);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async sync(basePath) {
        const activation = await loadActivation(basePath);
        if (activation.plan === 'free')
            return;
        const email = activation?.email || '';
        if (!email)
            return;
        // 获取 JWT token
        const auth = getCachedToken() || await loginAndGetToken(this.config.serverUrl, email, basePath);
        if (!auth) {
            console.error('[SyncClient] 无法获取认证 token');
            return;
        }
        // 同步记忆数据
        await this.syncPreferences(basePath, auth.token);
        // 同步 chat_logs 和 skills 作为备份文件
        await this.syncFiles(basePath, auth.token);
    }
    async syncPreferences(basePath, token) {
        try {
            const prefsPath = path.join(basePath, 'memory', 'user_preferences.md');
            const content = await fs.readFile(prefsPath, 'utf-8').catch(() => '');
            if (!content.trim())
                return;
            // 解析本地偏好文件，提取条目
            const items = this.parsePreferences(content);
            if (items.length === 0)
                return;
            // 按类型分组上传
            const typeGroups = {};
            for (const item of items) {
                if (!typeGroups[item.type])
                    typeGroups[item.type] = [];
                typeGroups[item.type].push(item);
            }
            for (const [type, typeItems] of Object.entries(typeGroups)) {
                await fetch(`${this.config.serverUrl}/api/sync/push`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        type,
                        items: typeItems.map(item => ({
                            content: JSON.stringify({ text: item.text, source: item.source }),
                            confidence: item.confidence,
                        })),
                    }),
                    signal: AbortSignal.timeout(15000),
                });
            }
            console.log(`[SyncClient] 偏好同步完成: ${items.length} 条`);
        }
        catch (err) {
            console.error('[SyncClient] 偏好同步失败:', err);
        }
    }
    async syncFiles(basePath, token) {
        // 同步编译后的记忆文件到 memory API
        try {
            const compiledDir = path.join(basePath, 'memory', 'compiled');
            const files = ['memory.md', 'preferences.md', 'lessons.md'];
            for (const file of files) {
                const content = await fs.readFile(path.join(compiledDir, file), 'utf-8').catch(() => '');
                if (!content.trim())
                    continue;
                const type = file.replace('.md', '') === 'memory' ? 'preference' : file.replace('.md', '');
                await fetch(`${this.config.serverUrl}/api/memory/${type}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ content, confidence: 3 }),
                    signal: AbortSignal.timeout(15000),
                });
            }
            console.log('[SyncClient] 记忆文件同步完成');
        }
        catch (err) {
            console.error('[SyncClient] 文件同步失败:', err);
        }
    }
    parsePreferences(markdown) {
        const items = [];
        const lines = markdown.split('\n');
        let currentType = 'preference';
        const typeMap = {
            '偏好': 'preference',
            '习惯': 'habit',
            '事实': 'fact',
            '决定': 'decision',
            '教训': 'lesson',
            '技能': 'skill',
        };
        for (const line of lines) {
            // 检测类型标题
            const headingMatch = line.match(/^##\s+(?:[^\s]+\s+)?(.+)$/);
            if (headingMatch) {
                const headingText = headingMatch[1].trim();
                for (const [label, type] of Object.entries(typeMap)) {
                    if (headingText.includes(label)) {
                        currentType = type;
                        break;
                    }
                }
                continue;
            }
            // 跳过统计行
            if (line.startsWith('## 📊') || line.startsWith('---') || line.startsWith('>')) {
                continue;
            }
            // 解析条目
            if (line.trim().startsWith('- ')) {
                const text = line.trim().substring(2).trim();
                // 提取星级
                const starMatch = text.match(/\[([★☆]+)\]/);
                const confidence = starMatch
                    ? (starMatch[1].match(/★/g) || []).length
                    : 1;
                const cleanText = text.replace(/\[[★☆]+\]\s*/, '');
                if (cleanText && !cleanText.includes('*暂无') && !cleanText.startsWith('**')) {
                    items.push({
                        type: currentType,
                        text: cleanText,
                        confidence,
                        source: 'user_preferences.md',
                    });
                }
            }
        }
        return items;
    }
    async restore(basePath) {
        const activation = await loadActivation(basePath);
        if (activation.plan === 'free')
            return;
        const email = activation?.email || '';
        if (!email)
            return;
        const auth = getCachedToken() || await loginAndGetToken(this.config.serverUrl, email, basePath);
        if (!auth)
            return;
        // 拉取所有类型的数据
        const types = ['preference', 'habit', 'fact', 'decision', 'lesson', 'skill'];
        const allItems = [];
        for (const type of types) {
            try {
                const res = await fetch(`${this.config.serverUrl}/api/sync/pull?type=${type}`, {
                    headers: { 'Authorization': `Bearer ${auth.token}` },
                    signal: AbortSignal.timeout(10000),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.items) {
                        allItems.push(...data.items.map((item) => ({ ...item, type })));
                    }
                }
            }
            catch { }
        }
        // 重建本地偏好文件
        const typeLabels = {
            preference: '偏好',
            habit: '习惯',
            fact: '事实',
            decision: '决定',
            lesson: '教训',
            skill: '技能',
        };
        let markdown = `# 用户偏好\n\n> 自动同步于 ${new Date().toISOString()}\n\n`;
        const groups = {};
        for (const item of allItems) {
            if (!groups[item.type])
                groups[item.type] = [];
            groups[item.type].push(item);
        }
        for (const [type, items] of Object.entries(groups)) {
            markdown += `## ${typeLabels[type] || type}\n\n`;
            for (const item of items) {
                const content = typeof item.content === 'string'
                    ? JSON.parse(item.content).text
                    : item.content?.text || '';
                const stars = '★'.repeat(item.confidence || 1);
                markdown += `- [${stars}] ${content}\n`;
            }
            markdown += '\n';
        }
        await fs.mkdir(path.dirname(path.join(basePath, 'memory', 'user_preferences.md')), { recursive: true });
        await fs.writeFile(path.join(basePath, 'memory', 'user_preferences.md'), markdown);
        console.log(`[SyncClient] 数据恢复完成: ${allItems.length} 条`);
    }
}
//# sourceMappingURL=sync-client.js.map
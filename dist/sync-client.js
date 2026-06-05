import * as fs from 'fs/promises';
import * as path from 'path';
import { loadActivation } from './payment';
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
        const dirs = ['memory', 'chat_logs', 'skills'];
        for (const dir of dirs) {
            await this.syncDirectory(basePath, dir);
        }
    }
    async syncDirectory(basePath, dirName) {
        const activation = await loadActivation(basePath);
        const email = activation?.email || '';
        if (!email)
            return;
        const localDir = path.join(basePath, dirName);
        let files = [];
        try {
            const entries = await fs.readdir(localDir, { withFileTypes: true, recursive: true });
            files = entries
                .filter(e => e.isFile())
                .map(e => {
                const fullPath = path.join(e.parentPath || e.path || localDir, e.name);
                const relativePath = path.relative(basePath, fullPath);
                return relativePath.replace(/\\/g, '/');
            });
        }
        catch {
            return;
        }
        for (const file of files) {
            try {
                const content = await fs.readFile(path.join(basePath, file));
                await fetch(`${this.config.serverUrl}/api/sync/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filePath: file,
                        content: content.toString('base64'),
                        email: email,
                    }),
                });
            }
            catch (err) {
                console.error(`[SyncClient] 同步失败: ${file}`, err);
            }
        }
    }
    async restore(basePath, targetDir) {
        const activation = await loadActivation(basePath);
        if (activation.plan === 'free')
            return;
        const email = activation?.email || '';
        if (!email)
            return;
        const res = await fetch(`${this.config.serverUrl}/api/sync/files?email=${encodeURIComponent(email)}`);
        const files = await res.json();
        for (const file of files) {
            if (!file.path.startsWith(targetDir))
                continue;
            const downloadRes = await fetch(`${this.config.serverUrl}/api/sync/download/${encodeURIComponent(file.path)}?email=${encodeURIComponent(email)}`);
            const data = await downloadRes.json();
            if (data.content) {
                const localPath = path.join(basePath, file.path);
                await fs.mkdir(path.dirname(localPath), { recursive: true });
                await fs.writeFile(localPath, Buffer.from(data.content, 'base64'));
            }
        }
        console.log(`[SyncClient] 数据恢复完成: ${targetDir}`);
    }
}
//# sourceMappingURL=sync-client.js.map
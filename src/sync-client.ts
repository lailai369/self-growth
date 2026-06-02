import * as fs from 'fs/promises';
import * as path from 'path';
import { loadActivation, PlanType } from './payment';

export interface SyncConfig {
  serverUrl: string;
  localPath: string;
  interval: number;
}

export class SyncClient {
  private config: SyncConfig;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  async start(basePath: string): Promise<void> {
    const activation = await loadActivation(basePath);
    const plan = activation.plan as PlanType;

    const intervals: Record<PlanType, number> = {
      free: 0,
      pro: 10 * 60 * 1000,
      enterprise: 0,
    };

    const interval = intervals[plan];
    if (interval > 0) {
      this.timer = setInterval(() => this.sync(basePath), interval);
      console.log(`[SyncClient] 自动同步已启动 (间隔: ${interval / 1000}s)`);
    } else if (plan === 'free') {
      console.log('[SyncClient] 免费版，手动同步模式');
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync(basePath: string): Promise<void> {
    const activation = await loadActivation(basePath);
    if (!activation.license) return;

    const dirs = ['memory', 'chat_logs', 'skills'];
    for (const dir of dirs) {
      await this.syncDirectory(basePath, dir, activation.license);
    }
  }

  private async syncDirectory(basePath: string, dirName: string, license: string): Promise<void> {
    const localDir = path.join(basePath, dirName);
    let files: string[] = [];

    try {
      const entries = await fs.readdir(localDir, { withFileTypes: true, recursive: true });
      files = entries.filter(e => e.isFile()).map(e => path.join(dirName, e.name).replace(/\\/g, '/'));
    } catch {
      return;
    }

    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(basePath, file));
        await fetch(`${this.config.serverUrl}/api/sync/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${license}`,
          },
          body: JSON.stringify({
            filePath: file,
            content: content.toString('base64'),
          }),
        });
      } catch (err) {
        console.error(`[SyncClient] 同步失败: ${file}`, err);
      }
    }
  }

  async restore(basePath: string, targetDir: string): Promise<void> {
    const activation = await loadActivation(basePath);
    if (!activation.license) return;

    const res = await fetch(`${this.config.serverUrl}/api/sync/files`, {
      headers: { 'Authorization': `Bearer ${activation.license}` },
    });
    const files = await res.json() as any as { path: string }[];

    for (const file of files) {
      if (!file.path.startsWith(targetDir)) continue;

      const downloadRes = await fetch(
        `${this.config.serverUrl}/api/sync/download/${encodeURIComponent(file.path)}`,
        { headers: { 'Authorization': `Bearer ${activation.license}` } }
      );
      const data = await downloadRes.json() as any;
      if (data.content) {
        const localPath = path.join(basePath, file.path);
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, Buffer.from(data.content, 'base64'));
      }
    }
    console.log(`[SyncClient] 数据恢复完成: ${targetDir}`);
  }
}
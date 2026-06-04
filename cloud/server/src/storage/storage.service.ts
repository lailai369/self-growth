import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

const basePath = config.storage.localPath;

async function ensureDir(dirPath: string): Promise<void> {
  const dir = path.dirname(dirPath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function put(filePath: string, content: Buffer): Promise<void> {
  const fullPath = path.join(basePath, filePath);
  await ensureDir(fullPath);
  await fs.writeFile(fullPath, content);
}

export async function get(filePath: string): Promise<Buffer | null> {
  const fullPath = path.join(basePath, filePath);
  try {
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

export async function list(dirPath: string): Promise<{ path: string; size: number; lastModified: string }[]> {
  const fullPath = path.join(basePath, dirPath);
  const results: { path: string; size: number; lastModified: string }[] = [];

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        const stat = await fs.stat(path.join(fullPath, entry.name));
        results.push({
          path: filePath.replace(/\\/g, '/'),
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
        });
      }
    }
  } catch {
    // 目录不存在
  }

  return results;
}

export async function remove(filePath: string): Promise<void> {
  const fullPath = path.join(basePath, filePath);
  try {
    await fs.unlink(fullPath);
    logger.info(`文件已删除: ${filePath}`);
  } catch {
    // 文件不存在
  }
}
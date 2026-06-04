import path from 'path';
import { getDatabase } from '../database/connection';
import * as storageService from '../storage/storage.service';
import * as userService from '../user/user.service';
import { logger } from '../utils/logger';

export interface SyncFile {
  path: string;
  size: number;
  lastModified: string;
}

export async function uploadFile(userId: number, filePath: string, content: Buffer): Promise<void> {
  if (!userService.checkQuota(userId, content.length)) {
    throw new Error('存储空间不足');
  }

  const userDir = `user_${userId}`;
  const fullPath = path.join(userDir, filePath);

  await storageService.put(fullPath, content);
  userService.updateStorageUsed(userId, content.length);

  const db = getDatabase();
  db.prepare('INSERT INTO sync_records (user_id, file_path, file_size, action) VALUES (?, ?, ?, ?)').run(
    userId, filePath, content.length, 'upload'
  );

  logger.info(`文件上传: user=${userId} path=${filePath} size=${content.length}`);
}

export async function downloadFile(userId: number, filePath: string): Promise<Buffer | null> {
  const userDir = `user_${userId}`;
  const fullPath = path.join(userDir, filePath);

  const content = await storageService.get(fullPath);
  if (content) {
    const db = getDatabase();
    db.prepare('INSERT INTO sync_records (user_id, file_path, file_size, action) VALUES (?, ?, ?, ?)').run(
      userId, filePath, content.length, 'download'
    );
  }
  return content;
}

export async function listFiles(userId: number): Promise<SyncFile[]> {
  const userDir = `user_${userId}`;
  return storageService.list(userDir);
}

export async function deleteFile(userId: number, filePath: string): Promise<void> {
  const userDir = `user_${userId}`;
  const fullPath = path.join(userDir, filePath);
  await storageService.remove(fullPath);
  logger.info(`文件删除: user=${userId} path=${filePath}`);
}
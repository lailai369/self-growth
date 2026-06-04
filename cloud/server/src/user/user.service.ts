import { getDatabase } from '../database/connection';
import { User, UserPublic, toPublicUser } from './user.model';
import { config } from '../config';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + config.jwt.secret).digest('hex');
}

export async function createUser(username: string, email: string, password: string): Promise<UserPublic> {
  const db = getDatabase();

  // 检查用户名或邮箱是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    throw new Error('UNIQUE: 用户名或邮箱已被注册');
  }

  const hash = hashPassword(password);

  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, plan, storage_used)
    VALUES (?, ?, ?, 'free', 0)
  `);

  const result = stmt.run(username, email, hash);
  const user = getUserById(Number(result.lastInsertRowid));
  return user;
}

export function getUserById(id: number): UserPublic {
  const db = getDatabase();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (!user) throw new Error('用户不存在');
  return toPublicUser(user);
}

export function getUserByEmail(email: string): User | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | null;
}

export function getUserByUsername(username: string): User | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | null;
}

export function verifyPassword(user: User, password: string): boolean {
  return user.password_hash === hashPassword(password);
}

export function updatePlan(userId: number, plan: string, expiresAt?: string): void {
  const db = getDatabase();
  db.prepare('UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(plan, expiresAt || null, userId);
}

export function updateStorageUsed(userId: number, bytes: number): void {
  const db = getDatabase();
  db.prepare('UPDATE users SET storage_used = storage_used + ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(bytes, userId);
}

export function checkQuota(userId: number, fileSize: number): boolean {
  const user = getUserById(userId);
  const limits = config.plans[user.plan];
  return (user.storage_used + fileSize) <= limits.storage;
}
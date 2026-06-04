import { getDatabase } from '../database/connection';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface Suggestion {
  id: number;
  user_id: number;
  suggestion: string;
  category: string | null;
  plugin_version: string | null;
  agent: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function submitSuggestion(
  userId: number,
  suggestion: string,
  category?: string,
  pluginVersion?: string,
  agent?: string
): Suggestion {
  const db = getDatabase();

  // 检查每日上限
  const today = new Date().toISOString().split('T')[0];
  const count = db.prepare(
    `SELECT COUNT(*) as cnt FROM suggestions WHERE user_id = ? AND date(created_at) = ?`
  ).get(userId, today) as { cnt: number };

  if (count.cnt >= config.suggestion.maxPerUserPerDay) {
    throw new Error(`每日最多提交${config.suggestion.maxPerUserPerDay}条建议`);
  }

  const stmt = db.prepare(
    'INSERT INTO suggestions (user_id, suggestion, category, plugin_version, agent) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(userId, suggestion, category || null, pluginVersion || null, agent || null);

  logger.info(`建议提交: user=${userId} category=${category}`);

  return db.prepare('SELECT * FROM suggestions WHERE id = ?').get(result.lastInsertRowid) as Suggestion;
}

export function getPendingSuggestions(limit: number = 50): Suggestion[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM suggestions WHERE status = ? ORDER BY created_at DESC LIMIT ?')
    .all('pending', limit) as Suggestion[];
}

export function updateSuggestionStatus(id: number, status: 'approved' | 'rejected'): void {
  const db = getDatabase();
  db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, id);
  logger.info(`建议状态更新: id=${id} status=${status}`);
}
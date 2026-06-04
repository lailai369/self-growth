import { getDatabase } from '../database/connection';

export interface AuditEntry {
  userId?: number;
  action: string;
  ip?: string;
  userAgent?: string;
  details?: string;
}

export function logAudit(entry: AuditEntry): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, ip, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entry.userId || null,
    entry.action,
    entry.ip || null,
    entry.userAgent || null,
    entry.details || null
  );
}

export function getRecentAuditLogs(limit: number = 100): AuditEntry[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit) as AuditEntry[];
}
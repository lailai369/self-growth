import { config } from '../config';
import { logger } from '../utils/logger';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

function runMigrations(database: Database.Database): void {
  const currentVersion = database.pragma('user_version', { simple: true }) as number;
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (isNaN(version) || version <= currentVersion) continue;

    logger.info(`执行迁移: ${file} (v${version})`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    database.exec(sql);
    database.pragma(`user_version = ${version}`);
    logger.info(`迁移完成: v${currentVersion} → v${version}`);
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = config.database.url.replace('sqlite://', '');
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db);

    logger.info(`数据库已连接: ${dbPath}`);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    logger.info('数据库已关闭');
  }
}
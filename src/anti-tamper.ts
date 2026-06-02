import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

interface IntegrityRecord {
  files: Record<string, string>;
  lastChecked: string;
}

const INTEGRITY_FILE = '.integrity.json';

export async function computeHash(content: string): Promise<string> {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function verifyIntegrity(basePath: string): Promise<{ valid: boolean; tampered: string[] }> {
  const tampered: string[] = [];
  const integrityPath = path.join(basePath, INTEGRITY_FILE);

  let record: IntegrityRecord;
  try {
    const data = await fs.readFile(integrityPath, 'utf-8');
    record = JSON.parse(data);
  } catch {
    return { valid: true, tampered: [] };
  }

  for (const [filePath, expectedHash] of Object.entries(record.files)) {
    try {
      const content = await fs.readFile(path.join(basePath, filePath), 'utf-8');
      const actualHash = await computeHash(content);
      if (actualHash !== expectedHash) {
        tampered.push(filePath);
      }
    } catch {
      tampered.push(filePath);
    }
  }

  return { valid: tampered.length === 0, tampered };
}

export async function recordIntegrity(basePath: string, files: string[]): Promise<void> {
  const hashes: Record<string, string> = {};

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(basePath, file), 'utf-8');
      hashes[file] = await computeHash(content);
    } catch {}
  }

  const record: IntegrityRecord = {
    files: hashes,
    lastChecked: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(basePath, INTEGRITY_FILE),
    JSON.stringify(record, null, 2),
    'utf-8'
  );
}

export async function selfCheck(basePath: string): Promise<boolean> {
  const { valid, tampered } = await verifyIntegrity(basePath);
  if (!valid) {
    console.error(`[AntiTamper] ⚠️ 文件完整性校验失败: ${tampered.join(', ')}`);
  }
  return valid;
}
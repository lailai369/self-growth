import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

interface LicensePayload {
  userId: number;
  plan: string;
  issuedAt: string;
  expiresAt: string;
}

export function generateLicense(payload: LicensePayload): string {
  const data = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', config.jwt.secret)
    .update(data)
    .digest('hex');

  const license = Buffer.from(JSON.stringify({ data, signature })).toString('base64');
  logger.info(`许可证生成: user=${payload.userId} plan=${payload.plan}`);
  return license;
}

export function verifyLicense(license: string): LicensePayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(license, 'base64').toString('utf-8'));
    const { data, signature } = decoded;

    const expectedSig = crypto
      .createHmac('sha256', config.jwt.secret)
      .update(data)
      .digest('hex');

    if (signature !== expectedSig) {
      logger.warn('许可证签名无效');
      return null;
    }

    const payload: LicensePayload = JSON.parse(data);

    // 检查过期
    if (new Date(payload.expiresAt) < new Date()) {
      logger.warn(`许可证已过期: user=${payload.userId}`);
      return null;
    }

    return payload;
  } catch {
    logger.warn('许可证格式无效');
    return null;
  }
}
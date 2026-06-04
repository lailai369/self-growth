import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

type PlanKey = 'free' | 'pro' | 'enterprise';

export function syncRateMiddleware(req: Request, res: Response, next: NextFunction): void {
  const plan: PlanKey = (req as any).plan || 'free';
  const limit = config.plans[plan];

  if (limit.syncInterval === 0) {
    res.status(403).json({ error: '免费版不支持自动同步，请手动导出/导入' });
    return;
  }

  next();
}

export function syncQuotaMiddleware(req: Request, res: Response, next: NextFunction): void {
  const plan: PlanKey = (req as any).plan || 'free';
  const limit = config.plans[plan];

  const fileSize = parseInt(req.headers['content-length'] || '0');

  if (req.method === 'POST' && fileSize > 0) {
    const userService = require('../user/user.service');
    const userId = (req as any).userId;
    if (!userService.checkQuota(userId, fileSize)) {
      res.status(413).json({ error: '存储空间不足，请升级套餐或清理旧文件' });
      return;
    }
  }

  next();
}
import { Request, Response, NextFunction } from 'express';
import * as licenseService from './license.service';

export function licenseMiddleware(req: Request, res: Response, next: NextFunction): void {
  const license = req.headers['x-license-key'] as string;

  if (!license) {
    res.status(401).json({ error: '缺少许可证，请先激活' });
    return;
  }

  const payload = licenseService.verifyLicense(license);
  if (!payload) {
    res.status(401).json({ error: '许可证无效或已过期' });
    return;
  }

  (req as any).licenseUserId = payload.userId;
  (req as any).licensePlan = payload.plan;
  next();
}
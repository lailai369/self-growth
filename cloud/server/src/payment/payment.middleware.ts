import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function paidPlanRequired(req: Request, res: Response, next: NextFunction): void {
  const plan = (req as any).plan || 'free';

  if (plan === 'free') {
    res.status(403).json({ error: '此功能需要升级专业版或企业版' });
    return;
  }

  next();
}

export function getPlanFromRequest(req: Request): string {
  const userService = require('../user/user.service');
  const userId = (req as any).userId;
  try {
    const user = userService.getUserById(userId);
    return user.plan;
  } catch {
    return 'free';
  }
}
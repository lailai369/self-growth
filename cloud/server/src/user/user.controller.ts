import { Router, Request, Response } from 'express';
import * as userService from './user.service';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

// 获取当前用户信息
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = userService.getUserById(userId);
  res.json(user);
});

// 获取存储配额
router.get('/quota', authMiddleware, (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = userService.getUserById(userId);
  res.json({
    plan: user.plan,
    storage_used: user.storage_used,
    storage_limit: user.storage_limit,
    devices_limit: user.devices_limit,
  });
});

export { router as userRoutes };
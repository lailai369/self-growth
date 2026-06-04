import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import * as licenseService from './license.service';
import * as userService from '../user/user.service';

const router = Router();
router.use(authMiddleware);

// 生成许可证
router.post('/generate', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = userService.getUserById(userId);

  if (user.plan === 'free') {
    res.status(403).json({ error: '免费版不支持生成许可证' });
    return;
  }

  const expiresAt = new Date(Date.now() + 365 * 86400000).toISOString();

  const license = licenseService.generateLicense({
    userId,
    plan: user.plan,
    issuedAt: new Date().toISOString(),
    expiresAt,
  });

  res.json({ license, expiresAt });
});

// 验证许可证
router.post('/verify', (req: Request, res: Response) => {
  const { license } = req.body;

  if (!license) {
    res.status(400).json({ error: '缺少许可证' });
    return;
  }

  const payload = licenseService.verifyLicense(license);
  if (!payload) {
    res.status(401).json({ error: '许可证无效或已过期' });
    return;
  }

  res.json({ valid: true, plan: payload.plan, expiresAt: payload.expiresAt });
});

export { router as licenseRoutes };
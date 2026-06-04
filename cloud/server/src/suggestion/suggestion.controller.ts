import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import * as suggestionService from './suggestion.service';

const router = Router();

// 提交建议（需要登录）
router.post('/report', authMiddleware, (req: Request, res: Response) => {
  const { suggestion, category, pluginVersion, agent } = req.body;
  const userId = (req as any).userId;

  if (!suggestion || suggestion.length < 10) {
    res.status(400).json({ error: '建议内容至少10个字符' });
    return;
  }

  try {
    const result = suggestionService.submitSuggestion(userId, suggestion, category, pluginVersion, agent);
    res.status(201).json({ id: result.id, message: '感谢你的建议！' });
  } catch (err: any) {
    res.status(429).json({ error: err.message || '提交失败' });
  }
});

export { router as suggestionRoutes };
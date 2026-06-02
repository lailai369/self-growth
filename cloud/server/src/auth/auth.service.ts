import { Router, Request, Response } from 'express';
import * as authService from './auth.service';
import { validateEmail, validatePassword, validateUsername } from '../utils/validator';
import { authMiddleware } from './auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

// 注册
router.post('/register', (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ success: false, error: '用户名、邮箱和密码为必填项', code: 'MISSING_FIELDS' });
    return;
  }
  if (!validateUsername(username)) {
    res.status(400).json({ success: false, error: '用户名格式无效（3-30位字母数字）', code: 'INVALID_USERNAME' });
    return;
  }
  if (!validateEmail(email)) {
    res.status(400).json({ success: false, error: '邮箱格式无效', code: 'INVALID_EMAIL' });
    return;
  }
  if (!validatePassword(password)) {
    res.status(400).json({ success: false, error: '密码长度需6-128位', code: 'INVALID_PASSWORD' });
    return;
  }

  try {
    authService.register(username, email, password);
    const result = authService.login(email, password);
    logger.info(`新用户注册: ${username}`);
    res.status(201).json({ success: true, user: result?.user, token: result?.token, message: '注册成功' });
  } catch (err: any) {
    logger.error('注册失败:', err.message);
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ success: false, error: '用户名或邮箱已被注册', code: 'USER_EXISTS' });
    } else {
      res.status(500).json({ success: false, error: '注册失败，请稍后重试', code: 'SERVER_ERROR' });
    }
  }
});

// 登录
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: '邮箱和密码为必填项', code: 'MISSING_FIELDS' });
    return;
  }

  const result = authService.login(email, password);
  if (!result) {
    res.status(401).json({ success: false, error: '邮箱或密码错误', code: 'INVALID_CREDENTIALS' });
    return;
  }

  logger.info(`用户登录: ${result.user.username}`);
  res.json({ success: true, user: result.user, token: result.token });
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const { userId } = req as any;
  const userService = require('../user/user.service');
  const user = userService.getUserById(userId);
  res.json({ success: true, user });
});

export { router as authRoutes };
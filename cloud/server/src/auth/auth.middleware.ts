import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  userId: number;
  username: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供认证令牌' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    (req as any).userId = payload.userId;
    (req as any).username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: '令牌无效或已过期' });
  }
}
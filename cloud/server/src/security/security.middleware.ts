import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // 速率限制
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + config.security.rateLimit.windowMs });
  } else if (record.count >= config.security.rateLimit.maxRequests) {
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    return;
  } else {
    record.count++;
  }

  next();
}
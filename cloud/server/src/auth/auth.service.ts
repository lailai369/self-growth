import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getDatabase } from '../database/connection';
import * as userService from '../user/user.service';
import { User } from '../user/user.model';
import { JwtPayload } from './auth.middleware';
import crypto from 'crypto';

export function generateToken(user: User): string {
  const payload: JwtPayload = { userId: user.id, username: user.username };
  const expiresIn = typeof config.jwt.expiresIn === 'string'
    ? parseInt(config.jwt.expiresIn, 10)
    : config.jwt.expiresIn;
  return jwt.sign(payload, config.jwt.secret, { expiresIn: expiresIn || 3600 });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function saveSession(userId: number, token: string, expiresDays: number = 7): void {
  const db = getDatabase();
  const expiresAt = new Date(Date.now() + expiresDays * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);
}

export function register(username: string, email: string, password: string) {
  return userService.createUser(username, email, password);
}

export function login(email: string, password: string): { user: ReturnType<typeof userService.getUserById>; token: string } | null {
  const user = userService.getUserByEmail(email);
  if (!user || !userService.verifyPassword(user, password)) return null;

  const token = generateToken(user);
  saveSession(user.id, token);
  const publicUser = userService.getUserById(user.id);

  return { user: publicUser, token };
}
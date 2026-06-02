import { config, PlanName } from '../config';

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  plan: PlanName;
  plan_expires_at: string | null;
  storage_used: number;
  devices_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: number;
  username: string;
  email: string;
  plan: PlanName;
  storage_used: number;
  storage_limit: number;
  devices_limit: number;
  plan_expires_at: string | null;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Order {
  id: number;
  user_id: number;
  plan: PlanName;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
}

// 获取套餐配额
export function getPlanLimits(plan: PlanName): { storage: number; devices: number } {
  const p = config.plans[plan];
  return { storage: p.storage, devices: p.devices };
}

// 格式化用户公开信息
export function toPublicUser(user: User): UserPublic {
  const limits = getPlanLimits(user.plan);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    plan: user.plan,
    storage_used: user.storage_used,
    storage_limit: limits.storage,
    devices_limit: limits.devices,
    plan_expires_at: user.plan_expires_at,
  };
}
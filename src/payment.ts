import * as fs from 'fs/promises';
import * as path from 'path';

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface ActivationState {
  plan: PlanType;
  license: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  deviceId: string;
  email: string | null;
}

const ACTIVATION_FILE = 'activation.json';

export function getActivationPath(basePath: string): string {
  return path.join(basePath, ACTIVATION_FILE);
}

export async function loadActivation(basePath: string): Promise<ActivationState> {
  const filePath = getActivationPath(basePath);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      plan: 'free',
      license: null,
      activatedAt: null,
      expiresAt: null,
      deviceId: generateDeviceId(),
      email: null,
    };
  }
}

export async function saveActivation(basePath: string, state: ActivationState): Promise<void> {
  const filePath = getActivationPath(basePath);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

export async function activateLicense(basePath: string, license: string, serverUrl: string): Promise<ActivationState> {
  const res = await fetch(`${serverUrl}/api/license/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license }),
  });

  if (!res.ok) {
    throw new Error('许可证无效或已过期');
  }

  const data = await res.json() as any;
  const state: ActivationState = {
    plan: data.plan,
    license,
    activatedAt: new Date().toISOString(),
    expiresAt: data.expiresAt,
    deviceId: generateDeviceId(),
    email: data.email || null,
  };

  await saveActivation(basePath, state);
  return state;
}

export async function createPaymentOrder(plan: PlanType, serverUrl: string): Promise<{ orderId: number; amount: number }> {
  const state = await loadActivation('');

  const res = await fetch(`${serverUrl}/api/payment/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.license}`,
    },
    body: JSON.stringify({ plan }),
  });

  if (!res.ok) {
    throw new Error('创建订单失败');
  }

  return res.json() as any as { orderId: number; amount: number };
}

export async function checkPaymentStatus(orderId: number, serverUrl: string): Promise<string> {
  const state = await loadActivation('');

  const res = await fetch(`${serverUrl}/api/payment/order/${orderId}`, {
    headers: { 'Authorization': `Bearer ${state.license}` },
  });

  if (!res.ok) {
    return 'unknown';
  }

  const data = await res.json() as any;
  return data.status;
}

function generateDeviceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
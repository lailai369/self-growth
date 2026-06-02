import { config, PlanName } from '../config';

export interface Order {
  id: number;
  user_id: number;
  plan: PlanName;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  pay_url?: string;
  out_trade_no?: string;
}

export interface PaymentQRCode {
  orderId: number;
  qrCodeUrl: string;
  amount: number;
  plan: string;
}

export function getPlanPrice(plan: PlanName): number {
  return config.plans[plan].price;
}

export function getPlanDisplayName(plan: PlanName): string {
  return config.plans[plan].name;
}
import { getDatabase } from '../database/connection';
import { config, PlanName } from '../config';
import * as userService from '../user/user.service';
import { Order } from './payment.model';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { createPaymentUrl, verifyCallback } from './alipay.service';

// 微信支付配置
const wxConfig = {
  mchId: process.env.WX_MCH_ID || '',
  apiKey: process.env.WX_API_KEY || '',
  appId: process.env.WX_APP_ID || '',
};

export function createOrder(userId: number, plan: PlanName): Order {
  const db = getDatabase();
  const amount = config.plans[plan].price;
  const outTradeNo = `YL${Date.now()}${userId}`;

  const stmt = db.prepare('INSERT INTO orders (user_id, plan, amount, out_trade_no) VALUES (?, ?, ?, ?)');
  stmt.run(userId, plan, amount, outTradeNo);
  logger.info(`订单创建: user=${userId} plan=${plan} amount=${amount}`);

  const order = db.prepare('SELECT * FROM orders WHERE out_trade_no = ?').get(outTradeNo) as Order;

  // 🆕 生成支付宝支付链接
  const description = plan === 'pro' ? 'yulailai 专业版 (月付)' : 'yulailai 企业版 (年付)';
  const payUrl = createPaymentUrl(outTradeNo, amount, description);
  db.prepare('UPDATE orders SET pay_url = ? WHERE id = ?').run(payUrl, order.id);

  order.pay_url = payUrl;
  return order;
}

export function getOrder(orderId: number): Order | null {
  return getDatabase().prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order | null;
}

export function getOrderByOutTradeNo(outTradeNo: string): Order | null {
  return getDatabase().prepare('SELECT * FROM orders WHERE out_trade_no = ?').get(outTradeNo) as Order | null;
}

export function markOrderPaid(orderId: number, paymentMethod: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE orders SET status = 'paid', payment_method = ?, paid_at = datetime('now') WHERE id = ?`).run(paymentMethod, orderId);

  const order = getOrder(orderId);
  if (order) {
    userService.updatePlan(order.user_id, order.plan);
    logger.info(`支付成功: order=${orderId} user=${order.user_id} plan=${order.plan}`);
  }
}

export function getUserOrders(userId: number): Order[] {
  return getDatabase().prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Order[];
}

export function verifyWechatSignature(timestamp: string, nonce: string, body: string, signature: string): boolean {
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createHmac('sha256', wxConfig.apiKey).update(message).digest('base64') === signature;
}
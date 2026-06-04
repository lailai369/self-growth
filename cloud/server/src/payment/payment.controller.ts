import { Router, Request, Response, urlencoded } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import * as paymentService from './payment.service';
import { PlanName } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// 支付宝支付回调（支付宝 POST x-www-form-urlencoded）
router.post('/callback/alipay', urlencoded({ extended: false }), (req: Request, res: Response) => {
  try {
    const out_trade_no: string = req.body.out_trade_no;
    const trade_status: string = req.body.trade_status;

    if (!out_trade_no) {
      res.status(400).send('fail');
      return;
    }

    logger.info(`支付宝回调: out_trade_no=${out_trade_no}, status=${trade_status}`);

    if (trade_status !== 'TRADE_SUCCESS' && trade_status !== 'TRADE_FINISHED') {
      res.send('success');
      return;
    }

    const order = paymentService.getOrderByOutTradeNo(out_trade_no);
    if (!order) {
      logger.error(`订单不存在: ${out_trade_no}`);
      res.send('success');
      return;
    }

    paymentService.markOrderPaid(order.id, 'alipay');
    logger.info(`支付宝支付成功: order=${order.id}, user=${order.user_id}, plan=${order.plan}`);

    res.send('success');
  } catch (err: any) {
    logger.error('支付宝回调异常:', err.message);
    res.send('fail');
  }
});

// 查询支付状态（前端轮询用）
router.get('/order-status/:outTradeNo', (req: Request, res: Response) => {
  const outTradeNo = String(req.params.outTradeNo);
  try {
    const order = paymentService.getOrderByOutTradeNo(outTradeNo);
    if (!order) {
      res.status(404).json({ success: false, error: '订单不存在' });
      return;
    }
    res.json({ success: true, status: order.status, plan: order.plan });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.use(authMiddleware);

// 创建订单
router.post('/create-order', (req: Request, res: Response) => {
  const { plan } = req.body;
  const userId = (req as any).userId;

  const validPlans: PlanName[] = ['pro', 'enterprise'];
  if (!validPlans.includes(plan)) {
    res.status(400).json({ success: false, error: '无效的套餐类型，可选: pro, enterprise' });
    return;
  }

  try {
    const order = paymentService.createOrder(userId, plan);
    res.json({
      success: true,
      orderId: order.id,
      plan: order.plan,
      amount: order.amount,
      outTradeNo: order.out_trade_no,
      payUrl: order.pay_url,
      message: order.pay_url ? '请扫码支付' : '订单已创建',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || '创建订单失败' });
  }
});

// 查询订单
router.get('/order/:id', (req: Request, res: Response) => {
  const orderId = parseInt(req.params.id as string);
  const userId = (req as any).userId;
  if (isNaN(orderId)) { res.status(400).json({ success: false, error: '无效的订单ID' }); return; }
  const order = paymentService.getOrder(orderId);
  if (!order || order.user_id !== userId) { res.status(404).json({ success: false, error: '订单不存在' }); return; }
  res.json({ success: true, order });
});

// 获取历史订单
router.get('/orders', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  res.json({ success: true, orders: paymentService.getUserOrders(userId) });
});

export { router as paymentRoutes };
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { config } from './config';
import { authRoutes } from './auth/auth.controller';
import { paymentRoutes } from './payment/payment.controller';
import { syncRoutes } from './sync/sync.controller';
import { suggestionRoutes } from './suggestion/suggestion.controller';
import { licenseRoutes } from './license/license.controller';
import { securityMiddleware } from './security/security.middleware';
import { logger } from './utils/logger';

const app = express();

app.use(express.json());
app.use(securityMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/suggestion', suggestionRoutes);
app.use('/api/license', licenseRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', env: config.env });
});

// 全局错误处理（放在所有路由之后）
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error('未捕获错误:', err.message || err);

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      success: false,
      message: '数据已存在，请勿重复提交',
      code: 'UNIQUE_CONSTRAINT'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
    code: err.code || 'SERVER_ERROR'
  });
});

app.listen(config.port, () => {
  logger.info(`yulailai server started on port ${config.port} [${config.env}]`);
});

export default app;
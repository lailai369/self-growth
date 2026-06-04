// yunlailai 服务端配置

export const config = {
  // 服务器
  port: parseInt(process.env.PORT || '3000'),
  env: process.env.NODE_ENV || 'development',

  // 数据库
  database: {
    url: process.env.DATABASE_URL || 'sqlite://./data/yulailai.db',
  },

  // JWT 鉴权
  jwt: {
    secret: process.env.JWT_SECRET || 'yunlailai-dev-secret-change-in-production',
    expiresIn: '7d',
  },

  // 文件存储
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local', // local | oss | s3
    localPath: process.env.STORAGE_LOCAL_PATH || './data/files',
    oss: {
      region: process.env.OSS_REGION || '',
      bucket: process.env.OSS_BUCKET || '',
      accessKey: process.env.OSS_ACCESS_KEY || '',
      secretKey: process.env.OSS_SECRET_KEY || '',
    },
  },

  // 套餐配额
  plans: {
    free: {
      name: '免费版',
      storage: 1 * 1024 * 1024 * 1024,    // 1GB
      devices: 1,
      syncInterval: 0,                       // 手动同步
      price: 0,
    },
    pro: {
      name: '专业版',
      storage: 10 * 1024 * 1024 * 1024,   // 10GB
      devices: 5,
      syncInterval: 10 * 60 * 1000,         // 10分钟
      price: 15,                             // 元/月
    },
    enterprise: {
      name: '企业版',
      storage: 100 * 1024 * 1024 * 1024,  // 100GB
      devices: Infinity,
      syncInterval: 0,                       // 实时
      price: 3000,                           // 元/年
    },
  },

  // 支付（预留接口）
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'wechat', // wechat | alipay
    wechat: {
      appId: process.env.WECHAT_APP_ID || '',
      mchId: process.env.WECHAT_MCH_ID || '',
      apiKey: process.env.WECHAT_API_KEY || '',
    },
  },

  // 安全
  security: {
    rateLimit: {
      windowMs: 60 * 1000,      // 1分钟
      maxRequests: 100,          // 最多100次请求
    },
    encryptionKey: process.env.ENCRYPTION_KEY || 'yunlailai-dev-key-32chars!!',
  },

  // 建议上报
  suggestion: {
    maxPerUserPerDay: 5,
  },
};

export type PlanName = keyof typeof config.plans;
import crypto from 'crypto';

const ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export function createPaymentUrl(orderId: string, amount: number, description: string): string {
  const params: Record<string, string> = {
    app_id: process.env.ALIPAY_APP_ID!,
    method: 'alipay.trade.page.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
    version: '1.0',
    notify_url: process.env.ALIPAY_NOTIFY_URL || '',
    return_url: process.env.ALIPAY_RETURN_URL || '',
    biz_content: JSON.stringify({
      out_trade_no: orderId,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: amount.toFixed(2),
      subject: description,
    }),
  };

  const sortedKeys = Object.keys(params).sort();
  const signContent = sortedKeys
    .filter(key => !!params[key])
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const privateKey = process.env.ALIPAY_PRIVATE_KEY!;
  const sign = crypto.createSign('RSA-SHA256').update(signContent).sign(privateKey, 'base64');
  const encodedSign = encodeURIComponent(sign);

  const urlParams = sortedKeys
    .filter(key => !!params[key])
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');

  return `${ALIPAY_GATEWAY}?${urlParams}&sign=${encodedSign}`;
}

export function verifyCallback(params: Record<string, string>): boolean {
  const sign = params.sign;
  delete params.sign;
  delete params.sign_type;

  const sortedKeys = Object.keys(params).sort();
  const signContent = sortedKeys
    .filter(key => !!params[key])
    .map(key => `${key}=${decodeURIComponent(params[key])}`)
    .join('&');

  const publicKey = process.env.ALIPAY_PUBLIC_KEY!;
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(signContent);
  return verify.verify(publicKey, sign, 'base64');
}
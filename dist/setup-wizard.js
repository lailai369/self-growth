import * as fs from 'fs/promises';
import { createWriteStream, chmodSync } from 'fs';
import * as path from 'path';
import https from 'https';
const WELCOME_FILE = '.yulailai_welcome_shown';
const CLOUD_BINARY = process.platform === 'win32' ? 'yulailai-cloud.exe' : 'yulailai-cloud';
const DOWNLOAD_BASE = process.env.YULAI_CLOUD_URL || 'https://releases.yulailai.com/cloud/latest';
export async function shouldShowWizard(basePath) {
    try {
        await fs.access(path.join(basePath, WELCOME_FILE));
        return false;
    }
    catch {
        return true;
    }
}
export async function markWizardComplete(basePath) {
    await fs.writeFile(path.join(basePath, WELCOME_FILE), new Date().toISOString(), 'utf-8');
}
export async function downloadCloudClient(basePath) {
    const binDir = path.join(basePath, 'bin');
    const binaryPath = path.join(binDir, CLOUD_BINARY);
    try {
        await fs.access(binaryPath);
        return binaryPath;
    }
    catch { }
    await fs.mkdir(binDir, { recursive: true });
    const url = `${DOWNLOAD_BASE}/${CLOUD_BINARY}`;
    console.log(`[yulailai] 正在下载云服务客户端...`);
    return new Promise((resolve) => {
        https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                https.get(res.headers.location, (redirectRes) => {
                    const file = createWriteStream(binaryPath);
                    redirectRes.pipe(file);
                    file.on('finish', () => {
                        chmodSync(binaryPath, 0o755);
                        console.log('[yulailai] 云服务客户端就绪');
                        resolve(binaryPath);
                    });
                }).on('error', () => {
                    console.warn('[yulailai] 下载失败，离线模式可用');
                    resolve(null);
                });
                return;
            }
            const file = createWriteStream(binaryPath);
            res.pipe(file);
            file.on('finish', () => {
                chmodSync(binaryPath, 0o755);
                console.log('[yulailai] 云服务客户端就绪');
                resolve(binaryPath);
            });
        }).on('error', () => {
            console.warn('[yulailai] 下载失败，离线模式可用');
            resolve(null);
        });
    });
}
export function getWelcomeStep() {
    return {
        title: '欢迎使用 yulailai',
        description: 'yulailai 帮助你的 AI Agent 跨设备共享记忆、偏好和技能。首次使用需要注册账号。',
        options: [
            { key: 'register', label: '注册新账号' },
            { key: 'login', label: '已有账号，直接登录' },
            { key: 'skip', label: '跳过，使用免费版（手动同步）' },
        ],
    };
}
export function getPlanStep() {
    return {
        title: '选择套餐',
        description: '免费版支持手动同步，专业版和企业版支持自动同步。',
        options: [
            { key: 'free', label: '免费版 - 1GB 存储 | 1台设备 | 手动同步 | 免费', plan: 'free' },
            { key: 'pro', label: '专业版 - 10GB 存储 | 5台设备 | 自动同步 | ¥15/月', plan: 'pro' },
            { key: 'enterprise', label: '企业版 - 100GB 存储 | 不限设备 | 实时同步 | ¥3000/年', plan: 'enterprise' },
        ],
    };
}
export function getPaymentStep(plan, amount) {
    const prices = { free: '免费', pro: '¥15/月', enterprise: '¥3000/年' };
    return {
        title: '扫码支付',
        description: `套餐: ${plan === 'pro' ? '专业版' : '企业版'} | 金额: ${prices[plan]}\n\n请使用微信扫描二维码完成支付。支付完成后自动激活。`,
        options: [
            { key: 'paid', label: '已完成支付' },
            { key: 'cancel', label: '取消，使用免费版' },
        ],
    };
}
export function getCompleteStep(plan) {
    const names = { free: '免费版', pro: '专业版', enterprise: '企业版' };
    return {
        title: '设置完成',
        description: `yulailai ${names[plan]}已就绪。\n\n你的 AI Agent 现在拥有跨设备记忆能力。`,
        options: [
            { key: 'done', label: '开始使用' },
        ],
    };
}
export async function handleRegister(serverUrl, username, email, password) {
    const res = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '注册失败');
    }
    const data = await res.json();
    return data.user;
}
export async function handleLogin(serverUrl, email, password) {
    const res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '登录失败');
    }
    const data = await res.json();
    return data.token;
}
//# sourceMappingURL=setup-wizard.js.map
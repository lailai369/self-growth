// 认证客户端 - 获取和刷新 JWT token
import * as fs from 'fs/promises';
import * as path from 'path';
let _cache = null;
export function getCachedToken() {
    return _cache;
}
export async function loginAndGetToken(serverUrl, email, basePath) {
    // 先从缓存文件读取
    const cacheFile = path.join(basePath, '.auth_cache.json');
    try {
        const raw = await fs.readFile(cacheFile, 'utf-8');
        const cached = JSON.parse(raw);
        if (cached.expiresAt > Date.now() + 86400000) {
            _cache = cached;
            return cached;
        }
    }
    catch { }
    try {
        const res = await fetch(`${serverUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'self-growth-plugin' }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            // 用户可能还未注册，尝试自动注册
            return await autoRegister(serverUrl, email, basePath);
        }
        const data = await res.json();
        const tokenCache = {
            token: data.token,
            userId: data.user.id,
            email: data.user.email,
            plan: data.user.plan,
            expiresAt: Date.now() + 6 * 86400000, // 6天后过期
        };
        _cache = tokenCache;
        await fs.writeFile(cacheFile, JSON.stringify(tokenCache));
        return tokenCache;
    }
    catch (err) {
        console.error('[AuthClient] 登录失败:', err);
        return null;
    }
}
async function autoRegister(serverUrl, email, basePath) {
    try {
        const res = await fetch(`${serverUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nickname: email.split('@')[0],
                email,
                password: 'self-growth-plugin',
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        const tokenCache = {
            token: data.token,
            userId: data.user.id,
            email: data.user.email,
            plan: data.user.plan,
            expiresAt: Date.now() + 6 * 86400000,
        };
        _cache = tokenCache;
        const cacheFile = path.join(basePath, '.auth_cache.json');
        await fs.writeFile(cacheFile, JSON.stringify(tokenCache));
        console.log('[AuthClient] 自动注册成功');
        return tokenCache;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=auth-client.js.map
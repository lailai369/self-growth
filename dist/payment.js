import * as fs from 'fs/promises';
import * as path from 'path';
const ACTIVATION_FILE = 'activation.json';
export function getActivationPath(basePath) {
    return path.join(basePath, ACTIVATION_FILE);
}
export async function loadActivation(basePath) {
    const filePath = getActivationPath(basePath);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    }
    catch {
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
export async function saveActivation(basePath, state) {
    const filePath = getActivationPath(basePath);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}
export async function activateLicense(basePath, license, serverUrl) {
    const res = await fetch(`${serverUrl}/api/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license }),
    });
    if (!res.ok) {
        throw new Error('许可证无效或已过期');
    }
    const data = await res.json();
    const state = {
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
export async function createPaymentOrder(plan, serverUrl) {
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
    return res.json();
}
export async function checkPaymentStatus(orderId, serverUrl) {
    const state = await loadActivation('');
    const res = await fetch(`${serverUrl}/api/payment/order/${orderId}`, {
        headers: { 'Authorization': `Bearer ${state.license}` },
    });
    if (!res.ok) {
        return 'unknown';
    }
    const data = await res.json();
    return data.status;
}
function generateDeviceId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 16; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}
//# sourceMappingURL=payment.js.map
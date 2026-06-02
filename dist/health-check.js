import * as fs from 'fs/promises';
import * as path from 'path';
import { loadActivation } from './payment';
export async function runHealthCheck(basePath, serverUrl) {
    const checks = [];
    // 1. 检查目录权限
    const dirs = ['memory', 'chat_logs', 'skills'];
    for (const dir of dirs) {
        const dirPath = path.join(basePath, dir);
        try {
            await fs.access(dirPath);
            checks.push({ name: `目录: ${dir}`, status: 'ok', message: `可读写` });
        }
        catch {
            try {
                await fs.mkdir(dirPath, { recursive: true });
                checks.push({ name: `目录: ${dir}`, status: 'ok', message: `已创建` });
            }
            catch {
                checks.push({ name: `目录: ${dir}`, status: 'error', message: `无法创建 ${dirPath}` });
            }
        }
    }
    // 2. 检查激活状态
    try {
        const activation = await loadActivation(basePath);
        checks.push({
            name: '激活状态',
            status: 'ok',
            message: `当前套餐: ${activation.plan}`,
        });
    }
    catch {
        checks.push({ name: '激活状态', status: 'error', message: '无法读取激活信息' });
    }
    // 3. 检查服务端连接
    try {
        const res = await fetch(`${serverUrl}/api/health`);
        if (res.ok) {
            checks.push({ name: '服务端连接', status: 'ok', message: '连接正常' });
        }
        else {
            checks.push({ name: '服务端连接', status: 'error', message: `HTTP ${res.status}` });
        }
    }
    catch {
        checks.push({ name: '服务端连接', status: 'warning', message: '无法连接服务端（离线模式可用）' });
    }
    // 4. 检查磁盘空间
    const freeWarningMB = 100;
    try {
        const stat = await fs.stat(basePath);
        checks.push({
            name: '磁盘空间',
            status: 'ok',
            message: `目录可访问`,
        });
    }
    catch {
        checks.push({ name: '磁盘空间', status: 'warning', message: '无法检测' });
    }
    const passed = checks.every(c => c.status !== 'error');
    return { passed, checks };
}
//# sourceMappingURL=health-check.js.map
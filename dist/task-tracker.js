import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * 任务追踪器（融合版 + 关联 + 防抖）
 *
 * 功能一：实时状态追踪 — 监控任务执行状态（进行中/成功/失败）
 * 功能二：长期流程记录 — 记录任务步骤、累计次数、触发 Skill 生成
 * 功能三：维度关联 — 通过 runIds 关联实时状态与长期记录
 * 功能四：防抖保存 — 减少高并发下的文件 I/O 压力
 */
export class TaskTracker {
    // ========== 实时状态追踪 ==========
    activeTasks = new Map();
    completedTasks = [];
    // ========== 长期流程记录 ==========
    trackerFile;
    tasks;
    // ========== 防抖保存 ==========
    saveTimer = null;
    saveDelay = 500; // 500ms 防抖间隔
    constructor(storageDir = './memory') {
        this.trackerFile = path.join(storageDir, 'task_tracker.json');
        this.tasks = new Map();
    }
    /**
     * 初始化：从文件加载已有的任务记录
     */
    async init() {
        try {
            await fs.mkdir(path.dirname(this.trackerFile), { recursive: true });
            const data = await fs.readFile(this.trackerFile, 'utf-8');
            const parsed = JSON.parse(data);
            this.tasks = new Map(Object.entries(parsed));
        }
        catch {
            this.tasks = new Map();
        }
    }
    // ========== 实时状态 API ==========
    /**
     * 标记一个任务开始执行
     */
    startTask(taskId, taskName) {
        this.activeTasks.set(taskId, taskName);
        console.log(`[TaskTracker] ▶️ 任务开始 [${taskId}]: ${taskName}`);
    }
    /**
     * 标记一个任务执行成功
     */
    completeTask(taskId) {
        const taskName = this.activeTasks.get(taskId);
        if (taskName) {
            this.recordCompletion(taskId, taskName, 'success');
            console.log(`[TaskTracker] ✅ 任务成功 [${taskId}]: ${taskName}`);
        }
    }
    /**
     * 标记一个任务执行失败
     */
    failTask(taskId, error) {
        const taskName = this.activeTasks.get(taskId);
        if (taskName) {
            this.recordCompletion(taskId, taskName, 'failed');
            console.warn(`[TaskTracker] ❌ 任务失败 [${taskId}]: ${taskName}${error ? ` - ${error}` : ''}`);
        }
    }
    /**
     * 获取当前所有正在执行的任务
     */
    getActiveTasks() {
        return new Map(this.activeTasks);
    }
    /**
     * 获取最近完成的任务列表
     */
    getRecentCompletedTasks(limit = 10) {
        return this.completedTasks.slice(-limit);
    }
    // ========== 长期流程记录 API ==========
    /**
     * 记录一次任务执行（流程步骤追踪）
     * 会自动关联当前所有活跃的 taskId，建立维度关联。
     *
     * @param taskName 任务名称，例如 "周报生成"
     * @param steps 步骤列表
     * @param category 任务类别
     * @returns 本次记录后的任务信息
     */
    async addTask(taskName, steps, category = 'general') {
        if (!this.tasks.has(taskName)) {
            this.tasks.set(taskName, {
                name: taskName,
                category,
                count: 0,
                steps,
                history: [],
                readyForSkill: false,
                runIds: []
            });
        }
        const task = this.tasks.get(taskName);
        task.count += 1;
        task.steps = steps;
        task.history.push({
            time: new Date().toISOString(),
            steps
        });
        // 关联当前所有活跃的 taskId
        const activeIds = Array.from(this.activeTasks.keys());
        task.runIds.push(...activeIds);
        if (task.count >= 3) {
            task.readyForSkill = true;
        }
        // 防抖保存：500ms 内的多次调用只触发一次文件写入
        this.debouncedSave();
        return task;
    }
    /**
     * 获取某个任务的完整信息
     */
    getTask(taskName) {
        return this.tasks.get(taskName);
    }
    /**
     * 获取某个任务的执行次数
     */
    getTaskCount(taskName) {
        const task = this.tasks.get(taskName);
        return task ? task.count : 0;
    }
    /**
     * 获取所有可生成 Skill 的任务
     */
    getReadyTasks() {
        return Array.from(this.tasks.values()).filter(task => task.readyForSkill);
    }
    /**
     * 列出所有已追踪的任务名称
     */
    listAllTasks() {
        return Array.from(this.tasks.keys());
    }
    /**
     * 检查某个任务是否达到了生成 Skill 的阈值（3 次）
     */
    isReadyForSkill(taskName) {
        const task = this.tasks.get(taskName);
        return task ? task.readyForSkill : false;
    }
    // ========== 通用 API ==========
    /**
     * 重置实时追踪状态（长期记录保留）
     */
    reset() {
        this.activeTasks.clear();
        this.completedTasks = [];
        console.log('[TaskTracker] 🧹 已重置追踪状态（长期记录保留）');
    }
    /**
     * 完全清空所有数据（包括长期记录）
     * 会取消待处理的防抖保存，立即写入空数据
     */
    async clearAll() {
        this.activeTasks.clear();
        this.completedTasks = [];
        this.tasks.clear();
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.saveImmediate();
        console.log('[TaskTracker] 🧹 已清空所有追踪数据');
    }
    // ========== 私有方法 ==========
    /**
     * 记录任务完成并清理活跃任务列表
     */
    recordCompletion(taskId, taskName, status) {
        this.completedTasks.push({
            id: taskId,
            name: taskName,
            status,
            time: new Date().toISOString()
        });
        this.activeTasks.delete(taskId);
    }
    /**
     * 防抖保存：延迟 500ms 写入文件。
     * 如果在延迟期间又有新数据，取消前一次计时器，重新计时。
     * 这样高并发下的多次调用只触发一次实际的文件 I/O。
     */
    debouncedSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveImmediate();
            this.saveTimer = null;
        }, this.saveDelay);
    }
    /**
     * 立即保存长期任务数据到文件（不经过防抖）
     */
    async saveImmediate() {
        try {
            await fs.mkdir(path.dirname(this.trackerFile), { recursive: true });
            const data = Object.fromEntries(this.tasks);
            await fs.writeFile(this.trackerFile, JSON.stringify(data, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('[TaskTracker] ❌ 保存任务数据失败:', error);
        }
    }
}
//# sourceMappingURL=task-tracker.js.map
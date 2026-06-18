/**
 * 已完成任务记录
 */
export interface CompletedTask {
    id: string;
    name: string;
    status: 'success' | 'failed';
    time: string;
}
/**
 * 长期任务记录
 */
export interface TaskRecord {
    name: string;
    category: string;
    count: number;
    steps: string[];
    history: Array<{
        time: string;
        steps: string[];
    }>;
    readyForSkill: boolean;
    /** 关联的任务执行 ID，用于关联实时状态追踪 */
    runIds: string[];
}
/**
 * 任务追踪器（融合版 + 关联 + 防抖）
 *
 * 功能一：实时状态追踪 — 监控任务执行状态（进行中/成功/失败）
 * 功能二：长期流程记录 — 记录任务步骤、累计次数、触发 Skill 生成
 * 功能三：维度关联 — 通过 runIds 关联实时状态与长期记录
 * 功能四：防抖保存 — 减少高并发下的文件 I/O 压力
 */
export declare class TaskTracker {
    private activeTasks;
    private completedTasks;
    private trackerFile;
    private tasks;
    private saveTimer;
    private readonly saveDelay;
    constructor(storageDir?: string);
    /**
     * 初始化：从文件加载已有的任务记录
     */
    init(): Promise<void>;
    /**
     * 标记一个任务开始执行
     */
    startTask(taskId: string, taskName: string): void;
    /**
     * 标记一个任务执行成功
     */
    completeTask(taskId: string): void;
    /**
     * 标记一个任务执行失败
     */
    failTask(taskId: string, error?: string): void;
    /**
     * 获取当前所有正在执行的任务
     */
    getActiveTasks(): Map<string, string>;
    /**
     * 获取最近完成的任务列表
     */
    getRecentCompletedTasks(limit?: number): CompletedTask[];
    /**
     * 记录一次任务执行（流程步骤追踪）
     * 会自动关联当前所有活跃的 taskId，建立维度关联。
     *
     * @param taskName 任务名称，例如 "周报生成"
     * @param steps 步骤列表
     * @param category 任务类别
     * @returns 本次记录后的任务信息
     */
    addTask(taskName: string, steps: string[], category?: string): Promise<TaskRecord>;
    /**
     * 获取某个任务的完整信息
     */
    getTask(taskName: string): TaskRecord | undefined;
    /**
     * 获取某个任务的执行次数
     */
    getTaskCount(taskName: string): number;
    /**
     * 获取所有可生成 Skill 的任务
     */
    getReadyTasks(): TaskRecord[];
    /**
     * 列出所有已追踪的任务名称
     */
    listAllTasks(): string[];
    /**
     * 检查某个任务是否达到了生成 Skill 的阈值（3 次）
     */
    isReadyForSkill(taskName: string): boolean;
    /**
     * 重置实时追踪状态（长期记录保留）
     */
    reset(): void;
    /**
     * 完全清空所有数据（包括长期记录）
     * 会取消待处理的防抖保存，立即写入空数据
     */
    clearAll(): Promise<void>;
    /**
     * 记录任务完成并清理活跃任务列表
     */
    private recordCompletion;
    /**
     * 防抖保存：延迟 500ms 写入文件。
     * 如果在延迟期间又有新数据，取消前一次计时器，重新计时。
     * 这样高并发下的多次调用只触发一次实际的文件 I/O。
     */
    private debouncedSave;
    /**
     * 立即保存长期任务数据到文件（不经过防抖）
     */
    private saveImmediate;
}
//# sourceMappingURL=task-tracker.d.ts.map
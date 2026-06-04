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
    runIds: string[];
}
export interface DiagnosisResult {
    problemsFound: boolean;
    diagnosis: string;
    patchInstruction: string;
}
export interface UpgradeSuggestion {
    skillName: string;
    currentScore: number;
    suggestion: string;
    generatedAt: string;
    status: 'pending' | 'approved' | 'rejected';
}
export declare class SkillOptimizer {
    private skillsDir;
    private llmUrl;
    private llmModel;
    private scores;
    private pendingUpgradesPath;
    constructor(storageDir?: string, llmUrl?: string, llmModel?: string);
    init(): Promise<void>;
    generateSkill(taskRecord: TaskRecord): Promise<string>;
    batchGenerate(readyTasks: TaskRecord[]): Promise<string[]>;
    batchGenerateFromLLM(tasks: Array<{
        taskName: string;
        steps: string[];
        reason: string;
    }>): Promise<string[]>;
    listGenerated(): Promise<string[]>;
    getExistingSkill(skillName: string): Promise<string | null>;
    recordExecution(skillName: string, success: boolean, durationMs: number, hadManualFix?: boolean): boolean;
    calculateComprehensiveScore(skillName: string): Promise<{
        total: number;
        reuse: number;
        quality: number;
        structure: number;
    }>;
    evaluateAndCleanup(): Promise<UpgradeSuggestion[]>;
    private generateUpgradeSuggestion;
    getPendingUpgrades(): Promise<UpgradeSuggestion[]>;
    updateUpgradeStatus(skillName: string, status: 'approved' | 'rejected'): Promise<void>;
    getAverageScore(skillName: string): number;
    resetScores(skillName: string): void;
    detectChanges(skillName: string, recentLogs: string): Promise<string | null>;
    diagnoseAndPatch(skillName: string, skillContent: string, recentLogs: string): Promise<DiagnosisResult>;
    applyPatch(skillPath: string, patchInstruction: string): Promise<boolean>;
    evaluateAndOptimize(recentLogs: string): Promise<number>;
    private parseStatus;
    private buildSkillMarkdown;
    private optimizeSteps;
    private callLLM;
}
//# sourceMappingURL=skill-optimizer.d.ts.map
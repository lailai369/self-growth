export declare class SkillGenerator {
    private readonly outputDir;
    constructor(workspacePath: string);
    generate(taskName: string, steps: string[], category: string): string;
    listGenerated(): string[];
    evaluateAndGenerate(taskContext: {
        taskName: string;
        steps: string[];
        category: string;
        toolCallCount: number;
        turnCount: number;
    }): boolean;
    /**
     * 标准化裸 .md 文件：移入子文件夹，补全 SKILL.md 的 frontmatter
     */
    normalizeSkillFiles(): void;
    private countSimilarTask;
    manageLifecycle(): void;
    markUsed(skillName: string): void;
    private parseLastUsed;
    private parseStatus;
    private updateStatus;
    private ensureDirectoryExists;
    private convertToFolderName;
    private buildSkillContent;
}
//# sourceMappingURL=skill-generator.d.ts.map
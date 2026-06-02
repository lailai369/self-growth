import { ChatLogger } from './chat-logger';
import { PreferenceExtractor, Preference } from './preference-extractor';
import { TaskTracker } from './task-tracker';
import { SkillOptimizer } from './skill-optimizer';
export interface DailyReviewReport {
    date: string;
    summary: string;
    insights: string[];
    topics: string[];
    skillsGenerated: string[];
    newPreferences: Preference[];
}
export declare class DailyReviewer {
    private chatLogger;
    private preferenceExtractor;
    private taskTracker;
    private skillOptimizer;
    private llmUrl;
    private snapshotDir;
    private compiledDir;
    private rawMemoryPath;
    private serverUrl;
    constructor(chatLogger: ChatLogger, preferenceExtractor: PreferenceExtractor, taskTracker: TaskTracker, skillOptimizer: SkillOptimizer, llmUrl: string, _llmModel: string, storageDir: string);
    runDailyReview(): Promise<DailyReviewReport>;
    private compileMemories;
    private pruneOldPreferences;
    private buildReviewPrompt;
    private parseReviewResult;
    private extractSection;
    private callLLM;
    private formatDate;
}
//# sourceMappingURL=daily-review.d.ts.map
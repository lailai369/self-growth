import { TaskTracker } from './task-tracker';
import { SkillOptimizer } from './skill-optimizer';
import { DailyReviewer } from './daily-review';
import { ChatLogger } from './chat-logger';
import { PreferenceExtractor, type Preference } from './preference-extractor';
export interface MemoryStats {
    total: number;
    byType: Record<string, number>;
    lastUpdated: string;
}
interface ScoredPreference extends Preference {
    confidence: number;
    occurrences: number;
    lastMentioned: number;
}
export declare class MemoryManager {
    private storageDir;
    private llmUrl;
    private llmModel;
    chatLogger: ChatLogger;
    preferenceExtractor: PreferenceExtractor;
    taskTracker: TaskTracker;
    skillOptimizer: SkillOptimizer;
    dailyReviewer: DailyReviewer;
    private preferences;
    private preferenceFilePath;
    private readonly fileHeader;
    private readonly typeLabels;
    constructor(storageDir?: string, llmUrl?: string, llmModel?: string);
    boot(): Promise<void>;
    shutdown(): Promise<void>;
    getActiveTasks(): Map<string, string>;
    triggerDailyReview(): Promise<import("./daily-review").DailyReviewReport>;
    addPreference(preference: Preference): Promise<boolean>;
    autoDegrade(): void;
    addPreferences(preferences: Preference[]): Promise<number>;
    getPreferences(type?: string): ScoredPreference[];
    searchPreferences(query: string): ScoredPreference[];
    removePreference(text: string): Promise<boolean>;
    clearPreferences(): Promise<void>;
    getPreferenceStats(): MemoryStats;
    getPreferencesForRetrieval(): Array<{
        text: string;
        confidence: number;
        type: string;
    }>;
    formatPreferencesForContext(maxItems?: number): string;
    getRelevantMemories(context: string, limit?: number): Promise<string>;
    private formatSorted;
    private formatResult;
    private loadPreferences;
    private writePreferences;
    private formatPreferencesToMarkdown;
    private parsePreferencesFromMarkdown;
    private getTypeEmoji;
}
export {};
//# sourceMappingURL=memory-manager.d.ts.map
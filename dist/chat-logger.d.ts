export declare class ChatLogger {
    private logDir;
    private retentionDays;
    constructor(logDir?: string, retentionDays?: number);
    onSessionStart(sessionKey: string): void;
    log(content: string, source?: string): void;
    logUserMessage(content: string): void;
    logAgentMessage(content: string): void;
    scanRecent(days?: number): string;
    cleanup(): void;
    private appendToLogFile;
    private getLogFiles;
    private parseDateFromFilename;
    private formatDate;
    private formatTimestamp;
}
//# sourceMappingURL=chat-logger.d.ts.map
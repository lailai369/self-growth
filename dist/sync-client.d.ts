export interface SyncConfig {
    serverUrl: string;
    localPath: string;
    interval: number;
}
export declare class SyncClient {
    private config;
    private timer;
    constructor(config: SyncConfig);
    start(basePath: string): Promise<void>;
    stop(): void;
    sync(basePath: string): Promise<void>;
    private syncPreferences;
    private syncFiles;
    private parsePreferences;
    restore(basePath: string): Promise<void>;
}
//# sourceMappingURL=sync-client.d.ts.map
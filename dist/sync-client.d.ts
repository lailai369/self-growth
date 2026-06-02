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
    private syncDirectory;
    restore(basePath: string, targetDir: string): Promise<void>;
}
//# sourceMappingURL=sync-client.d.ts.map
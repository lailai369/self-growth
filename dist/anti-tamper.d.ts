export declare function computeHash(content: string): Promise<string>;
export declare function verifyIntegrity(basePath: string): Promise<{
    valid: boolean;
    tampered: string[];
}>;
export declare function recordIntegrity(basePath: string, files: string[]): Promise<void>;
export declare function selfCheck(basePath: string): Promise<boolean>;
//# sourceMappingURL=anti-tamper.d.ts.map
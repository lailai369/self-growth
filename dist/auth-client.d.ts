interface TokenCache {
    token: string;
    userId: number;
    email: string;
    plan: string;
    expiresAt: number;
}
export declare function getCachedToken(): TokenCache | null;
export declare function loginAndGetToken(serverUrl: string, email: string, basePath: string): Promise<TokenCache | null>;
export {};
//# sourceMappingURL=auth-client.d.ts.map
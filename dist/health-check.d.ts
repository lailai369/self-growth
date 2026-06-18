export interface HealthReport {
    passed: boolean;
    checks: HealthCheck[];
}
export interface HealthCheck {
    name: string;
    status: 'ok' | 'warning' | 'error';
    message: string;
}
export declare function runHealthCheck(basePath: string, serverUrl: string): Promise<HealthReport>;
//# sourceMappingURL=health-check.d.ts.map
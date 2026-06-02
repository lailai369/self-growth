export type PlanType = 'free' | 'pro' | 'enterprise';
export interface ActivationState {
    plan: PlanType;
    license: string | null;
    activatedAt: string | null;
    expiresAt: string | null;
    deviceId: string;
}
export declare function getActivationPath(basePath: string): string;
export declare function loadActivation(basePath: string): Promise<ActivationState>;
export declare function saveActivation(basePath: string, state: ActivationState): Promise<void>;
export declare function activateLicense(basePath: string, license: string, serverUrl: string): Promise<ActivationState>;
export declare function createPaymentOrder(plan: PlanType, serverUrl: string): Promise<{
    orderId: number;
    amount: number;
}>;
export declare function checkPaymentStatus(orderId: number, serverUrl: string): Promise<string>;
//# sourceMappingURL=payment.d.ts.map
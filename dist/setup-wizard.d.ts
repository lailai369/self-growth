import { PlanType } from './payment';
export interface WizardStep {
    title: string;
    description: string;
    options: {
        key: string;
        label: string;
        plan?: PlanType;
    }[];
}
export declare function shouldShowWizard(basePath: string): Promise<boolean>;
export declare function markWizardComplete(basePath: string): Promise<void>;
export declare function downloadCloudClient(basePath: string): Promise<string | null>;
export declare function getWelcomeStep(): WizardStep;
export declare function getPlanStep(): WizardStep;
export declare function getPaymentStep(plan: PlanType, amount: number): WizardStep;
export declare function getCompleteStep(plan: PlanType): WizardStep;
export declare function handleRegister(serverUrl: string, username: string, email: string, password: string): Promise<string>;
export declare function handleLogin(serverUrl: string, email: string, password: string): Promise<string>;
//# sourceMappingURL=setup-wizard.d.ts.map
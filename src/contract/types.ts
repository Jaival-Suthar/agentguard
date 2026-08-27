export const EXECUTION_CONTRACT_VERSION = 1 as const;

export interface ExecutionContractActions {
  allow: string[];
  approvalRequired: string[];
  deny: string[];
}

export interface ExecutionContractLimits {
  maxRetries: number;
}

export interface ExecutionContractRequirements {
  verificationRequired: boolean;
  requiredActions: string[];
  requiredEvidence: string[];
}

export interface ExecutionContractOrdering {
  before: Array<{
    action: string;
    before: string;
  }>;
}

export interface ExecutionContract {
  version: typeof EXECUTION_CONTRACT_VERSION;
  name: string;
  description?: string;
  actions: ExecutionContractActions;
  limits: ExecutionContractLimits;
  requirements: ExecutionContractRequirements;
  ordering: ExecutionContractOrdering;
}

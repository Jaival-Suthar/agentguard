import type { ExecutionContract } from "../contract/types.js";

export const POLICY_DECISIONS = [
  "ALLOW",
  "BLOCK",
  "APPROVAL_REQUIRED",
] as const;

export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export interface PolicyContext {
  contract: ExecutionContract;
  source?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecisionResult {
  action: string;
  decision: PolicyDecision;
  reason: string;
  contract: string;
  source?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecisionEvent extends PolicyDecisionResult {
  type: "policy.decision";
  timestamp: string;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  reason: string;
  contract: string;
  requestedAt: string;
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  decidedAt: string;
  reason?: string;
}

export interface PolicyGateOptions {
  now?: () => string;
  createRequestId?: () => string;
  onDecision?: (event: PolicyDecisionEvent) => void | Promise<void>;
  requestApproval?: (
    request: ApprovalRequest,
  ) => Promise<ApprovalDecision>;
}

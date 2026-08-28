import type { ExecutionContract } from "../contract/types.js";
import type {
  PolicyContext,
  PolicyDecisionResult,
} from "./types.js";

function decision(
  contract: ExecutionContract,
  action: string,
  value: PolicyDecisionResult["decision"],
  reason: string,
  context?: Omit<PolicyContext, "contract">,
): PolicyDecisionResult {
  return {
    action,
    decision: value,
    reason,
    contract: contract.name,
    ...(context?.source ? { source: context.source } : {}),
    ...(context?.actor ? { actor: context.actor } : {}),
    ...(context?.metadata ? { metadata: context.metadata } : {}),
  };
}

/**
 * Deterministic policy evaluation. No model or external service is involved.
 * Explicit deny wins, followed by approval-required, then allow. Unknown
 * actions fail closed.
 */
export function evaluatePolicy(
  action: string,
  context: PolicyContext,
): PolicyDecisionResult {
  const normalizedAction = action.trim();

  if (!normalizedAction) {
    throw new Error("Policy action must be a non-empty string");
  }

  const { contract, ...metadata } = context;

  if (contract.actions.deny.includes(normalizedAction)) {
    return decision(
      contract,
      normalizedAction,
      "BLOCK",
      "Action is explicitly forbidden by the execution contract",
      metadata,
    );
  }

  if (contract.actions.approvalRequired.includes(normalizedAction)) {
    return decision(
      contract,
      normalizedAction,
      "APPROVAL_REQUIRED",
      "Action requires human approval before execution",
      metadata,
    );
  }

  if (contract.actions.allow.includes(normalizedAction)) {
    return decision(
      contract,
      normalizedAction,
      "ALLOW",
      "Action is explicitly permitted by the execution contract",
      metadata,
    );
  }

  return decision(
    contract,
    normalizedAction,
    "BLOCK",
    "Action is not declared by the execution contract; policy fails closed",
    metadata,
  );
}

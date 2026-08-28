import type { ExecutionContract } from "../contract/types.js";
import { evaluatePolicy } from "./evaluate.js";
import type {
  ApprovalRequest,
  PolicyContext,
  PolicyDecisionEvent,
  PolicyDecisionResult,
  PolicyGateOptions,
} from "./types.js";

export class PolicyBlockedError extends Error {
  readonly decision: PolicyDecisionResult;

  constructor(decision: PolicyDecisionResult) {
    super(`Policy blocked action "${decision.action}": ${decision.reason}`);
    this.name = "PolicyBlockedError";
    this.decision = decision;
  }
}

export class ApprovalDeniedError extends Error {
  readonly decision: PolicyDecisionResult;
  readonly requestId: string;

  constructor(decision: PolicyDecisionResult, requestId: string) {
    super(`Approval denied for action "${decision.action}"`);
    this.name = "ApprovalDeniedError";
    this.decision = decision;
    this.requestId = requestId;
  }
}

export interface PolicyGateResult<T> {
  result: T;
  decision: PolicyDecisionResult;
  approvalRequestId?: string;
}

function defaultRequestId(): string {
  return `approval-${crypto.randomUUID()}`;
}

/**
 * Hard pre-execution boundary. The executor is never invoked for BLOCK, and
 * approval-gated actions are never invoked until the approval callback grants
 * the exact request created by this gate.
 */
export class PolicyGate {
  private readonly now: () => string;
  private readonly createRequestId: () => string;
  private readonly onDecision?: PolicyGateOptions["onDecision"];
  private readonly requestApproval?: PolicyGateOptions["requestApproval"];

  constructor(options: PolicyGateOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createRequestId = options.createRequestId ?? defaultRequestId;
    this.onDecision = options.onDecision;
    this.requestApproval = options.requestApproval;
  }

  async execute<T>(
    action: string,
    contract: ExecutionContract,
    executor: () => Promise<T> | T,
    context: Omit<PolicyContext, "contract"> = {},
  ): Promise<PolicyGateResult<T>> {
    const decision = evaluatePolicy(action, { contract, ...context });
    await this.emitDecision(decision);

    if (decision.decision === "BLOCK") {
      throw new PolicyBlockedError(decision);
    }

    if (decision.decision === "ALLOW") {
      return {
        result: await executor(),
        decision,
      };
    }

    if (!this.requestApproval) {
      throw new Error(
        `Approval is required for action "${action}", but no approval handler is configured`,
      );
    }

    const request: ApprovalRequest = {
      id: this.createRequestId(),
      action: decision.action,
      reason: decision.reason,
      contract: decision.contract,
      requestedAt: this.now(),
    };

    const approval = await this.requestApproval(request);

    if (approval.requestId !== request.id) {
      const mismatchDecision: PolicyDecisionResult = {
        ...decision,
        decision: "BLOCK",
        reason:
          "Approval response did not match the exact request created by the policy gate",
        metadata: {
          ...(decision.metadata ?? {}),
          approvalRequestId: request.id,
          approvalResponseRequestId: approval.requestId,
          approvalDecision: "rejected",
          rejectionReason: "request_id_mismatch",
        },
      };

      await this.emitDecision(mismatchDecision);

      throw new ApprovalDeniedError(mismatchDecision, request.id);
    }

    if (!approval.approved) {
      const deniedDecision: PolicyDecisionResult = {
        ...decision,
        decision: "BLOCK",
        reason: approval.reason ?? "Human approval denied; action was not executed",
        metadata: {
          ...(decision.metadata ?? {}),
          approvalRequestId: request.id,
          approvalDecision: "denied",
        },
      };

      await this.emitDecision(deniedDecision);

      throw new ApprovalDeniedError(deniedDecision, request.id);
    }

    const effectiveDecision: PolicyDecisionResult = {
      ...decision,
      decision: "ALLOW",
      reason: "Human approval granted; action is now permitted",
      metadata: {
        ...(decision.metadata ?? {}),
        approvalRequestId: request.id,
        approvalDecision: "granted",
      },
    };

    await this.emitDecision(effectiveDecision);

    return {
      result: await executor(),
      decision: effectiveDecision,
      approvalRequestId: request.id,
    };
  }

  private async emitDecision(
    result: PolicyDecisionResult,
  ): Promise<void> {
    if (!this.onDecision) {
      return;
    }

    const event: PolicyDecisionEvent = {
      type: "policy.decision",
      timestamp: this.now(),
      ...result,
    };

    await this.onDecision(event);
  }
}

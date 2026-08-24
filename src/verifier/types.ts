export const VERIFICATION_VERDICTS = [
  "PASS",
  "WARN",
  "FAIL",
] as const;

export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

export type ObservationKind =
  | "action"
  | "approval"
  | "retry"
  | "evidence"
  | "outcome";

export interface VerificationObservation {
  kind: ObservationKind;
  action?: string;
  approved?: boolean;
  retryCount?: number;
  evidence?: string[];
  outcomeVerified?: boolean;
  eventId?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

export interface VerificationFinding {
  code:
    | "ACTION_ALLOWED"
    | "ACTION_APPROVAL_REQUIRED"
    | "ACTION_DENIED"
    | "APPROVAL_MISSING"
    | "APPROVAL_GRANTED"
    | "RETRY_LIMIT_EXCEEDED"
    | "REQUIRED_EVIDENCE_MISSING"
    | "OUTCOME_UNVERIFIED"
    | "UNKNOWN_ACTION"
    | "MALFORMED_OBSERVATION";
  verdict: VerificationVerdict;
  message: string;
  action?: string;
  eventId?: string;
}

export interface VerificationReport {
  verdict: VerificationVerdict;
  findings: VerificationFinding[];
  observationsEvaluated: number;
  passed: number;
  warnings: number;
  failures: number;
}

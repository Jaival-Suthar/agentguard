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
  actionEventId?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

export interface VerificationFinding {
  code:
    | "ACTION_ALLOWED"
    | "ACTION_DENIED"
    | "APPROVAL_MISSING"
    | "APPROVAL_GRANTED"
    | "RETRY_LIMIT_EXCEEDED"
    | "RETRY_WITHIN_LIMIT"
    | "REQUIRED_EVIDENCE_MISSING"
    | "REQUIRED_EVIDENCE_PRESENT"
    | "OUTCOME_UNVERIFIED"
    | "OUTCOME_VERIFIED"
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
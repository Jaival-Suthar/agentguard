import type { EvidenceVerificationReport } from "../verifier/evidence.js";
import type { VerificationReport } from "../verifier/types.js";

export const ASSURANCE_VERDICTS = [
  "PASS",
  "WARN",
  "FAIL",
] as const;

export type AssuranceVerdict =
  (typeof ASSURANCE_VERDICTS)[number];

export type AssuranceStatus =
  | "COMPLETED"
  | "RECOVERED"
  | "BLOCKED"
  | "FAILED"
  | "EXHAUSTED";

export interface AssuranceCheck {
  status: "PASS" | "WARN" | "FAIL";
  summary: string;
  details?: string[];
}

export interface AssuranceRecovery {
  status:
    | "NOT_REQUIRED"
    | "RECOVERED"
    | "EXHAUSTED";
  attempts: number;
  retries: number;
  maxRetries: number;
}

export interface AssuranceArtifact {
  version: 1;
  runId: string;
  contract: string;
  incidentId?: string;
  status: AssuranceStatus;
  verdict: AssuranceVerdict;
  policy: AssuranceCheck;
  execution: AssuranceCheck;
  recovery: AssuranceRecovery;
  evidence: AssuranceCheck;
  contractVerification: AssuranceCheck;
  summary: string;
  failureReasons: string[];
  generatedAt: string;
}

export interface AssuranceBuildInput {
  runId: string;
  contractName: string;
  incidentId?: string;

  policyVerdict:
    | "ALLOW"
    | "BLOCK"
    | "APPROVAL_REQUIRED";

  executionFailed: boolean;

  recovery: {
    attempts: number;
    retries: number;
    recovered: boolean;
    exhausted: boolean;
    maxRetries: number;
  };

  evidenceReport: EvidenceVerificationReport;
  contractReport: VerificationReport;

  generatedAt: string;
}
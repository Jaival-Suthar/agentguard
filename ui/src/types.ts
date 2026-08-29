export type CheckStatus = "PASS" | "WARN" | "FAIL";
export type AssuranceVerdict = CheckStatus;
export type AssuranceStatus =
  | "COMPLETED"
  | "RECOVERED"
  | "BLOCKED"
  | "FAILED"
  | "EXHAUSTED";

export interface AssuranceCheck {
  status: CheckStatus;
  summary: string;
  details?: string[];
}

export interface AssuranceRecovery {
  status: "NOT_REQUIRED" | "RECOVERED" | "EXHAUSTED";
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

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

export type LiveConnectionState =
  | "LIVE"
  | "RUNNING"
  | "RECOVERING"
  | "VERIFYING"
  | "WARN"
  | "RECONNECTING"
  | "VERIFIED"
  | "FAILED"
  | "IDLE";

export interface ExecutionEvent {
  id: string;
  runId: string;
  sessionId?: string;
  source: "trueforge";
  type: string;
  timestamp: string;
  receivedAt: string;
  correlationId?: string;
  status?: string;
  data: Record<string, unknown>;
  raw: unknown;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  baseUrl: string;
  model: string;
  prompt: string;
  eventCount: number;
  eventTypes: string[];
  sessionId?: string;
  completedAt?: string;
  finalStatus?: string;
  incidentId?: string;
  verdict?: AssuranceArtifact["verdict"];
  status?: AssuranceArtifact["status"];
  artifactAvailable: boolean;
  connectionState: LiveConnectionState;
}

export interface RunDetail {
  summary: RunSummary;
  artifact?: AssuranceArtifact;
  events: ExecutionEvent[];
}

export type TimelineEntryKind = "event" | "artifact";

export interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  stage: string;
  state: "PASS" | "WARN" | "FAIL" | "LIVE";
  title: string;
  summary: string;
  timestamp: string;
  details: string[];
  payload: Record<string, unknown>;
}

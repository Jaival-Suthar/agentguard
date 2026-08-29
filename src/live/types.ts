import type { AssuranceArtifact } from "../assurance/types.js";
import type { ExecutionEvent } from "../events/types.js";

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

export interface RunSnapshot {
  summary: RunSummary;
  artifact?: AssuranceArtifact;
  events: ExecutionEvent[];
}

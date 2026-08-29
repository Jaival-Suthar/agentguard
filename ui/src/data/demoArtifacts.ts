import type { AssuranceArtifact } from "../types";

export const fallbackPassArtifact: AssuranceArtifact = {
  version: 1,
  runId: "demo-pass",
  contract: "incident-investigation",
  incidentId: "INC-042",
  status: "RECOVERED",
  verdict: "PASS",
  policy: {
    status: "PASS",
    summary: "Policy requirements were satisfied.",
  },
  execution: {
    status: "PASS",
    summary: "Execution completed after recovery.",
    details: ["Execution required 2 attempt(s).", "Recovery performed 1 retry(ies)."],
  },
  recovery: {
    status: "RECOVERED",
    attempts: 2,
    retries: 1,
    maxRetries: 2,
  },
  evidence: {
    status: "PASS",
    summary: "Required evidence was independently verified.",
    details: ["Verified evidence items: 1", "Passed findings: 2", "Warnings: 0", "Failures: 0"],
  },
  contractVerification: {
    status: "PASS",
    summary: "Execution contract requirements were satisfied.",
    details: ["Observations evaluated: 8", "Passed findings: 7", "Warnings: 0", "Failures: 0"],
  },
  summary: "Execution recovered successfully and all assurance checks passed.",
  failureReasons: [],
  generatedAt: "2026-08-29T10:54:07.351Z",
};

export const fallbackFailArtifact: AssuranceArtifact = {
  version: 1,
  runId: "demo-fail",
  contract: "chaos-incident-investigation",
  incidentId: "INC-042",
  status: "EXHAUSTED",
  verdict: "FAIL",
  policy: {
    status: "PASS",
    summary: "Policy requirements were satisfied.",
  },
  execution: {
    status: "FAIL",
    summary: "Execution did not complete successfully.",
  },
  recovery: {
    status: "EXHAUSTED",
    attempts: 3,
    retries: 2,
    maxRetries: 2,
  },
  evidence: {
    status: "FAIL",
    summary: "Evidence verification returned FAIL.",
    details: ["Verified evidence items: 0", "Passed findings: 0", "Warnings: 0", "Failures: 2"],
  },
  contractVerification: {
    status: "FAIL",
    summary: "Contract verification returned FAIL.",
    details: ["Observations evaluated: 9", "Passed findings: 5", "Warnings: 0", "Failures: 2"],
  },
  summary: "Recovery exhausted its retry budget.",
  failureReasons: [
    "Execution did not complete successfully.",
    "Recovery exhausted its retry budget.",
    "Evidence verification returned FAIL.",
    "Contract verification returned FAIL.",
  ],
  generatedAt: "2026-08-29T10:54:07.351Z",
};

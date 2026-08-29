import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssuranceArtifact } from "../types";
import { VerdictPanel } from "./VerdictPanel";

function makeArtifact(verdict: AssuranceArtifact["verdict"]): AssuranceArtifact {
  return {
    version: 1,
    runId: "run-1",
    contract: "incident-investigation",
    incidentId: "INC-042",
    status: verdict === "FAIL" ? "FAILED" : "COMPLETED",
    verdict,
    policy: {
      status: "PASS",
      summary: "Policy requirements were satisfied.",
      details: [],
    },
    execution: {
      status: "PASS",
      summary: "Execution completed successfully.",
      details: [],
    },
    recovery: {
      status: "NOT_REQUIRED",
      attempts: 1,
      retries: 0,
      maxRetries: 3,
    },
    evidence: {
      status: verdict,
      summary:
        verdict === "PASS"
          ? "Required evidence was independently verified."
          : verdict === "WARN"
            ? "Evidence verification returned WARN."
            : "Evidence verification returned FAIL.",
      details: [],
    },
    contractVerification: {
      status: "PASS",
      summary: "Execution contract requirements were satisfied.",
      details: [],
    },
    summary:
      verdict === "PASS"
        ? "Execution completed and all assurance checks passed."
        : verdict === "WARN"
          ? "Execution completed with warnings."
          : "Execution completed with failure.",
    failureReasons: verdict === "FAIL" ? ["Evidence verification returned FAIL."] : [],
    generatedAt: "2026-08-29T10:00:02.000Z",
  };
}

test("VerdictPanel preserves PASS, WARN, and FAIL as distinct verdict states", () => {
  const passHtml = renderToStaticMarkup(
    React.createElement(VerdictPanel, {
      artifact: makeArtifact("PASS"),
      connectionState: "FAILED",
    }),
  );
  const warnHtml = renderToStaticMarkup(
    React.createElement(VerdictPanel, {
      artifact: makeArtifact("WARN"),
      connectionState: "FAILED",
    }),
  );
  const failHtml = renderToStaticMarkup(
    React.createElement(VerdictPanel, {
      artifact: makeArtifact("FAIL"),
      connectionState: "FAILED",
    }),
  );

  assert.match(passHtml, /ag-verdict-panel pass/);
  assert.match(passHtml, />PASS</);

  assert.match(warnHtml, /ag-verdict-panel warn/);
  assert.match(warnHtml, />WARN</);
  assert.doesNotMatch(warnHtml, /ag-verdict-panel fail/);

  assert.match(failHtml, /ag-verdict-panel fail/);
  assert.match(failHtml, />FAIL</);
});


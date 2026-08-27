declare const process: {
  argv: string[];
  exitCode?: number;
};

import { loadExecutionContract } from "../src/contract/loader.js";
import {
  loadTrueForgeObservations,
} from "../src/verifier/trueforge-observations.js";
import {
  verifyObservations,
} from "../src/verifier/verify.js";
import type {
  VerificationObservation,
  VerificationFinding,
} from "../src/verifier/types.js";

const evidencePath = process.argv[2];

const EXPECTED_CHAOS_ACTION =
  "mcp:incident.lookup.chaos:lookup_incident";

if (!evidencePath) {
  throw new Error(
    "Usage: npm run verify:chaos-mcp -- data\\runs\\<run-id>.jsonl",
  );
}

const contract = await loadExecutionContract(
  "contracts/fixtures/chaos-incident-investigation.yaml",
);

const observations =
  await loadTrueForgeObservations(evidencePath);

const report =
  verifyObservations(
    contract,
    observations,
  );

const observedActions: string[] = [];

for (
  const observation of observations
) {
  if (
    observation.kind === "action" &&
    typeof observation.action === "string"
  ) {
    observedActions.push(
      observation.action,
    );
  }
}

const expectedChaosActionObserved =
  observedActions.includes(
    EXPECTED_CHAOS_ACTION,
  );

function outcomeMatchesExpectedChaos(
  observation: VerificationObservation,
): boolean {
  if (
    observation.kind !== "outcome"
  ) {
    return false;
  }

  if (
    observation.outcomeVerified !== true
  ) {
    return false;
  }

  const data =
    observation.data;

  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return false;
  }

  const action =
    (data as Record<string, unknown>)
      .action;

  return action === EXPECTED_CHAOS_ACTION;
}

const expectedChaosOutcomeVerified =
  observations.some(
    outcomeMatchesExpectedChaos,
  );

const findings: VerificationFinding[] = [
  ...report.findings,
];

if (
  !expectedChaosActionObserved
) {
  findings.push({
    code:
      "EXPECTED_CHAOS_ACTION_MISSING",
    verdict: "FAIL",
    message:
      `Expected Chaos MCP action "${EXPECTED_CHAOS_ACTION}" was not observed.`,
    action:
      EXPECTED_CHAOS_ACTION,
  });
}

if (
  !expectedChaosOutcomeVerified
) {
  findings.push({
    code:
      "EXPECTED_CHAOS_OUTCOME_MISSING",
    verdict: "FAIL",
    message:
      `No verified tool outcome was observed for expected Chaos MCP action "${EXPECTED_CHAOS_ACTION}".`,
    action:
      EXPECTED_CHAOS_ACTION,
  });
}

const verdict =
  findings.some(
    (finding) =>
      finding.verdict === "FAIL",
  )
    ? "FAIL"
    : findings.some(
          (finding) =>
            finding.verdict === "WARN",
        )
      ? "WARN"
      : "PASS";

const passed =
  findings.filter(
    (finding) =>
      finding.verdict === "PASS",
  ).length;

const warnings =
  findings.filter(
    (finding) =>
      finding.verdict === "WARN",
  ).length;

const failures =
  findings.filter(
    (finding) =>
      finding.verdict === "FAIL",
  ).length;

console.log("");
console.log(
  "AgentGuard Chaos Verification",
);
console.log(
  "=============================",
);
console.log(
  `Contract: ${contract.name}`,
);
console.log(
  `Evidence: ${evidencePath}`,
);
console.log("");

console.log(
  `Observed MCP actions: ${observedActions.length}`,
);

for (
  const action of observedActions
) {
  console.log(`- ${action}`);
}

console.log("");

console.log(
  `Expected Chaos action: ${
    expectedChaosActionObserved
      ? "OBSERVED"
      : "MISSING"
  }`,
);

console.log(
  `Expected Chaos outcome: ${
    expectedChaosOutcomeVerified
      ? "VERIFIED"
      : "MISSING OR UNVERIFIED"
  }`,
);

console.log("");

console.log(
  `Verdict: ${verdict}`,
);
console.log(
  `Passed: ${passed}`,
);
console.log(
  `Warnings: ${warnings}`,
);
console.log(
  `Failures: ${failures}`,
);
console.log("");

for (
  const finding of findings
) {
  console.log(
    `[${finding.verdict}] ${finding.code}: ${finding.message}`,
  );
}

process.exitCode =
  verdict === "PASS"
    ? 0
    : 1;
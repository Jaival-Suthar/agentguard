declare const process: {
  argv: string[];
  exitCode?: number;
};

import { loadExecutionContract } from "../src/contract/loader.js";
import { loadTrueForgeObservations } from "../src/verifier/trueforge-observations.js";
import { verifyExecutionEvidence } from "../src/verifier/evidence.js";

const evidencePath = process.argv[2];
const targetIncidentId = process.argv[3] ?? "INC-042";

if (!evidencePath) {
  throw new Error(
    "Usage: npm run verify:evidence -- data\\runs\\<run-id>.jsonl [INC-042]",
  );
}

const contract = await loadExecutionContract(
  "contracts/incident-investigation.yaml",
);

const observations = await loadTrueForgeObservations(evidencePath);
const report = verifyExecutionEvidence(contract, observations, {
  targetIncidentId,
});

console.log("");
console.log("AgentGuard Evidence Verification");
console.log("================================");
console.log(`Contract: ${contract.name}`);
console.log(`Evidence: ${evidencePath}`);
console.log(`Target incident: ${targetIncidentId}`);
console.log("");
console.log(`Observations evaluated: ${report.observationsEvaluated}`);
console.log(`Verified evidence items: ${report.evidence.length}`);
console.log("");
console.log(`Verdict: ${report.verdict}`);
console.log(`Passed: ${report.passed}`);
console.log(`Warnings: ${report.warnings}`);
console.log(`Failures: ${report.failures}`);
console.log("");

for (const item of report.evidence) {
  const correlation = [
    item.actionEventId ? `action=${item.actionEventId}` : undefined,
    item.outcomeEventId ? `outcome=${item.outcomeEventId}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  console.log(
    `[EVIDENCE] ${item.type} source=${item.source}${correlation ? ` ${correlation}` : ""}`,
  );
}

console.log("");

for (const finding of report.findings) {
  console.log(
    `[${finding.verdict}] ${finding.code}: ${finding.message}`,
  );
}

process.exitCode = report.verdict === "FAIL" ? 1 : 0;

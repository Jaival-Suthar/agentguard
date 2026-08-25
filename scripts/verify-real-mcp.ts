declare const process: {
  argv: string[];
  exitCode?: number;
};

import { loadExecutionContract } from "../src/contract/loader.js";
import { loadTrueForgeObservations } from "../src/verifier/trueforge-observations.js";
import { verifyObservations } from "../src/verifier/verify.js";

const evidencePath = process.argv[2];

if (!evidencePath) {
  throw new Error(
    "Usage: npm run verify:real-mcp -- data\\runs\\<run-id>.jsonl",
  );
}

const contract = await loadExecutionContract(
  "contracts/incident-investigation.yaml",
);

const observations = await loadTrueForgeObservations(evidencePath);

const report = verifyObservations(contract, observations);

console.log("");
console.log("AgentGuard Verification");
console.log("=======================");
console.log(`Contract: ${contract.name}`);
console.log(`Evidence: ${evidencePath}`);
console.log("");
console.log(`Observed MCP actions: ${observations.length}`);

for (const observation of observations) {
  if (observation.kind === "action") {
    console.log(`- ${observation.action}`);
  }
}

console.log("");
console.log(`Verdict: ${report.verdict}`);
console.log(`Passed: ${report.passed}`);
console.log(`Warnings: ${report.warnings}`);
console.log(`Failures: ${report.failures}`);
console.log("");

for (const finding of report.findings) {
  console.log(
    `[${finding.verdict}] ${finding.code}: ${finding.message}`,
  );
}

process.exitCode = report.verdict === "FAIL" ? 1 : 0;
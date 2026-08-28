import { loadExecutionContract } from "../src/contract/index.js";
import {
  ApprovalDeniedError,
  PolicyBlockedError,
  PolicyGate,
  type ApprovalDecision,
  type ApprovalRequest,
} from "../src/policy/index.js";

const contractPath = process.argv[2] ?? "contracts/incident-investigation.yaml";
const contract = await loadExecutionContract(contractPath);

console.log("AgentGuard Policy Verification");
console.log("===============================");
console.log(`Contract: ${contract.name}`);
console.log("");

async function runScenario(
  label: string,
  action: string,
  requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>,
): Promise<void> {
  let executions = 0;
  const gate = new PolicyGate({
    createRequestId: () => `${label.toLowerCase().replace(/\s+/g, "-")}-approval`,
    onDecision: (event) => {
      console.log(JSON.stringify(event));
    },
    ...(requestApproval ? { requestApproval } : {}),
  });

  try {
    const result = await gate.execute(action, contract, () => {
      executions += 1;
      return "EXECUTED";
    });

    console.log(`${label}: ${result.decision.decision} / executions=${executions}`);
  } catch (error) {
    if (error instanceof PolicyBlockedError) {
      console.log(`${label}: BLOCK / executions=${executions}`);
      return;
    }

    if (error instanceof ApprovalDeniedError) {
      console.log(`${label}: BLOCK_AFTER_APPROVAL_DENIAL / executions=${executions}`);
      return;
    }

    throw error;
  }
}

await runScenario(
  "SAFE",
  "mcp:incident.lookup:lookup_incident",
);

await runScenario(
  "DANGEROUS",
  "host:shell",
);

await runScenario(
  "SENSITIVE",
  "operation:rollback",
  async (request) => ({
    requestId: request.id,
    approved: true,
    decidedAt: new Date().toISOString(),
  }),
);

console.log("");
console.log("Policy verification complete.");

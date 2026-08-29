import "dotenv/config";
import { TrueForge } from "@truefoundry/trueforge-sdk";

import { loadExecutionContract } from "../src/contract/loader.js";
import {
  executeWithRecovery,
  RecoveryExhaustedError,
} from "../src/recovery/index.js";
import { RunStore, type RunMetadata } from "../src/trueforge/run-store.js";
import { normalizeTrueForgeObservations } from "../src/verifier/trueforge-observations.js";
import {
  verifyExecutionEvidence,
  type EvidenceVerificationReport,
} from "../src/verifier/evidence.js";
import { verifyObservations } from "../src/verifier/verify.js";
import type { VerificationObservation } from "../src/verifier/types.js";
import type { RecordedTrueForgeEvent } from "../src/events/types.js";

const baseUrl = (
  process.env.TRUEFORGE_BASE_URL?.trim() || "http://localhost:8791"
).replace(/\/+$/, "");

const modelName = process.env.TRUEFORGE_MODEL_NAME?.trim();
const agentName = process.env.TRUEFORGE_AGENT_NAME?.trim();

const mcpServerName =
  process.env.TRUEFORGE_MCP_SERVER_NAME?.trim() ||
  "incident.lookup.chaos";

const incidentId =
  process.env.TRUEFORGE_INCIDENT_ID?.trim() || "INC-042";

const contractPath =
  process.env.TRUEFORGE_RECOVERY_CONTRACT?.trim() ||
  "contracts/fixtures/chaos-incident-investigation.yaml";

if (!modelName) {
  throw new Error("Missing required environment variable TRUEFORGE_MODEL_NAME");
}

if (!agentName) {
  throw new Error("Missing required environment variable TRUEFORGE_AGENT_NAME");
}

const resolvedModelName = modelName;
const resolvedAgentName = agentName;

const EXPECTED_CHAOS_ACTION =
  `mcp:${mcpServerName}:lookup_incident`;

const contract = await loadExecutionContract(contractPath);

const client = new TrueForge({
  baseUrl,
  timeoutInSeconds: 600,
});

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const store = new RunStore(runId);

await store.init();

const metadata: RunMetadata = {
  runId,
  startedAt: new Date().toISOString(),
  baseUrl,
  model: resolvedModelName,
  prompt: "",
  eventCount: 0,
  eventTypes: [],
};

const eventTypes = new Set<string>();
const allObservations: VerificationObservation[] = [];

let nextAttemptNumber = 1;

const attemptReports: Array<{
  attempt: number;
  observations: VerificationObservation[];
  report: EvidenceVerificationReport;
}> = [];

const prompt = [
  "Perform exactly one incident lookup for the requested synthetic incident.",
  `Target incident: ${incidentId}.`,
  `Use exactly the MCP server named ${mcpServerName}.`,
  "Call lookup_incident exactly once.",
  "Do not retry the tool yourself.",
  "Do not invent facts.",
  "Do not use any other tool.",
  "Return a concise result after the single tool call.",
].join("\n");

metadata.prompt = prompt;

interface AttemptExecution {
  attempt: number;
  sessionId: string;
  observations: VerificationObservation[];
  report: EvidenceVerificationReport;
}

async function runAttempt(attemptNumber: number): Promise<AttemptExecution> {
  const { data: savedAgents } = await client.agents.list();

  const savedAgent = savedAgents.find(
    (agent) => agent.name === resolvedAgentName,
  );

  if (!savedAgent) {
    throw new Error(
      `Missing saved TrueForge agent named ${resolvedAgentName}.`,
    );
  }

  const savedMcpServers = savedAgent.manifest.mcpServers ?? [];

  if (savedMcpServers.length === 0) {
    throw new Error(
      `Saved TrueForge agent ${resolvedAgentName} has no MCP server configuration.`,
    );
  }

  const configuredMcpServers = savedMcpServers.map((server) => {
    if (server.name === "incident.lookup") {
      return {
        ...server,
        name: mcpServerName,
      };
    }

    return server;
  });

  if (
    !configuredMcpServers.some(
      (server) => server.name === mcpServerName,
    )
  ) {
    throw new Error(
      `Unable to configure MCP server "${mcpServerName}" from saved agent "${resolvedAgentName}".`,
    );
  }

  const sessionAgentSpec = {
    ...savedAgent.manifest,
    model: {
      name: resolvedModelName,
    },
    mcpServers: configuredMcpServers,
  };

  const { data: session } = await client.sessions.create({
    agent: {
      spec: sessionAgentSpec,
    },
  });

  metadata.sessionId = session.id;

  const rawEvents: Array<Record<string, unknown>> = [];

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [
      {
        type: "user.message",
        content: [
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  for await (const { data: event } of stream.withMetadata()) {
    const receivedAt = new Date().toISOString();

    const rawEvent =
      event as unknown as Record<string, unknown>;

    rawEvents.push(rawEvent);

    metadata.eventCount += 1;

    const eventType =
      typeof rawEvent.type === "string"
        ? rawEvent.type
        : "unknown";

    eventTypes.add(eventType);

    const record: RecordedTrueForgeEvent = {
      received_at: receivedAt,
      event: rawEvent,
    };

    await store.append(record);
  }

  /*
   * IMPORTANT:
   *
   * Do not reject a turn merely because TrueForge reports
   * turn.status === "error".
   *
   * A failed Chaos turn is itself evidence that AgentGuard
   * must normalize and verify. Recovery needs to see that
   * failed evidence so that the verifier can decide whether
   * the attempt failed and therefore needs a retry.
   */

  const observations =
    normalizeTrueForgeObservations(rawEvents);

  const report = verifyExecutionEvidence(
    contract,
    observations,
    {
      targetIncidentId: incidentId,
      mcpIncidentAction: EXPECTED_CHAOS_ACTION,
      requireSandboxAnalysis: false,
    },
  );

  attemptReports.push({
    attempt: attemptNumber,
    observations,
    report,
  });

  if (report.verdict !== "PASS") {
    throw new RecoveryVerificationError(
      attemptNumber,
      report,
      observations,
    );
  }

  return {
    attempt: attemptNumber,
    sessionId: session.id,
    observations,
    report,
  };
}

class RecoveryVerificationError extends Error {
  readonly attempt: number;
  readonly report: EvidenceVerificationReport;
  readonly observations: VerificationObservation[];

  constructor(
    attempt: number,
    report: EvidenceVerificationReport,
    observations: VerificationObservation[],
  ) {
    super(
      `Recovery attempt ${attempt} produced a ${report.verdict} evidence verdict.`,
    );

    this.name = "RecoveryVerificationError";
    this.attempt = attempt;
    this.report = report;
    this.observations = observations;
  }
}

function printReport(
  report: EvidenceVerificationReport,
  verificationVerdict: string,
): void {
  console.log("");
  console.log("AgentGuard Recovery + Chaos Verification");
  console.log("=========================================");
  console.log(`Contract: ${contract.name}`);
  console.log(`Evidence: ${store.jsonlPath}`);
  console.log(`Target incident: ${incidentId}`);
  console.log(`Expected action: ${EXPECTED_CHAOS_ACTION}`);
  console.log("");

  console.log(
    `Recovery attempts: ${attemptReports.length}`,
  );

  console.log(
    `Recovery retries: ${Math.max(
      0,
      attemptReports.length - 1,
    )}`,
  );

  console.log(
    `Evidence verdict: ${report.verdict}`,
  );

  console.log(
    `Contract verdict: ${verificationVerdict}`,
  );

  console.log(
    `Verified evidence items: ${report.evidence.length}`,
  );

  console.log("");

  for (const attempt of attemptReports) {
    console.log(
      `Attempt ${attempt.attempt}: ${attempt.report.verdict} (${attempt.observations.length} observations)`,
    );
  }

  console.log("");

  for (const item of report.evidence) {
    const correlation = [
      item.actionEventId
        ? `action=${item.actionEventId}`
        : undefined,

      item.outcomeEventId
        ? `outcome=${item.outcomeEventId}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    console.log(
      `[EVIDENCE] ${item.type} source=${item.source}${
        correlation ? ` ${correlation}` : ""
      }`,
    );
  }

  console.log("");

  for (const finding of report.findings) {
    console.log(
      `[${finding.verdict}] ${finding.code}: ${finding.message}`,
    );
  }

  console.log("");
}

try {
  console.log(`Run ID: ${runId}`);
  console.log(`TrueForge: ${baseUrl}`);
  console.log(`Model: ${resolvedModelName}`);
  console.log(`Agent: ${resolvedAgentName}`);
  console.log(`Chaos MCP: ${mcpServerName}`);
  console.log(`Incident: ${incidentId}`);
  console.log(
    `Contract maxRetries: ${contract.limits.maxRetries}`,
  );
  console.log("");

  const recovery = await executeWithRecovery(
    contract,
    () => {
      const attemptNumber = nextAttemptNumber;
      nextAttemptNumber += 1;

      return runAttempt(attemptNumber);
    },
    {
      onRetry: async (retry, error) => {
        console.log(
          `[RECOVERY] retry=${retry} reason=${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      },
    },
  );

    for (let index = 0; index < attemptReports.length; index += 1) {
      const attempt = attemptReports[index];

      if (!attempt) {
        continue;
      }

      allObservations.push(...attempt.observations);

      const isLastAttempt = index === attemptReports.length - 1;

      if (!isLastAttempt) {
        allObservations.push({
          kind: "retry",
          retryCount: index + 1,
          data: {
            recovered: recovery.recovered,
            attempts: recovery.attempts,
          },
        });
      }
    }

  const finalEvidenceReport =
    verifyExecutionEvidence(
      contract,
      allObservations,
      {
        targetIncidentId: incidentId,
        mcpIncidentAction: EXPECTED_CHAOS_ACTION,
        requireSandboxAnalysis: false,
      },
    );

  const finalContractReport =
    verifyObservations(
      contract,
      allObservations,
    );

  if (finalEvidenceReport.verdict !== "PASS") {
    throw new Error(
      `Recovery completed, but final evidence verification returned ${finalEvidenceReport.verdict}.`,
    );
  }

  if (finalContractReport.verdict === "FAIL") {
    throw new Error(
      "Recovery completed, but contract verification returned FAIL.",
    );
  }

  printReport(
    finalEvidenceReport,
    finalContractReport.verdict,
  );

  console.log("RECOVERED → PASS");
  console.log("");
  console.log(`Evidence: ${store.jsonlPath}`);
} catch (error) {
  const exhausted =
    error instanceof RecoveryExhaustedError;

    for (let index = 0; index < attemptReports.length; index += 1) {
      const attempt = attemptReports[index];

      if (!attempt) {
        continue;
      }

      allObservations.push(...attempt.observations);

      const isLastAttempt = index === attemptReports.length - 1;

      if (!isLastAttempt) {
        allObservations.push({
          kind: "retry",
          retryCount: index + 1,
        });
      }
    }

  const finalEvidenceReport =
    verifyExecutionEvidence(
      contract,
      allObservations,
      {
        targetIncidentId: incidentId,
        mcpIncidentAction: EXPECTED_CHAOS_ACTION,
        requireSandboxAnalysis: false,
      },
    );

  const finalContractReport =
    verifyObservations(
      contract,
      allObservations,
    );

  printReport(
    finalEvidenceReport,
    finalContractReport.verdict,
  );

  console.error(
    `[RECOVERY] ${
      error instanceof Error
        ? error.message
        : String(error)
    }`,
  );

  console.error(
    exhausted
      ? "RECOVERY EXHAUSTED → FAIL"
      : "RECOVERY INTEGRATION FAILED → FAIL",
  );

  process.exitCode = 1;
} finally {
  metadata.eventTypes = [...eventTypes].sort();
  metadata.completedAt = new Date().toISOString();

  metadata.finalStatus =
    process.exitCode === 1
      ? "failed"
      : "done";

  await store.writeMetadata(metadata);
}

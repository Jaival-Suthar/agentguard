import "dotenv/config";
import { readFile } from "node:fs/promises";
import { TrueForge } from "@truefoundry/trueforge-sdk";

import type { RecordedTrueForgeEvent } from "../events/types.js";

import { normalizeTrueForgeRecords } from "../trueforge/adapter.js";
import { normalizeTrueForgeObservations } from "../verifier/trueforge-observations.js";

import { getEnv, requireEnv } from "../trueforge/env.js";


import {
  RunStore,
  type RunMetadata,
} from "../trueforge/run-store.js";

import {
  buildInvestigationReport,
  resolveIncidentLookupFromEvents,
} from "./report.js";

import type { InvestigationStatus } from "./types.js";
import type { VerificationObservation } from "../verifier/types.js";

const baseUrl = getEnv(
  "TRUEFORGE_BASE_URL",
  "http://localhost:8791",
).replace(/\/+$/, "");

const agentName = requireEnv("TRUEFORGE_AGENT_NAME");

const requestedModelName = requireEnv(
  "TRUEFORGE_MODEL_NAME",
);

const mcpServerName = getEnv(
  "TRUEFORGE_MCP_SERVER_NAME",
  "incident.lookup",
);

const incidentId = getEnv(
  "TRUEFORGE_INCIDENT_ID",
  "INC-042",
);

const sandboxEnabled =
  process.argv.includes("--sandbox") ||
  getEnv("TRUEFORGE_ENABLE_SANDBOX", "false").toLowerCase() === "true";

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
  model: requestedModelName,
  prompt: "",
  eventCount: 0,
  eventTypes: [],
};

const eventTypes = new Set<string>();

const prompt = [
  "You are investigating a synthetic production incident involving checkout-api.",
  "",
  `Target incident: ${incidentId}.`,
  `Use the ${mcpServerName} MCP server to gather evidence.`,
  "Call its lookup_incident tool for the target incident.",
  `Use exactly the MCP server named ${mcpServerName}.`,
  "Do not guess or substitute another MCP server name.",
  "Do not ask the user which MCP server to use.",
  "Do not invent facts.",
  "Determine what is failing, the likely root cause, what evidence supports that conclusion, and whether remediation should require human approval.",
  "Report only facts supported by tool results.",
  "Explicitly distinguish known facts from unknowns.",
  "Do not claim a root cause unless the evidence establishes it.",
  "Do not perform write operations outside the sandbox.",
  ...(sandboxEnabled
    ? [
        "SANDBOX MODE IS ENABLED.",
        "After obtaining the incident evidence, use the TrueForge Sandbox `exec` tool for deterministic analysis.",
        "Execute the uploaded sandbox-analysis.py.",
        "Do not rewrite or generate the Python program.",
        "Pass the exact lookup_incident tool response to sandbox-analysis.py through stdin.",
        "Use JSON exactly as returned by lookup_incident; do not remove or alter quotation marks.",
        "Run the script with: printf '%s' '<exact JSON>' | python3 sandbox-analysis.py",
        "The script must validate incident_id, service, severity, status, and suspected_component.",
        "The script must fail closed if any required field is absent.",
        "The script must derive root_cause_candidate only from suspected_component.",
        "The script must write analysis.json.",
        "Use the successful sandbox execution result as evidence.",
        "Do not invent or modify incident values.",
      ]
    : []),
  "Return a concise investigation summary.",
].join("\n");

metadata.prompt = prompt;

let response = "";

const recordedEvents: RecordedTrueForgeEvent[] = [];

let investigationStatus: InvestigationStatus = "INCOMPLETE";

let runError: unknown;

function isSuccessfulSandboxOutcome(
  observation: VerificationObservation,
): boolean {
  const parsedContent = observation.data?.parsedContent;

  if (
    !parsedContent ||
    typeof parsedContent !== "object" ||
    Array.isArray(parsedContent)
  ) {
    return false;
  }

  const response =
    (parsedContent as Record<string, unknown>).response;

  if (
    !response ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    return false;
  }

  return (
    (response as Record<string, unknown>).exitCode === 0
  );
}

try {
  console.log(`Run ID: ${runId}`);
  console.log(`TrueForge: ${baseUrl}`);
  console.log(`Requested model: ${requestedModelName}`);
  console.log(`Requested MCP server: ${mcpServerName}`);
  console.log("");

  const { data: savedAgents } =
    await client.agents.list();

  const savedAgent = savedAgents.find(
    (agent) => agent.name === agentName,
  );

  if (!savedAgent) {
    throw new Error(
      `Missing saved TrueForge agent named ${agentName}.`,
    );
  }

  /*
   * The saved agent is the normal incident investigator
   * and normally contains:
   *
   *   incident.lookup
   *
   * For chaos testing we need to create the session from
   * the same saved agent but replace the configured MCP
   * server name with the requested connector.
   *
   * This keeps the connector configuration intact while
   * allowing:
   *
   *   incident.lookup
   *
   * or:
   *
   *   incident.lookup.chaos
   *
   * to be selected at runtime.
   */
  const originalMcpServerName = "incident.lookup";

const savedMcpServers =
  savedAgent.manifest.mcpServers ?? [];

if (savedMcpServers.length === 0) {
  throw new Error(
    `Saved TrueForge agent ${agentName} has no MCP server configuration.`,
  );
}

const configuredMcpServers = savedMcpServers.map((server) => {
    if (server.name === originalMcpServerName) {
      return {
        ...server,
        name: mcpServerName,
      };
    }

    return server;
  });

const hasRequestedMcpServer =
  configuredMcpServers.some(
    (server) => server.name === mcpServerName,
  );

if (!hasRequestedMcpServer) {
  throw new Error(
    `Unable to configure MCP server "${mcpServerName}" from saved agent "${agentName}".`,
  );
}

  const sessionAgentSpec = {
    ...savedAgent.manifest,
    model: {
      name: requestedModelName,
    },
    mcpServers: configuredMcpServers,
    config: {
      ...(savedAgent.manifest.config ?? {}),
      sandbox: {
        ...(savedAgent.manifest.config?.sandbox ?? {}),
        enabled: sandboxEnabled,
      },
    },
  };

  console.log("Session agent MCP configuration:");

  console.log(
    JSON.stringify(
      configuredMcpServers,
      null,
      2,
    ),
  );

  console.log("");

  const { data: session } =
    await client.sessions.create({
      agent: {
        spec: sessionAgentSpec,
      },
    });

  metadata.sessionId = session.id;

  if (session.agent.type !== "inline") {
    throw new Error(
      `Expected an inline session agent after overriding the model, but received ${session.agent.type}.`,
    );
  }

  const runtimeModelName =
    session.agent.spec.model.name;

  metadata.model = runtimeModelName;

  await store.writeMetadata(metadata);

  console.log(`Session: ${session.id}`);
  console.log(`Agent: ${agentName}`);
  console.log(`Runtime model: ${runtimeModelName}`);
  console.log(`MCP server: ${mcpServerName}`);
  console.log(`Sandbox: ${sandboxEnabled ? "enabled" : "disabled"}`);
  console.log(`Incident: ${incidentId}`);
  console.log("");

  console.log(
    "Starting incident investigation...",
  );
  console.log("");
  const sandboxAnalysisScript = await readFile(
    new URL("./sandbox-analysis.py", import.meta.url),
  );
  const stream =
    await client.sessions.createTurnStream(
      session.id,
      {
        input: [
          {
            type: "user.message",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "file",
                name: "sandbox-analysis.py",
                data: `data:text/x-python;base64,${sandboxAnalysisScript.toString("base64")}`,
              },
            ],
          },
        ],
      },
    );

  for await (
    const { data: event } of stream.withMetadata()
  ) {
    const receivedAt =
      new Date().toISOString();

    metadata.eventCount += 1;

    eventTypes.add(
      typeof event.type === "string"
        ? event.type
        : "unknown",
    );

    const record: RecordedTrueForgeEvent = {
      received_at: receivedAt,
      event: event as unknown as Record<
        string,
        unknown
      >,
    };

    await store.append(record);

    recordedEvents.push(record);

    if (
      event.type === "model.message.delta"
    ) {
      const content =
        typeof event.content === "string"
          ? event.content
          : "";

      process.stdout.write(content);

      response += content;
    }

    if (event.type === "turn.done") {
      investigationStatus =
        event.state.status === "done"
          ? "COMPLETED"
          : "INCOMPLETE";

      metadata.finalStatus =
        event.state.status;

      console.log("");
      console.log("");
      console.log(
        `Turn status: ${event.state.status}`,
      );
    }
  }

  metadata.finalStatus ??= "done";
} catch (error) {
  runError = error;

  investigationStatus = "INCOMPLETE";

  metadata.finalStatus = "error";

  console.error("");

  console.error(
    `Investigation execution failed: ${
      error instanceof Error
        ? error.message
        : String(error)
    }`,
  );
} finally {
  metadata.completedAt =
    new Date().toISOString();

  metadata.eventTypes = [
    ...eventTypes,
  ].sort();

  try {
    await store.writeMetadata(metadata);
  } catch (metadataError) {
    console.error(
      `Failed to finalize run metadata: ${
        metadataError instanceof Error
          ? metadataError.message
          : String(metadataError)
      }`,
    );

    if (!runError) {
      runError = metadataError;
    }
  }
}

if (runError) {
  console.log("");
  console.log("Investigation");
  console.log("=============");
  console.log(`Incident: ${incidentId}`);
  console.log("Lookup result: UNKNOWN");
  console.log("Evidence retrieved: NO");
  console.log(
    "Investigation status: INCOMPLETE",
  );

  console.log("");

  console.log("Known facts:");
  console.log("- None observed.");

  console.log("");

  console.log("Unknowns:");

  console.log(
    "- Root cause has not been independently established.",
  );

  console.log(
    "- Remediation has not been executed or verified.",
  );

  console.log("");

  console.log("Next actions:");

  console.log(
    "- Gather additional evidence before claiming root cause.",
  );

  console.log(
    "- Verify the proposed remediation against observed evidence.",
  );

  console.log("");

  console.log(
    `Evidence: ${store.jsonlPath}`,
  );

  console.log(
    `Metadata: ${store.metadataPath}`,
  );

  console.log(
    `Events captured: ${metadata.eventCount}`,
  );

  console.log(
    `Types: ${metadata.eventTypes.join(", ")}`,
  );

  process.exitCode = 1;
} else {
  const normalizedEvents =
    normalizeTrueForgeRecords(
      recordedEvents,
      {
        runId,
        ...(metadata.sessionId
          ? {
              sessionId:
                metadata.sessionId,
            }
          : {}),
      },
    );

  const lookupResolution =
    resolveIncidentLookupFromEvents(
      normalizedEvents,
      incidentId,
      {
        mcpServerName,
        toolName: "lookup_incident",
      },
    );

    if (sandboxEnabled) {
      const sandboxObservations =
        normalizeTrueForgeObservations(
          recordedEvents.map((record) => record.event),
        );

      const sandboxExecutionVerified =
        sandboxObservations.some(
          (observation: VerificationObservation) =>
            observation.kind === "outcome" &&
            observation.data?.action === "sandbox:execute" &&
            observation.outcomeVerified === true &&
            isSuccessfulSandboxOutcome(observation),
        );

      if (!sandboxExecutionVerified) {
        investigationStatus = "INCOMPLETE";
        process.exitCode = 1;

        console.error(
          "Sandbox verification failed: no successful sandbox execution was observed.",
        );
      }
    }

  const report =
    buildInvestigationReport({
      targetIncidentId: incidentId,
      status: investigationStatus,
      incidentLookupResult:
        lookupResolution.incidentLookupResult,
      rawResponse: response,
      ...(lookupResolution.incidentValue
        ? {
            incidentValue:
              lookupResolution.incidentValue,
          }
        : {}),
    });

  console.log("");

  console.log("Investigation");
  console.log("=============");

  console.log(
    `Incident: ${report.targetIncidentId}`,
  );

  console.log(
    `Lookup result: ${report.incidentLookupResult}`,
  );

  console.log(
    `Evidence retrieved: ${
      report.evidenceRetrieved
        ? "YES"
        : "NO"
    }`,
  );

  console.log(
    `Investigation status: ${report.status}`,
  );

  console.log("");

  console.log("Known facts:");

  if (report.knownFacts.length === 0) {
    console.log("- None observed.");
  } else {
    for (const fact of report.knownFacts) {
      console.log(`- ${fact}`);
    }
  }

  console.log("");

  console.log("Unknowns:");

  for (const unknown of report.unknowns) {
    console.log(`- ${unknown}`);
  }

  console.log("");

  console.log("Next actions:");

  for (const action of report.nextActions) {
    console.log(`- ${action}`);
  }

  console.log("");

  console.log(
    `Evidence: ${store.jsonlPath}`,
  );

  console.log(
    `Metadata: ${store.metadataPath}`,
  );

  console.log(
    `Events captured: ${metadata.eventCount}`,
  );

  console.log(
    `Types: ${metadata.eventTypes.join(", ")}`,
  );
}
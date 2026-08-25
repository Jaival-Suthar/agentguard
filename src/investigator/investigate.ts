import "dotenv/config";

import { TrueForge } from "@truefoundry/trueforge-sdk";

import type { RecordedTrueForgeEvent } from "../events/types.js";

import { normalizeTrueForgeRecords } from "../trueforge/adapter.js";

import { getEnv, requireEnv } from "../trueforge/env.js";

import { RunStore, type RunMetadata } from "../trueforge/run-store.js";

import {
  buildInvestigationReport,
  resolveIncidentLookupFromEvents,
} from "./report.js";

import type { InvestigationStatus } from "./types.js";

const baseUrl = getEnv(
  "TRUEFORGE_BASE_URL",
  "http://localhost:8791",
).replace(/\/+$/, "");

const agentName = requireEnv("TRUEFORGE_AGENT_NAME");

const requestedModelName = requireEnv("TRUEFORGE_MODEL_NAME");

const incidentId = getEnv(
  "TRUEFORGE_INCIDENT_ID",
  "INC-042",
);

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
  "Use the incident.lookup MCP server to gather evidence.",
  "Call its lookup_incident tool for the target incident.",
  "Use exactly the MCP server named incident.lookup.",
  "Do not guess or substitute another MCP server name.",
  "Do not ask the user which MCP server to use.",
  "Do not invent facts.",
  "Determine what is failing, the likely root cause, what evidence supports that conclusion, and whether remediation should require human approval.",
  "Report only facts supported by tool results.",
  "Explicitly distinguish known facts from unknowns.",
  "Do not claim a root cause unless the evidence establishes it.",
  "Do not perform write operations.",
  "Return a concise investigation summary.",
].join("\n");

metadata.prompt = prompt;

let response = "";

const recordedEvents: RecordedTrueForgeEvent[] = [];

let investigationStatus: InvestigationStatus = "INCOMPLETE";

let runError: unknown;

try {
  console.log(`Run ID: ${runId}`);

  console.log(`TrueForge: ${baseUrl}`);

  console.log(`Requested model: ${requestedModelName}`);

  console.log("");

  const { data: savedAgents } = await client.agents.list();

  const savedAgent = savedAgents.find(
    (agent) => agent.name === agentName,
  );

  if (!savedAgent) {
    throw new Error(
      `Missing saved TrueForge agent named ${agentName}.`,
    );
  }

  const sessionAgentSpec = {
    ...savedAgent.manifest,
    model: {
      name: requestedModelName,
    },
  };

  const { data: session } = await client.sessions.create({
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

  const runtimeModelName = session.agent.spec.model.name;

  metadata.model = runtimeModelName;

  await store.writeMetadata(metadata);

  console.log(`Session: ${session.id}`);

  console.log(`Agent: ${agentName}`);

  console.log(`Runtime model: ${runtimeModelName}`);

  console.log(`Incident: ${incidentId}`);

  console.log("");

  console.log("Starting incident investigation...");

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [
      {
        type: "user.message",
        content: prompt,
      },
    ],
  });

  for await (const { data: event } of stream.withMetadata()) {
    const receivedAt = new Date().toISOString();

    metadata.eventCount += 1;

    eventTypes.add(
      typeof event.type === "string"
        ? event.type
        : "unknown",
    );

    const record: RecordedTrueForgeEvent = {
      received_at: receivedAt,
      event: event as unknown as Record<string, unknown>,
    };

    await store.append(record);

    recordedEvents.push(record);

    if (event.type === "model.message.delta") {
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

      metadata.finalStatus = event.state.status;

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
  metadata.completedAt = new Date().toISOString();

  metadata.eventTypes = [...eventTypes].sort();

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

  console.log("Investigation status: INCOMPLETE");

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

  console.log(`Evidence: ${store.jsonlPath}`);

  console.log(`Metadata: ${store.metadataPath}`);

  console.log(
    `Events captured: ${metadata.eventCount}`,
  );

  console.log(
    `Types: ${metadata.eventTypes.join(", ")}`,
  );

  process.exitCode = 1;
} else {
  const normalizedEvents = normalizeTrueForgeRecords(
    recordedEvents,
    {
      runId,
      ...(metadata.sessionId
        ? { sessionId: metadata.sessionId }
        : {}),
    },
  );

  const lookupResolution =
    resolveIncidentLookupFromEvents(
      normalizedEvents,
      incidentId,
    );

  const report = buildInvestigationReport(
    {
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
    },
  );

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

  console.log(`Evidence: ${store.jsonlPath}`);

  console.log(`Metadata: ${store.metadataPath}`);

  console.log(
    `Events captured: ${metadata.eventCount}`,
  );

  console.log(
    `Types: ${metadata.eventTypes.join(", ")}`,
  );
}
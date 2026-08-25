import "dotenv/config";

import { TrueForge } from "@truefoundry/trueforge-sdk";

import { getEnv } from "../trueforge/env.js";
import { buildInvestigationReport } from "./report.js";
import type { InvestigationStatus } from "./types.js";

const baseUrl = getEnv(
  "TRUEFORGE_BASE_URL",
  "http://localhost:8791",
);

const agentName = getEnv(
  "TRUEFORGE_AGENT_NAME",
  "",
);

const incidentId = getEnv(
  "TRUEFORGE_INCIDENT_ID",
  "INC-042",
);

if (!agentName) {
  throw new Error(
    "Missing TRUEFORGE_AGENT_NAME. Create/save the incident investigator agent in TrueForge and set its name.",
  );
}

const client = new TrueForge({
  baseUrl,
  timeoutInSeconds: 600,
});

const { data: session } = await client.sessions.create({
  agent: {
    name: agentName,
  },
});

console.log(`Session: ${session.id}`);
console.log(`Agent: ${agentName}`);
console.log(`Incident: ${incidentId}`);
console.log("");

const prompt = [
  `Investigate incident ${incidentId}.`,
  "",
  "Use the connected incident lookup tool.",
  "Do not invent facts.",
  "Report only facts supported by tool results.",
  "Explicitly distinguish known facts from unknowns.",
  "Do not claim a root cause unless the evidence establishes it.",
  "Do not perform write operations.",
].join("\n");

const stream = await client.sessions.createTurnStream(session.id, {
  input: [
    {
      type: "user.message",
      content: prompt,
    },
  ],
});

let response = "";
let incidentFacts: Record<string, unknown> | undefined;
let investigationStatus: InvestigationStatus = "INCOMPLETE";

for await (const { data: event } of stream.withMetadata()) {
  if (event.type === "model.message.delta") {
    const content =
      typeof event.content === "string" ? event.content : "";

    process.stdout.write(content);
    response += content;
  }

  if (event.type === "tool.response") {
    const content =
      typeof event.content === "string" ? event.content : "";

    try {
      const parsed: unknown = JSON.parse(content);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "incident_id" in parsed
      ) {
        incidentFacts = parsed as Record<string, unknown>;
      }
    } catch {
      // Tool responses such as list_tools/get_tool_info are not incident facts.
    }
  }
  
  if (event.type === "turn.done") {
    investigationStatus =
      event.state.status === "done"
        ? "COMPLETED"
        : "INCOMPLETE";

    console.log("");
    console.log("");
    console.log(`Turn status: ${event.state.status}`);
  }
}

const report = buildInvestigationReport(
  {
    targetIncidentId: incidentId,
    status: investigationStatus,
    evidenceRetrieved: incidentFacts !== undefined,
    rawResponse: response,
    ...(incidentFacts ? { incidentValue: incidentFacts } : {}),
  },
);

console.log("");
console.log("Investigation");
console.log("=============");
console.log(`Incident: ${report.targetIncidentId}`);
console.log(`Evidence retrieved: ${report.evidenceRetrieved ? "YES" : "NO"}`);
console.log(`Investigation status: ${report.status}`);
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

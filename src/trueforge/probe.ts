import "dotenv/config";
import { TrueForge } from "@truefoundry/trueforge-sdk";
import { getEnv, requireEnv } from "./env.js";
import { RunStore, type RunMetadata } from "./run-store.js";

const baseUrl = getEnv(
  "TRUEFORGE_BASE_URL",
  "http://localhost:8791"
).replace(/\/+$/, "");

const modelName = requireEnv("TRUEFORGE_MODEL_NAME");

const instructions = getEnv(
  "TRUEFORGE_AGENT_INSTRUCTIONS",
  "You are a concise incident investigation assistant. Explain your reasoning clearly and use connected tools when available."
);

const prompt = getEnv(
  "TRUEFORGE_PROMPT",
  "In two sentences, introduce yourself and describe what you can do."
);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const store = new RunStore(runId);
await store.init();

const client = new TrueForge({
  baseUrl,
  timeoutInSeconds: 600,
});

const metadata: RunMetadata = {
  runId,
  startedAt: new Date().toISOString(),
  baseUrl,
  model: modelName,
  prompt,
  eventCount: 0,
  eventTypes: [],
};

const eventTypes = new Set<string>();

console.log(`Run ID: ${runId}`);
console.log(`TrueForge: ${baseUrl}`);
console.log(`Model: ${modelName}`);
console.log("");

try {
  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        model: { name: modelName },
        instructions,
      },
    },
  });

  metadata.sessionId = session.id;
  await store.writeMetadata(metadata);

  console.log(`Session: ${session.id}`);
  console.log("Streaming turn...");
  console.log("");

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: "user.message", content: prompt }],
  });

  for await (const { data: event } of stream.withMetadata()) {
    metadata.eventCount += 1;

    const type = typeof event.type === "string" ? event.type : "unknown";
    eventTypes.add(type);

    await store.append({
      received_at: new Date().toISOString(),
      event,
    });

    if (event.type === "model.message.delta") {
      process.stdout.write(event.content ?? "");
    }

    if (event.type === "turn.done") {
      console.log("");
      console.log("");
      console.log(`Turn status: ${event.state.status}`);
      metadata.finalStatus = event.state.status;
    }
  }

  metadata.finalStatus ??= "done";
} catch (error) {
  metadata.finalStatus = "error";

  console.error("");
  console.error("Runtime proof failed.");
  console.error(error);

  process.exitCode = 1;
} finally {
  metadata.eventTypes = [...eventTypes].sort();
  metadata.completedAt = new Date().toISOString();

  await store.writeMetadata(metadata);
}

if (metadata.finalStatus !== "error") {
  console.log("");
  console.log(`Evidence: ${store.jsonlPath}`);
  console.log(`Metadata: ${store.metadataPath}`);
  console.log(`Events captured: ${metadata.eventCount}`);
  console.log(`Types: ${metadata.eventTypes.join(", ")}`);
}
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { AssuranceArtifact } from "../assurance/types.js";
import type { ExecutionEvent, RecordedTrueForgeEvent } from "../events/types.js";
import { normalizeTrueForgeRecords } from "../trueforge/adapter.js";
import type { RunMetadata } from "../trueforge/run-store.js";
import type {
  LiveConnectionState,
  RunDetail,
  RunSnapshot,
  RunSummary,
} from "./types.js";

export const LIVE_EVENT_BUFFER_LIMIT = 200;

function dataRoot(): string {
  return process.env.AGENTGUARD_DATA_DIR?.trim() || "data";
}

function runsDir(): string {
  return join(dataRoot(), "runs");
}

function assuranceDir(): string {
  return join(dataRoot(), "assurance");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function runBaseName(fileName: string): string | undefined {
  if (fileName.endsWith(".jsonl")) {
    return fileName.slice(0, -".jsonl".length);
  }

  if (fileName.endsWith(".json") && !fileName.endsWith("-verifier.json")) {
    return fileName.slice(0, -".json".length);
  }

  return undefined;
}

async function listRunIds(): Promise<string[]> {
  try {
    const entries = await readdir(runsDir(), { withFileTypes: true });
    const ids = new Set<string>();

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const base = runBaseName(entry.name);
        if (base) ids.add(base);
      }
    }

    return [...ids].sort((left, right) => right.localeCompare(left));
  } catch {
    return [];
  }
}

function connectionStateFor(summary: {
  artifactAvailable: boolean;
  finalStatus?: string;
  status?: RunSummary["status"];
  verdict?: RunSummary["verdict"];
  completedAt?: string;
  eventCount: number;
}): LiveConnectionState {
  if (summary.artifactAvailable && summary.verdict) {
    if (summary.verdict === "PASS") return "VERIFIED";
    if (summary.verdict === "WARN") return "WARN";
    return "FAILED";
  }
  if (summary.status === "RECOVERED") return "RECOVERING";
  if (summary.status === "EXHAUSTED" || summary.finalStatus === "failed") return "FAILED";
  if (summary.completedAt) return "VERIFYING";
  if (summary.eventCount > 0) return "RUNNING";
  return "LIVE";
}

async function loadMetadata(runId: string): Promise<RunMetadata | undefined> {
  return readJsonFile<RunMetadata>(join(runsDir(), `${runId}.json`));
}

async function loadArtifact(runId: string): Promise<AssuranceArtifact | undefined> {
  return readJsonFile<AssuranceArtifact>(join(assuranceDir(), `${runId}.json`));
}

async function loadRecordedEvents(runId: string): Promise<RecordedTrueForgeEvent[]> {
  try {
    const text = await readFile(join(runsDir(), `${runId}.jsonl`), "utf8");
    if (!text.trim()) return [];

    return text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed: unknown = JSON.parse(line);
          return isRecord(parsed) && isRecord(parsed.event)
            ? [parsed as unknown as RecordedTrueForgeEvent]
            : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function summaryFrom(
  runId: string,
  metadata: RunMetadata | undefined,
  artifact: AssuranceArtifact | undefined,
  eventCount: number,
  eventTypes: string[],
): RunSummary {
  const startedAt = metadata?.startedAt ?? metadata?.completedAt ?? new Date().toISOString();
  const summary: RunSummary = {
    runId,
    startedAt,
    baseUrl: metadata?.baseUrl ?? "unknown",
    model: metadata?.model ?? "unknown",
    prompt: metadata?.prompt ?? "",
    eventCount: Math.max(metadata?.eventCount ?? 0, eventCount),
    eventTypes: metadata?.eventTypes?.length ? metadata.eventTypes : eventTypes,
    ...(metadata?.sessionId ? { sessionId: metadata.sessionId } : {}),
    ...(metadata?.completedAt ? { completedAt: metadata.completedAt } : {}),
    ...(metadata?.finalStatus ? { finalStatus: metadata.finalStatus } : {}),
    ...(artifact?.incidentId ? { incidentId: artifact.incidentId } : {}),
    ...(artifact?.verdict ? { verdict: artifact.verdict } : {}),
    ...(artifact?.status ? { status: artifact.status } : {}),
    artifactAvailable: artifact !== undefined,
    connectionState: "IDLE",
  };
  summary.connectionState = connectionStateFor(summary);
  return summary;
}

function semanticEvents<T extends { type: string }>(events: readonly T[]): T[] {
  return events.filter((event) => event.type !== "MODEL_OUTPUT_DELTA");
}

function lightweightEvent(event: ExecutionEvent): ExecutionEvent {
  const data = { ...event.data };

  // Live timeline events must stay small. Full tool/model payloads remain in
  // the JSONL evidence. Parsed tool results are retained because they are the
  // useful proof summary for the console.
  if (typeof data.content === "string" && data.content.length > 16_384) {
    data.content = `${data.content.slice(0, 16_384)}\n… [payload truncated in live view]`;
  }

  return {
    id: event.id,
    runId: event.runId,
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    source: event.source,
    type: event.type,
    timestamp: event.timestamp,
    receivedAt: event.receivedAt,
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    ...(event.status ? { status: event.status } : {}),
    data,
    raw: undefined,
  };
}

export async function listRunSummaries(): Promise<RunSummary[]> {
  const runIds = await listRunIds();
  const summaries = await Promise.all(
    runIds.map(async (runId) => {
      const [metadata, artifact] = await Promise.all([
        loadMetadata(runId),
        loadArtifact(runId),
      ]);
      const eventCount = metadata?.eventCount ?? 0;
      const eventTypes = metadata?.eventTypes ?? [];
      return summaryFrom(runId, metadata, artifact, eventCount, eventTypes);
    }),
  );
  return summaries.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export async function loadRunSummary(
  runId: string,
  eventCountOverride?: number,
): Promise<RunSummary | undefined> {
  const [metadata, artifact] = await Promise.all([
    loadMetadata(runId),
    loadArtifact(runId),
  ]);

  if (!metadata && !artifact) return undefined;

  return summaryFrom(
    runId,
    metadata,
    artifact,
    eventCountOverride ?? metadata?.eventCount ?? 0,
    metadata?.eventTypes ?? [],
  );
}

export async function loadRunDetail(runId: string): Promise<RunDetail | undefined> {
  const [metadata, artifact, recordedEvents] = await Promise.all([
    loadMetadata(runId),
    loadArtifact(runId),
    loadRecordedEvents(runId),
  ]);

  if (!metadata && recordedEvents.length === 0 && !artifact) return undefined;

  const events = normalizeTrueForgeRecords(recordedEvents, {
    runId,
    ...(metadata?.sessionId ? { sessionId: metadata.sessionId } : {}),
  });
  const semantic = semanticEvents(events);
  const summary = summaryFrom(
    runId,
    metadata,
    artifact,
    events.length,
    [...new Set(events.map((event) => event.type))],
  );

  return {
    summary,
    ...(artifact ? { artifact } : {}),
    events: semantic.slice(-LIVE_EVENT_BUFFER_LIMIT).map(lightweightEvent),
  };
}

export async function loadRunSnapshot(runId: string): Promise<RunSnapshot | undefined> {
  return loadRunDetail(runId);
}

export async function runExists(runId: string): Promise<boolean> {
  const [metadata, artifact, events] = await Promise.all([
    loadMetadata(runId),
    loadArtifact(runId),
    loadRecordedEvents(runId),
  ]);
  return Boolean(metadata || artifact || events.length > 0);
}

export async function getRunStat(runId: string): Promise<{
  jsonl?: Awaited<ReturnType<typeof stat>>;
  metadata?: Awaited<ReturnType<typeof stat>>;
  artifact?: Awaited<ReturnType<typeof stat>>;
}> {
  const [jsonl, metadata, artifact] = await Promise.all([
    stat(join(runsDir(), `${runId}.jsonl`)).catch(() => undefined),
    stat(join(runsDir(), `${runId}.json`)).catch(() => undefined),
    stat(join(assuranceDir(), `${runId}.json`)).catch(() => undefined),
  ]);
  return { jsonl, metadata, artifact };
}

export function runJsonlPath(runId: string): string {
  return join(runsDir(), `${runId}.jsonl`);
}

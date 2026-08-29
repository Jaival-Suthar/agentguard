import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { open, stat } from "node:fs/promises";
import { URL } from "node:url";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  listRunSummaries,
  loadRunSnapshot,
  loadRunSummary,
  runJsonlPath,
} from "./index.js";
import { LIVE_EVENT_BUFFER_LIMIT } from "./store.js";
import { normalizeTrueForgeRecords } from "../trueforge/adapter.js";
import type { RecordedTrueForgeEvent } from "../events/types.js";
import type { ExecutionEvent } from "../events/types.js";

const HOST = process.env.HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.PORT?.trim() || "8780");
const PULSE_MS = Number(process.env.LIVE_PULSE_MS?.trim() || "750");
const READ_CHUNK_BYTES = 64 * 1024;

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendSseEvent(res: ServerResponse, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api/runs" || pathname.startsWith("/api/runs/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function lightweightEvent(event: ExecutionEvent): ExecutionEvent {
  const data = { ...event.data };
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

async function readAppendedRecords(
  filePath: string,
  offset: number,
  carry: string,
): Promise<{ records: RecordedTrueForgeEvent[]; nextOffset: number; carry: string }> {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await handle.stat();
    if (fileStat.size < offset) {
      return { records: [], nextOffset: 0, carry: "" };
    }

    if (fileStat.size === offset) {
      return { records: [], nextOffset: offset, carry };
    }

    const chunks: Buffer[] = [];
    let position = offset;
    while (position < fileStat.size) {
      const length = Math.min(READ_CHUNK_BYTES, fileStat.size - position);
      const buffer = Buffer.allocUnsafe(length);
      const result = await handle.read(buffer, 0, length, position);
      if (result.bytesRead === 0) break;
      chunks.push(buffer.subarray(0, result.bytesRead));
      position += result.bytesRead;
    }

    const text = carry + Buffer.concat(chunks).toString("utf8");
    const lines = text.split(/\r?\n/);
    const nextCarry = lines.pop() ?? "";
    const records: RecordedTrueForgeEvent[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (isRecord(parsed) && isRecord(parsed.event)) {
          records.push(parsed as unknown as RecordedTrueForgeEvent);
        }
      } catch {
        // Keep malformed/partial records out of the stream. The carry is retried on the next poll.
      }
    }

    return {
      records,
      nextOffset: fileStat.size,
      carry: nextCarry,
    };
  } finally {
    await handle.close();
  }
}

async function handleRuns(res: ServerResponse): Promise<void> {
  const runs = await listRunSummaries();
  sendJson(res, 200, { runs });
}

async function handleRun(res: ServerResponse, runId: string): Promise<void> {
  const detail = await loadRunSnapshot(runId);
  if (!detail) {
    sendJson(res, 404, { error: "Run not found", runId });
    return;
  }
  sendJson(res, 200, detail);
}

async function handleRunEvents(
  req: IncomingMessage,
  res: ServerResponse,
  runId: string,
): Promise<void> {
  const initial = await loadRunSnapshot(runId);
  if (!initial) {
    sendJson(res, 404, { error: "Run not found", runId });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  sendSseEvent(res, "snapshot", initial);

  let closed = false;
  let offset = 0;
  let carry = "";
  let recordIndex = initial.summary.eventCount;
  let lastArtifactMtime = 0;
  let pollInFlight = false;

  const initialStat = await stat(runJsonlPath(runId)).catch(() => undefined);
  offset = initialStat?.size ?? 0;
  const initialArtifactStat = await stat(resolve(process.env.AGENTGUARD_DATA_DIR?.trim() || "data", "assurance", `${runId}.json`)).catch(() => undefined);
  lastArtifactMtime = initialArtifactStat?.mtimeMs ?? 0;

  const poll = async (): Promise<void> => {
    if (closed || pollInFlight) return;
    pollInFlight = true;

    try {
      const path = runJsonlPath(runId);
      const result = await readAppendedRecords(path, offset, carry).catch(() => ({ records: [], nextOffset: offset, carry }));
      offset = result.nextOffset;
      carry = result.carry;

      if (result.records.length > 0) {
        for (let index = 0; index < result.records.length; index += 1) {
          const [event] = normalizeTrueForgeRecords([result.records[index]!], {
            runId,
            ...(initial.summary.sessionId ? { sessionId: initial.summary.sessionId } : {}),
          });
          if (!event) continue;
          recordIndex += 1;
          if (event.type === "MODEL_OUTPUT_DELTA") continue;
          const liveEvent = { ...event, id: `${runId}:${recordIndex - 1}`, raw: undefined };
          sendSseEvent(res, "event", lightweightEvent(liveEvent));
        }

        const statusSummary = await loadRunSummary(runId, recordIndex);
        if (statusSummary) {
          sendSseEvent(res, "status", statusSummary);
        }
      }

      const artifactPath = resolve(
        process.env.AGENTGUARD_DATA_DIR?.trim() || "data",
        "assurance",
        `${runId}.json`,
      );
      const artifactStat = await stat(artifactPath).catch(() => undefined);
      if (artifactStat && artifactStat.mtimeMs !== lastArtifactMtime) {
        lastArtifactMtime = artifactStat.mtimeMs;
        const completed = await loadRunSnapshot(runId);
        if (completed?.artifact) {
          sendSseEvent(res, "snapshot", completed);
        }
      }
    } finally {
      pollInFlight = false;
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, PULSE_MS);

  const keepAlive = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 15000);

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearInterval(keepAlive);
    req.off("close", cleanup);
    res.end();
  };

  req.on("close", cleanup);
}

async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method?.toUpperCase() || "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname } = url;

  if (method === "GET" && pathname === "/healthz") {
    sendText(res, 200, "ok\n");
    return;
  }
  if (method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (pathname === "/api/runs") {
    await handleRuns(res);
    return;
  }
  const runEventsMatch = pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (runEventsMatch?.[1]) {
    await handleRunEvents(req, res, decodeURIComponent(runEventsMatch[1]));
    return;
  }
  const runDetailMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (runDetailMatch?.[1]) {
    await handleRun(res, decodeURIComponent(runDetailMatch[1]));
    return;
  }
  if (isApiPath(pathname)) {
    sendJson(res, 404, { error: "Unknown API route" });
    return;
  }
  sendJson(res, 404, { error: "Not found" });
}

export async function startLiveServer(): Promise<void> {
  const server = createServer((req, res) => {
    void requestHandler(req, res).catch((error) => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    });
  });

  await new Promise<void>((resolveListen) => server.listen(PORT, HOST, resolveListen));
  console.log(`AgentGuard live API listening on http://${HOST}:${PORT}`);
  console.log(`Live event buffer: ${LIVE_EVENT_BUFFER_LIMIT} semantic events`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void startLiveServer().catch((error) => {
    console.error("Failed to start live API server.");
    console.error(error);
    process.exitCode = 1;
  });
}

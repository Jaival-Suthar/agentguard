import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  listRunSummaries,
  loadRunDetail,
  loadRunSnapshot,
} from "./index.js";

const HOST = process.env.HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.PORT?.trim() || "8780");
const PULSE_MS = Number(process.env.LIVE_PULSE_MS?.trim() || "1000");

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(
  res: ServerResponse,
  status: number,
  body: string,
): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendSseEvent(
  res: ServerResponse,
  event: string,
  payload: unknown,
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api/runs" ||
    pathname.startsWith("/api/runs/");
}

async function handleRuns(
  res: ServerResponse,
): Promise<void> {
  const runs = await listRunSummaries();
  sendJson(res, 200, { runs });
}

async function handleRun(
  res: ServerResponse,
  runId: string,
): Promise<void> {
  const detail = await loadRunDetail(runId);

  if (!detail) {
    sendJson(res, 404, {
      error: "Run not found",
      runId,
    });
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
    sendJson(res, 404, {
      error: "Run not found",
      runId,
    });
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
  let lastSnapshot = JSON.stringify(initial);

  const timer = setInterval(async () => {
    if (closed) {
      return;
    }

    const next = await loadRunSnapshot(runId);

    if (!next) {
      return;
    }

    const nextSnapshot = JSON.stringify(next);

    if (nextSnapshot !== lastSnapshot) {
      lastSnapshot = nextSnapshot;
      sendSseEvent(res, "snapshot", next);
    }
  }, PULSE_MS);

  const cleanup = (): void => {
    if (closed) {
      return;
    }

    closed = true;
    clearInterval(timer);
    req.off("close", cleanup);
    res.end();
  };

  req.on("close", cleanup);
}

async function requestHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method?.toUpperCase() || "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname } = url;

  if (method === "GET" && pathname === "/healthz") {
    sendText(res, 200, "ok\n");
    return;
  }

  if (method !== "GET") {
    sendJson(res, 405, {
      error: "Method not allowed",
    });
    return;
  }

  if (pathname === "/api/runs") {
    await handleRuns(res);
    return;
  }

  const runDetailMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (runDetailMatch?.[1]) {
    await handleRun(res, decodeURIComponent(runDetailMatch[1]));
    return;
  }

  const runEventsMatch = pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (runEventsMatch?.[1]) {
    await handleRunEvents(req, res, decodeURIComponent(runEventsMatch[1]));
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
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, HOST, resolve);
  });

  console.log(`AgentGuard live API listening on http://${HOST}:${PORT}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void startLiveServer().catch((error) => {
    console.error("Failed to start live API server.");
    console.error(error);
    process.exitCode = 1;
  });
}

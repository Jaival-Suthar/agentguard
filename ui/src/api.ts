import type { RunDetail, RunSummary } from "./types";

interface RunListResponse {
  runs: RunSummary[];
}

function jsonHeaders(): HeadersInit {
  return {
    Accept: "application/json",
  };
}

export async function listRuns(): Promise<RunSummary[]> {
  const response = await fetch("/api/runs", {
    cache: "no-store",
    headers: jsonHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Unable to list runs: ${response.status}`);
  }

  const payload =
    (await response.json()) as RunListResponse;

  return payload.runs ?? [];
}

export async function loadRun(
  runId: string,
): Promise<RunDetail> {
  const response = await fetch(
    `/api/runs/${encodeURIComponent(runId)}`,
    {
      cache: "no-store",
      headers: jsonHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to load run ${runId}: ${response.status}`);
  }

  return (await response.json()) as RunDetail;
}

export function watchRun(
  runId: string,
  onSnapshot: (snapshot: RunDetail) => void,
  onReconnect: () => void,
  onError: (error: Error) => void,
): () => void {
  const source = new EventSource(
    `/api/runs/${encodeURIComponent(runId)}/events`,
  );

  source.addEventListener("snapshot", (event) => {
    if (!(event instanceof MessageEvent)) {
      return;
    }

    try {
      onSnapshot(JSON.parse(event.data as string) as RunDetail);
    } catch (error) {
      onError(
        error instanceof Error
          ? error
          : new Error(String(error)),
      );
    }
  });

  source.addEventListener("error", () => {
    onReconnect();
  });

  return () => {
    source.close();
  };
}

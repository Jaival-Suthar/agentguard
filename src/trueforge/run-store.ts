import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

export interface RunMetadata {
  runId: string;
  startedAt: string;
  baseUrl: string;
  model: string;
  sessionId?: string;
  prompt: string;
  eventCount: number;
  eventTypes: string[];
  completedAt?: string;
  finalStatus?: string;
}

export class RunStore {
  readonly runId: string;
  readonly jsonlPath: string;
  readonly metadataPath: string;

  constructor(runId: string) {
    this.runId = runId;
    this.jsonlPath = join("data", "runs", `${runId}.jsonl`);
    this.metadataPath = join("data", "runs", `${runId}.json`);
  }

  async init(): Promise<void> {
    await mkdir(join("data", "runs"), { recursive: true });
  }

  async append(event: unknown): Promise<void> {
    const line = JSON.stringify(event);
    await appendFile(this.jsonlPath, `${line}\n`, "utf8");
  }

  async writeMetadata(metadata: RunMetadata): Promise<void> {
    await writeFile(this.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }
}

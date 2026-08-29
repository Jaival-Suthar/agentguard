import { Tag } from "primereact/tag";
import { FiShield, FiClock, FiFileText, FiWifi } from "react-icons/fi";
import type { AssuranceArtifact, RunSummary, LiveConnectionState } from "../types";
import { formatAssuranceTimestamp } from "../format";
import { StatusTag } from "./StatusTag";

function connectionSeverity(
  state: LiveConnectionState,
): "success" | "warning" | "danger" | "info" {
  if (state === "VERIFIED") {
    return "success";
  }

  if (state === "FAILED") {
    return "danger";
  }

  if (state === "WARN" || state === "RECONNECTING" || state === "RECOVERING" || state === "VERIFYING") {
    return "warning";
  }

  return "info";
}

function connectionMessage(state: LiveConnectionState): string {
  if (state === "RUNNING") {
    return "AgentGuard is still processing the execution.";
  }

  if (state === "VERIFYING") {
    return "Execution completed. AgentGuard is verifying the assurance result.";
  }

  return "Awaiting final AssuranceArtifact from AgentGuard";
}

export function RunHeader({
  run,
  artifact,
  connectionState,
}: {
  run: RunSummary | null;
  artifact: AssuranceArtifact | null;
  connectionState: LiveConnectionState;
}) {
  const title =
    artifact?.incidentId ??
    run?.incidentId ??
    (run ? "Assurance Run" : "Select a run");

  const contract =
    artifact?.contract ??
    (run ? `${run.model} · ${run.baseUrl}` : "Waiting for a run");

  const timestamp =
    artifact?.generatedAt ??
    run?.completedAt ??
    run?.startedAt;

  return (
    <div className="grid align-items-stretch gap-3 xl:grid-cols-[1fr_auto]">
      <div className="ag-card p-5">
        <div className="flex items-start gap-4">
          <div className="ag-mark"><FiShield size={24} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">AGENTGUARD / ASSURANCE RUN</span>
              {artifact ? <StatusTag value={artifact.status} /> : <Tag value={connectionState.replaceAll("_", " ")} severity={connectionSeverity(connectionState)} rounded />}
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-400">{contract}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-900">
              <span className="inline-flex items-center gap-1.5"><FiFileText /> Run {run?.runId ?? artifact?.runId ?? "n/a"}</span>
              <span className="inline-flex items-center gap-1.5"><FiWifi /> {connectionState.replaceAll("_", " ")}</span>
              {timestamp ? <span className="inline-flex items-center gap-1.5"><FiClock /> {formatAssuranceTimestamp(timestamp)}</span> : null}
            </div>
          </div>
        </div>
      </div>
      <div className={`ag-verdict ${artifact ? artifact.verdict.toLowerCase() : "warn"}`}>
        <span className="eyebrow">FINAL VERDICT</span>
        <div className="mt-2 text-4xl font-bold tracking-tight">{artifact?.verdict ?? "LIVE"}</div>
        <div className="mt-1 text-sm font-medium opacity-80">
          {artifact
            ? artifact.status === "RECOVERED"
              ? "Recovered after failure"
              : artifact.status === "EXHAUSTED"
                ? "Recovery exhausted"
                : artifact.summary
            : connectionMessage(connectionState)}
        </div>
      </div>
    </div>
  );
}

import { FiShield, FiClock, FiFileText } from "react-icons/fi";
import type { AssuranceArtifact } from "../types";
import { StatusTag } from "./StatusTag";

export function RunHeader({ artifact }: { artifact: AssuranceArtifact }) {
  return (
    <div className="grid align-items-stretch gap-3 xl:grid-cols-[1fr_auto]">
      <div className="ag-card p-5">
        <div className="flex items-start gap-4">
          <div className="ag-mark"><FiShield size={24} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">AGENTGUARD / ASSURANCE RUN</span>
              <StatusTag value={artifact.status} />
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-50">{artifact.incidentId ?? artifact.runId}</h1>
            <p className="mt-1 text-sm text-slate-400">{artifact.contract}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><FiFileText /> Run {artifact.runId}</span>
              <span className="inline-flex items-center gap-1.5"><FiClock /> {new Date(artifact.generatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
      <div className={`ag-verdict ${artifact.verdict.toLowerCase()}`}>
        <span className="eyebrow">FINAL VERDICT</span>
        <div className="mt-2 text-4xl font-bold tracking-tight">{artifact.verdict}</div>
        <div className="mt-1 text-sm font-medium opacity-80">
          {artifact.status === "RECOVERED" ? "Recovered after failure" : artifact.status === "EXHAUSTED" ? "Recovery exhausted" : artifact.summary}
        </div>
      </div>
    </div>
  );
}

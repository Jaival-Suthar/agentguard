import { Panel } from "primereact/panel";
import { FiFileText } from "react-icons/fi";
import type { AssuranceArtifact, TimelineEntry } from "../types";
import { StatusTag } from "./StatusTag";

export function ProofPanel({
  artifact,
  entry,
  onClose,
}: {
  artifact: AssuranceArtifact | null;
  entry: TimelineEntry | null;
  onClose: () => void;
}) {
  if (!entry) {
    return null;
  }

  return (
    <Panel
      className="ag-card ag-proof"
      header={<div className="flex items-center gap-3"><span className={`proof-icon ${entry.state.toLowerCase()}`}><FiFileText /></span><div><div className="eyebrow">PROOF INSPECTOR</div><div className="mt-0.5 text-lg font-semibold text-slate-100">{entry.stage}</div></div></div>}
      toggleable
      collapsed={false}
      onToggle={onClose}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Run</div>
            <div className="mt-1 font-mono text-sm text-slate-200">{artifact?.runId ?? entry.id}</div>
          </div>
          <StatusTag value={entry.state === "LIVE" ? "WARN" : entry.state} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">Finding</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{entry.summary}</p>
        </div>
        {entry.details.length > 0 ? (
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Details</div>
            <ul className="mt-2 space-y-2">
              {entry.details.map((detail) => (
                <li key={detail} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="evidence-box">
          <div className="text-xs uppercase tracking-wider text-slate-500">Payload</div>
          <pre className="mt-3 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-300">
            {JSON.stringify(entry.payload, null, 2)}
          </pre>
        </div>
        {artifact && entry.kind === "artifact" ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">Authoritative Artifact</div>
            <pre className="mt-3 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-300">
              {JSON.stringify(artifact, null, 2)}
            </pre>
          </div>
        ) : null}
        <button className="text-xs text-slate-500 underline decoration-slate-700 underline-offset-4" onClick={onClose}>Close inspector</button>
      </div>
    </Panel>
  );
}

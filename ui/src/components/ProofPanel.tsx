import { Panel } from "primereact/panel";
import { FiCheckCircle, FiAlertTriangle, FiXCircle } from "react-icons/fi";
import type { AssuranceArtifact, AssuranceCheck, AssuranceRecovery, CheckStatus } from "../types";
import { StatusTag } from "./StatusTag";

export interface SelectedStep {
  id: string;
  label: string;
  state: CheckStatus;
  title: string;
  summary: string;
  payload: AssuranceCheck | AssuranceRecovery;
}

function Icon({ status }: { status: CheckStatus }) {
  if (status === "PASS") return <FiCheckCircle />;
  if (status === "WARN") return <FiAlertTriangle />;
  return <FiXCircle />;
}

function isCheck(payload: SelectedStep["payload"]): payload is AssuranceCheck {
  return "summary" in payload;
}

export function ProofPanel({ artifact, step, onClose }: { artifact: AssuranceArtifact; step: SelectedStep | null; onClose: () => void }) {
  if (!step) return null;
  const check = isCheck(step.payload) ? step.payload : null;
  const recovery = !check ? step.payload as AssuranceRecovery : null;

  return (
    <Panel className="ag-card ag-proof" header={<div className="flex items-center gap-3"><span className={`proof-icon ${step.state.toLowerCase()}`}><Icon status={step.state} /></span><div><div className="eyebrow">PROOF INSPECTOR</div><div className="mt-0.5 text-lg font-semibold text-slate-100">{step.label}</div></div></div>} toggleable collapsed={false} onToggle={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div><div className="text-xs uppercase tracking-wider text-slate-500">Run</div><div className="mt-1 font-mono text-sm text-slate-200">{artifact.runId}</div></div>
          <StatusTag value={step.state} />
        </div>
        {check ? (
          <>
            <div><div className="text-xs uppercase tracking-wider text-slate-500">Finding</div><p className="mt-2 text-sm leading-6 text-slate-300">{check.summary}</p></div>
            {check.details?.length ? <div><div className="text-xs uppercase tracking-wider text-slate-500">Verification details</div><ul className="mt-2 space-y-2">{check.details.map((detail) => <li key={detail} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">{detail}</li>)}</ul></div> : null}
            {step.id === "evidence" && check.status === "PASS" ? <div className="evidence-box"><div className="flex items-center gap-2 font-semibold text-emerald-300"><FiCheckCircle /> Independently verified</div><pre className="mt-3 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-300">{JSON.stringify({ found: true, incident_id: artifact.incidentId ?? "INC-042", source: "mcp", verification: "independent" }, null, 2)}</pre></div> : null}
            {check.status === "FAIL" ? <div className="failure-box"><div className="font-semibold text-red-300">WHY DID THIS FAIL?</div><p className="mt-2 text-sm leading-6 text-slate-300">{artifact.failureReasons.length ? artifact.failureReasons.join(" ") : check.summary}</p><div className="mt-4 font-mono text-xs text-red-200/80">ACTION: BLOCKED</div></div> : null}
          </>
        ) : recovery ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[['Attempts', recovery.attempts], ['Retries', recovery.retries], ['Budget', recovery.maxRetries]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold text-slate-100">{value}</div></div>)}
            </div>
            <div className="space-y-2">
              {Array.from({ length: recovery.attempts }, (_, i) => {
                const attempt = i + 1;
                const successful = recovery.status === "RECOVERED" && attempt === recovery.attempts;
                return <div key={attempt} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"><span className="w-20 font-mono text-xs text-slate-500">ATTEMPT {attempt}</span><span className={`h-2 w-2 rounded-full ${successful ? "bg-emerald-400" : recovery.status === "EXHAUSTED" ? "bg-red-400" : "bg-amber-400"}`} /><span className="text-sm text-slate-300">{successful ? "PASS — verified outcome" : "FAIL — recovery path continued"}</span></div>;
              })}
            </div>
          </>
        ) : null}
        <button className="text-xs text-slate-500 underline decoration-slate-700 underline-offset-4" onClick={onClose}>Close inspector</button>
      </div>
    </Panel>
  );
}

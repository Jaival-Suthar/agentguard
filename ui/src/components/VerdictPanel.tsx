import React from "react";
import { FiAlertTriangle, FiCheckCircle, FiShield, FiXCircle } from "react-icons/fi";
import type { AssuranceArtifact, LiveConnectionState } from "../types";

export function VerdictPanel({
  artifact,
  connectionState,
}: {
  artifact: AssuranceArtifact | null;
  connectionState: LiveConnectionState;
}) {
  if (!artifact) {
    return (
      <div className="ag-verdict-panel">
        <div className="flex items-start gap-4">
          <div className="verdict-icon"><FiShield size={28} /></div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">ASSURANCE RESULT</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">{connectionState}</h2>
              <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">Live run</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">AgentGuard is still processing the execution. The final PASS or FAIL will come from the assurance artifact once verification completes.</p>
          </div>
        </div>
      </div>
    );
  }

  const verdict = artifact.verdict;
  const tone = verdict === "PASS" ? "pass" : verdict === "WARN" ? "warn" : "fail";
  return (
    <div className={`ag-verdict-panel ${tone}`}>
      <div className="flex items-start gap-4">
        <div className="verdict-icon">
          {tone === "pass" ? (
            <FiCheckCircle size={28} />
          ) : tone === "warn" ? (
            <FiAlertTriangle size={28} />
          ) : (
            <FiXCircle size={28} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">ASSURANCE RESULT</div>
          <div className="mt-1 flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold text-slate-900">{verdict}</h2><span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">{artifact.status.replaceAll("_", " ")}</span></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{artifact.summary}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-3">
        <div className="mini-proof"><FiShield /> Policy <span>{artifact.policy.status}</span></div>
        <div className="mini-proof"><FiCheckCircle /> Evidence <span>{artifact.evidence.status}</span></div>
        <div className="mini-proof"><FiCheckCircle /> Contract <span>{artifact.contractVerification.status}</span></div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Timeline } from "primereact/timeline";
import { FiActivity, FiCheckCircle, FiFileText, FiLock, FiRefreshCw, FiShield, FiZap } from "react-icons/fi";
import type { AssuranceArtifact, AssuranceCheck, AssuranceRecovery, CheckStatus } from "../types";
import { StatusIcon } from "./StatusIcon";

interface Step {
  id: string;
  label: string;
  state: CheckStatus;
  title: string;
  summary: string;
  icon: ReactNode;
  payload: AssuranceCheck | AssuranceRecovery;
}

function recoveryStatus(recovery: AssuranceRecovery): CheckStatus {
  return recovery.status === "EXHAUSTED" ? "FAIL" : "PASS";
}

export function AssuranceTimeline({ artifact, onSelect }: { artifact: AssuranceArtifact; onSelect: (step: Step) => void }) {
  const steps: Step[] = [
    { id: "policy", label: "Policy", state: artifact.policy.status, title: artifact.policy.status === "PASS" ? "ALLOW" : artifact.policy.status, summary: artifact.policy.summary, icon: <FiLock />, payload: artifact.policy },
    { id: "execution", label: "Execution", state: artifact.execution.status, title: artifact.execution.status, summary: artifact.execution.summary, icon: <FiActivity />, payload: artifact.execution },
    { id: "chaos", label: "Chaos", state: artifact.recovery.retries > 0 ? "WARN" : "PASS", title: artifact.recovery.retries > 0 ? "FAILURE INJECTED" : "NO FAILURE", summary: artifact.recovery.retries > 0 ? "Execution encountered a controlled failure before recovery." : "No controlled failure was required.", icon: <FiZap />, payload: artifact.recovery },
    { id: "recovery", label: "Recovery", state: recoveryStatus(artifact.recovery), title: artifact.recovery.status, summary: `${artifact.recovery.attempts} attempt(s) · ${artifact.recovery.retries} retry(ies)`, icon: <FiRefreshCw />, payload: artifact.recovery },
    { id: "evidence", label: "Evidence", state: artifact.evidence.status, title: artifact.evidence.status === "PASS" ? "VERIFIED" : artifact.evidence.status, summary: artifact.evidence.summary, icon: <FiFileText />, payload: artifact.evidence },
    { id: "contract", label: "Contract", state: artifact.contractVerification.status, title: artifact.contractVerification.status === "PASS" ? "SATISFIED" : artifact.contractVerification.status, summary: artifact.contractVerification.summary, icon: <FiShield />, payload: artifact.contractVerification },
    { id: "assurance", label: "Assurance", state: artifact.verdict, title: artifact.verdict, summary: artifact.summary, icon: <FiCheckCircle />, payload: artifact.contractVerification },
  ];

  return (
    <div className="ag-card p-5 md:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <span className="eyebrow">EXECUTION TIMELINE</span>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">What happened, in order</h2>
        </div>
        <span className="hidden text-xs text-slate-500 md:block">Select any step to inspect its proof</span>
      </div>
      <Timeline
        value={steps}
        align="left"
        className="ag-timeline"
        marker={(item) => (
          <button className={`timeline-marker ${item.state.toLowerCase()}`} onClick={() => onSelect(item)} aria-label={`Inspect ${item.label}`}>
            <StatusIcon status={item.state} size={17} />
          </button>
        )}
        content={(item) => (
          <button className="timeline-content w-full text-left" onClick={() => onSelect(item)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span className="timeline-icon">{item.icon}</span>{item.label}
              </div>
              <span className={`timeline-state ${item.state.toLowerCase()}`}>{item.title}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-400">{item.summary}</p>
          </button>
        )}
      />
    </div>
  );
}

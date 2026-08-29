import { Timeline } from "primereact/timeline";
import type { TimelineEntry } from "../types";
import { formatAssuranceTimestamp } from "../format";
import { StatusIcon } from "./StatusIcon";

export function AssuranceTimeline({
  entries,
  selectedId,
  onSelect,
}: {
  entries: TimelineEntry[];
  selectedId: string | null;
  onSelect: (entry: TimelineEntry) => void;
}) {
  return (
    <div className="ag-card p-5 md:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <span className="eyebrow">EXECUTION TIMELINE</span>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">What happened, in order</h2>
        </div>
        <span className="hidden text-xs text-slate-500 md:block">Select any entry to inspect its proof</span>
      </div>
      <Timeline
        value={entries}
        align="left"
        className="ag-timeline"
        marker={(item) => (
          <button
            type="button"
            className={`timeline-marker ${item.state.toLowerCase()} ${item.id === selectedId ? "is-selected" : ""}`}
            onClick={() => onSelect(item)}
            aria-label={`Inspect ${item.stage}`}
            aria-pressed={item.id === selectedId}
          >
            <StatusIcon status={item.state} size={17} />
          </button>
        )}
        content={(item) => (
          <button
            type="button"
            className={`timeline-content w-full text-left ${item.id === selectedId ? "is-selected" : ""}`}
            onClick={() => onSelect(item)}
            aria-pressed={item.id === selectedId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="timeline-icon">{item.kind === "artifact" ? "◆" : "•"}</span>{item.stage}
              </div>
              <span className={`timeline-state ${item.state.toLowerCase()}`}>{item.title}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</p>
            <div className="mt-2 text-[11px] uppercase tracking-[.18em] text-slate-500">
              {formatAssuranceTimestamp(item.timestamp)}
            </div>
          </button>
        )}
      />
    </div>
  );
}

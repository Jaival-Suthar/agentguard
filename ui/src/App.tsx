import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import {
  FiArrowUpRight,
  FiDatabase,
  FiRefreshCw,
  FiUploadCloud,
  FiWifi,
} from "react-icons/fi";
import { AssuranceTimeline } from "./components/AssuranceTimeline";
import { ProofPanel } from "./components/ProofPanel";
import { RunHeader } from "./components/RunHeader";
import { VerdictPanel } from "./components/VerdictPanel";
import { listRuns, loadRun, watchRun } from "./api";
import { fallbackFailArtifact, fallbackPassArtifact } from "./data/demoArtifacts";
import {
  buildArtifactOnlyDetail,
  buildTimelineEntries,
  semanticTimelineEvents,
} from "./view-model";
import type {
  AssuranceArtifact,
  RunDetail,
  RunSummary,
  TimelineEntry,
  LiveConnectionState,
} from "./types";

interface SelectionOption {
  label: string;
  value: string;
}

function isRunSelection(value: string): boolean {
  return value.startsWith("run:");
}

function selectionRunId(value: string): string {
  return value.slice("run:".length);
}

function selectionLabel(
  detail: RunDetail | null,
  selectedValue: string,
): string {
  if (selectedValue === "demo-pass") {
    return "DEMO STATE · PASS";
  }

  if (selectedValue === "demo-fail") {
    return "DEMO STATE · FAIL";
  }

  if (detail?.artifact) {
    return "REAL ARTIFACT";
  }

  return detail ? "LIVE RUN" : "NO RUN SELECTED";
}

function connectionStateFor(
  detail: RunDetail | null,
  streamState: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected",
): LiveConnectionState {
  if (streamState === "reconnecting") {
    return "RECONNECTING";
  }

  if (!detail) {
    return streamState === "connecting" ? "LIVE" : "IDLE";
  }

  return detail.summary.connectionState;
}

function emptyDetail(): RunDetail | null {
  return null;
}

function sanitizeDetail(detail: RunDetail): RunDetail {
  return {
    ...detail,
    events: semanticTimelineEvents(detail.events),
  };
}

export default function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [detail, setDetail] = useState<RunDetail | null>(emptyDetail);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [streamState, setStreamState] = useState<
    "idle" | "connecting" | "connected" | "reconnecting" | "disconnected"
  >("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const subscriptionRef = useRef<(() => void) | null>(null);

  const liveRunOptions = useMemo<SelectionOption[]>(
    () =>
      runs.map((run) => ({
        label: `${run.verdict ?? run.connectionState} · ${run.incidentId ?? run.runId}`,
        value: `run:${run.runId}`,
      })),
    [runs],
  );

  const demoOptions = useMemo<SelectionOption[]>(
    () => [
      {
        label: "Demo PASS · INC-042",
        value: "demo-pass",
      },
      {
        label: "Demo FAIL · INC-042",
        value: "demo-fail",
      },
    ],
    [],
  );

  const options = useMemo(
    () => [...liveRunOptions, ...demoOptions],
    [demoOptions, liveRunOptions],
  );

  useEffect(() => {
    void listRuns()
      .then((items) => {
        setRuns(items);
      })
      .catch((listError) => {
        setError(
          listError instanceof Error
            ? listError.message
            : String(listError),
        );
        setRuns([]);
      });
  }, []);

  useEffect(() => {
    if (selectedValue || runs.length === 0) {
      return;
    }

    setSelectedValue(`run:${runs[0]?.runId}`);
  }, [runs, selectedValue]);

  const entries = useMemo(
    () => (detail ? buildTimelineEntries(detail) : []),
    [detail],
  );

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedEntry(null);
      return;
    }

    if (selectedEntry && entries.some((entry) => entry.id === selectedEntry.id)) {
      return;
    }

    setSelectedEntry(entries[entries.length - 1] ?? null);
  }, [entries, selectedEntry]);

  useEffect(() => {
    let cancelled = false;
    const closeSubscription = (): void => {
      subscriptionRef.current?.();
      subscriptionRef.current = null;
    };

    closeSubscription();

    if (!selectedValue) {
      setDetail(null);
      setStreamState("idle");
      setLoading(false);
      return () => {
        cancelled = true;
        closeSubscription();
      };
    }

    async function loadSelected(): Promise<void> {
      setLoading(true);
      setError(null);

      if (selectedValue === "imported") {
        setStreamState("disconnected");
        setLoading(false);
        return;
      }

      if (selectedValue === "demo-pass") {
        if (cancelled) {
          return;
        }

        setDetail(buildArtifactOnlyDetail(fallbackPassArtifact));
        setStreamState("disconnected");
        setLoading(false);
        return;
      }

      if (selectedValue === "demo-fail") {
        if (cancelled) {
          return;
        }

        setDetail(buildArtifactOnlyDetail(fallbackFailArtifact));
        setStreamState("disconnected");
        setLoading(false);
        return;
      }

      if (!isRunSelection(selectedValue)) {
        setDetail(null);
        setLoading(false);
        return;
      }

      const runId = selectionRunId(selectedValue);
      setStreamState("connecting");

      try {
        const snapshot = await loadRun(runId);

        if (cancelled) {
          return;
        }

        setDetail(sanitizeDetail(snapshot));
        setStreamState("connected");

        subscriptionRef.current = watchRun(
          runId,
          (nextSnapshot) => {
            if (cancelled) return;
            setDetail(sanitizeDetail(nextSnapshot));
            setStreamState("connected");
          },
          (nextEvent) => {
            if (cancelled) return;
            if (nextEvent.type === "MODEL_OUTPUT_DELTA") {
              setStreamState("connected");
              return;
            }
            setDetail((current) => {
              if (!current || current.summary.runId !== runId) return current;
              const events = semanticTimelineEvents(
                [...current.events, nextEvent],
              );
              return { ...current, events };
            });
            setStreamState("connected");
          },
          (nextSummary) => {
            if (cancelled) return;
            setDetail((current) => {
              if (!current || current.summary.runId !== runId) return current;
              return { ...current, summary: nextSummary };
            });
            setStreamState("connected");
          },
          () => {
            if (!cancelled) setStreamState("reconnecting");
          },
          (watchError) => {
            if (!cancelled) setError(watchError.message);
          },
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : String(loadError),
          );
          setDetail(null);
          setStreamState("disconnected");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSelected();

    return () => {
      cancelled = true;
      closeSubscription();
    };
  }, [refreshVersion, selectedValue]);

  const artifact = detail?.artifact ?? null;
  const connectionState = connectionStateFor(detail, streamState);
  const selectionLabelValue = selectionLabel(detail, selectedValue);

  const sourcePillClass =
    selectedValue === "demo-pass" ||
    selectedValue === "demo-fail" ||
    selectedValue === "imported"
      ? "demo"
      : detail
        ? "live"
        : "demo";

  const refreshCurrent = () => {
    setRefreshVersion((value) => value + 1);
  };

  const dropdownValue =
    selectedValue === "imported"
      ? null
      : selectedValue || null;

  const importArtifact = (file: File) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AssuranceArtifact;
        setSelectedValue("imported");
        setDetail(buildArtifactOnlyDetail(parsed));
        setStreamState("disconnected");
        setError(null);
      } catch (importError) {
        setError(
          importError instanceof Error
            ? importError.message
            : String(importError),
        );
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <div className="ag-logo light">AG</div>
            <div>
              <div className="font-semibold tracking-tight text-slate-900">
                AgentGuard
              </div>
              <div className="text-[10px] uppercase tracking-[.2em] text-slate-500">
                Assurance Console
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden cursor-pointer sm:block">
              <span className="sr-only">Import assurance artifact</span>
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => event.target.files?.[0] && importArtifact(event.target.files[0])}
              />
              <Button label="Import artifact" icon={<FiUploadCloud />} outlined size="small" />
            </label>
            <Button
              label="Refresh"
              icon={<FiRefreshCw />}
              text
              size="small"
              onClick={refreshCurrent}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="eyebrow">TRUST BOUNDARY</span>
            <p className="mt-1 text-sm text-slate-600">
              TrueForge runs the agent. AgentGuard determines whether the execution can be trusted.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`source-pill ${sourcePillClass}`}>{selectionLabelValue}</span>
            <Dropdown
              value={dropdownValue}
              options={options}
              optionLabel="label"
              optionValue="value"
              onChange={(event) => setSelectedValue(String(event.value))}
              placeholder="Select assurance run or artifact"
              className="w-full sm:w-80"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
              <FiWifi className={connectionState === "RECONNECTING" ? "animate-pulse text-amber-500" : "text-slate-400"} />
              {connectionState.replaceAll("_", " ")}
            </span>
          </div>
        </div>

        {error ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        <RunHeader
          run={detail?.summary ?? null}
          artifact={artifact}
          connectionState={connectionState}
        />

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.7fr)]">
          <AssuranceTimeline
            entries={entries}
            selectedId={selectedEntry?.id ?? null}
            onSelect={setSelectedEntry}
          />
          <div className="space-y-5">
            <VerdictPanel
              artifact={artifact}
              connectionState={connectionState}
            />
            {artifact ? (
              artifact.failureReasons.length > 0 ? (
                <div className="ag-card p-5">
                  <div className="eyebrow">FAILURE REASONS</div>
                  <ul className="mt-3 space-y-2">
                    {artifact.failureReasons.map((reason) => (
                      <li
                        key={reason}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-800"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="ag-card p-5">
                  <div className="eyebrow">ASSURANCE SUMMARY</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    All required checks are represented by the assurance artifact. The UI renders the artifact; it does not independently decide PASS or FAIL.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <FiDatabase /> Artifact version {artifact.version}
                  </div>
                </div>
              )
            ) : (
              <div className="ag-card p-5">
                <div className="eyebrow">ASSURANCE SUMMARY</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Select a real run, or import a final AssuranceArtifact to inspect the authoritative result. The console does not invent PASS/FAIL on its own.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <ProofPanel
            artifact={artifact}
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <span>AgentGuard assurance surface · live run rendering</span>
          <span className="inline-flex items-center gap-1.5">
            TrueForge remains the execution environment <FiArrowUpRight />
          </span>
        </div>
      </main>

      {loading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 backdrop-blur-[1px]">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-xl">
            Loading assurance data…
          </div>
        </div>
      ) : null}
    </div>
  );
}

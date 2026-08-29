import { useEffect, useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { FiArrowUpRight, FiDatabase, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import { AssuranceTimeline } from "./components/AssuranceTimeline";
import { ProofPanel, type SelectedStep } from "./components/ProofPanel";
import { RunHeader } from "./components/RunHeader";
import { VerdictPanel } from "./components/VerdictPanel";
import { fallbackFailArtifact, fallbackPassArtifact } from "./data/demoArtifacts";
import type { AssuranceArtifact } from "./types";

interface ArtifactOption { label: string; path: string; }

export default function App() {
  const [artifact, setArtifact] = useState<AssuranceArtifact>(fallbackPassArtifact);
  const [selected, setSelected] = useState<SelectedStep | null>(null);
  const [options, setOptions] = useState<ArtifactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"live" | "demo">("demo");

  const demoOptions = useMemo(() => [
    { label: "Recovered PASS · INC-042", path: "demo-pass" },
    { label: "Recovery exhausted · INC-042", path: "demo-fail" },
  ], []);

  useEffect(() => {
    fetch("/index.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((items: string[]) => setOptions(items.map((path) => ({ label: path.replace(/\.json$/, ""), path: `/assurance/${path}` }))))
      .catch(() => setOptions([]));
  }, []);

  const loadArtifact = async (path: string) => {
    setLoading(true);
    try {
      if (path === "demo-pass") { setArtifact(fallbackPassArtifact); setSource("demo"); return; }
      if (path === "demo-fail") { setArtifact(fallbackFailArtifact); setSource("demo"); return; }
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load ${path}`);
      const next = await response.json() as AssuranceArtifact;
      setArtifact(next);
      setSelected(null);
      setSource("live");
    } finally { setLoading(false); }
  };

  const importArtifact = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { setArtifact(JSON.parse(String(reader.result)) as AssuranceArtifact); setSource("live"); setSelected(null); } catch { /* invalid JSON is intentionally ignored */ }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070b14]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3"><div className="ag-logo">AG</div><div><div className="font-semibold tracking-tight text-slate-100">AgentGuard</div><div className="text-[10px] uppercase tracking-[.2em] text-slate-500">Assurance Console</div></div></div>
          <div className="flex items-center gap-2">
            <label className="hidden cursor-pointer sm:block"><span className="sr-only">Import assurance artifact</span><input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importArtifact(e.target.files[0])} /><Button label="Import artifact" icon={<FiUploadCloud />} outlined size="small" /></label>
            <Button label="Refresh" icon={<FiRefreshCw />} text size="small" onClick={() => window.location.reload()} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><span className="eyebrow">TRUST BOUNDARY</span><p className="mt-1 text-sm text-slate-400">TrueForge runs the agent. AgentGuard determines whether the execution can be trusted.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`source-pill ${source}`}>{source === "live" ? "REAL ARTIFACT" : "DEMO STATE"}</span>
            <Dropdown value={source === "demo" ? (artifact === fallbackFailArtifact ? "demo-fail" : "demo-pass") : undefined} options={[...demoOptions, ...options]} optionLabel="label" optionValue="path" onChange={(e) => void loadArtifact(e.value)} placeholder="Select assurance artifact" className="w-full sm:w-72" />
          </div>
        </div>

        <RunHeader artifact={artifact} />

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.7fr)]">
          <AssuranceTimeline artifact={artifact} onSelect={setSelected} />
          <div className="space-y-5">
            <VerdictPanel artifact={artifact} />
            {artifact.failureReasons.length > 0 ? <div className="ag-card p-5"><div className="eyebrow">FAILURE REASONS</div><ul className="mt-3 space-y-2">{artifact.failureReasons.map((reason) => <li key={reason} className="rounded-lg border border-red-950/70 bg-red-950/20 px-3 py-2 text-sm leading-5 text-red-200">{reason}</li>)}</ul></div> : <div className="ag-card p-5"><div className="eyebrow">ASSURANCE SUMMARY</div><p className="mt-2 text-sm leading-6 text-slate-300">All required checks are represented by the assurance artifact. The UI renders the artifact; it does not independently decide PASS or FAIL.</p><div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><FiDatabase /> Artifact version {artifact.version}</div></div>}
          </div>
        </div>

        <div className="mt-5">
          <ProofPanel artifact={artifact} step={selected} onClose={() => setSelected(null)} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-5 text-xs text-slate-500">
          <span>AgentGuard assurance surface · artifact-driven rendering</span>
          <span className="inline-flex items-center gap-1.5">TrueForge remains the execution environment <FiArrowUpRight /></span>
        </div>
      </main>
      {loading ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"><div className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-sm text-slate-200">Loading assurance artifact…</div></div> : null}
    </div>
  );
}

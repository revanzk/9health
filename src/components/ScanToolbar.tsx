import { useState } from "react";
import { Layers, Play, Server, Square, Zap, ListOrdered } from "lucide-react";
import type {
  ComboRecord,
  ProviderSummary,
  ScanJobSnapshot,
  ScanMode,
  ScanScope,
  StartScanRequest,
} from "@shared/types";

interface ScanToolbarProps {
  providers: ProviderSummary[];
  combos: ComboRecord[];
  activeJob: ScanJobSnapshot | null;
  globalConcurrency: number;
  perProviderConcurrency: number;
  disabled: boolean;
  onStartScan: (req: StartScanRequest) => void;
  onCancelScan: (jobId: string) => void;
}

export function ScanToolbar({
  providers,
  combos,
  activeJob,
  globalConcurrency,
  perProviderConcurrency,
  disabled,
  onStartScan,
  onCancelScan,
}: ScanToolbarProps) {
  const [scope, setScope] = useState<ScanScope>("all");
  const [mode, setMode] = useState<ScanMode>("rapid");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedComboId, setSelectedComboId] = useState<string>("");

  const isRunning = activeJob?.status === "running";
  const progressPct =
    activeJob && activeJob.total > 0
      ? Math.round((activeJob.completed / activeJob.total) * 100)
      : 0;

  const toggleProvider = (pid: string) => {
    setSelectedProviders((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]
    );
  };

  const canStart =
    !disabled &&
    !isRunning &&
    (scope === "all" ||
      (scope === "provider" && selectedProviders.length > 0) ||
      (scope === "combo" && Boolean(selectedComboId || combos[0]?.id)));

  const handleRun = () => {
    if (!canStart) return;
    if (scope === "provider") {
      onStartScan({ scope: "provider", mode, providers: selectedProviders });
    } else if (scope === "combo") {
      onStartScan({ scope: "combo", mode, comboId: selectedComboId || combos[0]?.id });
    } else {
      onStartScan({ scope: "all", mode });
    }
  };

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#11151d] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Scope & Mode Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Selector */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#0a0d13] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`rounded-md px-2.5 py-1.5 font-medium transition ${
                scope === "all"
                  ? "bg-slate-800 text-slate-100 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Scan All
            </button>
            <button
              type="button"
              onClick={() => setScope("provider")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                scope === "provider"
                  ? "bg-slate-800 text-slate-100 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              By Provider
            </button>
            <button
              type="button"
              onClick={() => {
                setScope("combo");
                if (!selectedComboId && combos[0]) setSelectedComboId(combos[0].id);
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                scope === "combo"
                  ? "bg-slate-800 text-slate-100 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              By Combo
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#0a0d13] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("rapid")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                mode === "rapid"
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
              title={`Max ${globalConcurrency} global parallel, max ${perProviderConcurrency} per provider`}
            >
              <Zap className="h-3.5 w-3.5" />
              Rapid ({globalConcurrency}x · {perProviderConcurrency}/prov)
            </button>
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                mode === "single"
                  ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
              title="Sequential 1 model at a time (safest for strict rate limits)"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Single (1x)
            </button>
          </div>

          {/* Combo dropdown when scope === combo */}
          {scope === "combo" ? (
            <select
              value={selectedComboId || combos[0]?.id || ""}
              onChange={(e) => setSelectedComboId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              {combos.length === 0 ? (
                <option value="">No combos configured</option>
              ) : (
                combos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.models.length} models)
                  </option>
                ))
              )}
            </select>
          ) : null}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {isRunning && activeJob ? (
            <button
              type="button"
              onClick={() => onCancelScan(activeJob.jobId)}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop Scan ({activeJob.completed}/{activeJob.total})
            </button>
          ) : (
            <button
              type="button"
              disabled={!canStart}
              onClick={handleRun}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Start Health Scan
            </button>
          )}
        </div>
      </div>

      {/* Multi-Provider Picker when scope === provider */}
      {scope === "provider" ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-3">
          <span className="mr-1 text-[11px] font-medium text-slate-400">Select providers:</span>
          {providers.map((p) => {
            const active = selectedProviders.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProvider(p.id)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-800 bg-[#0a0d13] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                {p.id} <span className="font-mono text-[10px] opacity-70">({p.modelCount})</span>
              </button>
            );
          })}
          {providers.length === 0 ? (
            <span className="text-xs text-slate-500">No providers found</span>
          ) : null}
        </div>
      ) : null}

      {/* Progress Bar when running or just finished/cancelled */}
      {activeJob && (isRunning || activeJob.status === "cancelled") ? (
        <div className="mt-3 border-t border-slate-800/80 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-slate-300">
              {isRunning
                ? `Scanning (${activeJob.mode === "rapid" ? "Rapid" : "Sequential"})…`
                : `Scan cancelled — ${activeJob.completed} partial result(s) saved`}
            </span>
            <span className="font-mono text-slate-400">
              {activeJob.completed} / {activeJob.total} ({progressPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                activeJob.status === "cancelled" ? "bg-amber-400" : "bg-emerald-400"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

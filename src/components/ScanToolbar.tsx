import { Layers, ListOrdered, Play, Server, Square, Zap } from "lucide-react";
import type {
  ComboRecord,
  ProviderSummary,
  ScanJobSnapshot,
  ScanMode,
} from "@shared/types";

export type ToolbarScope = "all" | "provider" | "combo";

interface ScanToolbarProps {
  providers: ProviderSummary[];
  combos: ComboRecord[];
  scope: ToolbarScope;
  mode: ScanMode;
  selectedProviders: string[];
  selectedComboId: string;
  filteredModelCount: number;
  totalModelCount: number;
  activeJob: ScanJobSnapshot | null;
  globalConcurrency: number;
  perProviderConcurrency: number;
  disabled: boolean;
  onChangeScope: (scope: ToolbarScope) => void;
  onChangeMode: (mode: ScanMode) => void;
  onToggleProvider: (providerId: string) => void;
  onClearProviders: () => void;
  onChangeComboId: (comboId: string) => void;
  onStartScan: () => void;
  onCancelScan: (jobId: string) => void;
}

export function ScanToolbar({
  providers,
  combos,
  scope,
  mode,
  selectedProviders,
  selectedComboId,
  filteredModelCount,
  totalModelCount,
  activeJob,
  globalConcurrency,
  perProviderConcurrency,
  disabled,
  onChangeScope,
  onChangeMode,
  onToggleProvider,
  onClearProviders,
  onChangeComboId,
  onStartScan,
  onCancelScan,
}: ScanToolbarProps) {
  const isRunning = activeJob?.status === "running";
  const progressPct =
    activeJob && activeJob.total > 0
      ? Math.round((activeJob.completed / activeJob.total) * 100)
      : 0;

  // Show only providers that actually have models in the active scan picker
  const activeProviders = providers.filter((p) => p.modelCount > 0);

  const canStart = !disabled && !isRunning && filteredModelCount > 0;

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#11151d] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Scope & Mode Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Selector */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#0a0d13] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onChangeScope("all")}
              className={`rounded-md px-2.5 py-1.5 font-medium transition ${
                scope === "all"
                  ? "bg-slate-800 text-slate-100 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Scan All ({totalModelCount})
            </button>
            <button
              type="button"
              onClick={() => onChangeScope("provider")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                scope === "provider"
                  ? "bg-slate-800 text-slate-100 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              By Provider
              {scope === "provider" && selectedProviders.length > 0 ? (
                <span className="rounded bg-emerald-500/20 px-1 font-mono text-[10px] text-emerald-300">
                  {selectedProviders.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeScope("combo");
                if (!selectedComboId && combos[0]) onChangeComboId(combos[0].id);
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
              onClick={() => onChangeMode("rapid")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                mode === "rapid"
                  ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border border-transparent text-slate-400 hover:text-slate-200"
              }`}
              title={`Max ${globalConcurrency} global parallel, max ${perProviderConcurrency} per provider`}
            >
              <Zap className="h-3.5 w-3.5" />
              Rapid ({globalConcurrency}x · {perProviderConcurrency}/prov)
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("single")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition ${
                mode === "single"
                  ? "border border-sky-500/30 bg-sky-500/15 text-sky-300"
                  : "border border-transparent text-slate-400 hover:text-slate-200"
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
              onChange={(e) => onChangeComboId(e.target.value)}
              className="rounded-lg border border-emerald-500/40 bg-[#0a0d13] px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
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
              onClick={onStartScan}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {filteredModelCount < totalModelCount
                ? `Scan Filtered (${filteredModelCount})`
                : `Start Health Scan (${filteredModelCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Multi-Provider Picker when scope === provider */}
      {scope === "provider" ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-3">
          <span className="mr-1 text-[11px] font-medium text-slate-400">
            Select providers (filters list live):
          </span>
          {activeProviders.map((p) => {
            const active = selectedProviders.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggleProvider(p.id)}
                title={p.name !== p.id ? `${p.name} (${p.id})` : p.id}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-emerald-500/45 bg-emerald-500/18 text-emerald-200"
                    : "border-slate-800 bg-[#0a0d13] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                {p.name}{" "}
                <span className="font-mono text-[10px] opacity-75">({p.modelCount})</span>
              </button>
            );
          })}
          {selectedProviders.length > 0 ? (
            <button
              type="button"
              onClick={onClearProviders}
              className="ml-1 rounded-md px-2 py-1 text-[11px] text-slate-400 underline hover:text-slate-200"
            >
              Clear selection
            </button>
          ) : null}
          {activeProviders.length === 0 ? (
            <span className="text-xs text-slate-500">No active providers with models found</span>
          ) : null}
        </div>
      ) : null}

      {/* Progress Bar when running or just cancelled */}
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

import { useMemo, useState } from "react";
import {
  CheckSquare,
  Edit3,
  Play,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatLatency, formatRelativeTime, formatTokens } from "@shared/contextAnalyzer";
import type { ComboRecord, HealthStatus, ModelRecord, ProviderSummary } from "@shared/types";
import { StatusBadge } from "./StatusBadge";

interface ModelsTableProps {
  models: ModelRecord[];
  providers: ProviderSummary[];
  combos: ComboRecord[];
  selectedKeys: string[];
  isScanning: boolean;
  onToggleSelect: (key: string) => void;
  onSetSelectedKeys: (keys: string[]) => void;
  onScanSingle: (key: string) => void;
  onRequestDelete: (keys: string[]) => void;
  onEditOverride: (model: ModelRecord) => void;
  onOpenAddModel: () => void;
}

const MIN_CONTEXT_OPTIONS = [
  { label: "Any Context", value: 0 },
  { label: "≥ 32K", value: 32_000 },
  { label: "≥ 128K", value: 128_000 },
  { label: "≥ 200K", value: 200_000 },
  { label: "≥ 1M", value: 1_000_000 },
];

const SOURCE_BADGE: Record<ModelRecord["metadataSource"], { label: string; cls: string }> = {
  manual: { label: "Manual", cls: "border-sky-500/35 bg-sky-500/12 text-sky-300" },
  router_api: { label: "API", cls: "border-slate-700 bg-slate-800/80 text-slate-300" },
  registry: { label: "Registry", cls: "border-indigo-500/30 bg-indigo-500/12 text-indigo-300" },
  unknown: { label: "Unknown", cls: "border-amber-500/35 bg-amber-500/12 text-amber-300" },
};

export function ModelsTable({
  models,
  providers,
  combos,
  selectedKeys,
  isScanning,
  onToggleSelect,
  onSetSelectedKeys,
  onScanSingle,
  onRequestDelete,
  onEditOverride,
  onOpenAddModel,
}: ModelsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HealthStatus | "all">("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [comboFilter, setComboFilter] = useState("all");
  const [minContext, setMinContext] = useState(0);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (q) {
        const hay = `${m.key} ${m.name} ${m.provider} ${m.comboNames.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const st: HealthStatus = m.scan?.status ?? "unchecked";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (providerFilter !== "all" && m.provider !== providerFilter) return false;
      if (comboFilter !== "all" && !m.comboIds.includes(comboFilter)) return false;
      if (minContext > 0 && (m.contextWindow === null || m.contextWindow < minContext)) return false;
      return true;
    });
  }, [models, search, statusFilter, providerFilter, comboFilter, minContext]);

  const deadKeys = useMemo(
    () => models.filter((m) => m.scan?.status === "dead").map((m) => m.key),
    [models]
  );

  const rateLimitedCount = useMemo(
    () => models.filter((m) => m.scan?.status === "rate_limited").length,
    [models]
  );

  const handleSelectAllDead = () => {
    // Smart Safety Guard (FR-2.1): ONLY select Dead/Deprecated (red) models — never 429/Transient/Timeout
    onSetSelectedKeys(deadKeys);
  };

  const allFilteredSelected =
    filteredModels.length > 0 && filteredModels.every((m) => selectedSet.has(m.key));

  const toggleAllVisible = () => {
    if (allFilteredSelected) {
      const visibleSet = new Set(filteredModels.map((m) => m.key));
      onSetSelectedKeys(selectedKeys.filter((k) => !visibleSet.has(k)));
    } else {
      const merged = new Set([...selectedKeys, ...filteredModels.map((m) => m.key)]);
      onSetSelectedKeys(Array.from(merged));
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter & Bulk Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800/90 bg-[#11151d] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model ID, provider…"
              className="w-56 rounded-lg border border-slate-800 bg-[#0a0d13] py-1.5 pr-3 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as HealthStatus | "all")}
            className="rounded-lg border border-slate-800 bg-[#0a0d13] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="healthy">Healthy (200)</option>
            <option value="dead">Dead / Deprecated (404/410)</option>
            <option value="rate_limited">Rate Limited (429/503)</option>
            <option value="auth_error">Auth / Quota (401/402/403)</option>
            <option value="transient_error">Transient Error (5xx/400)</option>
            <option value="timeout">Timeout / Network</option>
            <option value="unchecked">Unchecked</option>
          </select>

          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0a0d13] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            aria-label="Filter by provider"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} ({p.modelCount})
              </option>
            ))}
          </select>

          <select
            value={comboFilter}
            onChange={(e) => setComboFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0a0d13] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            aria-label="Filter by combo"
          >
            <option value="all">All Combos</option>
            {combos.map((c) => (
              <option key={c.id} value={c.id}>
                Combo: {c.name}
              </option>
            ))}
          </select>

          <select
            value={minContext}
            onChange={(e) => setMinContext(Number(e.target.value))}
            className="rounded-lg border border-slate-800 bg-[#0a0d13] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            aria-label="Filter by minimum context window"
          >
            {MIN_CONTEXT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={deadKeys.length === 0}
            onClick={handleSelectAllDead}
            title={
              rateLimitedCount > 0
                ? `Smart Safety Guard: Only selects Dead/Deprecated models. ${rateLimitedCount} Rate Limited (429) model(s) are protected.`
                : "Smart Safety Guard: Select only Dead/Deprecated (Red) models"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Select All Dead ({deadKeys.length})
          </button>

          {selectedKeys.length > 0 ? (
            <button
              type="button"
              onClick={() => onRequestDelete(selectedKeys)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Selected ({selectedKeys.length})
            </button>
          ) : null}

          <button
            type="button"
            onClick={onOpenAddModel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Model
          </button>
        </div>
      </div>

      {/* Smart Safety Guard hint when Rate Limited models exist */}
      {rateLimitedCount > 0 && selectedKeys.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong>Smart Safety Guard active:</strong> &ldquo;Select All Dead&rdquo; only checks{" "}
            <span className="text-rose-300">Dead / Deprecated</span> models. {rateLimitedCount}{" "}
            <span className="text-amber-300">Rate Limited (429)</span> model(s) are excluded by default.
          </span>
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800/90 bg-[#11151d]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800/90 bg-[#0d1017] text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllVisible}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                  aria-label="Select all visible models"
                />
              </th>
              <th className="px-3 py-2.5">Model / Provider</th>
              <th className="px-3 py-2.5">Health Status</th>
              <th className="px-3 py-2.5">Context / Output</th>
              <th className="px-3 py-2.5">Latency</th>
              <th className="px-3 py-2.5">Last Checked</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredModels.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  No models match the active filters.
                </td>
              </tr>
            ) : (
              filteredModels.map((m) => {
                const status: HealthStatus = m.scan?.status ?? "unchecked";
                const isSelected = selectedSet.has(m.key);
                const srcBadge = SOURCE_BADGE[m.metadataSource];

                return (
                  <tr
                    key={m.key}
                    className={`transition hover:bg-slate-800/35 ${
                      isSelected ? "bg-rose-500/8" : ""
                    }`}
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(m.key)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                        aria-label={`Select ${m.key}`}
                      />
                    </td>

                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-100">{m.name}</span>
                        {m.isCustom ? (
                          <span className="rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.2 text-[10px] text-slate-300">
                            Custom
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400">{m.key}</div>
                      {m.comboNames.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.comboNames.map((cn) => (
                            <span
                              key={cn}
                              className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300/90"
                            >
                              combo:{cn}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>

                    <td className="max-w-xs px-3 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={status} httpStatus={m.scan?.httpStatus} />
                        {m.scan?.isReasoningFallback ? (
                          <span
                            title="Tested via reasoning fallback payload (max_completion_tokens)"
                            className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300"
                          >
                            <Sparkles className="h-3 w-3" />
                            Reasoning
                          </span>
                        ) : null}
                      </div>
                      {m.scan?.errorMessage ? (
                        <p
                          className="mt-1 line-clamp-2 font-mono text-[11px] leading-snug text-slate-400"
                          title={m.scan.errorMessage}
                        >
                          {m.scan.errorMessage}
                        </p>
                      ) : m.scan?.note ? (
                        <p className="mt-1 text-[11px] text-slate-400">{m.scan.note}</p>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono text-xs font-semibold ${
                            m.contextWindow === null ? "text-amber-300" : "text-slate-100"
                          }`}
                        >
                          {formatTokens(m.contextWindow)}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[10px] font-medium ${srcBadge.cls}`}
                        >
                          {srcBadge.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => onEditOverride(m)}
                          title="Edit manual Context Window / Max Output override"
                          className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                        Out: {m.maxOutput ? formatTokens(m.maxOutput) : "—"}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`font-mono text-xs font-medium ${
                          m.scan?.latencyMs == null
                            ? "text-slate-500"
                            : m.scan.latencyMs < 500
                              ? "text-emerald-300"
                              : m.scan.latencyMs < 1500
                                ? "text-amber-300"
                                : "text-rose-300"
                        }`}
                      >
                        {formatLatency(m.scan?.latencyMs)}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 align-top whitespace-nowrap text-slate-400">
                      {formatRelativeTime(m.scan?.checkedAt)}
                    </td>

                    <td className="px-3 py-2.5 text-right align-top">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isScanning}
                          onClick={() => onScanSingle(m.key)}
                          title="Scan this model individually"
                          className="rounded-md border border-slate-700/90 bg-slate-800/70 p-1.5 text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDelete([m.key])}
                          title="Delete model (checks Combo impact)"
                          className="rounded-md border border-slate-700/90 bg-slate-800/70 p-1.5 text-slate-300 transition hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

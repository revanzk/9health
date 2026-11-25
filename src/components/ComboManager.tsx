import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Edit3,
  GripVertical,
  HelpCircle,
  Layers,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { analyzeComboContext, formatLatency, formatTokens } from "@shared/contextAnalyzer";
import type { ComboRecord, ModelRecord } from "@shared/types";
import { StatusBadge } from "./StatusBadge";

interface ComboManagerProps {
  combos: ComboRecord[];
  models: ModelRecord[];
  bottleneckThresholdPercent: number;
  isScanning: boolean;
  onScanCombo: (comboId: string) => void;
  onCreateCombo: (name: string, models: string[]) => Promise<void>;
  onUpdateCombo: (id: string, name: string, models: string[]) => Promise<void>;
  onDeleteCombo: (id: string) => Promise<void>;
  onEditOverride: (model: ModelRecord) => void;
}

export function ComboManager({
  combos,
  models,
  bottleneckThresholdPercent,
  isScanning,
  onScanCombo,
  onCreateCombo,
  onUpdateCombo,
  onDeleteCombo,
  onEditOverride,
}: ComboManagerProps) {
  const [selectedId, setSelectedId] = useState<string>(combos[0]?.id ?? "");
  const [draftName, setDraftName] = useState("");
  const [draftModels, setDraftModels] = useState<string[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newComboName, setNewComboName] = useState("");
  const [saving, setSaving] = useState(false);

  const modelByKey = useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const selectedCombo = useMemo(
    () => combos.find((c) => c.id === selectedId) ?? combos[0] ?? null,
    [combos, selectedId]
  );

  useEffect(() => {
    if (selectedCombo) {
      setSelectedId(selectedCombo.id);
      setDraftName(selectedCombo.name);
      setDraftModels([...selectedCombo.models]);
    } else {
      setDraftName("");
      setDraftModels([]);
    }
  }, [selectedCombo]);

  const contextMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const m of models) map[m.key] = m.contextWindow;
    return map;
  }, [models]);

  const liveAnalysis = useMemo(
    () => analyzeComboContext(draftModels, contextMap, bottleneckThresholdPercent),
    [draftModels, contextMap, bottleneckThresholdPercent]
  );

  const isDirty = useMemo(() => {
    if (!selectedCombo) return false;
    if (draftName.trim() !== selectedCombo.name) return true;
    if (draftModels.length !== selectedCombo.models.length) return true;
    return draftModels.some((m, i) => m !== selectedCombo.models[i]);
  }, [selectedCombo, draftName, draftModels]);

  const availableToAdd = useMemo(() => {
    const existing = new Set(draftModels);
    const q = addSearch.trim().toLowerCase();
    return models
      .filter((m) => !existing.has(m.key))
      .filter((m) => !q || `${m.key} ${m.name} ${m.provider}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const aHealthy = a.scan?.status === "healthy" ? 0 : 1;
        const bHealthy = b.scan?.status === "healthy" ? 0 : 1;
        if (aHealthy !== bHealthy) return aHealthy - bHealthy;
        return (b.contextWindow ?? 0) - (a.contextWindow ?? 0);
      });
  }, [models, draftModels, addSearch]);

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= draftModels.length || from === to) return;
    setDraftModels((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const removeMember = (modelKey: string) => {
    setDraftModels((prev) => prev.filter((k) => k !== modelKey));
  };

  const addMember = (modelKey: string) => {
    setDraftModels((prev) => (prev.includes(modelKey) ? prev : [...prev, modelKey]));
  };

  const handleSave = async () => {
    if (!selectedCombo || !draftName.trim()) return;
    setSaving(true);
    try {
      await onUpdateCombo(selectedCombo.id, draftName.trim(), draftModels);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const clean = newComboName.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const defaultFirst = models.find((m) => m.scan?.status === "healthy")?.key ?? models[0]?.key;
      await onCreateCombo(clean, defaultFirst ? [defaultFirst] : []);
      setNewComboName("");
      setCreatingNew(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Left Sidebar: Combo List */}
      <div className="space-y-3 lg:col-span-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Configured Combos ({combos.length})
          </h2>
          <button
            type="button"
            onClick={() => setCreatingNew((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            New Combo
          </button>
        </div>

        {creatingNew ? (
          <div className="rounded-xl border border-emerald-500/35 bg-[#11151d] p-3">
            <label className="mb-1 block text-[11px] font-medium text-slate-300">
              Combo Name (letters, numbers, -, _, .)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComboName}
                onChange={(e) => setNewComboName(e.target.value)}
                placeholder="e.g. coding-fast-1m"
                className="flex-1 rounded-lg border border-slate-700 bg-[#0a0d13] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={saving || !newComboName.trim()}
                onClick={handleCreate}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {combos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#11151d] p-6 text-center text-xs text-slate-500">
              No Combos found in 9router. Create one to manage fallback chains and context awareness.
            </div>
          ) : (
            combos.map((c) => {
              const active = c.id === selectedCombo?.id;
              const bottleneckCount = c.analysis.bottleneckModelKeys.length;
              const deadCount = c.models.filter(
                (mk) => modelByKey.get(mk)?.scan?.status === "dead"
              ).length;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border p-3.5 text-left transition ${
                    active
                      ? "border-emerald-500/50 bg-[#151b26]"
                      : "border-slate-800/90 bg-[#11151d] hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-emerald-400" />
                      <span className="font-mono text-sm font-semibold text-slate-100">
                        {c.name}
                      </span>
                    </div>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                      {c.models.length} models
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md border border-slate-700/80 bg-[#0a0d13] px-2 py-0.5 font-mono text-[11px] text-slate-200">
                      Effective: <strong>{formatTokens(c.analysis.effectiveContext)}</strong>
                    </span>

                    {bottleneckCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        <AlertTriangle className="h-3 w-3" />
                        {bottleneckCount} Bottleneck
                      </span>
                    ) : null}

                    {c.analysis.hasUnknownModels ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
                        <HelpCircle className="h-3 w-3" />
                        Unknown Ctx
                      </span>
                    ) : null}

                    {deadCount > 0 ? (
                      <span className="rounded-md border border-rose-500/35 bg-rose-500/12 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        {deadCount} Dead
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Detail: Combo Inspector & Fallback Editor */}
      <div className="lg:col-span-8">
        {!selectedCombo ? (
          <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-slate-800/90 bg-[#11151d] p-8 text-sm text-slate-500">
            Select a Combo to inspect its Effective Context Window and fallback order.
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-slate-800/90 bg-[#11151d] p-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-1.5 font-mono text-sm font-semibold text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
                {isDirty ? (
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                    Unsaved changes
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => onScanCombo(selectedCombo.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" />
                  Scan Combo
                </button>
                <button
                  type="button"
                  disabled={!isDirty || saving}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save to 9router"}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCombo(selectedCombo.id)}
                  title="Delete this Combo"
                  className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Effective Context Summary Banner */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-[#0c0f16] p-3">
                <div className="text-[11px] text-slate-400">Effective Context Window</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-emerald-300">
                    {formatTokens(liveAnalysis.effectiveContext)}
                  </span>
                  {liveAnalysis.maxContext &&
                  liveAnalysis.effectiveContext &&
                  liveAnalysis.effectiveContext < liveAnalysis.maxContext ? (
                    <span className="font-mono text-xs text-slate-500">
                      (max: {formatTokens(liveAnalysis.maxContext)})
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0c0f16] p-3">
                <div className="text-[11px] text-slate-400">Bottleneck Status</div>
                <div className="mt-1 text-xs font-medium">
                  {liveAnalysis.bottleneckModelKeys.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {liveAnalysis.bottleneckModelKeys.length} model(s) ≤{" "}
                      {liveAnalysis.bottleneckThresholdPercent}% of max context
                    </span>
                  ) : (
                    <span className="text-emerald-300">Balanced — No bottleneck detected</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0c0f16] p-3">
                <div className="text-[11px] text-slate-400">Metadata Coverage</div>
                <div className="mt-1 text-xs font-medium">
                  {liveAnalysis.hasUnknownModels ? (
                    <span className="inline-flex items-center gap-1.5 text-sky-300">
                      <HelpCircle className="h-4 w-4 shrink-0" />
                      Partial — {liveAnalysis.unknownModelKeys.length} model(s) Unknown
                    </span>
                  ) : (
                    <span className="text-slate-300">100% metadata resolved</span>
                  )}
                </div>
              </div>
            </div>

            {liveAnalysis.hasUnknownModels ? (
              <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/8 px-3 py-2 text-xs text-sky-200">
                <HelpCircle className="h-4 w-4 shrink-0 text-sky-400" />
                <span>
                  <strong>Partial Calculation:</strong> One or more models have an{" "}
                  <code>Unknown</code> context window. Click the edit icon next to any Unknown
                  model to set a Manual Override.
                </span>
              </div>
            ) : null}

            {/* Fallback Priority Order List (Drag & Drop + Up/Down) */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Fallback Priority Chain (Drag or use arrows to reorder)
                </h3>
              </div>

              <div className="space-y-2">
                {draftModels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                    Combo has no models. Add at least one healthy model below.
                  </div>
                ) : (
                  draftModels.map((mk, idx) => {
                    const model = modelByKey.get(mk);
                    const ctx = liveAnalysis.modelContexts[mk];
                    const isBottleneck = liveAnalysis.bottleneckModelKeys.includes(mk);
                    const isUnknown = ctx === null;

                    return (
                      <div
                        key={mk}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIdx !== null) moveItem(dragIdx, idx);
                          setDragIdx(null);
                        }}
                        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition ${
                          isBottleneck
                            ? "border-amber-500/45 bg-amber-500/8"
                            : "border-slate-800 bg-[#0c0f16]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <GripVertical className="h-4 w-4 cursor-grab text-slate-600" />
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 font-mono text-[11px] font-semibold text-slate-300">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-medium text-slate-100">
                                {mk}
                              </span>
                              <StatusBadge
                                status={model?.scan?.status ?? "unchecked"}
                                compact
                              />
                              <span className="font-mono text-[11px] text-slate-400">
                                {formatLatency(model?.scan?.latencyMs)}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={`font-mono text-[11px] ${
                                  isUnknown ? "text-sky-300" : "text-slate-300"
                                }`}
                              >
                                Context: <strong>{formatTokens(ctx)}</strong>
                              </span>

                              {isBottleneck ? (
                                <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                                  <AlertTriangle className="h-3 w-3" />
                                  Bottleneck: limits Combo to {formatTokens(ctx)}
                                </span>
                              ) : null}

                              {isUnknown && model ? (
                                <button
                                  type="button"
                                  onClick={() => onEditOverride(model)}
                                  className="inline-flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-500/20"
                                >
                                  <Edit3 className="h-2.5 w-2.5" />
                                  Set Context Override
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveItem(idx, idx - 1)}
                            title="Move priority up"
                            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === draftModels.length - 1}
                            onClick={() => moveItem(idx, idx + 1)}
                            title="Move priority down"
                            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMember(mk)}
                            title="Remove model from Combo"
                            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Add Model Picker */}
            <div className="border-t border-slate-800/80 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Add Model to Combo
                </h3>
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Filter models to add…"
                  className="w-56 rounded-lg border border-slate-800 bg-[#0a0d13] px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {availableToAdd.slice(0, 20).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => addMember(m.key)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-[#0c0f16] px-2.5 py-2 text-left text-xs transition hover:border-emerald-500/40 hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px] text-slate-200">{m.key}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                        <span>Ctx: {formatTokens(m.contextWindow)}</span>
                        <span>·</span>
                        <span>{formatLatency(m.scan?.latencyMs)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={m.scan?.status ?? "unchecked"} compact />
                      <Plus className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                  </button>
                ))}
                {availableToAdd.length === 0 ? (
                  <div className="col-span-2 py-3 text-center text-xs text-slate-500">
                    All matching models are already in this Combo.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

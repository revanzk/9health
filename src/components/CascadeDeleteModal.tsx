import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Trash2, X } from "lucide-react";
import { formatLatency, formatTokens } from "@shared/contextAnalyzer";
import type {
  CascadeImpactItem,
  DeleteModelsRequest,
  ModelRecord,
} from "@shared/types";

interface CascadeDeleteModalProps {
  open: boolean;
  deletingKeys: string[];
  impacts: CascadeImpactItem[];
  allModels: ModelRecord[];
  onClose: () => void;
  onConfirm: (payload: DeleteModelsRequest) => Promise<void>;
}

type ComboChoice = {
  action: "remove" | "swap" | "delete_combo";
  swapMap: Record<string, string>;
};

export function CascadeDeleteModal({
  open,
  deletingKeys,
  impacts,
  allModels,
  onClose,
  onConfirm,
}: CascadeDeleteModalProps) {
  const [choices, setChoices] = useState<Record<string, ComboChoice>>({});
  const [submitting, setSubmitting] = useState(false);

  const deleteSet = useMemo(() => new Set(deletingKeys), [deletingKeys]);

  // Healthy replacement candidates sorted by lowest latency & largest context window
  const healthyCandidates = useMemo(() => {
    return allModels
      .filter((m) => !deleteSet.has(m.key) && m.scan?.status === "healthy")
      .sort((a, b) => {
        const latA = a.scan?.latencyMs ?? 99_999;
        const latB = b.scan?.latencyMs ?? 99_999;
        return latA - latB;
      });
  }, [allModels, deleteSet]);

  const fallbackCandidates = useMemo(() => {
    if (healthyCandidates.length > 0) return healthyCandidates;
    return allModels.filter((m) => !deleteSet.has(m.key) && m.scan?.status !== "dead");
  }, [healthyCandidates, allModels, deleteSet]);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, ComboChoice> = {};
    const defaultReplacement = fallbackCandidates[0]?.key ?? "";
    for (const imp of impacts) {
      const swapMap: Record<string, string> = {};
      for (const mk of imp.affectedModels) {
        if (defaultReplacement) swapMap[mk] = defaultReplacement;
      }
      init[imp.comboId] = {
        // Default to swap if healthy replacement exists, otherwise delete_combo for single-model combo or remove
        action: defaultReplacement
          ? "swap"
          : imp.willBecomeEmpty
            ? "delete_combo"
            : "remove",
        swapMap,
      };
    }
    setChoices(init);
  }, [open, impacts, fallbackCandidates]);

  if (!open) return null;

  const canSubmit = impacts.every((imp) => {
    const c = choices[imp.comboId];
    if (!c) return false;
    if (imp.willBecomeEmpty && c.action === "remove") return false;
    if (c.action === "swap") {
      return imp.affectedModels.every((mk) => Boolean(c.swapMap[mk]));
    }
    return true;
  });

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const comboActions: DeleteModelsRequest["comboActions"] = impacts.map((imp) => {
        const c = choices[imp.comboId];
        return {
          comboId: imp.comboId,
          action: c.action,
          swapMap: c.action === "swap" ? c.swapMap : undefined,
        };
      });
      await onConfirm({ modelKeys: deletingKeys, comboActions });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-[#121620] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Confirm Delete ({deletingKeys.length} Model{deletingKeys.length > 1 ? "s" : ""})
              </h2>
              <p className="text-xs text-slate-400">
                {impacts.length > 0
                  ? `Cascade Impact detected in ${impacts.length} Combo(s)`
                  : "No Combos are affected by this deletion."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {/* Models list */}
          <div>
            <div className="mb-1.5 font-medium text-slate-300">Models to delete from 9router:</div>
            <div className="flex flex-wrap gap-1.5">
              {deletingKeys.map((mk) => (
                <span
                  key={mk}
                  className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] text-rose-200"
                >
                  {mk}
                </span>
              ))}
            </div>
          </div>

          {/* Cascade Impacts */}
          {impacts.length > 0 ? (
            <div className="space-y-3">
              <div className="font-medium text-slate-300">Affected Combos &amp; Resolution:</div>
              {impacts.map((imp) => {
                const choice = choices[imp.comboId] ?? { action: "remove", swapMap: {} };

                return (
                  <div
                    key={imp.comboId}
                    className={`rounded-xl border p-3.5 ${
                      imp.willBecomeEmpty
                        ? "border-amber-500/45 bg-amber-500/8"
                        : "border-slate-800 bg-[#0b0e15]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-100">
                        Combo: {imp.comboName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {imp.affectedModels.length} affected · {imp.remainingModels.length} remaining
                      </span>
                    </div>

                    {imp.willBecomeEmpty ? (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/12 px-2.5 py-2 text-[11px] text-amber-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span>
                          <strong>Single-Model Combo Warning:</strong> Removing this model would
                          leave <code>{imp.comboName}</code> empty. Please either{" "}
                          <strong>Swap</strong> with a healthy model or{" "}
                          <strong>Delete the Combo</strong> together.
                        </span>
                      </div>
                    ) : null}

                    {/* Action Choices */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={fallbackCandidates.length === 0}
                        onClick={() =>
                          setChoices((prev) => ({
                            ...prev,
                            [imp.comboId]: { ...choice, action: "swap" },
                          }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          choice.action === "swap"
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                        } disabled:opacity-40`}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        Quick Swap (Healthy)
                      </button>

                      {!imp.willBecomeEmpty ? (
                        <button
                          type="button"
                          onClick={() =>
                            setChoices((prev) => ({
                              ...prev,
                              [imp.comboId]: { ...choice, action: "remove" },
                            }))
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            choice.action === "remove"
                              ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                              : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Remove &amp; Clean from Combo
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setChoices((prev) => ({
                              ...prev,
                              [imp.comboId]: { ...choice, action: "delete_combo" },
                            }))
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            choice.action === "delete_combo"
                              ? "border-rose-500/50 bg-rose-500/15 text-rose-200"
                              : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Delete Model + Delete Combo
                        </button>
                      )}
                    </div>

                    {/* Swap Selectors */}
                    {choice.action === "swap" ? (
                      <div className="mt-3 space-y-2 border-t border-slate-800/80 pt-3">
                        {imp.affectedModels.map((deadKey) => (
                          <div
                            key={deadKey}
                            className="flex flex-wrap items-center gap-2 text-[11px]"
                          >
                            <span className="font-mono text-rose-300 line-through">{deadKey}</span>
                            <span className="text-slate-500">→</span>
                            <select
                              value={choice.swapMap[deadKey] ?? ""}
                              onChange={(e) =>
                                setChoices((prev) => ({
                                  ...prev,
                                  [imp.comboId]: {
                                    ...choice,
                                    swapMap: { ...choice.swapMap, [deadKey]: e.target.value },
                                  },
                                }))
                              }
                              className="flex-1 rounded-lg border border-slate-700 bg-[#0a0d13] px-2.5 py-1.5 font-mono text-xs text-emerald-200 focus:border-emerald-500 focus:outline-none"
                            >
                              {fallbackCandidates.map((cand) => (
                                <option key={cand.key} value={cand.key}>
                                  {cand.key} · {formatTokens(cand.contextWindow)} ·{" "}
                                  {formatLatency(cand.scan?.latencyMs)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {submitting ? "Applying…" : "Execute & Sync to 9router"}
          </button>
        </div>
      </div>
    </div>
  );
}

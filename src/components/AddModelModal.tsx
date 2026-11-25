import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ProviderSummary } from "@shared/types";

interface AddModelModalProps {
  open: boolean;
  providers: ProviderSummary[];
  onClose: () => void;
  onSubmit: (payload: {
    providerAlias: string;
    modelId: string;
    name?: string;
    contextWindow?: number | null;
    maxOutput?: number | null;
  }) => Promise<void>;
}

export function AddModelModal({ open, providers, onClose, onSubmit }: AddModelModalProps) {
  const [providerAlias, setProviderAlias] = useState(providers[0]?.id ?? "openrouter");
  const [modelId, setModelId] = useState("");
  const [name, setName] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [maxOutput, setMaxOutput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerAlias.trim() || !modelId.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        providerAlias: providerAlias.trim(),
        modelId: modelId.trim(),
        name: name.trim() || undefined,
        contextWindow: contextWindow ? Number(contextWindow) : null,
        maxOutput: maxOutput ? Number(maxOutput) : null,
      });
      setModelId("");
      setName("");
      setContextWindow("");
      setMaxOutput("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#121620] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Add Custom Model to 9router</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 px-5 py-4 text-xs">
          <div>
            <label className="mb-1 block font-medium text-slate-300">Provider Alias</label>
            <input
              list="provider-aliases"
              value={providerAlias}
              onChange={(e) => setProviderAlias(e.target.value)}
              placeholder="e.g. openrouter, groq, gemini"
              required
              className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
            <datalist id="provider-aliases">
              {providers.map((p) => (
                <option key={p.id} value={p.id} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-300">Model ID</label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g. deepseek/deepseek-r1:free"
              required
              className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-300">
              Display Name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DeepSeek R1 Free"
              className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-medium text-slate-300">
                Context Window <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="number"
                min={1024}
                step={1024}
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="e.g. 131072"
                className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-300">
                Max Output <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="number"
                min={256}
                step={256}
                value={maxOutput}
                onChange={(e) => setMaxOutput(e.target.value)}
                placeholder="e.g. 8192"
                className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 font-medium text-slate-200 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !providerAlias.trim() || !modelId.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? "Adding…" : "Add Model"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { RotateCcw, Save, X } from "lucide-react";
import { formatTokens } from "@shared/contextAnalyzer";
import type { ModelRecord } from "@shared/types";

interface OverrideModalProps {
  model: ModelRecord | null;
  onClose: () => void;
  onSave: (payload: {
    modelKey: string;
    contextWindow?: number | null;
    maxOutput?: number | null;
    clear?: boolean;
  }) => Promise<void>;
}

const PRESETS = [
  { label: "32K", value: 32_768 },
  { label: "128K", value: 128_000 },
  { label: "200K", value: 200_000 },
  { label: "256K", value: 262_144 },
  { label: "1M", value: 1_048_576 },
];

export function OverrideModal({ model, onClose, onSave }: OverrideModalProps) {
  const [contextWindow, setContextWindow] = useState("");
  const [maxOutput, setMaxOutput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (model) {
      setContextWindow(model.contextWindow ? String(model.contextWindow) : "");
      setMaxOutput(model.maxOutput ? String(model.maxOutput) : "");
    }
  }, [model]);

  if (!model) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        modelKey: model.key,
        contextWindow: contextWindow ? Number(contextWindow) : null,
        maxOutput: maxOutput ? Number(maxOutput) : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await onSave({ modelKey: model.key, clear: true });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#121620] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Manual Metadata Override</h2>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">{model.key}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 px-5 py-4 text-xs">
          <div className="rounded-lg border border-slate-800 bg-[#0b0e15] px-3 py-2 text-[11px] text-slate-400">
            Current source: <strong className="text-slate-200">{model.metadataSource}</strong> ·
            9router API value:{" "}
            <span className="font-mono text-slate-300">{formatTokens(model.apiContextWindow)}</span>
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-slate-300">
              Context Window (tokens)
            </label>
            <input
              type="number"
              min={1024}
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
              placeholder="e.g. 131072 or 1048576"
              className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setContextWindow(String(p.value))}
                  className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-slate-300">
              Max Output Tokens <span className="text-slate-500">(optional)</span>
            </label>
            <input
              type="number"
              min={256}
              value={maxOutput}
              onChange={(e) => setMaxOutput(e.target.value)}
              placeholder="e.g. 8192 or 65536"
              className="w-full rounded-lg border border-slate-700 bg-[#0a0d13] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            {model.metadataSource === "manual" ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleClear}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Override
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 font-medium text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" />
                Save Override
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

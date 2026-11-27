import { useEffect, useState } from "react";
import { Database, RefreshCw, RotateCcw, Save, Settings2, X } from "lucide-react";
import type { AppSettings, DashboardSnapshot } from "@shared/types";

interface SettingsModalProps {
  open: boolean;
  snapshot: DashboardSnapshot | null;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  onSyncRegistry: () => Promise<void>;
  onResetDemo: () => Promise<void>;
}

export function SettingsModal({
  open,
  snapshot,
  onClose,
  onSave,
  onSyncRegistry,
  onResetDemo,
}: SettingsModalProps) {
  const [routerBaseUrl, setRouterBaseUrl] = useState("http://127.0.0.1:20128");
  const [dashboardPassword, setDashboardPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [timeoutSec, setTimeoutSec] = useState(15);
  const [globalConcurrency, setGlobalConcurrency] = useState(5);
  const [perProviderConcurrency, setPerProviderConcurrency] = useState(2);
  const [providerPacingMs, setProviderPacingMs] = useState(150);
  const [bottleneckThresholdPercent, setBottleneckThresholdPercent] = useState(50);
  const [demoMode, setDemoMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (open && snapshot) {
      const s = snapshot.settings;
      setRouterBaseUrl(s.routerBaseUrl);
      setDashboardPassword(s.hasDashboardPassword ? "__UNCHANGED__" : "");
      setApiKey(s.hasApiKey ? "__UNCHANGED__" : "");
      setTimeoutSec(Math.round(s.timeoutMs / 1000));
      setGlobalConcurrency(s.globalConcurrency);
      setPerProviderConcurrency(s.perProviderConcurrency);
      setProviderPacingMs(s.providerPacingMs);
      setBottleneckThresholdPercent(s.bottleneckThresholdPercent);
      setDemoMode(s.demoMode);
    }
  }, [open, snapshot]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        routerBaseUrl,
        dashboardPassword,
        apiKey,
        timeoutMs: timeoutSec * 1000,
        globalConcurrency,
        perProviderConcurrency,
        providerPacingMs,
        bottleneckThresholdPercent,
        demoMode,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSyncRegistry();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-[#121620] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              9scout Settings &amp; 9router Connection
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {/* 9router Connection */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0b0e15] p-3.5">
            <div className="font-semibold text-slate-200">9router Local API Connection</div>
            <div>
              <label className="mb-1 block text-slate-400">9router Base URL</label>
              <input
                type="url"
                value={routerBaseUrl}
                onChange={(e) => setRouterBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:20128"
                required
                className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-400">
                  Dashboard Password <span className="text-slate-500">(default: 123456)</span>
                </label>
                <input
                  type="password"
                  value={dashboardPassword === "__UNCHANGED__" ? "" : dashboardPassword}
                  onChange={(e) => setDashboardPassword(e.target.value)}
                  placeholder={
                    dashboardPassword === "__UNCHANGED__" ? "•••••••• (saved)" : "Leave empty for default"
                  }
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-slate-400">
                  9router API Key <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  type="password"
                  value={apiKey === "__UNCHANGED__" ? "" : apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={apiKey === "__UNCHANGED__" ? "•••••••• (saved)" : "Bearer token for /v1/*"}
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Credentials stay exclusively in the local 9scout backend proxy and are never exposed in
              browser storage.
            </p>
          </div>

          {/* Scanner & Bottleneck Settings */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0b0e15] p-3.5">
            <div className="font-semibold text-slate-200">Health Scanner &amp; Context Guardrails</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-slate-400">Timeout (seconds)</label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-400">Global Max (1–5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={globalConcurrency}
                  onChange={(e) => setGlobalConcurrency(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-400">Per-Provider (1–3)</label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={perProviderConcurrency}
                  onChange={(e) => setPerProviderConcurrency(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-400">Provider Pacing (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={50}
                  value={providerPacingMs}
                  onChange={(e) => setProviderPacingMs(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-slate-400">
                  Bottleneck Warning Threshold (% of Combo Max Context)
                </label>
                <input
                  type="number"
                  min={10}
                  max={90}
                  value={bottleneckThresholdPercent}
                  onChange={(e) => setBottleneckThresholdPercent(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#080a0f] px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Metadata Registry & Demo Sandbox */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-[#0b0e15] p-3.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Database className="h-3.5 w-3.5 text-indigo-400" />
                Metadata Registry
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Cached models: <strong className="text-slate-200">{snapshot?.registryCount ?? 0}</strong>
              </p>
              <button
                type="button"
                disabled={syncing}
                onClick={handleSync}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/35 bg-indigo-500/12 px-2.5 py-1.5 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync OpenRouter Catalog"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b0e15] p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Demo Sandbox Mode</span>
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={(e) => setDemoMode(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Test scanner, Cascade Impact, and Bottlenecks offline without 9router running.
              </p>
              {demoMode ? (
                <button
                  type="button"
                  onClick={onResetDemo}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Demo Data
                </button>
              ) : null}
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
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

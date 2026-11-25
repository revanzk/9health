import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Layers,
  RefreshCw,
  Settings2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import type {
  AppSettings,
  CascadeImpactItem,
  DashboardSnapshot,
  DeleteModelsRequest,
  HealthStatus,
  ModelRecord,
  ScanJobSnapshot,
  ScanMode,
  StartScanRequest,
} from "@shared/types";
import { api } from "./api";
import { AddModelModal } from "./components/AddModelModal";
import { CascadeDeleteModal } from "./components/CascadeDeleteModal";
import { ComboManager } from "./components/ComboManager";
import { ModelsTable } from "./components/ModelsTable";
import { OverrideModal } from "./components/OverrideModal";
import { ScanToolbar, type ToolbarScope } from "./components/ScanToolbar";
import { SettingsModal } from "./components/SettingsModal";

type ActiveTab = "monitor" | "combos";

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("monitor");
  const [activeJob, setActiveJob] = useState<ScanJobSnapshot | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Unified dynamic scan scope + table filter state
  const [scanScope, setScanScope] = useState<ToolbarScope>("all");
  const [scanMode, setScanMode] = useState<ScanMode>("rapid");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedComboId, setSelectedComboId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HealthStatus | "all">("all");
  const [minContext, setMinContext] = useState(0);

  // Modals & inline auth unlock
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [overrideModel, setOverrideModel] = useState<ModelRecord | null>(null);
  const [quickPassword, setQuickPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    keys: string[];
    impacts: CascadeImpactItem[];
  }>({ open: false, keys: [], impacts: [] });

  const streamCleanupRef = useRef<(() => void) | null>(null);

  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      const data = await api.getSnapshot();
      setSnapshot(data);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to reach 9health server");
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  const attachScanStream = useCallback(
    (jobId: string) => {
      streamCleanupRef.current?.();
      streamCleanupRef.current = api.streamScan(
        jobId,
        (ev) => {
          setActiveJob(ev.job);
          if (ev.latestResult) {
            const latest = ev.latestResult;
            setSnapshot((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                models: prev.models.map((m) =>
                  m.key === latest.modelKey ? { ...m, scan: latest } : m
                ),
              };
            });
          }
          if (ev.type === "done") {
            pushToast("success", `Scan complete (${ev.job.completed}/${ev.job.total} models checked)`);
            void refreshSnapshot();
          } else if (ev.type === "cancelled") {
            pushToast(
              "info",
              `Scan stopped — ${ev.job.completed} completed result(s) preserved`
            );
            void refreshSnapshot();
          }
        },
        () => {
          void refreshSnapshot();
        }
      );
    },
    [pushToast, refreshSnapshot]
  );

  useEffect(() => {
    void refreshSnapshot();
    void api.getActiveScan().then(({ job }) => {
      if (job) {
        setActiveJob(job);
        if (job.status === "running") {
          attachScanStream(job.jobId);
        }
      }
    });
    return () => {
      streamCleanupRef.current?.();
    };
  }, [refreshSnapshot, attachScanStream]);

  const stats = useMemo(() => {
    const models = snapshot?.models ?? [];
    const combos = snapshot?.combos ?? [];
    let healthy = 0;
    let rateLimited = 0;
    let dead = 0;
    let warningOther = 0;
    for (const m of models) {
      const st = m.scan?.status;
      if (st === "healthy") healthy += 1;
      else if (st === "rate_limited") rateLimited += 1;
      else if (st === "dead") dead += 1;
      else if (st) warningOther += 1;
    }
    const bottleneckCombos = combos.filter((c) => c.analysis.bottleneckModelKeys.length > 0).length;
    return {
      totalModels: models.length,
      healthy,
      rateLimited,
      dead,
      warningOther,
      totalCombos: combos.length,
      bottleneckCombos,
    };
  }, [snapshot]);

  const filteredModels = useMemo(() => {
    const models = snapshot?.models ?? [];
    const combos = snapshot?.combos ?? [];
    const q = search.trim().toLowerCase();
    const providerSet = new Set(selectedProviders);
    const activeCombo =
      scanScope === "combo"
        ? combos.find((c) => c.id === selectedComboId) ?? combos[0] ?? null
        : null;
    const comboMemberOrder = activeCombo
      ? new Map(activeCombo.models.map((mk, idx) => [mk, idx]))
      : null;

    const list = models.filter((m) => {
      if (scanScope === "provider") {
        if (selectedProviders.length === 0) return false;
        if (!providerSet.has(m.provider)) return false;
      } else if (scanScope === "combo") {
        if (!activeCombo) return false;
        if (!comboMemberOrder?.has(m.key) && !m.comboIds.includes(activeCombo.id)) return false;
      }

      if (q) {
        const hay =
          `${m.key} ${m.name} ${m.provider} ${m.providerName} ${m.comboNames.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const st: HealthStatus = m.scan?.status ?? "unchecked";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (minContext > 0 && (m.contextWindow === null || m.contextWindow < minContext)) return false;
      return true;
    });

    // When viewing a specific Combo, preserve its exact fallback priority order
    if (comboMemberOrder) {
      return [...list].sort(
        (a, b) => (comboMemberOrder.get(a.key) ?? 9999) - (comboMemberOrder.get(b.key) ?? 9999)
      );
    }
    return list;
  }, [snapshot, scanScope, selectedProviders, selectedComboId, search, statusFilter, minContext]);

  const handleStartFilteredScan = () => {
    const targetKeys = filteredModels.map((m) => m.key);
    if (targetKeys.length === 0) return;

    const hasExtraTableFilters =
      Boolean(search.trim()) || statusFilter !== "all" || minContext > 0;

    if (hasExtraTableFilters) {
      void handleStartScan({ scope: "all", mode: scanMode, modelKeys: targetKeys });
    } else if (scanScope === "provider" && selectedProviders.length > 0) {
      void handleStartScan({ scope: "provider", mode: scanMode, providers: selectedProviders });
    } else if (scanScope === "combo") {
      const cid = selectedComboId || snapshot?.combos[0]?.id;
      if (cid) void handleStartScan({ scope: "combo", mode: scanMode, comboId: cid });
    } else {
      void handleStartScan({ scope: "all", mode: scanMode });
    }
  };

  const handleStartScan = async (req: StartScanRequest) => {
    try {
      const { job } = await api.startScan(req);
      setActiveJob(job);
      attachScanStream(job.jobId);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to start scan");
    }
  };

  const handleCancelScan = async (jobId: string) => {
    try {
      const { job } = await api.cancelScan(jobId);
      setActiveJob(job);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to cancel scan");
    }
  };

  const handleRetryConnection = async () => {
    try {
      const data = await api.retryConnection();
      setSnapshot(data);
      if (data.connection.connected) {
        pushToast("success", "Connected to 9router");
      } else {
        pushToast("error", data.connection.error || "9router is still unreachable");
      }
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Retry failed");
    }
  };

  const handleEnableDemo = async () => {
    try {
      const data = await api.updateSettings({ demoMode: true });
      setSnapshot(data);
      pushToast("info", "Demo Sandbox Mode enabled — try Rapid Scan & Combo Bottlenecks");
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to enable demo mode");
    }
  };

  const handleRequestDelete = async (keys: string[]) => {
    if (keys.length === 0) return;
    try {
      const { impacts } = await api.previewDeleteImpact(keys);
      setDeleteDialog({ open: true, keys, impacts });
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to check combo impact");
    }
  };

  const handleConfirmDelete = async (payload: DeleteModelsRequest) => {
    const data = await api.deleteModels(payload);
    setSnapshot(data);
    setSelectedKeys([]);
    pushToast(
      "success",
      `Deleted ${payload.modelKeys.length} model(s) and synchronized changes to 9router`
    );
  };

  const handleSaveSettings = async (patch: Partial<AppSettings>) => {
    const data = await api.updateSettings(patch);
    setSnapshot(data);
    pushToast("success", "Settings saved");
  };

  const handleQuickUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPassword) return;
    setUnlocking(true);
    try {
      const data = await api.updateSettings({ dashboardPassword: quickPassword });
      setSnapshot(data);
      if (data.connection.authenticated) {
        setQuickPassword("");
        pushToast("success", `Authenticated — loaded ${data.combos.length} Combo(s) from 9router`);
      } else {
        pushToast("error", data.connection.error || "Invalid 9router dashboard password");
      }
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setUnlocking(false);
    }
  };

  const isConnected = snapshot?.connection.connected ?? false;
  const isDemo = snapshot?.connection.demoMode ?? false;
  const isScanning = activeJob?.status === "running";

  // Models queued in an active scan appear as "Pending" until their result arrives.
  // When cancelled (or completed), this set clears immediately so any unfinished model
  // automatically reverts to its exact previous state stored in snapshot.
  const pendingModelKeys = useMemo(() => {
    if (!activeJob || activeJob.status !== "running") {
      return new Set<string>();
    }
    const doneKeys = new Set(activeJob.results.map((r) => r.modelKey));
    const pending = new Set<string>();
    for (const key of activeJob.targetModelKeys ?? []) {
      if (!doneKeys.has(key)) pending.add(key);
    }
    return pending;
  }, [activeJob]);

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0b0e15]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand + Tabs */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/35 bg-emerald-500/15 text-emerald-400">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-slate-100">
                  9health
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                    v1.0
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">9router Health &amp; Context Console</div>
              </div>
            </div>

            <nav className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#090b10] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("monitor")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  activeTab === "monitor"
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Health Monitor
                <span className="font-mono text-[10px] text-slate-400">({stats.totalModels})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("combos")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  activeTab === "combos"
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Combo Manager
                {stats.bottleneckCombos > 0 ? (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-amber-300">
                    {stats.bottleneckCombos} !
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-slate-400">
                    ({stats.totalCombos})
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Connection Status & Settings */}
          <div className="flex items-center gap-2">
            {isDemo ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/12 px-2.5 py-1.5 text-xs font-medium text-cyan-200">
                <FlaskConical className="h-3.5 w-3.5" />
                Demo Sandbox
              </span>
            ) : isConnected ? (
              <span
                title={`Connected to ${snapshot?.connection.routerBaseUrl}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300"
              >
                <Wifi className="h-3.5 w-3.5" />
                9router Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={handleRetryConnection}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/12 px-2.5 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
              >
                <WifiOff className="h-3.5 w-3.5" />
                9router Disconnected · Retry
              </button>
            )}

            <button
              type="button"
              onClick={() => void refreshSnapshot()}
              title="Refresh models and combos from 9router"
              className="rounded-lg border border-slate-800 bg-[#11151d] p-2 text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#11151d] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800 bg-[#11151d] text-sm text-slate-400">
            Connecting to 9health local proxy…
          </div>
        ) : !isConnected ? (
          /* Graceful Disconnected Recovery Banner (NFR-3) */
          <div className="rounded-2xl border border-rose-500/35 bg-[#12151f] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/35 bg-rose-500/15 text-rose-400">
              <WifiOff className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-100">9router Disconnected</h1>
            <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-400">
              {snapshot?.connection.error ||
                "Unable to reach local 9router service. Make sure 9router is running on port 20128 or update the URL in Settings."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleRetryConnection}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Connection
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Connection Settings
              </button>
              <button
                type="button"
                onClick={handleEnableDemo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/12 px-4 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Launch Demo Sandbox
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Auth Warning + Quick Inline Unlock if connected to /v1 but /api needs password */}
            {!snapshot?.connection.authenticated && !isDemo ? (
              <form
                onSubmit={handleQuickUnlock}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <div className="font-semibold text-amber-200">
                      9router Dashboard Login Required for Combos &amp; Model Editing
                    </div>
                    <div className="mt-0.5 text-[11px] text-amber-200/80">
                      {snapshot?.connection.error ||
                        "Enter your 9router dashboard password to load full Combo member lists and enable editing."}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    value={quickPassword}
                    onChange={(e) => setQuickPassword(e.target.value)}
                    placeholder="9router dashboard password"
                    className="w-52 rounded-lg border border-amber-500/40 bg-[#0a0d13] px-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={unlocking || !quickPassword}
                    className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40"
                  >
                    {unlocking ? "Signing in…" : "Unlock Combos"}
                  </button>
                </div>
              </form>
            ) : null}

            {/* Summary KPI Strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-slate-800/90 bg-[#11151d] p-3.5">
                <div className="text-[11px] text-slate-400">Active Models</div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-100">
                  {stats.totalModels}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-[#11151d] p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Healthy
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-300">
                  {stats.healthy}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-[#11151d] p-3.5">
                <div className="text-[11px] text-amber-400">Rate Limited (Protected)</div>
                <div className="mt-1 font-mono text-2xl font-bold text-amber-300">
                  {stats.rateLimited}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-[#11151d] p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
                  <XCircle className="h-3.5 w-3.5" />
                  Dead / Deprecated
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-rose-300">{stats.dead}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("combos")}
                className="rounded-xl border border-slate-800/90 bg-[#11151d] p-3.5 text-left transition hover:border-amber-500/40"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Combo Bottlenecks
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-100">
                  {stats.bottleneckCombos}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    / {stats.totalCombos}
                  </span>
                </div>
              </button>
            </div>

            {activeTab === "monitor" ? (
              <>
                <ScanToolbar
                  providers={snapshot?.providers ?? []}
                  combos={snapshot?.combos ?? []}
                  scope={scanScope}
                  mode={scanMode}
                  selectedProviders={selectedProviders}
                  selectedComboId={selectedComboId}
                  filteredModelCount={filteredModels.length}
                  totalModelCount={snapshot?.models.length ?? 0}
                  activeJob={activeJob}
                  globalConcurrency={snapshot?.settings.globalConcurrency ?? 5}
                  perProviderConcurrency={snapshot?.settings.perProviderConcurrency ?? 2}
                  disabled={!isConnected}
                  onChangeScope={(nextScope) => {
                    setScanScope(nextScope);
                    if (nextScope === "all") {
                      setSelectedProviders([]);
                      setSelectedComboId("");
                    } else if (nextScope === "combo" && !selectedComboId && snapshot?.combos[0]) {
                      setSelectedComboId(snapshot.combos[0].id);
                    }
                  }}
                  onChangeMode={setScanMode}
                  onToggleProvider={(pid) =>
                    setSelectedProviders((prev) =>
                      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]
                    )
                  }
                  onClearProviders={() => setSelectedProviders([])}
                  onChangeComboId={(cid) => setSelectedComboId(cid)}
                  onStartScan={handleStartFilteredScan}
                  onCancelScan={handleCancelScan}
                />

                <ModelsTable
                  allModels={snapshot?.models ?? []}
                  filteredModels={filteredModels}
                  providers={snapshot?.providers ?? []}
                  combos={snapshot?.combos ?? []}
                  scope={scanScope}
                  selectedProviders={selectedProviders}
                  selectedComboId={selectedComboId}
                  search={search}
                  statusFilter={statusFilter}
                  minContext={minContext}
                  selectedKeys={selectedKeys}
                  pendingModelKeys={pendingModelKeys}
                  isScanning={isScanning}
                  onChangeSearch={setSearch}
                  onChangeStatusFilter={setStatusFilter}
                  onChangeMinContext={setMinContext}
                  onSelectProviderDropdown={(pid) => {
                    if (pid === "all") {
                      setScanScope("all");
                      setSelectedProviders([]);
                    } else if (pid !== "__multi__") {
                      setScanScope("provider");
                      setSelectedProviders([pid]);
                      setSelectedComboId("");
                    }
                  }}
                  onSelectComboDropdown={(cid) => {
                    if (cid === "all") {
                      setScanScope("all");
                      setSelectedComboId("");
                    } else {
                      setScanScope("combo");
                      setSelectedComboId(cid);
                      setSelectedProviders([]);
                    }
                  }}
                  onResetFilters={() => {
                    setScanScope("all");
                    setSelectedProviders([]);
                    setSelectedComboId("");
                    setSearch("");
                    setStatusFilter("all");
                    setMinContext(0);
                  }}
                  onToggleSelect={(key) =>
                    setSelectedKeys((prev) =>
                      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                    )
                  }
                  onSetSelectedKeys={setSelectedKeys}
                  onScanSingle={(key) =>
                    void handleStartScan({ scope: "single", mode: "single", modelKey: key })
                  }
                  onRequestDelete={(keys) => void handleRequestDelete(keys)}
                  onEditOverride={(m) => setOverrideModel(m)}
                  onOpenAddModel={() => setAddModelOpen(true)}
                />
              </>
            ) : (
              <ComboManager
                combos={snapshot?.combos ?? []}
                models={snapshot?.models ?? []}
                pendingModelKeys={pendingModelKeys}
                bottleneckThresholdPercent={snapshot?.settings.bottleneckThresholdPercent ?? 50}
                isScanning={isScanning}
                onScanCombo={(comboId) => {
                  setScanScope("combo");
                  setSelectedComboId(comboId);
                  setSelectedProviders([]);
                  setSearch("");
                  setStatusFilter("all");
                  setMinContext(0);
                  setActiveTab("monitor");
                  void handleStartScan({ scope: "combo", mode: scanMode, comboId });
                }}
                onCreateCombo={async (name, models) => {
                  try {
                    const data = await api.createCombo({ name, models });
                    setSnapshot(data);
                    pushToast("success", `Combo "${name}" created`);
                  } catch (err) {
                    pushToast("error", err instanceof Error ? err.message : "Failed to create combo");
                  }
                }}
                onUpdateCombo={async (id, name, models) => {
                  try {
                    const data = await api.updateCombo(id, { name, models });
                    setSnapshot(data);
                    pushToast("success", `Combo "${name}" saved to 9router`);
                  } catch (err) {
                    pushToast("error", err instanceof Error ? err.message : "Failed to save combo");
                  }
                }}
                onDeleteCombo={async (id) => {
                  try {
                    const data = await api.deleteCombo(id);
                    setSnapshot(data);
                    pushToast("success", "Combo deleted");
                  } catch (err) {
                    pushToast("error", err instanceof Error ? err.message : "Failed to delete combo");
                  }
                }}
                onEditOverride={(m) => setOverrideModel(m)}
              />
            )}
          </>
        )}
      </main>

      {/* Modals */}
      <CascadeDeleteModal
        open={deleteDialog.open}
        deletingKeys={deleteDialog.keys}
        impacts={deleteDialog.impacts}
        allModels={snapshot?.models ?? []}
        onClose={() => setDeleteDialog({ open: false, keys: [], impacts: [] })}
        onConfirm={handleConfirmDelete}
      />

      <AddModelModal
        open={addModelOpen}
        providers={snapshot?.providers ?? []}
        onClose={() => setAddModelOpen(false)}
        onSubmit={async (payload) => {
          const data = await api.addModel(payload);
          setSnapshot(data);
          pushToast("success", `Added ${payload.providerAlias}/${payload.modelId}`);
        }}
      />

      <OverrideModal
        model={overrideModel}
        onClose={() => setOverrideModel(null)}
        onSave={async (payload) => {
          const data = await api.setOverride(payload);
          setSnapshot(data);
          pushToast(
            "success",
            payload.clear ? "Manual override cleared" : "Metadata override saved"
          );
        }}
      />

      <SettingsModal
        open={settingsOpen}
        snapshot={snapshot}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        onSyncRegistry={async () => {
          try {
            const res = await api.syncRegistry();
            pushToast("success", `Synced ${res.syncedModels} models from OpenRouter registry`);
            await refreshSnapshot();
          } catch (err) {
            pushToast("error", err instanceof Error ? err.message : "Registry sync failed");
          }
        }}
        onResetDemo={async () => {
          const data = await api.resetDemo();
          setSnapshot(data);
          pushToast("info", "Demo dataset reset");
        }}
      />

      {/* Toast Stack */}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-xl backdrop-blur-md ${
              t.kind === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
                : t.kind === "error"
                  ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
                  : "border-sky-500/40 bg-slate-900/95 text-sky-200"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

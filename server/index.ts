import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCascadeImpact, analyzeComboContext } from "../shared/contextAnalyzer.js";
import { BUILTIN_METADATA_REGISTRY, resolveModelMetadata } from "../shared/metadataRegistry.js";
import type {
  AppSettings,
  ComboRecord,
  DashboardSnapshot,
  DeleteModelsRequest,
  ModelRecord,
  ProviderSummary,
  RegistryEntry,
  RouterConnectionStatus,
  ScanResult,
  StartScanRequest,
} from "../shared/types.js";
import { LocalStore } from "./store.js";
import { NineRouterClient, type RawRouterCombo, type RawRouterModel } from "./routerClient.js";
import { ScanManager, type ScanTarget } from "./scanner.js";

const PORT = Number(process.env.PORT || 3099);

export function resolveDistDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "..", "dist"), // compiled dist-server/server/index.js -> <pkg>/dist
    path.resolve(here, "..", "dist"), // dev server/index.ts -> <pkg>/dist
    path.resolve(process.cwd(), "dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return null;
}

export interface CreateAppOverrides {
  routerBaseUrl?: string;
  demoMode?: boolean;
}

export function createApp(customStorePath?: string, overrides?: CreateAppOverrides) {
  const app = express();
  const store = new LocalStore(customStorePath);
  if (overrides?.routerBaseUrl || typeof overrides?.demoMode === "boolean") {
    store.updateSettings({
      ...(overrides.routerBaseUrl ? { routerBaseUrl: overrides.routerBaseUrl } : {}),
      ...(typeof overrides.demoMode === "boolean" ? { demoMode: overrides.demoMode } : {}),
    });
  }
  const routerClient = new NineRouterClient();
  const scanManager = new ScanManager();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  async function loadCurrentInventory(): Promise<{
    connection: RouterConnectionStatus;
    rawModels: RawRouterModel[];
    rawCombos: RawRouterCombo[];
    providers: ProviderSummary[];
  }> {
    const settings = store.getSettings();

    if (settings.demoMode) {
      const demo = store.getDemoState();
      const providerCounts = new Map<string, number>();
      for (const m of demo.models) {
        providerCounts.set(m.provider, (providerCounts.get(m.provider) ?? 0) + 1);
      }
      const providers: ProviderSummary[] = Array.from(providerCounts.entries())
        .map(([id, modelCount]) => ({
          id,
          name: id,
          isActive: true,
          modelCount,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      return {
        connection: {
          connected: true,
          demoMode: true,
          routerBaseUrl: settings.routerBaseUrl,
          authenticated: true,
          error: null,
          checkedAt: new Date().toISOString(),
        },
        rawModels: demo.models.map((m) => ({
          key: m.key,
          provider: m.provider,
          providerName: m.provider,
          providerActive: true,
          modelId: m.modelId,
          name: m.name,
          isCustom: m.isCustom,
          apiContextWindow: m.apiContextWindow,
          apiMaxOutput: m.apiMaxOutput,
        })),
        rawCombos: demo.combos.map((c) => ({ ...c, models: [...c.models] })),
        providers,
      };
    }

    const connection = await routerClient.checkConnection(settings);
    if (!connection.connected) {
      return {
        connection,
        rawModels: [],
        rawCombos: [],
        providers: [],
      };
    }

    const inv = await routerClient.fetchInventory(settings);
    return {
      connection,
      rawModels: inv.models,
      rawCombos: inv.combos,
      providers: inv.providers,
    };
  }

  async function buildSnapshot(): Promise<DashboardSnapshot> {
    const settings = store.getSettings();
    const { connection, rawModels, rawCombos, providers } = await loadCurrentInventory();
    const scanResults = store.getScanResults();
    const manualOverrides = store.getManualOverrides();
    const { entries: dynamicRegistry, updatedAt: registryUpdatedAt } = store.getDynamicRegistry();

    const comboMembershipByModel = new Map<string, { ids: string[]; names: string[] }>();
    for (const c of rawCombos) {
      for (const mk of c.models) {
        const entry = comboMembershipByModel.get(mk) ?? { ids: [], names: [] };
        entry.ids.push(c.id);
        entry.names.push(c.name);
        comboMembershipByModel.set(mk, entry);
      }
    }

    const models: ModelRecord[] = rawModels.map((raw) => {
      const resolved = resolveModelMetadata({
        modelKey: raw.key,
        apiContextWindow: raw.apiContextWindow,
        apiMaxOutput: raw.apiMaxOutput,
        manualOverride: manualOverrides[raw.key] ?? null,
        dynamicRegistry,
      });
      const membership = comboMembershipByModel.get(raw.key) ?? { ids: [], names: [] };
      return {
        key: raw.key,
        provider: raw.provider,
        providerName: raw.providerName,
        providerActive: raw.providerActive,
        modelId: raw.modelId,
        name: raw.name,
        isCustom: raw.isCustom,
        contextWindow: resolved.contextWindow,
        maxOutput: resolved.maxOutput,
        metadataSource: resolved.metadataSource,
        apiContextWindow: raw.apiContextWindow,
        apiMaxOutput: raw.apiMaxOutput,
        scan: scanResults[raw.key] ?? null,
        comboIds: membership.ids,
        comboNames: membership.names,
      };
    });

    const contextMap: Record<string, number | null> = {};
    for (const m of models) {
      contextMap[m.key] = m.contextWindow;
    }

    // Also resolve context for any combo member not currently in active models list
    for (const c of rawCombos) {
      for (const mk of c.models) {
        if (!(mk in contextMap)) {
          const resolved = resolveModelMetadata({
            modelKey: mk,
            manualOverride: manualOverrides[mk] ?? null,
            dynamicRegistry,
          });
          contextMap[mk] = resolved.contextWindow;
        }
      }
    }

    const combos: ComboRecord[] = rawCombos.map((c) => ({
      id: c.id,
      name: c.name,
      models: c.models,
      kind: c.kind ?? null,
      analysis: analyzeComboContext(c.models, contextMap, settings.bottleneckThresholdPercent),
    }));

    const { dashboardPassword, apiKey, ...publicSettings } = settings;

    return {
      connection,
      models,
      combos,
      providers,
      settings: {
        ...publicSettings,
        hasDashboardPassword: Boolean(dashboardPassword),
        hasApiKey: Boolean(apiKey),
      },
      registryCount:
        Object.keys(BUILTIN_METADATA_REGISTRY).length + Object.keys(dynamicRegistry).length,
      registryUpdatedAt,
    };
  }

  // --- Health & Snapshot ---
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "9scout", timestamp: new Date().toISOString() });
  });

  app.get("/api/snapshot", async (_req, res) => {
    try {
      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/connection/retry", async (_req, res) => {
    routerClient.clearSession();
    try {
      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Settings ---
  app.put("/api/settings", async (req, res) => {
    try {
      const body = (req.body ?? {}) as Partial<AppSettings>;
      const patch: Partial<AppSettings> = {};
      if (typeof body.routerBaseUrl === "string") patch.routerBaseUrl = body.routerBaseUrl;
      if (typeof body.dashboardPassword === "string" && body.dashboardPassword !== "__UNCHANGED__") {
        patch.dashboardPassword = body.dashboardPassword;
      }
      if (typeof body.apiKey === "string" && body.apiKey !== "__UNCHANGED__") {
        patch.apiKey = body.apiKey;
      }
      if (typeof body.timeoutMs === "number") patch.timeoutMs = body.timeoutMs;
      if (typeof body.globalConcurrency === "number") patch.globalConcurrency = body.globalConcurrency;
      if (typeof body.perProviderConcurrency === "number") {
        patch.perProviderConcurrency = body.perProviderConcurrency;
      }
      if (typeof body.providerPacingMs === "number") patch.providerPacingMs = body.providerPacingMs;
      if (typeof body.bottleneckThresholdPercent === "number") {
        patch.bottleneckThresholdPercent = body.bottleneckThresholdPercent;
      }
      if (typeof body.demoMode === "boolean") patch.demoMode = body.demoMode;

      store.updateSettings(patch);
      routerClient.clearSession();
      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/demo/reset", async (_req, res) => {
    store.resetDemoState();
    const snapshot = await buildSnapshot();
    res.json(snapshot);
  });

  // --- Metadata Registry Sync (OpenRouter public catalog -> local cache) ---
  app.post("/api/registry/sync", async (_req, res) => {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        throw new Error(`OpenRouter catalog returned HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as {
        data?: Array<{
          id?: string;
          context_length?: number;
          top_provider?: { max_completion_tokens?: number | null };
        }>;
      };
      const entries: Record<string, RegistryEntry> = {};
      for (const item of json.data ?? []) {
        if (!item.id || typeof item.context_length !== "number" || item.context_length <= 0) continue;
        const cleanId = item.id.toLowerCase().replace(/:free$/, "");
        entries[cleanId] = {
          contextWindow: item.context_length,
          maxOutput:
            typeof item.top_provider?.max_completion_tokens === "number"
              ? item.top_provider.max_completion_tokens
              : null,
        };
      }
      store.setDynamicRegistry(entries);
      res.json({
        success: true,
        syncedModels: Object.keys(entries).length,
        updatedAt: store.getDynamicRegistry().updatedAt,
      });
    } catch (err) {
      res.status(502).json({
        error: `Failed to sync public metadata registry (using local built-in registry): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // --- Health Scanner (Start, Active, SSE Stream, Cancel) ---
  app.get("/api/scan/active", (_req, res) => {
    res.json({ job: scanManager.getActiveOrLatestJob() });
  });

  app.post("/api/scan/start", async (req, res) => {
    try {
      const body = (req.body ?? {}) as StartScanRequest;
      const settings = store.getSettings();
      const { connection, rawModels, rawCombos } = await loadCurrentInventory();

      if (!connection.connected) {
        res.status(503).json({ error: connection.error || "9router is disconnected" });
        return;
      }

      const mode = body.mode === "single" ? "single" : "rapid";
      const scope = body.scope || "all";

      let targetModels = rawModels;
      if (scope === "single" && body.modelKey) {
        targetModels = rawModels.filter((m) => m.key === body.modelKey);
      } else if (scope === "provider" && Array.isArray(body.providers) && body.providers.length > 0) {
        const provSet = new Set(body.providers);
        targetModels = rawModels.filter((m) => provSet.has(m.provider));
      } else if (scope === "combo" && body.comboId) {
        const combo = rawCombos.find((c) => c.id === body.comboId || c.name === body.comboId);
        if (!combo) {
          res.status(404).json({ error: "Selected combo not found" });
          return;
        }
        const memberSet = new Set(combo.models);
        targetModels = rawModels.filter((m) => memberSet.has(m.key));
      } else if (Array.isArray(body.modelKeys) && body.modelKeys.length > 0) {
        const keySet = new Set(body.modelKeys);
        targetModels = rawModels.filter((m) => keySet.has(m.key));
      }

      const targets: ScanTarget[] = targetModels.map((m) => ({
        key: m.key,
        provider: m.provider,
      }));

      if (targets.length === 0) {
        res.status(400).json({ error: "No matching models found for the selected scan scope" });
        return;
      }

      const job = scanManager.startJob({
        scope,
        mode,
        targets,
        globalConcurrency: settings.globalConcurrency,
        perProviderConcurrency: settings.perProviderConcurrency,
        providerPacingMs: settings.providerPacingMs,
        probe: async (target, signal): Promise<ScanResult> => {
          if (settings.demoMode) {
            const demo = store.getDemoState();
            const found = demo.models.find((m) => m.key === target.key);
            const delay = found ? Math.min(900, Math.max(180, (found.simulatedLatencyMs ?? 700) * 0.55)) : 350;
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(resolve, delay);
              signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(t);
                  reject(new Error("Aborted"));
                },
                { once: true }
              );
            });
            return {
              modelKey: target.key,
              status: found?.simulatedStatus ?? "healthy",
              latencyMs: found?.simulatedLatencyMs ?? 320,
              httpStatus: found?.simulatedHttpStatus ?? 200,
              errorMessage: found?.simulatedError ?? null,
              checkedAt: new Date().toISOString(),
              isReasoningFallback: found?.isReasoningFallback ?? false,
              note: found?.isReasoningFallback
                ? "Verified via reasoning fallback payload (max_completion_tokens)"
                : null,
            };
          }
          return routerClient.pingModelDirect(settings, target.key, signal);
        },
        onPersistResult: (result) => {
          store.saveScanResult(result);
        },
      });

      res.json({ job });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/scan/:jobId/stream", (req, res) => {
    const { jobId } = req.params;
    const job = scanManager.getJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Scan job not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const unsubscribe = scanManager.subscribe(jobId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === "done" || event.type === "cancelled") {
        unsubscribe();
        res.end();
      }
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  app.post("/api/scan/:jobId/cancel", (req, res) => {
    const job = scanManager.cancelJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Scan job not found" });
      return;
    }
    res.json({ job });
  });

  // --- Models Management ---
  app.post("/api/models", async (req, res) => {
    try {
      const { providerAlias, modelId, name, contextWindow, maxOutput } = (req.body ?? {}) as {
        providerAlias?: string;
        modelId?: string;
        name?: string;
        contextWindow?: number | null;
        maxOutput?: number | null;
      };

      const cleanProvider = String(providerAlias ?? "").trim();
      const cleanId = String(modelId ?? "").trim();
      if (!cleanProvider || !cleanId) {
        res.status(400).json({ error: "Provider and Model ID are required" });
        return;
      }

      const modelKey = `${cleanProvider}/${cleanId}`;
      const settings = store.getSettings();

      if (settings.demoMode) {
        store.updateDemoState((state) => {
          if (state.models.some((m) => m.key === modelKey)) {
            throw new Error(`Model ${modelKey} already exists`);
          }
          state.models.unshift({
            key: modelKey,
            provider: cleanProvider,
            modelId: cleanId,
            name: (name || cleanId).trim(),
            isCustom: true,
            apiContextWindow: typeof contextWindow === "number" && contextWindow > 0 ? contextWindow : null,
            apiMaxOutput: typeof maxOutput === "number" && maxOutput > 0 ? maxOutput : null,
            simulatedStatus: "healthy",
            simulatedLatencyMs: 390,
            simulatedHttpStatus: 200,
            simulatedError: null,
          });
        });
      } else {
        await routerClient.addCustomModel(settings, {
          providerAlias: cleanProvider,
          modelId: cleanId,
          name: (name || cleanId).trim(),
        });
      }

      if (
        (typeof contextWindow === "number" && contextWindow > 0) ||
        (typeof maxOutput === "number" && maxOutput > 0)
      ) {
        store.setManualOverride(modelKey, {
          contextWindow: typeof contextWindow === "number" && contextWindow > 0 ? contextWindow : null,
          maxOutput: typeof maxOutput === "number" && maxOutput > 0 ? maxOutput : null,
        });
      }

      const snapshot = await buildSnapshot();
      res.status(201).json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/models/override", async (req, res) => {
    try {
      const { modelKey, contextWindow, maxOutput, clear } = (req.body ?? {}) as {
        modelKey?: string;
        contextWindow?: number | null;
        maxOutput?: number | null;
        clear?: boolean;
      };
      if (!modelKey) {
        res.status(400).json({ error: "modelKey is required" });
        return;
      }
      if (clear) {
        store.setManualOverride(modelKey, null);
      } else {
        store.setManualOverride(modelKey, {
          contextWindow: typeof contextWindow === "number" && contextWindow > 0 ? contextWindow : null,
          maxOutput: typeof maxOutput === "number" && maxOutput > 0 ? maxOutput : null,
        });
      }
      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/models/delete-impact", async (req, res) => {
    try {
      const { modelKeys } = (req.body ?? {}) as { modelKeys?: string[] };
      if (!Array.isArray(modelKeys) || modelKeys.length === 0) {
        res.status(400).json({ error: "modelKeys[] is required" });
        return;
      }
      const { rawCombos } = await loadCurrentInventory();
      const impacts = analyzeCascadeImpact(modelKeys, rawCombos);
      res.json({ impacts });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/models/delete", async (req, res) => {
    try {
      const body = (req.body ?? {}) as DeleteModelsRequest;
      const modelKeys = Array.isArray(body.modelKeys) ? body.modelKeys : [];
      const comboActions = Array.isArray(body.comboActions) ? body.comboActions : [];

      if (modelKeys.length === 0) {
        res.status(400).json({ error: "modelKeys[] is required" });
        return;
      }

      const settings = store.getSettings();
      const { rawModels, rawCombos } = await loadCurrentInventory();
      const modelSet = new Set(modelKeys);
      const comboMap = new Map(rawCombos.map((c) => [c.id, c]));

      // 1. Apply cascade actions on affected Combos first
      for (const act of comboActions) {
        const combo = comboMap.get(act.comboId);
        if (!combo) continue;

        if (act.action === "delete_combo") {
          if (settings.demoMode) {
            store.updateDemoState((state) => {
              state.combos = state.combos.filter((c) => c.id !== combo.id);
            });
          } else {
            await routerClient.deleteCombo(settings, combo.id);
          }
          continue;
        }

        let nextModels: string[];
        if (act.action === "swap" && act.swapMap) {
          const seen = new Set<string>();
          nextModels = [];
          for (const mk of combo.models) {
            const candidate = modelSet.has(mk) ? (act.swapMap[mk] || null) : mk;
            if (candidate && !seen.has(candidate)) {
              seen.add(candidate);
              nextModels.push(candidate);
            }
          }
        } else {
          nextModels = combo.models.filter((mk) => !modelSet.has(mk));
        }

        if (nextModels.length === 0) {
          res.status(400).json({
            error: `Combo "${combo.name}" would become empty. Choose Swap or Delete Combo instead.`,
          });
          return;
        }

        if (settings.demoMode) {
          store.updateDemoState((state) => {
            const target = state.combos.find((c) => c.id === combo.id);
            if (target) target.models = nextModels;
          });
        } else {
          await routerClient.updateCombo(settings, combo.id, { name: combo.name, models: nextModels });
        }
      }

      // 2. Delete models from 9router (or demo state)
      const rawByKey = new Map(rawModels.map((m) => [m.key, m]));
      if (settings.demoMode) {
        store.updateDemoState((state) => {
          state.models = state.models.filter((m) => !modelSet.has(m.key));
        });
      } else {
        for (const mk of modelKeys) {
          const info = rawByKey.get(mk);
          await routerClient.deleteModel(
            settings,
            mk,
            info?.isCustom ?? false,
            info?.customProviderAlias
          );
        }
      }

      store.deleteScanResults(modelKeys);
      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Combos Management ---
  app.post("/api/combos", async (req, res) => {
    try {
      const { name, models, kind } = (req.body ?? {}) as {
        name?: string;
        models?: string[];
        kind?: string | null;
      };
      const cleanName = String(name ?? "").trim();
      const cleanModels = Array.isArray(models) ? models.filter(Boolean) : [];
      if (!cleanName) {
        res.status(400).json({ error: "Combo name is required" });
        return;
      }
      if (!/^[a-zA-Z0-9_.\-]+$/.test(cleanName)) {
        res.status(400).json({ error: "Combo name can only contain letters, numbers, -, _, and ." });
        return;
      }

      const settings = store.getSettings();
      if (settings.demoMode) {
        store.updateDemoState((state) => {
          if (state.combos.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
            throw new Error("Combo name already exists");
          }
          state.combos.push({
            id: `combo-${Date.now()}`,
            name: cleanName,
            models: cleanModels,
            kind: kind ?? "llm",
          });
        });
      } else {
        await routerClient.createCombo(settings, { name: cleanName, models: cleanModels, kind });
      }

      const snapshot = await buildSnapshot();
      res.status(201).json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/combos/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, models } = (req.body ?? {}) as { name?: string; models?: string[] };
      const settings = store.getSettings();

      if (name && !/^[a-zA-Z0-9_.\-]+$/.test(name)) {
        res.status(400).json({ error: "Combo name can only contain letters, numbers, -, _, and ." });
        return;
      }

      if (settings.demoMode) {
        store.updateDemoState((state) => {
          const target = state.combos.find((c) => c.id === id);
          if (!target) throw new Error("Combo not found");
          if (name) {
            const dup = state.combos.find(
              (c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase()
            );
            if (dup) throw new Error("Combo name already exists");
            target.name = name;
          }
          if (Array.isArray(models)) {
            target.models = models;
          }
        });
      } else {
        await routerClient.updateCombo(settings, id, { name, models });
      }

      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/combos/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const settings = store.getSettings();

      if (settings.demoMode) {
        store.updateDemoState((state) => {
          state.combos = state.combos.filter((c) => c.id !== id);
        });
      } else {
        await routerClient.deleteCombo(settings, id);
      }

      const snapshot = await buildSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Serve Built Frontend in Production ---
  const distDir = resolveDistDir();
  if (distDir) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}

const isDirectRun =
  process.argv[1] &&
  (() => {
    try {
      return (
        fs.realpathSync(process.argv[1]).toLowerCase() ===
        fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()
      );
    } catch {
      return false;
    }
  })();

if (isDirectRun) {
  const app = createApp();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[9scout] Local proxy & dashboard listening on http://127.0.0.1:${PORT}`);
  });
}

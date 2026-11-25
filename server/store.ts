import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ManualOverride,
  type RegistryEntry,
  type ScanResult,
} from "../shared/types.js";
import { createInitialDemoState, type DemoRouterState } from "./demoData.js";

export interface LocalStoreData {
  settings: AppSettings;
  scanResults: Record<string, ScanResult>;
  manualOverrides: Record<string, ManualOverride>;
  dynamicRegistry: Record<string, RegistryEntry>;
  registryUpdatedAt: string | null;
  demoState: DemoRouterState;
}

export function getDefaultStorePath(): string {
  if (process.env.NINEHEALTH_DATA_DIR) {
    return path.join(process.env.NINEHEALTH_DATA_DIR, "store.json");
  }
  return path.join(os.homedir(), ".9health", "store.json");
}

function createEmptyStore(): LocalStoreData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    scanResults: {},
    manualOverrides: {},
    dynamicRegistry: {},
    registryUpdatedAt: null,
    demoState: createInitialDemoState(),
  };
}

export class LocalStore {
  private readonly filePath: string;
  private data: LocalStoreData;

  constructor(filePath = getDefaultStorePath()) {
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  private loadFromDisk(): LocalStoreData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return createEmptyStore();
      }
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
      return {
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        scanResults: parsed.scanResults ?? {},
        manualOverrides: parsed.manualOverrides ?? {},
        dynamicRegistry: parsed.dynamicRegistry ?? {},
        registryUpdatedAt: parsed.registryUpdatedAt ?? null,
        demoState: parsed.demoState ?? createInitialDemoState(),
      };
    } catch {
      return createEmptyStore();
    }
  }

  private persist(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmpPath, this.filePath);
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const next: AppSettings = {
      ...this.data.settings,
      ...patch,
      timeoutMs: clamp(patch.timeoutMs ?? this.data.settings.timeoutMs, 3000, 60000),
      globalConcurrency: clamp(patch.globalConcurrency ?? this.data.settings.globalConcurrency, 1, 5),
      perProviderConcurrency: clamp(
        patch.perProviderConcurrency ?? this.data.settings.perProviderConcurrency,
        1,
        3
      ),
      providerPacingMs: clamp(patch.providerPacingMs ?? this.data.settings.providerPacingMs, 0, 5000),
      bottleneckThresholdPercent: clamp(
        patch.bottleneckThresholdPercent ?? this.data.settings.bottleneckThresholdPercent,
        10,
        90
      ),
    };
    if (typeof next.routerBaseUrl === "string") {
      next.routerBaseUrl = next.routerBaseUrl.trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.routerBaseUrl;
    }
    this.data.settings = next;
    this.persist();
    return { ...next };
  }

  getScanResults(): Record<string, ScanResult> {
    return { ...this.data.scanResults };
  }

  saveScanResult(result: ScanResult): void {
    this.data.scanResults[result.modelKey] = result;
    this.persist();
  }

  deleteScanResults(modelKeys: string[]): void {
    let changed = false;
    for (const key of modelKeys) {
      if (key in this.data.scanResults) {
        delete this.data.scanResults[key];
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  getManualOverrides(): Record<string, ManualOverride> {
    return { ...this.data.manualOverrides };
  }

  setManualOverride(
    modelKey: string,
    override: { contextWindow?: number | null; maxOutput?: number | null } | null
  ): void {
    if (!override || (override.contextWindow == null && override.maxOutput == null)) {
      delete this.data.manualOverrides[modelKey];
    } else {
      this.data.manualOverrides[modelKey] = {
        contextWindow: override.contextWindow ?? null,
        maxOutput: override.maxOutput ?? null,
        updatedAt: new Date().toISOString(),
      };
    }
    this.persist();
  }

  getDynamicRegistry(): { entries: Record<string, RegistryEntry>; updatedAt: string | null } {
    return {
      entries: this.data.dynamicRegistry,
      updatedAt: this.data.registryUpdatedAt,
    };
  }

  setDynamicRegistry(entries: Record<string, RegistryEntry>): void {
    this.data.dynamicRegistry = entries;
    this.data.registryUpdatedAt = new Date().toISOString();
    this.persist();
  }

  getDemoState(): DemoRouterState {
    return this.data.demoState;
  }

  updateDemoState(mutator: (state: DemoRouterState) => void): DemoRouterState {
    mutator(this.data.demoState);
    this.persist();
    return this.data.demoState;
  }

  resetDemoState(): DemoRouterState {
    this.data.demoState = createInitialDemoState();
    this.persist();
    return this.data.demoState;
  }
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

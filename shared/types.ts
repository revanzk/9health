export type HealthStatus =
  | "healthy"
  | "rate_limited"
  | "auth_error"
  | "dead"
  | "transient_error"
  | "timeout"
  | "unchecked";

export type MetadataSource = "manual" | "router_api" | "registry" | "unknown";

export interface ScanResult {
  modelKey: string;
  status: Exclude<HealthStatus, "unchecked">;
  latencyMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
  checkedAt: string;
  isReasoningFallback?: boolean;
  note?: string | null;
}

export interface ManualOverride {
  contextWindow?: number | null;
  maxOutput?: number | null;
  updatedAt: string;
}

export interface RegistryEntry {
  contextWindow: number;
  maxOutput?: number | null;
}

export interface ModelRecord {
  key: string; // e.g. "openrouter/deepseek/deepseek-r1:free" or "groq/llama-3.3-70b-versatile"
  provider: string; // providerAlias / prefix
  providerName: string; // human-readable provider name configured in 9router
  providerActive: boolean; // whether the provider connection is enabled in 9router
  modelId: string; // model id without provider prefix
  name: string;
  isCustom: boolean;
  contextWindow: number | null;
  maxOutput: number | null;
  metadataSource: MetadataSource;
  apiContextWindow: number | null;
  apiMaxOutput: number | null;
  scan: ScanResult | null;
  comboIds: string[];
  comboNames: string[];
}

export interface ComboContextAnalysis {
  effectiveContext: number | null;
  maxContext: number | null;
  hasUnknownModels: boolean;
  unknownModelKeys: string[];
  bottleneckModelKeys: string[];
  bottleneckThresholdPercent: number;
  modelContexts: Record<string, number | null>;
}

export interface ComboRecord {
  id: string;
  name: string;
  models: string[];
  kind?: string | null;
  analysis: ComboContextAnalysis;
}

export interface ProviderSummary {
  id: string;
  name: string;
  isActive: boolean;
  authType?: "oauth" | "apikey" | "cookie" | "compatible" | "free";
  modelCount: number;
}

export interface CascadeImpactItem {
  comboId: string;
  comboName: string;
  affectedModels: string[];
  remainingModels: string[];
  willBecomeEmpty: boolean;
}

export interface AppSettings {
  routerBaseUrl: string;
  dashboardPassword: string;
  apiKey: string;
  timeoutMs: number;
  globalConcurrency: number;
  perProviderConcurrency: number;
  providerPacingMs: number;
  bottleneckThresholdPercent: number;
  demoMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  routerBaseUrl: "http://127.0.0.1:20128",
  dashboardPassword: "",
  apiKey: "",
  timeoutMs: 15000,
  globalConcurrency: 5,
  perProviderConcurrency: 2,
  providerPacingMs: 150,
  bottleneckThresholdPercent: 50,
  demoMode: false,
};

export interface RouterConnectionStatus {
  connected: boolean;
  demoMode: boolean;
  routerBaseUrl: string;
  authenticated: boolean;
  error: string | null;
  checkedAt: string;
}

export type ScanScope = "all" | "provider" | "combo" | "single";
export type ScanMode = "rapid" | "single";

export interface StartScanRequest {
  scope: ScanScope;
  mode: ScanMode;
  providers?: string[];
  comboId?: string;
  modelKey?: string;
  modelKeys?: string[];
}

export interface ScanJobSnapshot {
  jobId: string;
  status: "running" | "completed" | "cancelled";
  mode: ScanMode;
  scope: ScanScope;
  total: number;
  completed: number;
  startedAt: string;
  finishedAt: string | null;
  results: ScanResult[];
}

export interface ScanStreamEvent {
  type: "init" | "progress" | "done" | "cancelled";
  job: ScanJobSnapshot;
  latestResult?: ScanResult;
}

export interface DashboardSnapshot {
  connection: RouterConnectionStatus;
  models: ModelRecord[];
  combos: ComboRecord[];
  providers: ProviderSummary[];
  settings: Omit<AppSettings, "dashboardPassword" | "apiKey"> & {
    hasDashboardPassword: boolean;
    hasApiKey: boolean;
  };
  registryCount: number;
  registryUpdatedAt: string | null;
}

export interface DeleteModelsRequest {
  modelKeys: string[];
  comboActions: Array<{
    comboId: string;
    action: "remove" | "swap" | "delete_combo";
    swapMap?: Record<string, string>; // deadModelKey -> replacementHealthyModelKey
  }>;
}

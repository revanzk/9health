import type {
  AppSettings,
  CascadeImpactItem,
  DashboardSnapshot,
  DeleteModelsRequest,
  ScanJobSnapshot,
  ScanStreamEvent,
  StartScanRequest,
} from "@shared/types";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed with HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  getSnapshot: () => apiJson<DashboardSnapshot>("/api/snapshot"),

  retryConnection: () =>
    apiJson<DashboardSnapshot>("/api/connection/retry", { method: "POST" }),

  updateSettings: (patch: Partial<AppSettings>) =>
    apiJson<DashboardSnapshot>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  resetDemo: () =>
    apiJson<DashboardSnapshot>("/api/demo/reset", { method: "POST" }),

  syncRegistry: () =>
    apiJson<{ success: boolean; syncedModels: number; updatedAt: string | null }>(
      "/api/registry/sync",
      { method: "POST" }
    ),

  getActiveScan: () => apiJson<{ job: ScanJobSnapshot | null }>("/api/scan/active"),

  startScan: (payload: StartScanRequest) =>
    apiJson<{ job: ScanJobSnapshot }>("/api/scan/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancelScan: (jobId: string) =>
    apiJson<{ job: ScanJobSnapshot }>(`/api/scan/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    }),

  streamScan: (jobId: string, onEvent: (ev: ScanStreamEvent) => void, onError?: () => void) => {
    const es = new EventSource(`/api/scan/${encodeURIComponent(jobId)}/stream`);
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as ScanStreamEvent;
        onEvent(parsed);
        if (parsed.type === "done" || parsed.type === "cancelled") {
          es.close();
        }
      } catch {
        // ignore malformed event
      }
    };
    es.onerror = () => {
      es.close();
      onError?.();
    };
    return () => es.close();
  },

  addModel: (payload: {
    providerAlias: string;
    modelId: string;
    name?: string;
    contextWindow?: number | null;
    maxOutput?: number | null;
  }) =>
    apiJson<DashboardSnapshot>("/api/models", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  setOverride: (payload: {
    modelKey: string;
    contextWindow?: number | null;
    maxOutput?: number | null;
    clear?: boolean;
  }) =>
    apiJson<DashboardSnapshot>("/api/models/override", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  previewDeleteImpact: (modelKeys: string[]) =>
    apiJson<{ impacts: CascadeImpactItem[] }>("/api/models/delete-impact", {
      method: "POST",
      body: JSON.stringify({ modelKeys }),
    }),

  deleteModels: (payload: DeleteModelsRequest) =>
    apiJson<DashboardSnapshot>("/api/models/delete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createCombo: (payload: { name: string; models: string[] }) =>
    apiJson<DashboardSnapshot>("/api/combos", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCombo: (id: string, payload: { name?: string; models?: string[] }) =>
    apiJson<DashboardSnapshot>(`/api/combos/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteCombo: (id: string) =>
    apiJson<DashboardSnapshot>(`/api/combos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

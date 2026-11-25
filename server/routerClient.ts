import { classifyHealthResponse } from "../shared/errorClassifier.js";
import type {
  AppSettings,
  ProviderSummary,
  RouterConnectionStatus,
  ScanResult,
} from "../shared/types.js";

export interface RawRouterModel {
  key: string;
  provider: string;
  modelId: string;
  name: string;
  isCustom: boolean;
  apiContextWindow: number | null;
  apiMaxOutput: number | null;
}

export interface RawRouterCombo {
  id: string;
  name: string;
  models: string[];
  kind?: string | null;
}

export interface RouterInventory {
  models: RawRouterModel[];
  combos: RawRouterCombo[];
  providers: ProviderSummary[];
}

function splitModelKey(fullKey: string): { provider: string; modelId: string } {
  const idx = fullKey.indexOf("/");
  if (idx <= 0) {
    return { provider: "default", modelId: fullKey };
  }
  return {
    provider: fullKey.slice(0, idx),
    modelId: fullKey.slice(idx + 1),
  };
}

function parseSetCookies(res: Response): string | null {
  const headersObj = res.headers as unknown as { getSetCookie?: () => string[] };
  const cookies =
    typeof headersObj.getSetCookie === "function"
      ? headersObj.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  const pairs = cookies
    .map((c) => c.split(";")[0]?.trim())
    .filter((c): c is string => Boolean(c));
  return pairs.length > 0 ? pairs.join("; ") : null;
}

export class NineRouterClient {
  private sessionCookie: string | null = null;
  private loginPromise: Promise<boolean> | null = null;
  private authFailedForKey: string | null = null;

  clearSession(): void {
    this.sessionCookie = null;
    this.loginPromise = null;
    this.authFailedForKey = null;
  }

  private async loginDashboard(settings: AppSettings): Promise<boolean> {
    const authKey = `${settings.routerBaseUrl}|${settings.dashboardPassword}`;
    if (this.authFailedForKey === authKey) {
      return false;
    }
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      const password = settings.dashboardPassword || "123456";
      try {
        const res = await fetch(`${settings.routerBaseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const cookie = parseSetCookies(res);
          if (cookie) {
            this.sessionCookie = cookie;
          }
          this.authFailedForKey = null;
          return true;
        }
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          this.authFailedForKey = authKey;
        }
      } catch {
        // Ignore network errors here
      } finally {
        this.loginPromise = null;
      }
      return false;
    })();

    return this.loginPromise;
  }

  private async apiFetch(
    settings: AppSettings,
    routePath: string,
    init: RequestInit = {},
    allowReauth = true,
    timeoutMs = 10000
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (this.sessionCookie) {
      headers.set("Cookie", this.sessionCookie);
    }
    if (settings.apiKey) {
      headers.set("Authorization", `Bearer ${settings.apiKey}`);
    }

    const res = await fetch(`${settings.routerBaseUrl}${routePath}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 401 && allowReauth && routePath.startsWith("/api/")) {
      const ok = await this.loginDashboard(settings);
      if (ok) {
        return this.apiFetch(settings, routePath, init, false, timeoutMs);
      }
    }

    return res;
  }

  async checkConnection(settings: AppSettings): Promise<RouterConnectionStatus> {
    const checkedAt = new Date().toISOString();
    try {
      // Probe lightweight /api/combos first (~5-20ms) instead of /v1/models which can
      // take several seconds while 9router queries upstream live provider catalogs.
      const combosRes = await this.apiFetch(
        settings,
        "/api/combos",
        { method: "GET" },
        true,
        5000
      );

      if (combosRes.ok) {
        return {
          connected: true,
          demoMode: false,
          routerBaseUrl: settings.routerBaseUrl,
          authenticated: true,
          error: null,
          checkedAt,
        };
      }

      if (combosRes.status === 401 || combosRes.status === 403) {
        return {
          connected: true,
          demoMode: false,
          routerBaseUrl: settings.routerBaseUrl,
          authenticated: false,
          error:
            "Connected to 9router, but Management API requires your dashboard password in Settings.",
          checkedAt,
        };
      }

      // Fallback for non-standard/older 9router builds: probe /v1/models with skip-dynamic-fetch header
      const v1Res = await this.apiFetch(
        settings,
        "/v1/models",
        {
          method: "GET",
          headers: { "x-9r-internal-models-fetch": "1" },
        },
        false,
        15000
      );

      if (v1Res.ok || v1Res.status === 401) {
        return {
          connected: true,
          demoMode: false,
          routerBaseUrl: settings.routerBaseUrl,
          authenticated: false,
          error: "Connected to 9router /v1 API (Management API unavailable or requires login).",
          checkedAt,
        };
      }

      return {
        connected: false,
        demoMode: false,
        routerBaseUrl: settings.routerBaseUrl,
        authenticated: false,
        error: `9router responded with HTTP ${v1Res.status}`,
        checkedAt,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        connected: false,
        demoMode: false,
        routerBaseUrl: settings.routerBaseUrl,
        authenticated: false,
        error: `Cannot reach 9router at ${settings.routerBaseUrl} (${msg})`,
        checkedAt,
      };
    }
  }

  async fetchInventory(settings: AppSettings): Promise<RouterInventory> {
    // Ensure management session is established once before fanning out parallel /api/* calls
    if (!this.sessionCookie) {
      await this.loginDashboard(settings);
    }

    const [v1Res, apiModelsRes, customRes, combosRes, providersRes] = await Promise.allSettled([
      this.apiFetch(
        settings,
        "/v1/models",
        { headers: { "x-9r-internal-models-fetch": "1" } },
        false,
        20000
      ),
      this.apiFetch(settings, "/api/models", {}, true, 10000),
      this.apiFetch(settings, "/api/models/custom", {}, true, 10000),
      this.apiFetch(settings, "/api/combos", {}, true, 10000),
      this.apiFetch(settings, "/api/providers", {}, true, 10000),
    ]);

    const customSet = new Set<string>();
    if (customRes.status === "fulfilled" && customRes.value.ok) {
      const data = (await customRes.value.json()) as {
        models?: Array<{ providerAlias?: string; id?: string }>;
      };
      for (const m of data.models ?? []) {
        if (m.providerAlias && m.id) {
          customSet.add(`${m.providerAlias}/${m.id}`);
        }
      }
    }

    const modelMap = new Map<string, RawRouterModel>();

    // Prefer /v1/models because it lists active routable models with active connections + context_length
    if (v1Res.status === "fulfilled" && v1Res.value.ok) {
      const data = (await v1Res.value.json()) as {
        data?: Array<{
          id?: string;
          owned_by?: string;
          context_length?: number;
          max_completion_tokens?: number;
          capabilities?: { contextWindow?: number; maxOutput?: number };
        }>;
      };
      for (const item of data.data ?? []) {
        if (!item.id || item.owned_by === "combo") continue;
        const { provider, modelId } = splitModelKey(item.id);
        const ctx =
          typeof item.context_length === "number"
            ? item.context_length
            : typeof item.capabilities?.contextWindow === "number"
              ? item.capabilities.contextWindow
              : null;
        const maxOut =
          typeof item.max_completion_tokens === "number"
            ? item.max_completion_tokens
            : typeof item.capabilities?.maxOutput === "number"
              ? item.capabilities.maxOutput
              : null;

        modelMap.set(item.id, {
          key: item.id,
          provider: item.owned_by || provider,
          modelId,
          name: modelId,
          isCustom: customSet.has(item.id),
          apiContextWindow: ctx,
          apiMaxOutput: maxOut,
        });
      }
    }

    // Enrich with /api/models (friendly names, caps) — also catches models if /v1/models was empty
    if (apiModelsRes.status === "fulfilled" && apiModelsRes.value.ok) {
      const data = (await apiModelsRes.value.json()) as {
        models?: Array<{
          provider?: string;
          model?: string;
          name?: string;
          routedModel?: string;
          fullModel?: string;
          caps?: { contextWindow?: number; maxOutput?: number };
        }>;
      };
      for (const m of data.models ?? []) {
        const key = m.routedModel || m.fullModel || (m.provider && m.model ? `${m.provider}/${m.model}` : "");
        if (!key) continue;
        const existing = modelMap.get(key);
        const { provider, modelId } = splitModelKey(key);
        const ctx = typeof m.caps?.contextWindow === "number" ? m.caps.contextWindow : null;
        const maxOut = typeof m.caps?.maxOutput === "number" ? m.caps.maxOutput : null;

        if (existing) {
          existing.name = m.name || existing.name;
          if (existing.apiContextWindow === null && ctx !== null) existing.apiContextWindow = ctx;
          if (existing.apiMaxOutput === null && maxOut !== null) existing.apiMaxOutput = maxOut;
        } else if (modelMap.size === 0 || customSet.has(key)) {
          modelMap.set(key, {
            key,
            provider: m.provider || provider,
            modelId: m.model || modelId,
            name: m.name || m.model || modelId,
            isCustom: customSet.has(key),
            apiContextWindow: ctx,
            apiMaxOutput: maxOut,
          });
        }
      }
    }

    const combos: RawRouterCombo[] = [];
    if (combosRes.status === "fulfilled" && combosRes.value.ok) {
      const data = (await combosRes.value.json()) as {
        combos?: Array<{ id?: string; name?: string; models?: string[]; kind?: string | null }>;
      };
      for (const c of data.combos ?? []) {
        if (!c.id || !c.name) continue;
        combos.push({
          id: c.id,
          name: c.name,
          models: Array.isArray(c.models) ? c.models.filter((x): x is string => typeof x === "string") : [],
          kind: c.kind ?? null,
        });
      }
    }

    const providerCountMap = new Map<string, number>();
    for (const m of modelMap.values()) {
      providerCountMap.set(m.provider, (providerCountMap.get(m.provider) ?? 0) + 1);
    }

    const providersMap = new Map<string, ProviderSummary>();
    if (providersRes.status === "fulfilled" && providersRes.value.ok) {
      const data = (await providersRes.value.json()) as {
        connections?: Array<{ provider?: string; name?: string; isActive?: boolean; providerSpecificData?: { prefix?: string } }>;
      };
      for (const conn of data.connections ?? []) {
        const pid = conn.providerSpecificData?.prefix || conn.provider;
        if (!pid) continue;
        providersMap.set(pid, {
          id: pid,
          name: conn.name || pid,
          isActive: conn.isActive !== false,
          modelCount: providerCountMap.get(pid) ?? 0,
        });
      }
    }

    for (const [pid, count] of providerCountMap.entries()) {
      if (!providersMap.has(pid)) {
        providersMap.set(pid, {
          id: pid,
          name: pid,
          isActive: true,
          modelCount: count,
        });
      } else {
        const existing = providersMap.get(pid)!;
        existing.modelCount = count;
      }
    }

    return {
      models: Array.from(modelMap.values()),
      combos,
      providers: Array.from(providersMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  /**
   * Direct single-model health probe through 9router (targets specific provider/model slug,
   * never a combo, so no combo auto-fallback triggers).
   * Automatically retries with reasoning-compatible payload if HTTP 400 rejects max_tokens: 1.
   */
  async pingModelDirect(
    settings: AppSettings,
    modelKey: string,
    signal?: AbortSignal
  ): Promise<ScanResult> {
    const attemptChatProbe = async (payload: Record<string, unknown>) => {
      const start = Date.now();
      const timeoutSignal = AbortSignal.timeout(settings.timeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      try {
        const res = await this.apiFetch(
          settings,
          "/v1/chat/completions",
          {
            method: "POST",
            body: JSON.stringify(payload),
            signal: combinedSignal,
          },
          false
        );
        const latencyMs = Date.now() - start;
        const rawText = await res.text().catch(() => "");
        let parsedBody: unknown = null;
        try {
          parsedBody = rawText ? JSON.parse(rawText) : null;
        } catch {
          parsedBody = null;
        }
        return { httpStatus: res.status, latencyMs, rawText, parsedBody, timedOut: false, networkError: null };
      } catch (err) {
        if (signal?.aborted) {
          throw err;
        }
        const isTimeout =
          err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          httpStatus: null,
          latencyMs: null,
          rawText: "",
          parsedBody: null,
          timedOut: isTimeout,
          networkError: isTimeout ? null : err instanceof Error ? err.message : String(err),
        };
      }
    };

    // 1. Lightweight test prompt (max_tokens: 1)
    const firstAttempt = await attemptChatProbe({
      model: modelKey,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
      stream: false,
    });

    // If /v1/chat/completions requires an API key that the user hasn't configured in 9health,
    // transparently fall back to 9router's dashboard /api/models/test endpoint (uses internal key).
    if (firstAttempt.httpStatus === 401 && !settings.apiKey) {
      const internal = await this.pingViaRouterTestEndpoint(settings, modelKey, signal);
      if (internal) return internal;
    }

    const firstClassified = classifyHealthResponse(firstAttempt);

    // 2. Automatic reasoning-model fallback payload when max_tokens: 1 is rejected
    if (firstClassified.shouldRetryReasoningPayload) {
      const retryAttempt = await attemptChatProbe({
        model: modelKey,
        messages: [{ role: "user", content: "hi" }],
        max_completion_tokens: 128,
        stream: false,
      });
      const retryClassified = classifyHealthResponse(retryAttempt);
      return {
        modelKey,
        status: retryClassified.status,
        latencyMs: retryAttempt.latencyMs,
        httpStatus: retryClassified.httpStatus,
        errorMessage: retryClassified.errorMessage,
        checkedAt: new Date().toISOString(),
        isReasoningFallback: true,
        note: retryClassified.note ?? "Tested with reasoning fallback payload (max_completion_tokens)",
      };
    }

    return {
      modelKey,
      status: firstClassified.status,
      latencyMs: firstAttempt.latencyMs,
      httpStatus: firstClassified.httpStatus,
      errorMessage: firstClassified.errorMessage,
      checkedAt: new Date().toISOString(),
      isReasoningFallback: false,
      note: firstClassified.note ?? null,
    };
  }

  private async pingViaRouterTestEndpoint(
    settings: AppSettings,
    modelKey: string,
    signal?: AbortSignal
  ): Promise<ScanResult | null> {
    const start = Date.now();
    const timeoutSignal = AbortSignal.timeout(settings.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    try {
      const res = await this.apiFetch(settings, "/api/models/test", {
        method: "POST",
        body: JSON.stringify({ model: modelKey, kind: "llm" }),
        signal: combinedSignal,
      });
      if (res.status === 404 || res.status === 401) return null;
      const rawText = await res.text().catch(() => "");
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }
      const latencyMs =
        typeof parsed?.latencyMs === "number" ? parsed.latencyMs : Date.now() - start;
      const upstreamStatus = typeof parsed?.status === "number" ? parsed.status : res.status;

      if (parsed?.ok === true) {
        return {
          modelKey,
          status: "healthy",
          latencyMs,
          httpStatus: upstreamStatus,
          errorMessage: null,
          checkedAt: new Date().toISOString(),
          note: typeof parsed.note === "string" ? parsed.note : "Verified via 9router /api/models/test",
        };
      }

      const classified = classifyHealthResponse({
        httpStatus: upstreamStatus,
        rawText: typeof parsed?.error === "string" ? parsed.error : rawText,
        parsedBody: parsed?.error ? { error: parsed.error } : parsed,
      });

      return {
        modelKey,
        status: classified.status,
        latencyMs,
        httpStatus: classified.httpStatus,
        errorMessage: classified.errorMessage,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async addCustomModel(
    settings: AppSettings,
    params: { providerAlias: string; modelId: string; name?: string }
  ): Promise<void> {
    const res = await this.apiFetch(settings, "/api/models/custom", {
      method: "POST",
      body: JSON.stringify({
        providerAlias: params.providerAlias,
        id: params.modelId,
        type: "llm",
        name: params.name || params.modelId,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Failed to add model to 9router (HTTP ${res.status}): ${err}`);
    }
  }

  async deleteModel(settings: AppSettings, modelKey: string, isCustom: boolean): Promise<void> {
    const { provider, modelId } = splitModelKey(modelKey);

    if (isCustom) {
      const url = `/api/models/custom?providerAlias=${encodeURIComponent(provider)}&id=${encodeURIComponent(modelId)}&type=llm`;
      const res = await this.apiFetch(settings, url, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Failed to delete custom model ${modelKey} (HTTP ${res.status}): ${err}`);
      }
      return;
    }

    // For built-in catalog models in 9router, disable them via /api/models/disabled
    const res = await this.apiFetch(settings, "/api/models/disabled", {
      method: "POST",
      body: JSON.stringify({ providerAlias: provider, ids: [modelId] }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Failed to disable built-in model ${modelKey} (HTTP ${res.status}): ${err}`);
    }
  }

  async createCombo(
    settings: AppSettings,
    params: { name: string; models: string[]; kind?: string | null }
  ): Promise<RawRouterCombo> {
    const res = await this.apiFetch(settings, "/api/combos", {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        models: params.models,
        kind: params.kind ?? null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(String(data.error ?? `Failed to create combo (HTTP ${res.status})`));
    }
    return {
      id: String(data.id),
      name: String(data.name),
      models: Array.isArray(data.models) ? (data.models as string[]) : params.models,
      kind: (data.kind as string | null) ?? null,
    };
  }

  async updateCombo(
    settings: AppSettings,
    id: string,
    params: { name?: string; models?: string[] }
  ): Promise<RawRouterCombo> {
    const res = await this.apiFetch(settings, `/api/combos/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(params),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(String(data.error ?? `Failed to update combo (HTTP ${res.status})`));
    }
    return {
      id: String(data.id ?? id),
      name: String(data.name ?? params.name ?? ""),
      models: Array.isArray(data.models) ? (data.models as string[]) : (params.models ?? []),
      kind: (data.kind as string | null) ?? null,
    };
  }

  async deleteCombo(settings: AppSettings, id: string): Promise<void> {
    const res = await this.apiFetch(settings, `/api/combos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error(String(data.error ?? `Failed to delete combo (HTTP ${res.status})`));
    }
  }
}

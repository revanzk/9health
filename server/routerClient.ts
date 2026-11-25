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
  providerName: string;
  providerActive: boolean;
  modelId: string;
  name: string;
  isCustom: boolean;
  customProviderAlias?: string;
  apiContextWindow: number | null;
  apiMaxOutput: number | null;
}

// Known 9router providerId -> routed alias fallbacks (auto-augmented from /api/models)
const KNOWN_PROVIDER_ALIASES: Record<string, string> = {
  cline: "cl",
  kiro: "kr",
  "cloudflare-ai": "cf",
  "kilo-gateway": "kgw",
  bazaarlink: "bzl",
  opencode: "oc",
  "opencode-zen": "ocz",
  antigravity: "ag",
  "claude-code": "cc",
  codex: "cx",
  github: "gh",
  cursor: "cu",
  qoder: "qd",
  "qoder-cn": "qdcn",
  "grok-cli": "gcli",
  iflow: "if",
  minimax: "mm",
};

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
  private lastAuthError: string | null = null;

  clearSession(): void {
    this.sessionCookie = null;
    this.loginPromise = null;
    this.authFailedForKey = null;
    this.lastAuthError = null;
  }

  private async fetchAuthStatus(settings: AppSettings): Promise<{
    reachable: boolean;
    requireLogin: boolean;
    hasPassword: boolean;
    authenticated: boolean;
  } | null> {
    try {
      const headers = new Headers();
      if (this.sessionCookie) headers.set("Cookie", this.sessionCookie);
      const res = await fetch(`${settings.routerBaseUrl}/api/auth/status`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        requireLogin?: boolean;
        hasPassword?: boolean;
        authenticated?: boolean;
      };
      return {
        reachable: true,
        requireLogin: data.requireLogin !== false,
        hasPassword: data.hasPassword === true,
        authenticated: data.authenticated === true,
      };
    } catch {
      return null;
    }
  }

  private async loginDashboard(
    settings: AppSettings,
    allowDefaultPassword = false
  ): Promise<boolean> {
    const password = settings.dashboardPassword || (allowDefaultPassword ? "123456" : "");
    if (!password) {
      this.lastAuthError =
        "9router requires your dashboard password to load & edit Combos.";
      return false;
    }

    const authKey = `${settings.routerBaseUrl}|${password}`;
    if (this.authFailedForKey === authKey) {
      return false;
    }
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
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
          this.lastAuthError = null;
          return true;
        }
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        this.lastAuthError =
          errBody.error || `9router login failed (HTTP ${res.status})`;
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          this.authFailedForKey = authKey;
        }
      } catch (err) {
        this.lastAuthError = err instanceof Error ? err.message : String(err);
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

    if (res.status === 401 && allowReauth && routePath.startsWith("/api/") && settings.dashboardPassword) {
      const ok = await this.loginDashboard(settings, false);
      if (ok) {
        return this.apiFetch(settings, routePath, init, false, timeoutMs);
      }
    }

    return res;
  }

  async checkConnection(settings: AppSettings): Promise<RouterConnectionStatus> {
    const checkedAt = new Date().toISOString();
    try {
      // 1. Check /api/auth/status (~5ms, never triggers login rate limiter!)
      const authStatus = await this.fetchAuthStatus(settings);
      if (authStatus) {
        if (!authStatus.requireLogin || authStatus.authenticated) {
          return {
            connected: true,
            demoMode: false,
            routerBaseUrl: settings.routerBaseUrl,
            authenticated: true,
            error: null,
            checkedAt,
          };
        }

        // Only auto-try default password "123456" if 9router reports NO custom password set
        const allowDefault = !authStatus.hasPassword;
        if (settings.dashboardPassword || allowDefault) {
          const loggedIn = await this.loginDashboard(settings, allowDefault);
          if (loggedIn) {
            return {
              connected: true,
              demoMode: false,
              routerBaseUrl: settings.routerBaseUrl,
              authenticated: true,
              error: null,
              checkedAt,
            };
          }
        }

        return {
          connected: true,
          demoMode: false,
          routerBaseUrl: settings.routerBaseUrl,
          authenticated: false,
          error:
            this.lastAuthError ||
            "Connected to 9router. Enter your 9router dashboard password to load & edit Combos.",
          checkedAt,
        };
      }

      // 2. Fallback probe for older 9router builds without /api/auth/status
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
            this.lastAuthError ||
            "Connected to 9router. Enter your 9router dashboard password to load & edit Combos.",
          checkedAt,
        };
      }

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
          error: "Connected to 9router /v1 API (Management API requires dashboard password).",
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
    const [v1Res, apiModelsRes, customRes, combosRes, providersRes, nodesRes] =
      await Promise.allSettled([
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
        this.apiFetch(settings, "/api/provider-nodes", {}, true, 10000),
      ]);

    // Parse /api/models first so we learn 9router's exact providerId <-> routedAlias table
    type ApiModelItem = {
      provider?: string;
      model?: string;
      name?: string;
      routedModel?: string;
      fullModel?: string;
      caps?: { contextWindow?: number; maxOutput?: number };
    };
    const apiModelsList: ApiModelItem[] = [];
    const providerIdToAlias = new Map<string, string>(Object.entries(KNOWN_PROVIDER_ALIASES));
    const aliasToProviderId = new Map<string, string>();
    for (const [pid, al] of providerIdToAlias.entries()) {
      aliasToProviderId.set(al, pid);
    }

    if (apiModelsRes.status === "fulfilled" && apiModelsRes.value.ok) {
      const data = (await apiModelsRes.value.json()) as { models?: ApiModelItem[] };
      for (const m of data.models ?? []) {
        apiModelsList.push(m);
        if (m.provider && m.routedModel && m.routedModel.includes("/")) {
          const routedAlias = m.routedModel.slice(0, m.routedModel.indexOf("/"));
          if (routedAlias && routedAlias !== m.provider) {
            providerIdToAlias.set(m.provider, routedAlias);
            aliasToProviderId.set(routedAlias, m.provider);
          }
        }
      }
    }

    // Map OpenAI/Anthropic-compatible node UUIDs -> human-readable name & prefix
    const nodeInfoById = new Map<string, { name: string; prefix: string }>();
    const providerDisplayName = new Map<string, string>();
    const providerActiveMap = new Map<string, boolean>();
    const providerAuthType = new Map<string, ProviderSummary["authType"]>();
    const connectedCanonicalIds = new Set<string>();
    const connectedRawIds = new Set<string>();

    if (nodesRes.status === "fulfilled" && nodesRes.value.ok) {
      const data = (await nodesRes.value.json()) as {
        nodes?: Array<{ id?: string; name?: string; prefix?: string }>;
      };
      for (const node of data.nodes ?? []) {
        if (!node.id) continue;
        const cleanName = (node.name || node.prefix || node.id).trim();
        const cleanPrefix = (node.prefix || node.id).trim();
        nodeInfoById.set(node.id, { name: cleanName, prefix: cleanPrefix });
        providerDisplayName.set(node.id, cleanName);
        if (cleanPrefix) {
          providerDisplayName.set(cleanPrefix, cleanName);
          providerAuthType.set(cleanPrefix, "compatible");
        }
      }
    }

    if (providersRes.status === "fulfilled" && providersRes.value.ok) {
      const data = (await providersRes.value.json()) as {
        connections?: Array<{
          provider?: string;
          name?: string;
          authType?: string;
          isActive?: boolean;
          providerSpecificData?: { prefix?: string; nodeName?: string };
        }>;
      };
      for (const conn of data.connections ?? []) {
        const rawProvider = conn.provider?.trim() || "";
        if (!rawProvider) continue;
        const prefix = conn.providerSpecificData?.prefix?.trim() || "";
        const nodeMeta = nodeInfoById.get(rawProvider);
        const routedAlias = providerIdToAlias.get(rawProvider) || "";
        const canonicalId = prefix || nodeMeta?.prefix || routedAlias || rawProvider;

        connectedCanonicalIds.add(canonicalId);
        connectedRawIds.add(rawProvider);
        if (routedAlias) connectedRawIds.add(routedAlias);

        const isCompat = Boolean(nodeMeta || prefix || rawProvider.includes("compatible-"));
        const isOAuth = conn.authType === "oauth";
        const authKind: ProviderSummary["authType"] = isCompat
          ? "compatible"
          : isOAuth
            ? "oauth"
            : conn.authType === "cookie"
              ? "cookie"
              : "apikey";
        providerAuthType.set(canonicalId, authKind);

        // Build clear human-readable name:
        // - Compatible nodes: exact node name configured in 9router ("Token Reply", "cent AI", "inferX")
        // - OAuth: combine provider name + account label when conn.name is generic ("Account 1" or email)
        // - API Key: prefer conn.name or provider id
        let friendlyName: string;
        if (isCompat) {
          friendlyName = (
            nodeMeta?.name ||
            conn.providerSpecificData?.nodeName ||
            conn.name ||
            canonicalId
          ).trim();
        } else if (isOAuth) {
          const acct = (conn.name || "").trim();
          friendlyName =
            acct && acct.toLowerCase() !== rawProvider.toLowerCase()
              ? `${rawProvider} (${acct})`
              : rawProvider;
        } else {
          const cn = (conn.name || "").trim();
          friendlyName =
            cn && cn.toLowerCase() !== rawProvider.toLowerCase() && !/^account\s*\d+$/i.test(cn)
              ? cn
              : rawProvider;
        }

        if (!nodeInfoById.has(rawProvider) && (prefix || routedAlias)) {
          nodeInfoById.set(rawProvider, {
            name: friendlyName,
            prefix: prefix || routedAlias,
          });
        }
        providerDisplayName.set(rawProvider, friendlyName);
        providerDisplayName.set(canonicalId, friendlyName);

        const prevActive = providerActiveMap.get(canonicalId) ?? false;
        providerActiveMap.set(canonicalId, prevActive || conn.isActive !== false);
      }
    }

    const resolveProviderMeta = (rawProvider: string): { id: string; name: string } => {
      const node = nodeInfoById.get(rawProvider);
      if (node) {
        return { id: node.prefix || rawProvider, name: node.name };
      }
      const mappedAlias = providerIdToAlias.get(rawProvider);
      if (mappedAlias) {
        return {
          id: mappedAlias,
          name:
            providerDisplayName.get(mappedAlias) ||
            providerDisplayName.get(rawProvider) ||
            rawProvider,
        };
      }
      return {
        id: rawProvider,
        name:
          providerDisplayName.get(rawProvider) ||
          providerDisplayName.get(aliasToProviderId.get(rawProvider) || "") ||
          rawProvider,
      };
    };

    // Map canonical model key -> original custom providerAlias (so DELETE /api/models/custom works!)
    type CustomModelItem = { providerAlias?: string; id?: string; name?: string; type?: string };
    const customModelsList: CustomModelItem[] = [];
    const customAliasByKey = new Map<string, string>();
    const customNameByKey = new Map<string, string>();
    if (customRes.status === "fulfilled" && customRes.value.ok) {
      const data = (await customRes.value.json()) as { models?: CustomModelItem[] };
      for (const m of data.models ?? []) {
        if (!m.providerAlias || !m.id) continue;
        if (m.type && m.type !== "llm") continue;
        customModelsList.push(m);
        const resolved = resolveProviderMeta(m.providerAlias);
        const canonicalKey = `${resolved.id}/${m.id}`;
        customAliasByKey.set(canonicalKey, m.providerAlias);
        customAliasByKey.set(`${m.providerAlias}/${m.id}`, m.providerAlias);
        if (m.name) {
          customNameByKey.set(canonicalKey, m.name);
        }
      }
    }

    const modelMap = new Map<string, RawRouterModel>();
    const v1FallbackCombos: RawRouterCombo[] = [];

    // 1. Load live routable models from /v1/models (active connections + no-auth free providers)
    if (v1Res.status === "fulfilled" && v1Res.value.ok) {
      const data = (await v1Res.value.json()) as {
        data?: Array<{
          id?: string;
          owned_by?: string;
          kind?: string;
          context_length?: number;
          max_completion_tokens?: number;
          capabilities?: { contextWindow?: number; maxOutput?: number };
        }>;
      };
      for (const item of data.data ?? []) {
        if (!item.id) continue;
        if (item.owned_by === "combo") {
          v1FallbackCombos.push({
            id: `v1-combo:${item.id}`,
            name: item.id,
            models: [],
            kind: item.kind ?? "llm",
          });
          continue;
        }
        const { provider: rawProv, modelId } = splitModelKey(item.id);
        const resolvedProv = resolveProviderMeta(item.owned_by || rawProv);
        const canonicalKey = `${resolvedProv.id}/${modelId}`;
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

        const customAlias = customAliasByKey.get(canonicalKey) ?? customAliasByKey.get(item.id);
        const isProvActive = providerActiveMap.get(resolvedProv.id) ?? true;
        if (!providerAuthType.has(resolvedProv.id)) {
          providerAuthType.set(resolvedProv.id, "free");
        }

        modelMap.set(canonicalKey, {
          key: item.id,
          provider: resolvedProv.id,
          providerName: resolvedProv.name,
          providerActive: isProvActive,
          modelId,
          name: customNameByKey.get(canonicalKey) || modelId,
          isCustom: Boolean(customAlias),
          customProviderAlias: customAlias,
          apiContextWindow: ctx,
          apiMaxOutput: maxOut,
        });
      }
    }

    // Track which providers already got live models from /v1/models
    const providersFromV1 = new Set(Array.from(modelMap.values()).map((m) => m.provider));

    // 2. Include ALL custom models belonging to ANY connected provider (even if disabled!)
    for (const m of customModelsList) {
      if (!m.providerAlias || !m.id) continue;
      const resolvedProv = resolveProviderMeta(m.providerAlias);
      const isConnected =
        connectedCanonicalIds.has(resolvedProv.id) ||
        connectedRawIds.has(m.providerAlias) ||
        providersFromV1.has(resolvedProv.id);
      if (!isConnected) continue;

      const canonicalKey = `${resolvedProv.id}/${m.id}`;
      const existing = modelMap.get(canonicalKey);
      if (existing) {
        existing.isCustom = true;
        existing.customProviderAlias = m.providerAlias;
        if (m.name) existing.name = m.name;
      } else {
        modelMap.set(canonicalKey, {
          key: canonicalKey,
          provider: resolvedProv.id,
          providerName: resolvedProv.name,
          providerActive: providerActiveMap.get(resolvedProv.id) ?? false,
          modelId: m.id,
          name: m.name || m.id,
          isCustom: true,
          customProviderAlias: m.providerAlias,
          apiContextWindow: null,
          apiMaxOutput: null,
        });
      }
    }

    // 3. Enrich from /api/models AND backfill built-in models for connected disabled/OAuth providers
    for (const m of apiModelsList) {
      const rawKey =
        m.routedModel || m.fullModel || (m.provider && m.model ? `${m.provider}/${m.model}` : "");
      if (!rawKey) continue;
      const { provider: rawProv, modelId } = splitModelKey(rawKey);
      const resolvedProv = resolveProviderMeta(m.provider || rawProv);
      const cleanModelId = m.model || modelId;
      const canonicalKey = `${resolvedProv.id}/${cleanModelId}`;
      const existing = modelMap.get(canonicalKey);
      const ctx = typeof m.caps?.contextWindow === "number" ? m.caps.contextWindow : null;
      const maxOut = typeof m.caps?.maxOutput === "number" ? m.caps.maxOutput : null;
      const customAlias = customAliasByKey.get(canonicalKey) ?? customAliasByKey.get(rawKey);

      if (existing) {
        if (m.name && m.name !== existing.modelId) existing.name = m.name;
        if (existing.apiContextWindow === null && ctx !== null) existing.apiContextWindow = ctx;
        if (existing.apiMaxOutput === null && maxOut !== null) existing.apiMaxOutput = maxOut;
        if (customAlias) {
          existing.isCustom = true;
          existing.customProviderAlias = customAlias;
        }
        continue;
      }

      // Include models for ANY connected provider (active OR disabled, OAuth OR API key)
      // when /v1/models did not already enumerate that provider's live list
      const isConnected =
        connectedCanonicalIds.has(resolvedProv.id) ||
        connectedRawIds.has(m.provider || "") ||
        connectedRawIds.has(rawProv);

      if (isConnected && !providersFromV1.has(resolvedProv.id)) {
        modelMap.set(canonicalKey, {
          key: canonicalKey,
          provider: resolvedProv.id,
          providerName: resolvedProv.name,
          providerActive: providerActiveMap.get(resolvedProv.id) ?? false,
          modelId: cleanModelId,
          name: m.name || customNameByKey.get(canonicalKey) || cleanModelId,
          isCustom: Boolean(customAlias),
          customProviderAlias: customAlias,
          apiContextWindow: ctx,
          apiMaxOutput: maxOut,
        });
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
          models: Array.isArray(c.models)
            ? c.models
                .filter((x): x is string => typeof x === "string")
                .map((mk) => {
                  const { provider: rawP, modelId } = splitModelKey(mk);
                  const node = nodeInfoById.get(rawP);
                  return node ? `${node.prefix}/${modelId}` : mk;
                })
            : [],
          kind: c.kind ?? null,
        });
      }
    } else if (v1FallbackCombos.length > 0) {
      combos.push(...v1FallbackCombos);
    }

    const providerCountMap = new Map<string, number>();
    for (const m of modelMap.values()) {
      providerCountMap.set(m.provider, (providerCountMap.get(m.provider) ?? 0) + 1);
    }

    const providersMap = new Map<string, ProviderSummary>();
    for (const pid of new Set([...connectedCanonicalIds, ...providerCountMap.keys()])) {
      providersMap.set(pid, {
        id: pid,
        name: providerDisplayName.get(pid) || pid,
        isActive: providerActiveMap.get(pid) ?? true,
        authType: providerAuthType.get(pid),
        modelCount: providerCountMap.get(pid) ?? 0,
      });
    }

    return {
      models: Array.from(modelMap.values()),
      combos,
      providers: Array.from(providersMap.values()).sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (b.modelCount !== a.modelCount) return b.modelCount - a.modelCount;
        return a.name.localeCompare(b.name);
      }),
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

  async deleteModel(
    settings: AppSettings,
    modelKey: string,
    isCustom: boolean,
    customProviderAlias?: string
  ): Promise<void> {
    const { provider, modelId } = splitModelKey(modelKey);
    const deleteAlias = customProviderAlias || provider;

    if (isCustom) {
      const url = `/api/models/custom?providerAlias=${encodeURIComponent(deleteAlias)}&id=${encodeURIComponent(modelId)}&type=llm`;
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

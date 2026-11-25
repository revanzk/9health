import type { ManualOverride, MetadataSource, RegistryEntry } from "./types.js";

/**
 * Curated local fallback registry modeled after OpenRouter / LiteLLM specs.
 * Matched against normalized model IDs (provider prefix & :free suffix stripped).
 */
export const BUILTIN_METADATA_REGISTRY: Record<string, RegistryEntry> = {
  // Google Gemini
  "gemini-2.5-pro": { contextWindow: 1_048_576, maxOutput: 65_536 },
  "gemini-2.5-flash": { contextWindow: 1_048_576, maxOutput: 65_536 },
  "gemini-2.5-flash-lite": { contextWindow: 1_048_576, maxOutput: 65_536 },
  "gemini-2.0-flash": { contextWindow: 1_048_576, maxOutput: 8_192 },
  "gemini-2.0-flash-exp": { contextWindow: 1_048_576, maxOutput: 8_192 },
  "gemini-2.0-flash-thinking": { contextWindow: 1_048_576, maxOutput: 65_536 },
  "gemini-1.5-pro": { contextWindow: 2_097_152, maxOutput: 8_192 },
  "gemini-1.5-flash": { contextWindow: 1_048_576, maxOutput: 8_192 },
  "gemma-3-27b-it": { contextWindow: 131_072, maxOutput: 8_192 },
  "gemma-3-12b-it": { contextWindow: 131_072, maxOutput: 8_192 },

  // Anthropic Claude
  "claude-opus-4": { contextWindow: 200_000, maxOutput: 32_000 },
  "claude-sonnet-4": { contextWindow: 200_000, maxOutput: 64_000 },
  "claude-3.7-sonnet": { contextWindow: 200_000, maxOutput: 64_000 },
  "claude-3-7-sonnet": { contextWindow: 200_000, maxOutput: 64_000 },
  "claude-3.5-sonnet": { contextWindow: 200_000, maxOutput: 8_192 },
  "claude-3-5-sonnet": { contextWindow: 200_000, maxOutput: 8_192 },
  "claude-3.5-haiku": { contextWindow: 200_000, maxOutput: 8_192 },
  "claude-3-5-haiku": { contextWindow: 200_000, maxOutput: 8_192 },

  // OpenAI
  "gpt-4.1": { contextWindow: 1_047_576, maxOutput: 32_768 },
  "gpt-4.1-mini": { contextWindow: 1_047_576, maxOutput: 32_768 },
  "gpt-4.1-nano": { contextWindow: 1_047_576, maxOutput: 32_768 },
  "gpt-4o": { contextWindow: 128_000, maxOutput: 16_384 },
  "gpt-4o-mini": { contextWindow: 128_000, maxOutput: 16_384 },
  "o4-mini": { contextWindow: 200_000, maxOutput: 100_000 },
  "o3": { contextWindow: 200_000, maxOutput: 100_000 },
  "o3-mini": { contextWindow: 200_000, maxOutput: 100_000 },
  "o1": { contextWindow: 200_000, maxOutput: 100_000 },
  "gpt-oss-120b": { contextWindow: 131_072, maxOutput: 32_768 },
  "gpt-oss-20b": { contextWindow: 131_072, maxOutput: 32_768 },

  // DeepSeek
  "deepseek-r1": { contextWindow: 163_840, maxOutput: 16_384 },
  "deepseek-r1-0528": { contextWindow: 163_840, maxOutput: 32_768 },
  "deepseek-r1-distill-llama-70b": { contextWindow: 131_072, maxOutput: 8_192 },
  "deepseek-chat": { contextWindow: 131_072, maxOutput: 8_192 },
  "deepseek-chat-v3": { contextWindow: 163_840, maxOutput: 8_192 },
  "deepseek-chat-v3-0324": { contextWindow: 163_840, maxOutput: 8_192 },
  "deepseek-v3": { contextWindow: 131_072, maxOutput: 8_192 },
  "deepseek-v3.1": { contextWindow: 163_840, maxOutput: 32_768 },
  "deepseek-reasoner": { contextWindow: 131_072, maxOutput: 32_768 },

  // Meta Llama
  "llama-4-scout": { contextWindow: 512_000, maxOutput: 16_384 },
  "llama-4-maverick": { contextWindow: 1_048_576, maxOutput: 16_384 },
  "llama-3.3-70b-versatile": { contextWindow: 128_000, maxOutput: 32_768 },
  "llama-3.3-70b-instruct": { contextWindow: 131_072, maxOutput: 8_192 },
  "llama-3.1-8b-instant": { contextWindow: 128_000, maxOutput: 8_192 },
  "llama-3.1-70b-instruct": { contextWindow: 131_072, maxOutput: 8_192 },
  "llama-3.1-405b-instruct": { contextWindow: 131_072, maxOutput: 8_192 },

  // Qwen
  "qwen3-coder": { contextWindow: 262_144, maxOutput: 65_536 },
  "qwen3-235b-a22b": { contextWindow: 131_072, maxOutput: 32_768 },
  "qwen3-32b": { contextWindow: 131_072, maxOutput: 16_384 },
  "qwen-2.5-coder-32b-instruct": { contextWindow: 32_768, maxOutput: 8_192 },
  "qwen-2.5-72b-instruct": { contextWindow: 131_072, maxOutput: 8_192 },
  "qwq-32b": { contextWindow: 131_072, maxOutput: 16_384 },

  // Mistral
  "mistral-small-3.1-24b-instruct": { contextWindow: 128_000, maxOutput: 8_192 },
  "mistral-small-3.2-24b-instruct": { contextWindow: 128_000, maxOutput: 8_192 },
  "mistral-large": { contextWindow: 128_000, maxOutput: 8_192 },
  "devstral-small": { contextWindow: 128_000, maxOutput: 16_384 },
  "codestral": { contextWindow: 256_000, maxOutput: 16_384 },

  // Moonshot / Kimi / Zhipu / xAI / NVIDIA
  "kimi-k2": { contextWindow: 131_072, maxOutput: 16_384 },
  "kimi-k2-instruct": { contextWindow: 131_072, maxOutput: 16_384 },
  "glm-4.5": { contextWindow: 131_072, maxOutput: 16_384 },
  "glm-4.5-air": { contextWindow: 131_072, maxOutput: 16_384 },
  "grok-3": { contextWindow: 131_072, maxOutput: 16_384 },
  "grok-3-mini": { contextWindow: 131_072, maxOutput: 16_384 },
  "grok-4": { contextWindow: 256_000, maxOutput: 32_768 },
  "llama-3.1-nemotron-ultra-253b": { contextWindow: 131_072, maxOutput: 16_384 },
  "nemotron-3-nano": { contextWindow: 131_072, maxOutput: 8_192 },
};

function normalizeLookupKeys(modelKey: string): string[] {
  const lower = modelKey.trim().toLowerCase();
  const withoutTag = lower.replace(/:(free|extended|nitro|floor|thinking)$/i, "");
  const segments = withoutTag.split("/").filter(Boolean);
  const candidates = new Set<string>([lower, withoutTag]);

  if (segments.length >= 2) {
    // e.g. "openrouter/deepseek/deepseek-r1" -> "deepseek/deepseek-r1" & "deepseek-r1"
    candidates.add(segments.slice(1).join("/"));
    candidates.add(segments[segments.length - 1]);
  }
  if (segments.length >= 1) {
    const tail = segments[segments.length - 1];
    candidates.add(tail);
    // Strip trailing date / preview version stamps (e.g. -20250514, -05-28, -preview)
    const stripped = tail
      .replace(/-\d{8}$/, "")
      .replace(/-\d{2}-\d{2}$/, "")
      .replace(/-(preview|exp|latest)$/, "");
    if (stripped) candidates.add(stripped);
  }

  return Array.from(candidates);
}

export function lookupRegistryMetadata(
  modelKey: string,
  dynamicRegistry: Record<string, RegistryEntry> = {}
): RegistryEntry | null {
  const candidates = normalizeLookupKeys(modelKey);

  // 1. Exact lookup in dynamic OpenRouter/synced cache
  for (const key of candidates) {
    if (dynamicRegistry[key]) return dynamicRegistry[key];
  }

  // 2. Exact lookup in built-in curated registry
  for (const key of candidates) {
    if (BUILTIN_METADATA_REGISTRY[key]) return BUILTIN_METADATA_REGISTRY[key];
  }

  // 3. Longest prefix match in built-in registry (e.g. "gemini-2.5-pro-exp-03-25" -> "gemini-2.5-pro")
  const tail = candidates[candidates.length - 1] ?? "";
  let bestKey = "";
  for (const regKey of Object.keys(BUILTIN_METADATA_REGISTRY)) {
    if (tail.startsWith(regKey) && regKey.length > bestKey.length) {
      bestKey = regKey;
    }
  }
  if (bestKey) return BUILTIN_METADATA_REGISTRY[bestKey];

  return null;
}

export function resolveModelMetadata(params: {
  modelKey: string;
  apiContextWindow?: number | null;
  apiMaxOutput?: number | null;
  manualOverride?: ManualOverride | null;
  dynamicRegistry?: Record<string, RegistryEntry>;
}): {
  contextWindow: number | null;
  maxOutput: number | null;
  metadataSource: MetadataSource;
} {
  const { modelKey, apiContextWindow, apiMaxOutput, manualOverride, dynamicRegistry } = params;
  const reg = lookupRegistryMetadata(modelKey, dynamicRegistry);

  const manualCtx =
    typeof manualOverride?.contextWindow === "number" && manualOverride.contextWindow > 0
      ? manualOverride.contextWindow
      : null;
  const manualOut =
    typeof manualOverride?.maxOutput === "number" && manualOverride.maxOutput > 0
      ? manualOverride.maxOutput
      : null;

  const apiCtx =
    typeof apiContextWindow === "number" && apiContextWindow > 0 ? apiContextWindow : null;
  const apiOut = typeof apiMaxOutput === "number" && apiMaxOutput > 0 ? apiMaxOutput : null;

  if (manualCtx !== null) {
    return {
      contextWindow: manualCtx,
      maxOutput: manualOut ?? apiOut ?? reg?.maxOutput ?? null,
      metadataSource: "manual",
    };
  }

  if (apiCtx !== null) {
    return {
      contextWindow: apiCtx,
      maxOutput: manualOut ?? apiOut ?? reg?.maxOutput ?? null,
      metadataSource: "router_api",
    };
  }

  if (reg) {
    return {
      contextWindow: reg.contextWindow,
      maxOutput: manualOut ?? apiOut ?? reg.maxOutput ?? null,
      metadataSource: "registry",
    };
  }

  return {
    contextWindow: null,
    maxOutput: manualOut ?? apiOut ?? null,
    metadataSource: manualOut !== null ? "manual" : "unknown",
  };
}

import type { HealthStatus } from "../shared/types.js";

export interface DemoModelDef {
  key: string;
  provider: string;
  modelId: string;
  name: string;
  isCustom: boolean;
  apiContextWindow: number | null;
  apiMaxOutput: number | null;
  simulatedStatus: Exclude<HealthStatus, "unchecked">;
  simulatedLatencyMs: number | null;
  simulatedHttpStatus: number | null;
  simulatedError: string | null;
  isReasoningFallback?: boolean;
}

export interface DemoComboDef {
  id: string;
  name: string;
  models: string[];
  kind?: string | null;
}

export interface DemoRouterState {
  models: DemoModelDef[];
  combos: DemoComboDef[];
}

export function createInitialDemoState(): DemoRouterState {
  return {
    models: [
      {
        key: "gemini/gemini-2.5-pro",
        provider: "gemini",
        modelId: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        isCustom: false,
        apiContextWindow: 1_048_576,
        apiMaxOutput: 65_536,
        simulatedStatus: "healthy",
        simulatedLatencyMs: 640,
        simulatedHttpStatus: 200,
        simulatedError: null,
      },
      {
        key: "gemini/gemini-2.5-flash",
        provider: "gemini",
        modelId: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        isCustom: false,
        apiContextWindow: 1_048_576,
        apiMaxOutput: 65_536,
        simulatedStatus: "healthy",
        simulatedLatencyMs: 310,
        simulatedHttpStatus: 200,
        simulatedError: null,
      },
      {
        key: "openrouter/deepseek/deepseek-r1:free",
        provider: "openrouter",
        modelId: "deepseek/deepseek-r1:free",
        name: "DeepSeek R1 (Free)",
        isCustom: true,
        apiContextWindow: null, // tests Registry fallback -> 164K
        apiMaxOutput: null,
        simulatedStatus: "healthy",
        simulatedLatencyMs: 1120,
        simulatedHttpStatus: 200,
        simulatedError: null,
        isReasoningFallback: true,
      },
      {
        key: "openrouter/qwen/qwen3-coder:free",
        provider: "openrouter",
        modelId: "qwen/qwen3-coder:free",
        name: "Qwen3 Coder (Free)",
        isCustom: true,
        apiContextWindow: 262_144,
        apiMaxOutput: 65_536,
        simulatedStatus: "healthy",
        simulatedLatencyMs: 495,
        simulatedHttpStatus: 200,
        simulatedError: null,
      },
      {
        key: "openrouter/google/gemini-2.0-flash-exp:free",
        provider: "openrouter",
        modelId: "google/gemini-2.0-flash-exp:free",
        name: "Gemini 2.0 Flash Exp (Free)",
        isCustom: true,
        apiContextWindow: 1_048_576,
        apiMaxOutput: 8_192,
        simulatedStatus: "dead",
        simulatedLatencyMs: 280,
        simulatedHttpStatus: 404,
        simulatedError: "HTTP 404: No endpoints found for google/gemini-2.0-flash-exp:free (deprecated)",
      },
      {
        key: "openrouter/meta-llama/llama-4-maverick:free",
        provider: "openrouter",
        modelId: "meta-llama/llama-4-maverick:free",
        name: "Llama 4 Maverick (Free)",
        isCustom: true,
        apiContextWindow: 1_048_576,
        apiMaxOutput: 16_384,
        simulatedStatus: "rate_limited",
        simulatedLatencyMs: 410,
        simulatedHttpStatus: 429,
        simulatedError: "HTTP 429: Upstream free-tier rate limit temporarily exceeded (RPM)",
      },
      {
        key: "openrouter/custom-lab/my-alpha-model:free",
        provider: "openrouter",
        modelId: "custom-lab/my-alpha-model:free",
        name: "My Alpha Model (Custom)",
        isCustom: true,
        apiContextWindow: null, // tests Unknown context window + Manual Override
        apiMaxOutput: null,
        simulatedStatus: "healthy",
        simulatedLatencyMs: 780,
        simulatedHttpStatus: 200,
        simulatedError: null,
      },
      {
        key: "groq/llama-3.3-70b-versatile",
        provider: "groq",
        modelId: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B Versatile",
        isCustom: false,
        apiContextWindow: 128_000,
        apiMaxOutput: 32_768,
        simulatedStatus: "healthy",
        simulatedLatencyMs: 215,
        simulatedHttpStatus: 200,
        simulatedError: null,
      },
      {
        key: "groq/qwen-2.5-coder-32b-instruct",
        provider: "groq",
        modelId: "qwen-2.5-coder-32b-instruct",
        name: "Qwen 2.5 Coder 32B (Legacy)",
        isCustom: false,
        apiContextWindow: 32_768,
        apiMaxOutput: 8_192,
        simulatedStatus: "dead",
        simulatedLatencyMs: 190,
        simulatedHttpStatus: 410,
        simulatedError: "HTTP 410: Model qwen-2.5-coder-32b-instruct has been decommissioned",
      },
      {
        key: "deepseek/deepseek-chat",
        provider: "deepseek",
        modelId: "deepseek-chat",
        name: "DeepSeek Chat V3",
        isCustom: false,
        apiContextWindow: 131_072,
        apiMaxOutput: 8_192,
        simulatedStatus: "auth_error",
        simulatedLatencyMs: 340,
        simulatedHttpStatus: 402,
        simulatedError: "HTTP 402: Insufficient balance on provider account",
      },
      {
        key: "cerebras/llama-3.1-70b-instruct",
        provider: "cerebras",
        modelId: "llama-3.1-70b-instruct",
        name: "Llama 3.1 70B (Cerebras)",
        isCustom: false,
        apiContextWindow: 131_072,
        apiMaxOutput: 8_192,
        simulatedStatus: "transient_error",
        simulatedLatencyMs: 530,
        simulatedHttpStatus: 502,
        simulatedError: "HTTP 502: Bad Gateway from upstream inference node",
      },
      {
        key: "mistral/mistral-old-deprecated",
        provider: "mistral",
        modelId: "mistral-old-deprecated",
        name: "Mistral Old Preview",
        isCustom: true,
        apiContextWindow: 32_768,
        apiMaxOutput: 4_096,
        simulatedStatus: "dead",
        simulatedLatencyMs: 250,
        simulatedHttpStatus: 404,
        simulatedError: "HTTP 404: Model ID mistral-old-deprecated does not exist",
      },
      {
        key: "nvidia/llama-3.1-nemotron-ultra-253b",
        provider: "nvidia",
        modelId: "llama-3.1-nemotron-ultra-253b",
        name: "Nemotron Ultra 253B",
        isCustom: true,
        apiContextWindow: null, // registry -> 131K
        apiMaxOutput: null,
        simulatedStatus: "timeout",
        simulatedLatencyMs: null,
        simulatedHttpStatus: null,
        simulatedError: "Request timed out after 15000ms",
      },
    ],
    combos: [
      {
        id: "combo-coding-agent",
        name: "coding-agent",
        models: [
          "gemini/gemini-2.5-pro",
          "openrouter/deepseek/deepseek-r1:free",
          "openrouter/google/gemini-2.0-flash-exp:free",
        ],
        kind: "llm",
      },
      {
        id: "combo-long-context",
        name: "long-context-1m",
        models: [
          "gemini/gemini-2.5-pro",
          "gemini/gemini-2.5-flash",
          "groq/llama-3.3-70b-versatile",
          "openrouter/custom-lab/my-alpha-model:free",
        ],
        kind: "llm",
      },
      {
        id: "combo-solo-legacy",
        name: "solo-legacy",
        models: ["groq/qwen-2.5-coder-32b-instruct"],
        kind: "llm",
      },
    ],
  };
}

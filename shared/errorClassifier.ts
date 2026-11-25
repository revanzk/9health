import type { HealthStatus } from "./types.js";

export interface ClassifyInput {
  httpStatus: number | null;
  rawText?: string;
  parsedBody?: unknown;
  timedOut?: boolean;
  networkError?: string | null;
}

export interface ClassifyOutput {
  status: Exclude<HealthStatus, "unchecked">;
  httpStatus: number | null;
  errorMessage: string | null;
  shouldRetryReasoningPayload: boolean;
  note?: string | null;
}

const DEAD_MODEL_PATTERNS = [
  /model[\s_-]*not[\s_-]*found/i,
  /invalid[\s_-]*model/i,
  /unknown[\s_-]*model/i,
  /does not exist/i,
  /not[\s_-]*available/i,
  /deprecated/i,
  /decommissioned/i,
  /no longer supported/i,
  /sunset/i,
  /no endpoints found/i,
  /model .* not found/i,
  /not a valid model/i,
];

const REASONING_PARAM_PATTERNS = [
  /max_completion_tokens/i,
  /unsupported[\s_-]*(parameter|value).*max_tokens/i,
  /max_tokens.*not supported/i,
  /max_tokens.*must be/i,
  /max_tokens.*at least/i,
  /reasoning.*budget/i,
  /minimum.*tokens/i,
];

const RATE_LIMIT_PATTERNS = [
  /rate[\s_-]*limit/i,
  /too many requests/i,
  /quota.*minute/i,
  /requests per (minute|second|day)/i,
  /overloaded/i,
  /temporarily unavailable/i,
  /capacity/i,
  /429/,
];

const AUTH_QUOTA_PATTERNS = [
  /invalid[\s_-]*api[\s_-]*key/i,
  /incorrect api key/i,
  /unauthorized/i,
  /authentication/i,
  /insufficient[\s_-]*(quota|balance|credits|funds)/i,
  /exceeded your current quota/i,
  /billing/i,
  /payment required/i,
  /account.*suspended/i,
  /api key.*expired/i,
  /forbidden/i,
];

function extractErrorDetail(parsedBody: unknown, rawText?: string): { code: string; message: string } {
  if (parsedBody && typeof parsedBody === "object") {
    const obj = parsedBody as Record<string, unknown>;
    const err = obj.error;
    if (typeof err === "string") {
      return { code: "", message: err };
    }
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      const code = String(e.code ?? e.type ?? "");
      const message = String(e.message ?? e.detail ?? JSON.stringify(e));
      return { code, message };
    }
    if (typeof obj.message === "string" || typeof obj.msg === "string") {
      return {
        code: String(obj.code ?? obj.status ?? ""),
        message: String(obj.message ?? obj.msg ?? ""),
      };
    }
  }
  return { code: "", message: (rawText ?? "").trim() };
}

function truncate(text: string, maxLen = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

export function isReasoningParameterRejection(httpStatus: number | null, text: string): boolean {
  if (httpStatus !== 400 && httpStatus !== 422) return false;
  return REASONING_PARAM_PATTERNS.some((re) => re.test(text));
}

export function classifyHealthResponse(input: ClassifyInput): ClassifyOutput {
  const { httpStatus, rawText = "", parsedBody, timedOut, networkError } = input;

  if (timedOut) {
    return {
      status: "timeout",
      httpStatus: null,
      errorMessage: "Request timed out before provider responded",
      shouldRetryReasoningPayload: false,
    };
  }

  if (networkError) {
    return {
      status: "timeout",
      httpStatus: null,
      errorMessage: truncate(networkError),
      shouldRetryReasoningPayload: false,
    };
  }

  const { code, message } = extractErrorDetail(parsedBody, rawText);
  const combinedError = [code, message].filter(Boolean).join(": ");

  // Check for provider error envelopes even when HTTP status is 200
  if (httpStatus === 200 && parsedBody && typeof parsedBody === "object") {
    const obj = parsedBody as Record<string, unknown>;
    const providerStatus = obj.status;
    const hasNonOkEnvelopeStatus =
      providerStatus !== undefined &&
      providerStatus !== null &&
      String(providerStatus) !== "200" &&
      String(providerStatus) !== "0" &&
      String(providerStatus).toLowerCase() !== "ok";

    if (obj.error || hasNonOkEnvelopeStatus) {
      const envMsg = combinedError || `Provider returned error envelope (status ${String(providerStatus)})`;
      if (RATE_LIMIT_PATTERNS.some((re) => re.test(envMsg))) {
        return { status: "rate_limited", httpStatus, errorMessage: truncate(envMsg), shouldRetryReasoningPayload: false };
      }
      if (AUTH_QUOTA_PATTERNS.some((re) => re.test(envMsg))) {
        return { status: "auth_error", httpStatus, errorMessage: truncate(envMsg), shouldRetryReasoningPayload: false };
      }
      if (DEAD_MODEL_PATTERNS.some((re) => re.test(envMsg))) {
        return { status: "dead", httpStatus, errorMessage: truncate(envMsg), shouldRetryReasoningPayload: false };
      }
      return { status: "transient_error", httpStatus, errorMessage: truncate(envMsg), shouldRetryReasoningPayload: false };
    }

    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    if (choices.length > 0) {
      const first = (choices[0] ?? {}) as Record<string, unknown>;
      const msg = (first.message ?? {}) as Record<string, unknown>;
      const hasReasoning = Boolean(
        msg.reasoning || msg.reasoning_content || msg.thinking || msg.thinking_content
      );
      const contentEmpty = !String(msg.content ?? "").trim();

      if (first.finish_reason === "length" && contentEmpty && hasReasoning) {
        return {
          status: "healthy",
          httpStatus,
          errorMessage: null,
          shouldRetryReasoningPayload: false,
          note: "Reasoning model responded (length-limited)",
        };
      }

      return {
        status: "healthy",
        httpStatus,
        errorMessage: null,
        shouldRetryReasoningPayload: false,
      };
    }

    // 9router /api/models/test shape: { ok: true, latencyMs, status }
    if (obj.ok === true) {
      return {
        status: "healthy",
        httpStatus,
        errorMessage: null,
        shouldRetryReasoningPayload: false,
        note: typeof obj.note === "string" ? obj.note : null,
      };
    }

    return {
      status: "transient_error",
      httpStatus,
      errorMessage: "HTTP 200 received without completion choices",
      shouldRetryReasoningPayload: false,
    };
  }

  // Non-200 status classification
  if (httpStatus === 429 || httpStatus === 503) {
    return {
      status: "rate_limited",
      httpStatus,
      errorMessage: truncate(combinedError || `HTTP ${httpStatus} Rate limited / Service busy`),
      shouldRetryReasoningPayload: false,
    };
  }

  if (httpStatus === 401 || httpStatus === 402 || httpStatus === 403) {
    return {
      status: "auth_error",
      httpStatus,
      errorMessage: truncate(combinedError || `HTTP ${httpStatus} Authentication or quota exhausted`),
      shouldRetryReasoningPayload: false,
    };
  }

  if (httpStatus === 404 || httpStatus === 410) {
    return {
      status: "dead",
      httpStatus,
      errorMessage: truncate(combinedError || `HTTP ${httpStatus} Model not found or deprecated`),
      shouldRetryReasoningPayload: false,
    };
  }

  if (httpStatus === 400 || httpStatus === 422) {
    if (isReasoningParameterRejection(httpStatus, combinedError)) {
      return {
        status: "transient_error",
        httpStatus,
        errorMessage: truncate(combinedError || `HTTP ${httpStatus} Unsupported test payload parameter`),
        shouldRetryReasoningPayload: true,
      };
    }
    if (DEAD_MODEL_PATTERNS.some((re) => re.test(combinedError))) {
      return {
        status: "dead",
        httpStatus,
        errorMessage: truncate(combinedError || `HTTP ${httpStatus} Invalid or deprecated model ID`),
        shouldRetryReasoningPayload: false,
      };
    }
    if (AUTH_QUOTA_PATTERNS.some((re) => re.test(combinedError))) {
      return {
        status: "auth_error",
        httpStatus,
        errorMessage: truncate(combinedError),
        shouldRetryReasoningPayload: false,
      };
    }
    if (RATE_LIMIT_PATTERNS.some((re) => re.test(combinedError))) {
      return {
        status: "rate_limited",
        httpStatus,
        errorMessage: truncate(combinedError),
        shouldRetryReasoningPayload: false,
      };
    }
    return {
      status: "transient_error",
      httpStatus,
      errorMessage: truncate(combinedError || `HTTP ${httpStatus} Bad request / parameter mismatch`),
      shouldRetryReasoningPayload: false,
    };
  }

  if (httpStatus !== null && httpStatus >= 500) {
    return {
      status: "transient_error",
      httpStatus,
      errorMessage: truncate(combinedError || `HTTP ${httpStatus} Upstream provider error`),
      shouldRetryReasoningPayload: false,
    };
  }

  return {
    status: "transient_error",
    httpStatus,
    errorMessage: truncate(combinedError || `Unexpected HTTP ${httpStatus ?? "unknown"}`),
    shouldRetryReasoningPayload: false,
  };
}

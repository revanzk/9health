import { describe, expect, it } from "vitest";
import { classifyHealthResponse } from "../shared/errorClassifier.js";

describe("classifyHealthResponse", () => {
  it("classifies valid HTTP 200 completion as healthy", () => {
    const res = classifyHealthResponse({
      httpStatus: 200,
      parsedBody: {
        id: "chatcmpl-1",
        choices: [{ message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
      },
    });
    expect(res.status).toBe("healthy");
    expect(res.errorMessage).toBeNull();
  });

  it("classifies reasoning-only HTTP 200 (length-limited empty content) as healthy", () => {
    const res = classifyHealthResponse({
      httpStatus: 200,
      parsedBody: {
        choices: [
          {
            message: { role: "assistant", content: "", reasoning_content: "thinking..." },
            finish_reason: "length",
          },
        ],
      },
    });
    expect(res.status).toBe("healthy");
    expect(res.note).toContain("Reasoning");
  });

  it("detects JSON error envelopes inside HTTP 200 responses", () => {
    const rateLimited = classifyHealthResponse({
      httpStatus: 200,
      parsedBody: { error: { message: "Rate limit exceeded for free tier" } },
    });
    expect(rateLimited.status).toBe("rate_limited");

    const dead = classifyHealthResponse({
      httpStatus: 200,
      parsedBody: { status: 404, msg: "Model not found on upstream" },
    });
    expect(dead.status).toBe("dead");
  });

  it("classifies HTTP 429 and 503 as rate_limited", () => {
    expect(classifyHealthResponse({ httpStatus: 429, rawText: "Too Many Requests" }).status).toBe(
      "rate_limited"
    );
    expect(classifyHealthResponse({ httpStatus: 503, rawText: "Service busy" }).status).toBe(
      "rate_limited"
    );
  });

  it("classifies HTTP 401/402/403 as auth_error", () => {
    expect(classifyHealthResponse({ httpStatus: 401, rawText: "Invalid API key" }).status).toBe(
      "auth_error"
    );
    expect(classifyHealthResponse({ httpStatus: 402, rawText: "Insufficient credits" }).status).toBe(
      "auth_error"
    );
    expect(classifyHealthResponse({ httpStatus: 403, rawText: "Forbidden" }).status).toBe(
      "auth_error"
    );
  });

  it("classifies HTTP 404/410 and invalid-model HTTP 400 as dead", () => {
    expect(classifyHealthResponse({ httpStatus: 404, rawText: "Not found" }).status).toBe("dead");
    expect(classifyHealthResponse({ httpStatus: 410, rawText: "Gone" }).status).toBe("dead");
    expect(
      classifyHealthResponse({
        httpStatus: 400,
        parsedBody: { error: { code: "model_not_found", message: "Model does not exist" } },
      }).status
    ).toBe("dead");
  });

  it("flags reasoning parameter rejections (HTTP 400 on max_tokens) for automatic fallback retry instead of dead", () => {
    const res = classifyHealthResponse({
      httpStatus: 400,
      parsedBody: {
        error: {
          message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        },
      },
    });
    expect(res.shouldRetryReasoningPayload).toBe(true);
    expect(res.status).toBe("transient_error");
  });

  it("classifies HTTP 500/502 as transient_error and timeout/network errors as timeout", () => {
    expect(classifyHealthResponse({ httpStatus: 502, rawText: "Bad Gateway" }).status).toBe(
      "transient_error"
    );
    expect(classifyHealthResponse({ httpStatus: null, timedOut: true }).status).toBe("timeout");
    expect(
      classifyHealthResponse({ httpStatus: null, networkError: "ECONNREFUSED" }).status
    ).toBe("timeout");
  });
});

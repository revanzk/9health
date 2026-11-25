import { describe, expect, it } from "vitest";
import { resolveModelMetadata } from "../shared/metadataRegistry.js";

describe("resolveModelMetadata (3-tier fallback hierarchy)", () => {
  it("prioritizes Manual Override over API and Registry", () => {
    const resolved = resolveModelMetadata({
      modelKey: "gemini/gemini-2.5-pro",
      apiContextWindow: 1_048_576,
      manualOverride: { contextWindow: 512_000, maxOutput: 16_384, updatedAt: new Date().toISOString() },
    });
    expect(resolved.metadataSource).toBe("manual");
    expect(resolved.contextWindow).toBe(512_000);
    expect(resolved.maxOutput).toBe(16_384);
  });

  it("uses 9router API value when no Manual Override exists", () => {
    const resolved = resolveModelMetadata({
      modelKey: "custom/my-model",
      apiContextWindow: 256_000,
      apiMaxOutput: 8_192,
    });
    expect(resolved.metadataSource).toBe("router_api");
    expect(resolved.contextWindow).toBe(256_000);
  });

  it("falls back to curated Registry when API value is missing (strips :free & provider prefix)", () => {
    const resolved = resolveModelMetadata({
      modelKey: "openrouter/deepseek/deepseek-r1:free",
      apiContextWindow: null,
    });
    expect(resolved.metadataSource).toBe("registry");
    expect(resolved.contextWindow).toBe(163_840);
  });

  it("returns unknown when no tier has metadata", () => {
    const resolved = resolveModelMetadata({
      modelKey: "openrouter/custom-lab/unlisted-experimental",
      apiContextWindow: null,
    });
    expect(resolved.metadataSource).toBe("unknown");
    expect(resolved.contextWindow).toBeNull();
  });
});

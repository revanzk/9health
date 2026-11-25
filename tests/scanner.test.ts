import { describe, expect, it } from "vitest";
import { runControlledScan } from "../server/scanner.js";
import type { ScanResult } from "../shared/types.js";

describe("runControlledScan", () => {
  it("enforces global concurrency <= 5 and per-provider concurrency <= 1", async () => {
    const targets = [
      { key: "groq/m1", provider: "groq" },
      { key: "groq/m2", provider: "groq" },
      { key: "groq/m3", provider: "groq" },
      { key: "openrouter/m1", provider: "openrouter" },
      { key: "openrouter/m2", provider: "openrouter" },
      { key: "gemini/m1", provider: "gemini" },
      { key: "mistral/m1", provider: "mistral" },
    ];

    let activeGlobal = 0;
    let peakGlobal = 0;
    const activePerProvider = new Map<string, number>();
    const peakPerProvider = new Map<string, number>();

    const persisted: ScanResult[] = [];
    const controller = new AbortController();

    const results = await runControlledScan({
      targets,
      globalConcurrency: 5,
      perProviderConcurrency: 1,
      providerPacingMs: 0,
      signal: controller.signal,
      probe: async (target) => {
        activeGlobal += 1;
        peakGlobal = Math.max(peakGlobal, activeGlobal);
        const curProv = (activePerProvider.get(target.provider) ?? 0) + 1;
        activePerProvider.set(target.provider, curProv);
        peakPerProvider.set(
          target.provider,
          Math.max(peakPerProvider.get(target.provider) ?? 0, curProv)
        );

        await new Promise((r) => setTimeout(r, 25));

        activeGlobal -= 1;
        activePerProvider.set(target.provider, (activePerProvider.get(target.provider) ?? 1) - 1);

        return {
          modelKey: target.key,
          status: "healthy",
          latencyMs: 25,
          httpStatus: 200,
          errorMessage: null,
          checkedAt: new Date().toISOString(),
        };
      },
      onResult: (r) => persisted.push(r),
    });

    expect(results).toHaveLength(targets.length);
    expect(persisted).toHaveLength(targets.length);
    expect(peakGlobal).toBeLessThanOrEqual(5);
    expect(peakGlobal).toBeGreaterThanOrEqual(2);
    for (const peak of peakPerProvider.values()) {
      expect(peak).toBe(1);
    }
  });

  it("preserves partial completed results when cancelled mid-scan", async () => {
    const targets = [
      { key: "p1/m1", provider: "p1" },
      { key: "p2/m2", provider: "p2" },
      { key: "p3/m3", provider: "p3" },
      { key: "p4/m4", provider: "p4" },
    ];

    const controller = new AbortController();
    const persisted: ScanResult[] = [];

    await runControlledScan({
      targets,
      globalConcurrency: 1,
      perProviderConcurrency: 1,
      providerPacingMs: 0,
      signal: controller.signal,
      probe: async (target) => {
        await new Promise((r) => setTimeout(r, 15));
        return {
          modelKey: target.key,
          status: "healthy",
          latencyMs: 15,
          httpStatus: 200,
          errorMessage: null,
          checkedAt: new Date().toISOString(),
        };
      },
      onResult: (r) => {
        persisted.push(r);
        if (persisted.length === 2) {
          controller.abort();
        }
      },
    });

    expect(persisted).toHaveLength(2);
    expect(persisted.map((r) => r.modelKey)).toEqual(["p1/m1", "p2/m2"]);
  });
});

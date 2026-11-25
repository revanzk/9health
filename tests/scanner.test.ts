import { describe, expect, it } from "vitest";
import { runControlledScan, ScanManager } from "../server/scanner.js";
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

describe("ScanManager pending targets & cancel rollback", () => {
  it("tracks targetModelKeys during active scan and preserves prior states for cancelled pending models", async () => {
    const manager = new ScanManager();
    const persisted = new Map<string, ScanResult>([
      [
        "p1/m1",
        {
          modelKey: "p1/m1",
          status: "healthy",
          latencyMs: 100,
          httpStatus: 200,
          errorMessage: null,
          checkedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        "p2/m2",
        {
          modelKey: "p2/m2",
          status: "dead",
          latencyMs: 200,
          httpStatus: 404,
          errorMessage: "Old dead state",
          checkedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]);

    const job = manager.startJob({
      scope: "all",
      mode: "single",
      targets: [
        { key: "p1/m1", provider: "p1" },
        { key: "p2/m2", provider: "p2" },
        { key: "p3/m3", provider: "p3" },
      ],
      globalConcurrency: 1,
      perProviderConcurrency: 1,
      providerPacingMs: 0,
      probe: async (target, signal) => {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, target.key === "p1/m1" ? 15 : 200);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("Aborted"));
          });
        });
        return {
          modelKey: target.key,
          status: "rate_limited",
          latencyMs: 15,
          httpStatus: 429,
          errorMessage: "Busy now",
          checkedAt: new Date().toISOString(),
        };
      },
      onPersistResult: (r) => {
        persisted.set(r.modelKey, r);
        if (r.modelKey === "p1/m1") {
          manager.cancelJob(job.jobId);
        }
      },
    });

    // Immediately exposes all targets so UI renders all of them as Pending
    expect(job.targetModelKeys).toEqual(["p1/m1", "p2/m2", "p3/m3"]);
    expect(job.status).toBe("running");

    await new Promise((r) => setTimeout(r, 80));
    const finalJob = manager.getJob(job.jobId)!;
    expect(finalJob.status).toBe("cancelled");
    expect(finalJob.completed).toBe(1);

    // Completed model updated, while cancelled pending models retained exact previous states
    expect(persisted.get("p1/m1")?.status).toBe("rate_limited");
    expect(persisted.get("p2/m2")?.status).toBe("dead");
    expect(persisted.get("p3/m3")).toBeUndefined();
  });
});

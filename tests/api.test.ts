import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/index.js";
import type { CascadeImpactItem, DashboardSnapshot, ScanJobSnapshot } from "../shared/types.js";

describe("9health Express API end-to-end integration", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let tmpDir = "";

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "9health-test-"));
    const storeFile = path.join(tmpDir, "store.json");
    const app = createApp(storeFile);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterAll(async () => {
    await closeServer();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("responds healthy on /api/health and serves built index.html on /", async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { ok: boolean; service: string };
    expect(health.ok).toBe(true);
    expect(health.service).toBe("9health");

    const htmlRes = await fetch(`${baseUrl}/`);
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain("9health");
  });

  it("enables Demo Mode, runs Rapid Scan, resolves Manual Override, and executes Cascade Impact Swap + Delete", async () => {
    // 1. Enable demo mode
    const demoRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demoMode: true }),
    });
    expect(demoRes.status).toBe(200);
    const demoSnap = (await demoRes.json()) as DashboardSnapshot;
    expect(demoSnap.connection.connected).toBe(true);
    expect(demoSnap.connection.demoMode).toBe(true);
    expect(demoSnap.models.length).toBeGreaterThanOrEqual(10);

    // Verify long-context-1m detects both bottleneck (128K vs 1M) and Unknown metadata
    const longCombo = demoSnap.combos.find((c) => c.name === "long-context-1m");
    expect(longCombo).toBeDefined();
    expect(longCombo!.analysis.effectiveContext).toBe(128_000);
    expect(longCombo!.analysis.bottleneckModelKeys).toContain("groq/llama-3.3-70b-versatile");
    expect(longCombo!.analysis.hasUnknownModels).toBe(true);

    // 2. Run Rapid Scan on coding-agent combo
    const codingCombo = demoSnap.combos.find((c) => c.name === "coding-agent")!;
    const startRes = await fetch(`${baseUrl}/api/scan/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "combo", mode: "rapid", comboId: codingCombo.id }),
    });
    expect(startRes.status).toBe(200);
    const { job } = (await startRes.json()) as { job: ScanJobSnapshot };
    expect(job.total).toBe(3);

    // Wait for scan completion
    let finishedJob = job;
    for (let i = 0; i < 40; i++) {
      const activeRes = await fetch(`${baseUrl}/api/scan/active`);
      const data = (await activeRes.json()) as { job: ScanJobSnapshot };
      finishedJob = data.job;
      if (finishedJob.status !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(finishedJob.status).toBe("completed");
    expect(finishedJob.completed).toBe(3);

    // 3. Apply Manual Override to unknown model -> clears Unknown warning on long-context-1m
    const overrideRes = await fetch(`${baseUrl}/api/models/override`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelKey: "openrouter/custom-lab/my-alpha-model:free",
        contextWindow: 1_048_576,
        maxOutput: 32_768,
      }),
    });
    expect(overrideRes.status).toBe(200);
    const afterOverride = (await overrideRes.json()) as DashboardSnapshot;
    const updatedLong = afterOverride.combos.find((c) => c.name === "long-context-1m")!;
    expect(updatedLong.analysis.hasUnknownModels).toBe(false);

    // 4. Preview Cascade Impact for deleting dead model in coding-agent + solo model in solo-legacy
    const deadKeys = [
      "openrouter/google/gemini-2.0-flash-exp:free",
      "groq/qwen-2.5-coder-32b-instruct",
    ];
    const impactRes = await fetch(`${baseUrl}/api/models/delete-impact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelKeys: deadKeys }),
    });
    expect(impactRes.status).toBe(200);
    const { impacts } = (await impactRes.json()) as { impacts: CascadeImpactItem[] };
    expect(impacts).toHaveLength(2);
    const soloImpact = impacts.find((i) => i.comboName === "solo-legacy")!;
    expect(soloImpact.willBecomeEmpty).toBe(true);

    // 5. Execute Delete with Quick Swap on coding-agent and delete_combo on solo-legacy
    const delRes = await fetch(`${baseUrl}/api/models/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelKeys: deadKeys,
        comboActions: [
          {
            comboId: codingCombo.id,
            action: "swap",
            swapMap: {
              "openrouter/google/gemini-2.0-flash-exp:free": "gemini/gemini-2.5-flash",
            },
          },
          {
            comboId: soloImpact.comboId,
            action: "delete_combo",
          },
        ],
      }),
    });
    expect(delRes.status).toBe(200);
    const afterDel = (await delRes.json()) as DashboardSnapshot;
    expect(afterDel.models.some((m) => deadKeys.includes(m.key))).toBe(false);
    expect(afterDel.combos.some((c) => c.name === "solo-legacy")).toBe(false);
    const updatedCoding = afterDel.combos.find((c) => c.name === "coding-agent")!;
    expect(updatedCoding.models).toContain("gemini/gemini-2.5-flash");
    expect(updatedCoding.models).not.toContain("openrouter/google/gemini-2.0-flash-exp:free");
  });
});

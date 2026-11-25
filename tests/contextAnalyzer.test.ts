import { describe, expect, it } from "vitest";
import {
  analyzeCascadeImpact,
  analyzeComboContext,
  formatTokens,
} from "../shared/contextAnalyzer.js";

describe("analyzeComboContext", () => {
  it("computes effective context as minimum and flags bottlenecks <= 50% of max", () => {
    const analysis = analyzeComboContext(
      ["gemini/2.5-pro", "claude/3.7-sonnet", "groq/llama-3.3-70b"],
      {
        "gemini/2.5-pro": 1_048_576,
        "claude/3.7-sonnet": 200_000,
        "groq/llama-3.3-70b": 128_000,
      },
      50
    );

    expect(analysis.effectiveContext).toBe(128_000);
    expect(analysis.maxContext).toBe(1_048_576);
    expect(analysis.hasUnknownModels).toBe(false);
    expect(analysis.bottleneckModelKeys).toEqual(["claude/3.7-sonnet", "groq/llama-3.3-70b"]);
  });

  it("does not flag bottleneck when all models are above the 50% threshold", () => {
    const analysis = analyzeComboContext(
      ["model-a", "model-b"],
      { "model-a": 200_000, "model-b": 128_000 },
      50
    );

    expect(analysis.effectiveContext).toBe(128_000);
    expect(analysis.bottleneckModelKeys).toEqual([]);
  });

  it("handles partial unknown metadata explicitly without crashing", () => {
    const analysis = analyzeComboContext(
      ["gemini/2.5-pro", "custom/unknown-alpha"],
      { "gemini/2.5-pro": 1_048_576, "custom/unknown-alpha": null },
      50
    );

    expect(analysis.effectiveContext).toBe(1_048_576);
    expect(analysis.hasUnknownModels).toBe(true);
    expect(analysis.unknownModelKeys).toEqual(["custom/unknown-alpha"]);
    expect(analysis.bottleneckModelKeys).toEqual([]);
  });

  it("formats token counts readably", () => {
    expect(formatTokens(1_048_576)).toBe("1M");
    expect(formatTokens(200_000)).toBe("200K");
    expect(formatTokens(128_000)).toBe("128K");
    expect(formatTokens(null)).toBe("Unknown");
  });
});

describe("analyzeCascadeImpact", () => {
  it("detects normal affected combos and single-model combo edge case", () => {
    const impacts = analyzeCascadeImpact(
      ["dead/model-1", "dead/solo-model"],
      [
        { id: "c1", name: "coding", models: ["healthy/m1", "dead/model-1"] },
        { id: "c2", name: "solo-legacy", models: ["dead/solo-model"] },
        { id: "c3", name: "unaffected", models: ["healthy/m1", "healthy/m2"] },
      ]
    );

    expect(impacts).toHaveLength(2);
    expect(impacts[0]).toMatchObject({
      comboId: "c1",
      affectedModels: ["dead/model-1"],
      remainingModels: ["healthy/m1"],
      willBecomeEmpty: false,
    });
    expect(impacts[1]).toMatchObject({
      comboId: "c2",
      affectedModels: ["dead/solo-model"],
      remainingModels: [],
      willBecomeEmpty: true,
    });
  });
});

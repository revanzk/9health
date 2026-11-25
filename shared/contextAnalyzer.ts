import type { CascadeImpactItem, ComboContextAnalysis, ComboRecord } from "./types.js";

export function analyzeComboContext(
  comboModels: string[],
  modelContextMap: Record<string, number | null | undefined>,
  bottleneckThresholdPercent = 50
): ComboContextAnalysis {
  const modelContexts: Record<string, number | null> = {};
  const knownEntries: Array<{ key: string; contextWindow: number }> = [];
  const unknownModelKeys: string[] = [];

  for (const modelKey of comboModels) {
    const raw = modelContextMap[modelKey];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      modelContexts[modelKey] = raw;
      knownEntries.push({ key: modelKey, contextWindow: raw });
    } else {
      modelContexts[modelKey] = null;
      unknownModelKeys.push(modelKey);
    }
  }

  if (knownEntries.length === 0) {
    return {
      effectiveContext: null,
      maxContext: null,
      hasUnknownModels: unknownModelKeys.length > 0,
      unknownModelKeys,
      bottleneckModelKeys: [],
      bottleneckThresholdPercent,
      modelContexts,
    };
  }

  let minCtx = Infinity;
  let maxCtx = -Infinity;
  for (const item of knownEntries) {
    if (item.contextWindow < minCtx) minCtx = item.contextWindow;
    if (item.contextWindow > maxCtx) maxCtx = item.contextWindow;
  }

  const ratio = Math.max(1, Math.min(99, bottleneckThresholdPercent)) / 100;
  const thresholdValue = maxCtx * ratio;

  const bottleneckModelKeys: string[] = [];
  if (knownEntries.length >= 2 && minCtx < maxCtx) {
    for (const item of knownEntries) {
      if (item.contextWindow <= thresholdValue) {
        bottleneckModelKeys.push(item.key);
      }
    }
  }

  return {
    effectiveContext: minCtx,
    maxContext: maxCtx,
    hasUnknownModels: unknownModelKeys.length > 0,
    unknownModelKeys,
    bottleneckModelKeys,
    bottleneckThresholdPercent,
    modelContexts,
  };
}

export function analyzeCascadeImpact(
  deletingModelKeys: string[],
  combos: Array<Pick<ComboRecord, "id" | "name" | "models">>
): CascadeImpactItem[] {
  const deleteSet = new Set(deletingModelKeys);
  const impacts: CascadeImpactItem[] = [];

  for (const combo of combos) {
    const affectedModels = combo.models.filter((m) => deleteSet.has(m));
    if (affectedModels.length === 0) continue;

    const remainingModels = combo.models.filter((m) => !deleteSet.has(m));
    impacts.push({
      comboId: combo.id,
      comboName: combo.name,
      affectedModels,
      remainingModels,
      willBecomeEmpty: remainingModels.length === 0,
    });
  }

  return impacts;
}

export function formatTokens(tokens: number | null | undefined): string {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) {
    return "Unknown";
  }
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1_000) {
    const k = Math.round(tokens / 1_000);
    return `${k}K`;
  }
  return String(tokens);
}

export function formatLatency(latencyMs: number | null | undefined): string {
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0) {
    return "—";
  }
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(2)}s`;
  }
  return `${Math.round(latencyMs)}ms`;
}

export function formatRelativeTime(isoDate: string | null | undefined, nowMs = Date.now()): string {
  if (!isoDate) return "Never";
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return "Never";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

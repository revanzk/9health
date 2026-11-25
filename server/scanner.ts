import crypto from "node:crypto";
import type {
  ScanJobSnapshot,
  ScanMode,
  ScanResult,
  ScanScope,
  ScanStreamEvent,
} from "../shared/types.js";

export interface ScanTarget {
  key: string;
  provider: string;
}

export interface ControlledScanOptions {
  targets: ScanTarget[];
  globalConcurrency: number;
  perProviderConcurrency: number;
  providerPacingMs: number;
  signal: AbortSignal;
  probe: (target: ScanTarget, signal: AbortSignal) => Promise<ScanResult>;
  onResult: (result: ScanResult) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      if (signal.aborted) {
        clearTimeout(timer);
        resolve();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Concurrency scheduler enforcing:
 * - Global concurrency limit (e.g. 5 for Rapid Scan, 1 for Single Scan)
 * - Per-provider concurrency limit (e.g. 1-2 per provider) + optional pacing delay
 * - Immediate graceful stop on AbortSignal while preserving all completed partial results
 */
export async function runControlledScan(options: ControlledScanOptions): Promise<ScanResult[]> {
  const {
    targets,
    globalConcurrency,
    perProviderConcurrency,
    providerPacingMs,
    signal,
    probe,
    onResult,
  } = options;

  const pending = [...targets];
  const results: ScanResult[] = [];
  const inFlightByProvider = new Map<string, number>();
  const lastStartedByProvider = new Map<string, number>();
  let activeGlobal = 0;

  return new Promise<ScanResult[]>((resolve) => {
    let resolved = false;
    const finishIfDone = () => {
      if (resolved) return;
      if ((pending.length === 0 || signal.aborted) && activeGlobal === 0) {
        resolved = true;
        resolve(results);
      }
    };

    const scheduleNext = () => {
      if (signal.aborted) {
        finishIfDone();
        return;
      }

      while (activeGlobal < globalConcurrency && pending.length > 0) {
        // Find the first queued target whose provider has spare concurrency capacity
        const nextIdx = pending.findIndex((t) => {
          const count = inFlightByProvider.get(t.provider) ?? 0;
          return count < perProviderConcurrency;
        });

        if (nextIdx === -1) {
          break;
        }

        const [target] = pending.splice(nextIdx, 1);
        activeGlobal += 1;
        inFlightByProvider.set(target.provider, (inFlightByProvider.get(target.provider) ?? 0) + 1);

        void (async () => {
          try {
            if (providerPacingMs > 0) {
              const prevStart = lastStartedByProvider.get(target.provider) ?? 0;
              const elapsed = Date.now() - prevStart;
              if (prevStart > 0 && elapsed < providerPacingMs) {
                await sleep(providerPacingMs - elapsed, signal);
              }
            }
            if (signal.aborted) return;
            lastStartedByProvider.set(target.provider, Date.now());

            const result = await probe(target, signal);
            if (!signal.aborted) {
              results.push(result);
              onResult(result);
            }
          } catch {
            // Aborted in-flight request — ignore without overwriting existing state
          } finally {
            activeGlobal -= 1;
            const prev = inFlightByProvider.get(target.provider) ?? 1;
            if (prev <= 1) {
              inFlightByProvider.delete(target.provider);
            } else {
              inFlightByProvider.set(target.provider, prev - 1);
            }
            scheduleNext();
            finishIfDone();
          }
        })();
      }

      finishIfDone();
    };

    if (signal.aborted) {
      finishIfDone();
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        finishIfDone();
      },
      { once: true }
    );

    scheduleNext();
  });
}

interface ManagedScanJob {
  snapshot: ScanJobSnapshot;
  controller: AbortController;
  subscribers: Set<(event: ScanStreamEvent) => void>;
}

export class ScanManager {
  private jobs = new Map<string, ManagedScanJob>();
  private latestJobId: string | null = null;

  getActiveOrLatestJob(): ScanJobSnapshot | null {
    if (!this.latestJobId) return null;
    const job = this.jobs.get(this.latestJobId);
    return job ? { ...job.snapshot, results: [...job.snapshot.results] } : null;
  }

  getJob(jobId: string): ScanJobSnapshot | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job.snapshot, results: [...job.snapshot.results] } : null;
  }

  subscribe(jobId: string, listener: (event: ScanStreamEvent) => void): () => void {
    const job = this.jobs.get(jobId);
    if (!job) return () => {};
    job.subscribers.add(listener);
    listener({
      type: "init",
      job: { ...job.snapshot, results: [...job.snapshot.results] },
    });
    return () => {
      job.subscribers.delete(listener);
    };
  }

  private emit(job: ManagedScanJob, event: ScanStreamEvent): void {
    for (const sub of job.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore closed stream
      }
    }
  }

  startJob(params: {
    scope: ScanScope;
    mode: ScanMode;
    targets: ScanTarget[];
    globalConcurrency: number;
    perProviderConcurrency: number;
    providerPacingMs: number;
    probe: (target: ScanTarget, signal: AbortSignal) => Promise<ScanResult>;
    onPersistResult: (result: ScanResult) => void;
  }): ScanJobSnapshot {
    // Cancel any currently running scan before starting a new one
    if (this.latestJobId) {
      const prev = this.jobs.get(this.latestJobId);
      if (prev && prev.snapshot.status === "running") {
        this.cancelJob(prev.snapshot.jobId);
      }
    }

    const jobId = crypto.randomUUID();
    const controller = new AbortController();
    const snapshot: ScanJobSnapshot = {
      jobId,
      status: "running",
      mode: params.mode,
      scope: params.scope,
      total: params.targets.length,
      completed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      results: [],
    };

    const managed: ManagedScanJob = {
      snapshot,
      controller,
      subscribers: new Set(),
    };

    this.jobs.set(jobId, managed);
    this.latestJobId = jobId;

    const effectiveGlobal = params.mode === "single" ? 1 : Math.min(5, Math.max(1, params.globalConcurrency));
    const effectivePerProvider =
      params.mode === "single" ? 1 : Math.min(effectiveGlobal, Math.max(1, params.perProviderConcurrency));

    void runControlledScan({
      targets: params.targets,
      globalConcurrency: effectiveGlobal,
      perProviderConcurrency: effectivePerProvider,
      providerPacingMs: params.mode === "single" ? 0 : params.providerPacingMs,
      signal: controller.signal,
      probe: params.probe,
      onResult: (result) => {
        params.onPersistResult(result);
        managed.snapshot.results.push(result);
        managed.snapshot.completed = managed.snapshot.results.length;
        this.emit(managed, {
          type: "progress",
          job: { ...managed.snapshot, results: [...managed.snapshot.results] },
          latestResult: result,
        });
      },
    }).then(() => {
      const wasCancelled = controller.signal.aborted;
      managed.snapshot.status = wasCancelled ? "cancelled" : "completed";
      managed.snapshot.finishedAt = new Date().toISOString();
      this.emit(managed, {
        type: wasCancelled ? "cancelled" : "done",
        job: { ...managed.snapshot, results: [...managed.snapshot.results] },
      });
    });

    return { ...snapshot, results: [] };
  }

  cancelJob(jobId: string): ScanJobSnapshot | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (job.snapshot.status === "running") {
      job.controller.abort();
      job.snapshot.status = "cancelled";
      job.snapshot.finishedAt = new Date().toISOString();
      this.emit(job, {
        type: "cancelled",
        job: { ...job.snapshot, results: [...job.snapshot.results] },
      });
    }
    return { ...job.snapshot, results: [...job.snapshot.results] };
  }
}

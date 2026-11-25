import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  KeyRound,
  WifiOff,
  XCircle,
} from "lucide-react";
import type { HealthStatus } from "@shared/types";

interface StatusConfig {
  label: string;
  shortLabel: string;
  classes: string;
  Icon: typeof CheckCircle2;
}

export const STATUS_META: Record<HealthStatus, StatusConfig> = {
  healthy: {
    label: "Healthy",
    shortLabel: "Healthy",
    classes: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
    Icon: CheckCircle2,
  },
  rate_limited: {
    label: "Rate Limited",
    shortLabel: "429 Busy",
    classes: "bg-amber-500/12 text-amber-300 border-amber-500/30",
    Icon: Clock,
  },
  auth_error: {
    label: "Auth / Quota",
    shortLabel: "Auth/Quota",
    classes: "bg-orange-500/12 text-orange-300 border-orange-500/30",
    Icon: KeyRound,
  },
  dead: {
    label: "Dead / Deprecated",
    shortLabel: "Dead",
    classes: "bg-rose-500/15 text-rose-300 border-rose-500/35",
    Icon: XCircle,
  },
  transient_error: {
    label: "Transient Error",
    shortLabel: "Transient",
    classes: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    Icon: AlertTriangle,
  },
  timeout: {
    label: "Timeout / Network",
    shortLabel: "Timeout",
    classes: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    Icon: WifiOff,
  },
  unchecked: {
    label: "Unchecked",
    shortLabel: "Unchecked",
    classes: "bg-zinc-800/70 text-zinc-400 border-zinc-700/70",
    Icon: CircleDashed,
  },
};

export function StatusBadge({
  status,
  httpStatus,
  compact = false,
}: {
  status: HealthStatus;
  httpStatus?: number | null;
  compact?: boolean;
}) {
  const cfg = STATUS_META[status];
  const Icon = cfg.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cfg.classes}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? cfg.shortLabel : cfg.label}</span>
      {httpStatus ? (
        <span className="font-mono text-[10px] opacity-80">({httpStatus})</span>
      ) : null}
    </span>
  );
}

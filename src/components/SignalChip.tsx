/**
 * SignalChip — Renders a screener signal badge.
 */
import clsx from "clsx";
import type { Signal } from "../types";

const COLORS: Record<string, string> = {
  rsi_oversold:   "bg-bull/20 text-bull border-bull/30",
  rsi_overbought: "bg-bear/20 text-bear border-bear/30",
  golden_cross:   "bg-bull/20 text-bull border-bull/30",
  death_cross:    "bg-bear/20 text-bear border-bear/30",
  vol_breakout:   "bg-info/20 text-info border-info/30",
  near_52w_high:  "bg-warn/20 text-warn border-warn/30",
  near_52w_low:   "bg-warn/20 text-warn border-warn/30",
};

export function SignalChip({ signal }: { signal: Signal }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-mono",
      COLORS[signal.type] ?? "bg-terminal-muted text-terminal-dim border-terminal-border"
    )}>
      {signal.label}
    </span>
  );
}

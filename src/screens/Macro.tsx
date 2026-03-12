/**
 * Macro & Calendar — VIX, DXY, key indices and economic events.
 */
import { useState } from "react";
import { useStore } from "../store";
import { ChangeCell } from "../components/ChangeCell";
import { SectionLoader } from "../components/Loading";
import { formatCurrency, formatPct } from "../utils/finance";
import { format } from "date-fns";
import clsx from "clsx";
import type { PivotQuote } from "../types";

// ── Macro Card ───────────────────────────────────────────────
function MacroCard({ label, quote }: { label: string; quote: PivotQuote | null }) {
  if (!quote) {
    return (
      <div className="bg-terminal-surface border border-terminal-border rounded p-4 min-w-[140px]">
        <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-2">{label}</div>
        <div className="text-terminal-dim font-mono text-lg">—</div>
      </div>
    );
  }
  return (
    <div className="bg-terminal-surface border border-terminal-border rounded p-4 min-w-[140px] hover:border-terminal-accent/50 transition-colors">
      <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-1">{label}</div>
      <div className="font-mono font-bold text-xl text-terminal-text">{quote.price.toFixed(2)}</div>
      <div className="mt-1">
        <ChangeCell value={quote.changePct} isPct />
      </div>
      <div className="text-xs font-mono text-terminal-dim mt-1">
        H: {quote.high.toFixed(2)}  L: {quote.low.toFixed(2)}
      </div>
    </div>
  );
}

// ── Risk gauge (VIX) ─────────────────────────────────────────
function RiskGauge({ vix }: { vix: number | null }) {
  if (!vix) return null;
  const level   = vix < 15 ? "LOW" : vix < 25 ? "NORMAL" : vix < 35 ? "ELEVATED" : "EXTREME";
  const color   = vix < 15 ? "text-bull" : vix < 25 ? "text-terminal-accent" : vix < 35 ? "text-warn" : "text-bear";
  const pct     = Math.min((vix / 60) * 100, 100);
  const barColor = vix < 15 ? "bg-bull" : vix < 25 ? "bg-terminal-accent" : vix < 35 ? "bg-warn" : "bg-bear";
  return (
    <div className="bg-terminal-surface border border-terminal-border rounded p-4">
      <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-3">Market Fear Index (VIX)</div>
      <div className="flex items-center gap-4">
        <div className={`font-mono font-black text-4xl ${color}`}>{vix.toFixed(1)}</div>
        <div>
          <div className={`font-mono font-bold text-sm ${color}`}>{level}</div>
          <div className="w-32 h-2 bg-terminal-muted rounded-full mt-1 overflow-hidden">
            <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs font-mono text-terminal-dim mt-0.5">
            <span>0</span><span>60</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const IMPORTANCE_STYLES: Record<string, string> = {
  high:   "bg-bear/20 text-bear border-bear/30",
  medium: "bg-warn/20 text-warn border-warn/30",
  low:    "bg-terminal-muted text-terminal-dim border-terminal-border",
};

export function MacroScreen() {
  const { macro, calendar, loading } = useStore(s => ({
    macro:    s.macro,
    calendar: s.calendar,
    loading:  s.loading.macro,
  }));

  const [importanceFilter, setImportanceFilter] = useState<"all" | "high" | "medium">("all");

  const filteredCalendar = importanceFilter === "all"
    ? calendar
    : calendar.filter(e => e.importance === importanceFilter ||
        (importanceFilter === "medium" && e.importance === "high"));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* ── Macro Dashboard ───────────────────────────────── */}
      <div className="px-6 py-5 border-b border-terminal-border">
        <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-4">
          Global Macro Dashboard
        </div>
        {loading && !macro ? (
          <SectionLoader label="Loading macro data…" />
        ) : (
          <div className="flex flex-wrap gap-4">
            <RiskGauge vix={macro?.vix?.price ?? null} />
            <MacroCard label="VIX"        quote={macro?.vix    ?? null} />
            <MacroCard label="DXY"        quote={macro?.dxy    ?? null} />
            <MacroCard label="S&P 500"    quote={macro?.sp500  ?? null} />
            <MacroCard label="NASDAQ"     quote={macro?.nasdaq ?? null} />
            <MacroCard label="Gold"       quote={macro?.gold   ?? null} />
            <MacroCard label="Crude Oil"  quote={macro?.oil    ?? null} />
            <MacroCard label="Bitcoin"    quote={macro?.btc    ?? null} />
            {macro?.tenYrYield && <MacroCard label="10Y Yield" quote={macro.tenYrYield} />}
          </div>
        )}
      </div>

      {/* ── Regime summary ───────────────────────────────── */}
      {macro && (
        <div className="px-6 py-4 border-b border-terminal-border">
          <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-3">
            Market Regime Analysis
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              {
                label: "Risk Appetite",
                value: (macro.vix?.price ?? 20) < 20 ? "Risk-ON" : "Risk-OFF",
                color: (macro.vix?.price ?? 20) < 20 ? "text-bull" : "text-bear",
              },
              {
                label: "Dollar Trend",
                value: (macro.dxy?.changePct ?? 0) > 0 ? "Strengthening" : "Weakening",
                color: (macro.dxy?.changePct ?? 0) > 0 ? "text-warn" : "text-bull",
              },
              {
                label: "Equity Trend",
                value: (macro.sp500?.changePct ?? 0) > 0 ? "Bullish" : "Bearish",
                color: (macro.sp500?.changePct ?? 0) > 0 ? "text-bull" : "text-bear",
              },
              {
                label: "Safe Haven",
                value: (macro.gold?.changePct ?? 0) > 0 ? "Active" : "Inactive",
                color: (macro.gold?.changePct ?? 0) > 0 ? "text-warn" : "text-terminal-dim",
              },
            ].map(r => (
              <div key={r.label} className="bg-terminal-surface border border-terminal-border rounded px-4 py-2">
                <div className="text-xs font-mono text-terminal-dim">{r.label}</div>
                <div className={`font-mono font-bold text-sm ${r.color}`}>{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Economic Calendar ─────────────────────────────── */}
      <div className="flex-1 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest">
            Economic Calendar
          </div>
          <div className="flex bg-terminal-surface rounded border border-terminal-border overflow-hidden">
            {(["all", "medium", "high"] as const).map(level => (
              <button
                key={level}
                onClick={() => setImportanceFilter(level)}
                className={clsx(
                  "px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors",
                  importanceFilter === level
                    ? "bg-terminal-accent text-terminal-bg font-bold"
                    : "text-terminal-dim hover:text-terminal-text"
                )}
              >
                {level === "all" ? "All" : level === "medium" ? "Medium+" : "High"}
              </button>
            ))}
          </div>
        </div>

        {filteredCalendar.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-terminal-dim font-mono text-sm">
            No economic events for the current filter.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredCalendar.map(event => (
              <div
                key={event.id}
                className="flex items-center gap-4 px-4 py-2.5 bg-terminal-surface/50 rounded border border-terminal-border/50 hover:border-terminal-accent/30 transition-colors"
              >
                <div className="w-20 shrink-0">
                  <div className="text-xs font-mono text-terminal-text">
                    {format(event.date, "MMM dd")}
                  </div>
                  <div className="text-xs font-mono text-terminal-dim">{event.time}</div>
                </div>
                <div className="w-8 shrink-0">
                  <span className="text-xs font-mono font-bold text-terminal-dim">{event.country}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-ui text-terminal-text">{event.event}</span>
                </div>
                <span className={clsx(
                  "text-xs font-mono px-2 py-0.5 rounded border shrink-0",
                  IMPORTANCE_STYLES[event.importance]
                )}>
                  {event.importance.toUpperCase()}
                </span>
                <div className="flex gap-4 shrink-0 text-xs font-mono text-right">
                  <div>
                    <div className="text-terminal-dim">Prev</div>
                    <div className="text-terminal-text">{event.previous ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-terminal-dim">Fcst</div>
                    <div className="text-terminal-accent">{event.forecast ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-terminal-dim">Act</div>
                    <div className={event.actual ? "text-bull font-bold" : "text-terminal-dim"}>
                      {event.actual ?? "Pending"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Market Activity — Table / Heatmap switcher with relative volume.
 */
import { useState, useMemo } from "react";
import { useStore } from "../store";
import { TickerBadge } from "../components/TickerBadge";
import { ChangeCell } from "../components/ChangeCell";
import { SectionLoader } from "../components/Loading";
import { formatCurrency, formatVolume, computeRelVolume } from "../utils/finance";
import clsx from "clsx";

type ViewMode = "table" | "heatmap";

// ── Heatmap Tile ─────────────────────────────────────────────
function HeatmapTile({ quote, onClick }: {
  quote: import("../types").PivotQuote;
  onClick: () => void;
}) {
  const pct     = quote.changePct;
  const absPct  = Math.abs(pct);
  const isPos   = pct >= 0;

  // Intensity: 0–10% maps to opacity 0.1–1.0
  const intensity = Math.min(absPct / 10, 1);
  const bg = isPos
    ? `rgba(0, 230, 118, ${0.08 + intensity * 0.45})`
    : `rgba(255, 23, 68, ${0.08 + intensity * 0.45})`;

  const relVol = computeRelVolume(quote.volume, quote.avgVolume30d);

  return (
    <div
      onClick={onClick}
      style={{ background: bg }}
      className="relative cursor-pointer rounded border border-terminal-border/40
                 hover:border-terminal-accent/60 transition-all duration-200 p-3
                 flex flex-col justify-between min-h-[80px]"
    >
      <div>
        <div className="font-mono font-bold text-terminal-text text-sm">{quote.ticker}</div>
        <div className="text-xs text-terminal-dim font-ui truncate">{quote.name}</div>
      </div>
      <div className="mt-2">
        <div className={`font-mono font-bold text-base ${isPos ? "text-bull" : "text-bear"}`}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
        </div>
        <div className="text-xs text-terminal-dim font-mono">
          {formatCurrency(quote.price)}
        </div>
        {relVol >= 1.5 && (
          <div className="text-xs text-info font-mono mt-0.5">
            Vol ×{relVol.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
}

export function MarketScreen() {
  const { marketQuotes, loading, setFocusTicker } = useStore(s => ({
    marketQuotes:   s.marketQuotes,
    loading:        s.loading.market,
    setFocusTicker: s.setFocusTicker,
  }));

  const [view, setView]         = useState<ViewMode>("table");
  const [sortBy, setSortBy]     = useState<"changePct" | "volume" | "relVolume">("changePct");
  const [sortDir, setSortDir]   = useState<1 | -1>(-1);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortBy(col); setSortDir(-1); }
  }

  const sorted = useMemo(() => {
    return [...marketQuotes].sort((a, b) => {
      const va = sortBy === "relVolume"
        ? computeRelVolume(a.volume, a.avgVolume30d)
        : a[sortBy];
      const vb = sortBy === "relVolume"
        ? computeRelVolume(b.volume, b.avgVolume30d)
        : b[sortBy];
      return (va - vb) * sortDir;
    });
  }, [marketQuotes, sortBy, sortDir]);

  const SortHeader = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <th
      className="px-4 py-2 text-left text-xs font-mono text-terminal-dim uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-terminal-text"
      onClick={() => toggleSort(col)}
    >
      {label}
      {sortBy === col && <span className="ml-1">{sortDir === -1 ? "↓" : "↑"}</span>}
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-terminal-border">
        <div className="flex bg-terminal-surface rounded overflow-hidden border border-terminal-border">
          {(["table", "heatmap"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                "px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors",
                view === v
                  ? "bg-terminal-accent text-terminal-bg font-bold"
                  : "text-terminal-dim hover:text-terminal-text"
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="text-xs text-terminal-dim font-mono">
          {marketQuotes.length} instruments
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-terminal-accent font-mono animate-pulse-dim">
            <span className="w-1.5 h-1.5 rounded-full bg-terminal-accent inline-block" />
            LIVE
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      {marketQuotes.length === 0 ? (
        <SectionLoader label="Loading market data…" />
      ) : view === "heatmap" ? (
        /* ── Heatmap View ─────────────────────────────────── */
        <div className="flex-1 overflow-auto p-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {sorted.map(q => (
              <HeatmapTile key={q.ticker} quote={q} onClick={() => setFocusTicker(q.ticker)} />
            ))}
          </div>
        </div>
      ) : (
        /* ── Table View ───────────────────────────────────── */
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-terminal-bg z-10">
              <tr className="border-b border-terminal-border">
                <th className="px-4 py-2 text-left text-xs font-mono text-terminal-dim uppercase tracking-widest">Ticker</th>
                <th className="px-4 py-2 text-left text-xs font-mono text-terminal-dim uppercase tracking-widest">Name</th>
                <th className="px-4 py-2 text-left text-xs font-mono text-terminal-dim uppercase tracking-widest">Price</th>
                <SortHeader col="changePct"  label="Change %" />
                <SortHeader col="volume"     label="Volume" />
                <SortHeader col="relVolume"  label="Rel Vol" />
                <th className="px-4 py-2 text-left text-xs font-mono text-terminal-dim uppercase tracking-widest">Cap Vol ($)</th>
                <th className="px-4 py-2 text-left text-xs font-mono text-terminal-dim uppercase tracking-widest">52W Range</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q, idx) => {
                const relVol    = computeRelVolume(q.volume, q.avgVolume30d);
                const capVol    = q.volume * q.price;
                const week52Pct = q.week52High > 0
                  ? ((q.price - q.week52Low) / (q.week52High - q.week52Low)) * 100
                  : 50;
                return (
                  <tr
                    key={q.ticker}
                    onClick={() => setFocusTicker(q.ticker)}
                    className={clsx(
                      "border-b border-terminal-border/50 cursor-pointer hover:bg-terminal-surface transition-colors",
                      idx % 2 === 0 ? "bg-terminal-bg" : "bg-terminal-surface/20"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <TickerBadge ticker={q.ticker} size="sm" />
                    </td>
                    <td className="px-4 py-2.5 text-terminal-text font-ui text-xs">{q.name}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-terminal-text tabular-nums">
                      {formatCurrency(q.price)}
                    </td>
                    <td className="px-4 py-2.5">
                      <ChangeCell value={q.changePct} isPct />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-terminal-dim tabular-nums">
                      {formatVolume(q.volume)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-terminal-muted rounded-full overflow-hidden">
                          <div
                            className={clsx("h-full rounded-full", relVol >= 2 ? "bg-info" : relVol >= 1 ? "bg-terminal-accent" : "bg-terminal-dim")}
                            style={{ width: `${Math.min(relVol / 5 * 100, 100)}%` }}
                          />
                        </div>
                        <span className={clsx(
                          "font-mono text-xs tabular-nums",
                          relVol >= 3 ? "text-info font-bold" : relVol >= 1.5 ? "text-terminal-accent" : "text-terminal-dim"
                        )}>
                          ×{relVol.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-terminal-dim tabular-nums">
                      {formatVolume(capVol)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-bear">{q.week52Low > 0 ? formatCurrency(q.week52Low) : "—"}</span>
                        <div className="w-16 h-1 bg-terminal-muted rounded-full overflow-hidden">
                          <div className="h-full bg-terminal-accent rounded-full" style={{ width: `${week52Pct}%` }} />
                        </div>
                        <span className="text-xs font-mono text-bull">{q.week52High > 0 ? formatCurrency(q.week52High) : "—"}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

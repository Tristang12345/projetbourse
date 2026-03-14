/**
 * ============================================================
 * SCREEN 3 — MARKET ACTIVITY
 * Toggleable Table/Heatmap, region switcher US / CAC 40 / Global.
 * Metrics: Volume Relatif (vs avg30j), Capital Volume, Variation %.
 * ============================================================
 */

import React, { useState, useMemo, useEffect } from "react";
import { Grid3x3, Table2, ArrowUpDown, Volume2, Globe2, Flag } from "lucide-react";
import { useTerminalStore } from "../store/useTerminalStore";
import { useMarketRefresh } from "../hooks/useDataRefresh";
import {
  formatPercent, formatVolume, formatCurrency, colorClass,
} from "../utils/financialCalculations";
import {
  MARKET_UNIVERSE, CAC40_UNIVERSE,
  GLOBAL_UNIVERSE, getTickerMeta,
} from "../services/dataOrchestrator";
import { generateMockQuote } from "../services/mockDataService";
import { priceFreshness } from "../utils/marketHours";
import type { PivotQuote } from "../services/types";
import type { MarketRegion } from "../services/dataOrchestrator";

// ─── Region config ────────────────────────────────────────────

const REGIONS: { id: MarketRegion; label: string; flag: string; universe: string[] }[] = [
  { id: "US",     label: "S&P 500",  flag: "🇺🇸", universe: MARKET_UNIVERSE },
  { id: "FR",     label: "CAC 40",   flag: "🇫🇷", universe: CAC40_UNIVERSE  },
  { id: "GLOBAL", label: "Global",   flag: "🌐", universe: GLOBAL_UNIVERSE  },
];

// ─── Sector color map ─────────────────────────────────────────

const SECTOR_HUE: Record<string, string> = {
  Technology:    "hsl(210,80%,55%)",
  Finance:       "hsl(150,70%,42%)",
  Healthcare:    "hsl(340,70%,52%)",
  Consumer:      "hsl(35,85%,50%)",
  Energy:        "hsl(25,90%,52%)",
  Industrials:   "hsl(260,60%,60%)",
  Materials:     "hsl(80,65%,42%)",
  Utilities:     "hsl(190,70%,48%)",
  Communication: "hsl(170,65%,45%)",
  "Real Estate": "hsl(300,55%,55%)",
};

const sectorHue = (sector?: string) =>
  SECTOR_HUE[sector ?? ""] ?? "hsl(210,20%,50%)";

// ─── Heatmap Cell ─────────────────────────────────────────────

const HeatCell: React.FC<{
  quote:     PivotQuote;
  onClick:   () => void;
  isFocused: boolean;
}> = ({ quote, onClick, isFocused }) => {
  const meta      = getTickerMeta(quote.ticker);
  const pct       = quote.changePercent;
  const intensity = Math.min(Math.abs(pct) / 5, 1);

  // Color: green/red for positive/negative, muted for flat
  const bg = pct > 0
    ? `rgba(0, 230, 118, ${0.06 + intensity * 0.28})`
    : pct < 0
    ? `rgba(255, 23, 68,  ${0.06 + intensity * 0.28})`
    : "rgba(42, 51, 64, 0.4)";

  const volRatio = quote.avgVolume30d > 0
    ? quote.volume / quote.avgVolume30d
    : null;

  // Show sector color strip on left edge
  const stripColor = sectorHue(meta.sector);

  return (
    <div
      onClick={onClick}
      className={`relative rounded border cursor-pointer transition-all flex flex-col justify-between p-2.5 hover:brightness-125 overflow-hidden
        ${isFocused ? "ring-2 ring-terminal-accent border-terminal-accent/60" : "border-terminal-border"}`}
      style={{ background: bg, minHeight: 76 }}
    >
      {/* Left sector strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 opacity-60"
        style={{ background: stripColor }}
      />

      {/* Header row: nom complet + ticker */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex flex-col min-w-0">
          <span className="text-2xs font-mono font-bold text-terminal-text leading-tight truncate">
            {meta.name.length > 14 ? meta.name.slice(0, 13) + "…" : meta.name}
          </span>
          <span className="text-[9px] font-mono text-terminal-dim/60 leading-none mt-0.5">
            {quote.ticker.replace(/\.[A-Z]+$/, "")}
          </span>
        </div>
        {volRatio !== null && volRatio >= 2 && (
          <Volume2 size={9} className="text-warn shrink-0 mt-0.5" />
        )}
      </div>

      {/* Price + change */}
      {(() => {
        const freshness = priceFreshness(quote.timestamp, quote.exchange);
        const isStale   = freshness === "stale";
        const hasPrice  = freshness !== "none" && quote.price > 0;
        return (
          <div>
            <div className={`text-sm font-mono font-semibold leading-none ${colorClass(pct)}`}>
              {formatPercent(pct)}
            </div>
            <div className={`text-2xs font-mono mt-0.5 ${isStale ? "text-warn" : "text-terminal-dim"}`}>
              {hasPrice
                ? `${quote.price < 100 ? quote.price.toFixed(2) : quote.price.toFixed(0)}${meta.country !== "US" ? " €" : " $"}`
                : "N/A"}
              {isStale && " ⚠"}
            </div>
        {volRatio !== null && (
          <div className="text-2xs font-mono text-terminal-dim/60 mt-0.5">
            {volRatio.toFixed(1)}x vol
          </div>
        )}
      </div>
        );
      })()}
    </div>
  );
};

// ─── Table View ───────────────────────────────────────────────

const MarketTable: React.FC<{
  quotes:        PivotQuote[];
  focusedTicker: string | null;
  onFocus:       (t: string) => void;
}> = ({ quotes, focusedTicker, onFocus }) => {
  const [sortCol, setSortCol] = useState<string>("changePercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    return [...quotes].sort((a, b) => {
      const va = (a as any)[sortCol] ?? 0;
      const vb = (b as any)[sortCol] ?? 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [quotes, sortCol, sortDir]);

  const ColHdr = ({ col, label, right = false }: { col: string; label: string; right?: boolean }) => (
    <button
      onClick={() => sort(col)}
      className={`flex items-center gap-1 text-2xs font-mono tracking-widest uppercase hover:text-terminal-text transition-colors ${
        sortCol === col ? "text-terminal-accent" : "text-terminal-dim"
      } ${right ? "justify-end w-full" : ""}`}
    >
      {label} <ArrowUpDown size={9} />
    </button>
  );

  return (
    <div className="w-full">
      {/* Column headers */}
      <div className="grid grid-cols-9 px-4 py-2 border-b border-terminal-border bg-terminal-bg sticky top-0 z-10">
        <ColHdr col="ticker"        label="Ticker"   />
        <div className="col-span-2"><ColHdr col="name" label="Société" /></div>
        <ColHdr col="sector"        label="Secteur"  />
        <ColHdr col="price"         label="Prix"     />
        <ColHdr col="changePercent" label="Var%"     />
        <ColHdr col="volume"        label="Volume"   />
        <ColHdr col="avgVolume30d"  label="Moy.30j"  />
        <div className="text-right"><ColHdr col="marketCap" label="Cap." right /></div>
      </div>

      {sorted.map((q) => {
        const meta     = getTickerMeta(q.ticker);
        const volRatio = q.avgVolume30d > 0 ? q.volume / q.avgVolume30d : null;
        const isFocused = focusedTicker === q.ticker;
        const currency  = meta.country === "US" ? "$" : "€";

        return (
          <div
            key={q.ticker}
            onClick={() => onFocus(q.ticker)}
            className={`grid grid-cols-9 items-center px-4 py-2.5 border-b border-terminal-border/50 cursor-pointer transition-colors
              ${isFocused ? "bg-terminal-accent/5 border-l-2 border-l-terminal-accent" : "hover:bg-terminal-elevated"}`}
          >
            <div className="text-sm font-mono font-semibold text-terminal-text">{q.ticker}</div>
            <div className="col-span-2 text-xs text-terminal-dim truncate">{q.name || meta.name}</div>
            <div className="text-2xs font-mono text-terminal-dim truncate">{meta.sector}</div>
            <div className="text-sm font-mono">
              {currency}{q.price < 100 ? q.price.toFixed(2) : q.price.toFixed(0)}
            </div>
            <div className={`text-sm font-mono font-semibold ${colorClass(q.changePercent)}`}>
              {formatPercent(q.changePercent)}
            </div>
            <div className="text-xs font-mono text-terminal-dim">
              {formatVolume(q.volume)}
              {volRatio !== null && volRatio >= 2 && (
                <span className="ml-1 text-warn text-2xs font-semibold">{volRatio.toFixed(1)}x</span>
              )}
            </div>
            <div className="text-xs font-mono text-terminal-dim">{formatVolume(q.avgVolume30d)}</div>
            <div className="text-xs font-mono text-terminal-dim text-right">
              {q.marketCap ? formatCurrency(q.marketCap, "USD", true) : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Sector Legend ────────────────────────────────────────────

const SectorLegend: React.FC = () => (
  <div className="flex items-center gap-3 flex-wrap">
    {Object.entries(SECTOR_HUE).map(([sector, hue]) => (
      <div key={sector} className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-sm" style={{ background: hue }} />
        <span className="text-2xs font-mono text-terminal-dim">{sector}</span>
      </div>
    ))}
  </div>
);

// ─── Main Screen ──────────────────────────────────────────────

export const MarketActivity: React.FC = () => {
  const { quotes, setFocusedTicker, focusedTicker, isLoading } =
    useTerminalStore();

  const [view,   setView]   = useState<"table" | "heatmap">("heatmap");
  const [region, setRegion] = useState<MarketRegion>("US");

  // useMarketRefresh handles both initial fetch + interval refresh.
  // Passing `region` ensures it re-fetches when the user switches US / FR / Global.
  const { refresh: refreshMarket } = useMarketRefresh(region);

  const universe = REGIONS.find((r) => r.id === region)!.universe;

  // ── Garantie : toujours universe.length cellules ────────────────────────────
  // useMemo réactif sur quotes + region. Pour chaque ticker:
  //   1. Quote réelle dans le store → affiche données live
  //   2. Quote absente (AV rate-limit, mode dégradé) → mock déterministe
  // Le mock est seeded par le ticker → valeurs stables entre les renders.
  const marketQuotes = useMemo(
    () => universe.map((t) => quotes[t] ?? generateMockQuote(t)) as PivotQuote[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [universe, quotes],
  );

  const gainers   = marketQuotes.filter((q) => q.changePercent > 0).length;
  const losers    = marketQuotes.filter((q) => q.changePercent < 0).length;
  const unchanged = marketQuotes.length - gainers - losers;

  // Breadth ratio for mini-bar
  const total     = marketQuotes.length || 1;
  const gPct      = (gainers   / total * 100).toFixed(0);
  const lPct      = (losers    / total * 100).toFixed(0);

  const handleFocus = (ticker: string) =>
    setFocusedTicker(focusedTicker === ticker ? null : ticker);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-terminal-border bg-terminal-bg shrink-0 flex-wrap">

        {/* Region Selector */}
        <div className="flex items-center border border-terminal-border rounded overflow-hidden">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-mono border-r border-terminal-border last:border-0 transition-colors ${
                region === r.id
                  ? "bg-terminal-accent/15 text-terminal-accent"
                  : "text-terminal-dim hover:text-terminal-text"
              }`}
            >
              <span>{r.flag}</span> {r.label}
            </button>
          ))}
        </div>

        {/* Breadth bar */}
        <div className="flex items-center gap-2">
          <div className="flex h-2 w-28 rounded overflow-hidden">
            <div className="bg-up transition-all" style={{ width: `${gPct}%` }} />
            <div className="bg-terminal-muted" style={{ width: `${(unchanged / total * 100).toFixed(0)}%` }} />
            <div className="bg-down transition-all" style={{ width: `${lPct}%` }} />
          </div>
          <span className="text-2xs font-mono text-up">{gainers}▲</span>
          <span className="text-2xs font-mono text-terminal-dim">{unchanged}−</span>
          <span className="text-2xs font-mono text-down">{losers}▼</span>
        </div>

        {isLoading["market"] && (
          <span className="text-2xs font-mono text-terminal-accent animate-pulse">● LIVE</span>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center border border-terminal-border rounded overflow-hidden">
          <button
            onClick={() => setView("heatmap")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-mono transition-colors ${
              view === "heatmap" ? "bg-terminal-accent/15 text-terminal-accent" : "text-terminal-dim hover:text-terminal-text"
            }`}
          >
            <Grid3x3 size={11} /> HEATMAP
          </button>
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-mono border-l border-terminal-border transition-colors ${
              view === "table" ? "bg-terminal-accent/15 text-terminal-accent" : "text-terminal-dim hover:text-terminal-text"
            }`}
          >
            <Table2 size={11} /> TABLE
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === "heatmap" ? (
          <>
            {/* Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-1.5 mb-4">
              {marketQuotes.map((q) => (
                <HeatCell
                  key={q.ticker}
                  quote={q}
                  onClick={() => handleFocus(q.ticker)}
                  isFocused={focusedTicker === q.ticker}
                />
              ))}

              {/* Skeleton overlay — show pulse on cells that only have mock data */}
              {/* (marketQuotes is always full; mock cells have source: "mock") */}
            </div>

            {/* Sector legend */}
            {view === "heatmap" && <SectorLegend />}
          </>
        ) : (
          <MarketTable
            quotes={marketQuotes}
            focusedTicker={focusedTicker}
            onFocus={handleFocus}
          />
        )}
      </div>
    </div>
  );
};

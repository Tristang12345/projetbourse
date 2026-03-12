// ============================================================
// SCREEN 3 — MARKET ACTIVITY
// Table / Heatmap toggle — Relative volume, capital volume, change%
// ============================================================
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTerminalStore } from "@/store";
import { getApiService } from "@/services/apiService";
import { formatCurrency, formatPct, formatVolume, formatCompact } from "@/lib/financialCalc";
import { Heatmap } from "@/components/Heatmap";
import type { QuoteSnapshot } from "@/types";

export function MarketScreen() {
  const { market, setMarketQuotes, setMarketViewMode, setFocusTicker, settings } = useTerminalStore();
  const [newTicker, setNewTicker] = useState("");
  const api = getApiService();

  const fetchMarket = async () => {
    const quotes = await api.fetchQuotes(market.watchlist);
    setMarketQuotes(quotes);
  };

  useEffect(() => {
    fetchMarket();
    const interval = setInterval(fetchMarket, settings.refreshIntervalFast);
    return () => clearInterval(interval);
  }, [market.watchlist.length]);

  const quotes = market.watchlist
    .map((t) => market.quotes[t])
    .filter((q): q is QuoteSnapshot => !!q);

  const sortedByAbsChange = [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-terminal-border bg-terminal-surface/80">
        <div className="flex border border-terminal-border rounded overflow-hidden">
          {(["table", "heatmap"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setMarketViewMode(mode)}
              className={clsx("px-3 py-1 text-2xs font-mono uppercase tracking-wider transition-colors", {
                "bg-brand-blue/20 text-brand-blue": market.viewMode === mode,
                "text-gray-500 hover:text-white": market.viewMode !== mode,
              })}
            >
              {mode === "table" ? "⊞ TABLE" : "⬛ HEATMAP"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <input
            type="text" placeholder="ADD TICKER"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTicker.trim()) {
                useTerminalStore.getState().addToWatchlist(newTicker.trim());
                setNewTicker("");
              }
            }}
            className="bg-terminal-bg border border-terminal-border text-white placeholder-gray-600 font-mono text-xs px-3 py-1.5 rounded w-32 focus:border-brand-blue focus:outline-none uppercase"
          />
          <span className="text-2xs text-gray-500 font-mono">{quotes.length} symbols</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {market.viewMode === "heatmap" ? (
          <Heatmap quotes={quotes} />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-bg border-b border-terminal-border z-10">
              <tr>
                {["SYMBOL", "PRICE", "CHANGE", "CHG%", "VOLUME", "REL VOL", "CAP VOL", "HIGH", "LOW", "ACTION"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-2xs font-mono font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedByAbsChange.map((q) => {
                const relVol = q.avgVolume30d > 0 ? q.volume / q.avgVolume30d : 0;
                const capitalVol = q.volume * q.price;
                const isHot = relVol > 2;
                return (
                  <tr
                    key={q.ticker}
                    className="border-b border-terminal-border/30 hover:bg-terminal-hover cursor-pointer transition-colors"
                    onClick={() => setFocusTicker(q.ticker, "market")}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono font-bold text-white">{q.ticker}</span>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-white font-semibold">
                      {formatCurrency(q.price)}
                    </td>
                    <td className={clsx("px-3 py-2 font-mono tabular-nums font-semibold", q.change >= 0 ? "text-pos" : "text-neg")}>
                      {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}
                    </td>
                    <td className={clsx("px-3 py-2 font-mono tabular-nums font-bold", q.changePct >= 0 ? "text-pos" : "text-neg")}>
                      {formatPct(q.changePct)}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-gray-300">
                      {formatVolume(q.volume)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={clsx("font-mono tabular-nums font-semibold text-xs px-2 py-0.5 rounded", {
                        "text-neg bg-neg-muted": relVol > 3,
                        "text-brand-amber bg-brand-amber/10": relVol > 2 && relVol <= 3,
                        "text-gray-400": relVol <= 2,
                      })}>
                        {isHot ? "🔥 " : ""}{relVol.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-gray-400">
                      ${formatCompact(capitalVol)}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-gray-400">
                      {formatCurrency(q.high)}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-gray-400">
                      {formatCurrency(q.low)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); useTerminalStore.getState().removeFromWatchlist(q.ticker); }}
                        className="text-gray-600 hover:text-neg text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

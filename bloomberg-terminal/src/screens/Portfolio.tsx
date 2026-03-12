// ============================================================
// SCREEN 1 — PORTFOLIO P&L
// Live positions with unrealized P&L, sparklines, sector breakdown
// ============================================================
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTerminalStore, selectPositionsWithPL } from "@/store";
import { getApiService } from "@/services/apiService";
import { formatCurrency, formatPct, formatCompact } from "@/lib/financialCalc";
import { Sparkline } from "@/components/Sparkline";
import type { PositionWithPL } from "@/types";

const SECTOR_COLORS: Record<string, string> = {
  Technology: "#00AAFF", Financials: "#9966FF", Healthcare: "#00E5FF",
  Energy: "#FFB800", Consumer: "#00FF88", Materials: "#FF8C00",
  Utilities: "#FF6B6B", Industrials: "#A8E6CF",
};

export function PortfolioScreen() {
  const store = useTerminalStore();
  const positions = selectPositionsWithPL(store);
  const { portfolio, updateQuotes, updateSparks, settings, setFocusTicker } = store;
  const [sortKey, setSortKey] = useState<keyof PositionWithPL>("unrealizedPLPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newPos, setNewPos] = useState({ ticker: "", name: "", sector: "Technology", quantity: "", avgCost: "" });

  const api = getApiService({
    finnhub: settings.apiKeys.finnhub,
    polygon: settings.apiKeys.polygon,
    av: settings.apiKeys.alphavantage,
  });

  // Fetch quotes on mount + interval
  const fetchData = async () => {
    const tickers = portfolio.positions.map((p) => p.ticker);
    if (!tickers.length) return;
    const quotes = await api.fetchQuotes(tickers);
    updateQuotes(quotes);
    // Fetch sparks for all tickers
    const sparksMap: Record<string, { time: number; value: number }[]> = {};
    for (const ticker of tickers) {
      sparksMap[ticker] = await api.fetchSparks(ticker);
    }
    updateSparks(sparksMap);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, settings.refreshIntervalFast);
    return () => clearInterval(interval);
  }, [portfolio.positions.length, settings.refreshIntervalFast]);

  const sorted = [...positions].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === "desc" ? (bv ?? 0) - (av ?? 0) : (av ?? 0) - (bv ?? 0);
  });

  const summary = portfolio.summary;

  function toggleSort(key: keyof PositionWithPL) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const TH = ({ label, field }: { label: string; field: keyof PositionWithPL }) => (
    <th
      className="px-3 py-2 text-left text-2xs font-mono font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="flex flex-col h-full gap-3 p-3">
      {/* Summary Header */}
      {summary && (
        <div className="grid grid-cols-6 gap-2">
          {[
            { label: "PORTFOLIO VALUE", value: formatCurrency(summary.totalValue), sub: null },
            { label: "TOTAL P&L", value: formatCurrency(summary.totalPL), sub: formatPct(summary.totalPLPct), isChange: true, val: summary.totalPL },
            { label: "DAY P&L", value: formatCurrency(summary.dayPL), sub: formatPct(summary.dayPLPct), isChange: true, val: summary.dayPL },
            { label: "COST BASIS", value: formatCurrency(summary.totalCost), sub: null },
            { label: "TOP GAINER", value: summary.topGainer, sub: positions.find(p => p.ticker === summary.topGainer) ? formatPct(positions.find(p => p.ticker === summary.topGainer)!.unrealizedPLPct) : null, isChange: true, val: 1 },
            { label: "TOP LOSER", value: summary.topLoser, sub: positions.find(p => p.ticker === summary.topLoser) ? formatPct(positions.find(p => p.ticker === summary.topLoser)!.unrealizedPLPct) : null, isChange: true, val: -1 },
          ].map((item) => (
            <div key={item.label} className="bg-terminal-surface border border-terminal-border rounded-sm p-3">
              <div className="text-2xs font-mono text-gray-500 uppercase tracking-widest mb-1">{item.label}</div>
              <div className={clsx("font-mono font-bold text-sm", item.isChange && item.val !== undefined
                ? item.val > 0 ? "text-pos" : item.val < 0 ? "text-neg" : "text-white"
                : "text-white"
              )}>
                {item.value}
              </div>
              {item.sub && (
                <div className={clsx("text-2xs font-mono", item.val !== undefined
                  ? item.val > 0 ? "text-pos-dim" : "text-neg-dim"
                  : "text-gray-400"
                )}>
                  {item.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Main table */}
        <div className="flex-1 bg-terminal-surface border border-terminal-border rounded-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border">
            <span className="text-2xs font-mono font-semibold text-gray-500 uppercase tracking-widest">
              POSITIONS ({positions.length})
            </span>
            <button
              onClick={() => setIsAddOpen(true)}
              className="text-2xs font-mono text-brand-blue hover:text-white px-2 py-1 border border-brand-blue/30 rounded hover:border-brand-blue transition-colors"
            >
              + ADD POSITION
            </button>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-terminal-surface border-b border-terminal-border z-10">
                <tr>
                  <TH label="TICKER" field="ticker" />
                  <th className="px-3 py-2 text-left text-2xs font-mono font-semibold text-gray-500 uppercase tracking-wider">SECTOR</th>
                  <TH label="QTY" field="quantity" />
                  <TH label="AVG COST" field="avgCost" />
                  <TH label="PRICE" field="currentValue" />
                  <TH label="VALUE" field="currentValue" />
                  <TH label="DAY P&L" field="dayPL" />
                  <TH label="TOTAL P&L" field="unrealizedPL" />
                  <TH label="P&L %" field="unrealizedPLPct" />
                  <TH label="WEIGHT" field="weight" />
                  <th className="px-3 py-2 text-left text-2xs font-mono font-semibold text-gray-500 uppercase tracking-wider">TREND</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((pos) => {
                  const sparks = portfolio.sparks[pos.ticker];
                  const isPos = pos.unrealizedPL >= 0;
                  return (
                    <tr
                      key={pos.id}
                      className="border-b border-terminal-border/50 hover:bg-terminal-hover cursor-pointer transition-colors"
                      onClick={() => setFocusTicker(pos.ticker, "portfolio")}
                    >
                      <td className="px-3 py-2">
                        <div className="font-mono font-bold text-white">{pos.ticker}</div>
                        <div className="text-2xs text-gray-500 truncate max-w-24">{pos.name}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-2xs font-mono px-1.5 py-0.5 rounded" style={{
                          backgroundColor: `${SECTOR_COLORS[pos.sector] ?? "#888"}22`,
                          color: SECTOR_COLORS[pos.sector] ?? "#888",
                          border: `1px solid ${SECTOR_COLORS[pos.sector] ?? "#888"}44`,
                        }}>
                          {pos.sector}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-300 tabular-nums">{pos.quantity}</td>
                      <td className="px-3 py-2 font-mono text-gray-400 tabular-nums">{formatCurrency(pos.avgCost)}</td>
                      <td className="px-3 py-2 font-mono text-white tabular-nums font-semibold">
                        {pos.quote ? formatCurrency(pos.quote.price) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-300 tabular-nums">{formatCurrency(pos.currentValue)}</td>
                      <td className={clsx("px-3 py-2 font-mono tabular-nums font-semibold", pos.dayPL >= 0 ? "text-pos" : "text-neg")}>
                        {pos.dayPL >= 0 ? "+" : ""}{formatCurrency(pos.dayPL)}
                      </td>
                      <td className={clsx("px-3 py-2 font-mono tabular-nums font-semibold", isPos ? "text-pos" : "text-neg")}>
                        {isPos ? "+" : ""}{formatCurrency(pos.unrealizedPL)}
                      </td>
                      <td className={clsx("px-3 py-2 font-mono tabular-nums font-bold", isPos ? "text-pos" : "text-neg")}>
                        {formatPct(pos.unrealizedPLPct)}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-400 tabular-nums">{pos.weight.toFixed(1)}%</td>
                      <td className="px-3 py-2">
                        {sparks && <Sparkline data={sparks} positive={pos.dayPL >= 0} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sector breakdown */}
        {summary && (
          <div className="w-48 bg-terminal-surface border border-terminal-border rounded-sm p-3">
            <div className="text-2xs font-mono font-semibold text-gray-500 uppercase tracking-widest mb-3">SECTORS</div>
            {Object.entries(summary.sectorBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([sector, value]) => {
                const pct = (value / summary.totalValue) * 100;
                return (
                  <div key={sector} className="mb-3">
                    <div className="flex justify-between text-2xs font-mono mb-1">
                      <span className="text-gray-400">{sector}</span>
                      <span className="text-gray-300">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 bg-terminal-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: SECTOR_COLORS[sector] ?? "#888" }}
                      />
                    </div>
                    <div className="text-2xs font-mono text-gray-500 mt-0.5">{formatCompact(value)}</div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Add Position Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-terminal-surface border border-terminal-border rounded p-6 w-96">
            <h3 className="text-sm font-mono font-bold text-white mb-4 uppercase tracking-wider">Add Position</h3>
            <div className="space-y-3">
              {[
                { label: "Ticker", key: "ticker", type: "text", placeholder: "AAPL" },
                { label: "Company Name", key: "name", type: "text", placeholder: "Apple Inc." },
                { label: "Quantity", key: "quantity", type: "number", placeholder: "100" },
                { label: "Avg Cost (PRU)", key: "avgCost", type: "number", placeholder: "150.00" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-2xs font-mono text-gray-500 uppercase mb-1">{label}</label>
                  <input
                    type={type} placeholder={placeholder}
                    value={newPos[key as keyof typeof newPos]}
                    onChange={(e) => setNewPos((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:border-brand-blue focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-2xs font-mono text-gray-500 uppercase mb-1">Sector</label>
                <select
                  value={newPos.sector}
                  onChange={(e) => setNewPos((p) => ({ ...p, sector: e.target.value }))}
                  className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-xs font-mono text-white focus:border-brand-blue focus:outline-none"
                >
                  {["Technology","Financials","Healthcare","Energy","Consumer","Materials","Utilities","Industrials"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  if (newPos.ticker && newPos.quantity && newPos.avgCost) {
                    store.addPosition({
                      ticker: newPos.ticker.toUpperCase(), name: newPos.name || newPos.ticker,
                      sector: newPos.sector, quantity: Number(newPos.quantity),
                      avgCost: Number(newPos.avgCost), addedAt: new Date().toISOString(),
                    });
                    setIsAddOpen(false);
                    setNewPos({ ticker: "", name: "", sector: "Technology", quantity: "", avgCost: "" });
                  }
                }}
                className="flex-1 bg-brand-blue/20 border border-brand-blue text-brand-blue font-mono text-xs py-2 rounded hover:bg-brand-blue/30 transition-colors"
              >
                ADD POSITION
              </button>
              <button
                onClick={() => setIsAddOpen(false)}
                className="flex-1 bg-terminal-bg border border-terminal-border text-gray-400 font-mono text-xs py-2 rounded hover:border-gray-500 transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

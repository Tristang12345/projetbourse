// ============================================================
// SCREEN 5 — MATHEMATICAL SCREENER
// RSI, SMA crossovers, volume breakouts — auto-scored signals
// ============================================================
import { useEffect } from "react";
import clsx from "clsx";
import { useTerminalStore } from "@/store";
import { getApiService } from "@/services/apiService";
import { computeTechnicalSignal, formatPct, formatVolume } from "@/lib/financialCalc";
import type { SignalFlag, TechnicalSignal } from "@/types";

const SIGNAL_META: Record<SignalFlag, { label: string; color: string; desc: string }> = {
  RSI_OVERSOLD:    { label: "RSI<30", color: "text-pos bg-pos-muted border-pos/30", desc: "Oversold — potential bounce" },
  RSI_OVERBOUGHT:  { label: "RSI>70", color: "text-neg bg-neg-muted border-neg/30", desc: "Overbought — potential pullback" },
  GOLDEN_CROSS:    { label: "GOLDEN ✕", color: "text-brand-amber bg-brand-amber/10 border-brand-amber/30", desc: "SMA50 crossed above SMA200" },
  DEATH_CROSS:     { label: "DEATH ✕", color: "text-neg bg-neg-muted border-neg/20", desc: "SMA50 crossed below SMA200" },
  VOLUME_BREAKOUT: { label: "VOL BREAK", color: "text-brand-blue bg-brand-blue/10 border-brand-blue/30", desc: "Volume 2× above 30d average" },
  ABOVE_SMA50:     { label: "▲ SMA50", color: "text-pos bg-pos-muted border-pos/20", desc: "Price above 50-day MA" },
  BELOW_SMA50:     { label: "▼ SMA50", color: "text-gray-400 bg-white/5 border-white/10", desc: "Price below 50-day MA" },
  NEAR_52W_HIGH:   { label: "52W HIGH", color: "text-brand-purple bg-brand-purple/10 border-brand-purple/30", desc: "Within 3% of 52-week high" },
  NEAR_52W_LOW:    { label: "52W LOW", color: "text-gray-500 bg-white/5 border-white/10", desc: "Within 3% of 52-week low" },
};

const UNIVERSE = [
  "AAPL","MSFT","NVDA","TSLA","AMZN","META","GOOGL","JPM","XOM","UNH",
  "JNJ","V","MA","BAC","WMT","HD","INTC","AMD","CRM","NFLX","DIS","PG",
];

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-terminal-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${score}%`,
            backgroundColor: score >= 70 ? "#00FF88" : score >= 40 ? "#FFB800" : "#FF3355",
          }}
        />
      </div>
      <span className={clsx("font-mono font-bold text-xs tabular-nums w-8", {
        "text-pos": score >= 70, "text-brand-amber": score >= 40 && score < 70, "text-neg": score < 40,
      })}>
        {score}
      </span>
    </div>
  );
}

export function ScreenerScreen() {
  const { screener, setScreenerSignals, toggleScreenerFilter, settings } = useTerminalStore();
  const api = getApiService();

  useEffect(() => {
    const load = async () => {
      const signals: TechnicalSignal[] = [];
      for (const ticker of UNIVERSE) {
        try {
          const candles = await api.fetchCandles(ticker, 200);
          const signal = computeTechnicalSignal(ticker, candles);
          // Compute real score
          const bull = ["RSI_OVERSOLD","GOLDEN_CROSS","VOLUME_BREAKOUT","ABOVE_SMA50","NEAR_52W_HIGH"];
          signal.score = Math.round((signal.signals.filter((s) => bull.includes(s)).length / bull.length) * 100);
          signals.push(signal);
        } catch { /* skip failed tickers */ }
      }
      setScreenerSignals(signals.sort((a, b) => b.score - a.score));
    };
    load();
    const interval = setInterval(load, settings.refreshIntervalSlow);
    return () => clearInterval(interval);
  }, []);

  const filtered = screener.signals.filter((s) => {
    if (screener.filterRSIOversold && !s.signals.includes("RSI_OVERSOLD")) return false;
    if (screener.filterRSIOverbought && !s.signals.includes("RSI_OVERBOUGHT")) return false;
    if (screener.filterGoldenCross && !s.signals.includes("GOLDEN_CROSS")) return false;
    if (screener.filterVolumeBreakout && !s.signals.includes("VOLUME_BREAKOUT")) return false;
    return true;
  });

  return (
    <div className="flex h-full">
      {/* Filters sidebar */}
      <div className="w-52 border-r border-terminal-border p-3 bg-terminal-surface/50">
        <div className="text-2xs font-mono font-semibold text-gray-500 uppercase tracking-widest mb-3">FILTERS</div>
        {([
          { key: "filterRSIOversold", label: "RSI Oversold (<30)", icon: "📉" },
          { key: "filterRSIOverbought", label: "RSI Overbought (>70)", icon: "📈" },
          { key: "filterGoldenCross", label: "Golden Cross", icon: "✨" },
          { key: "filterVolumeBreakout", label: "Volume Breakout (2×)", icon: "🔥" },
        ] as { key: "filterRSIOversold"|"filterRSIOverbought"|"filterGoldenCross"|"filterVolumeBreakout"; label: string; icon: string }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => toggleScreenerFilter(key)}
            className={clsx("flex items-center gap-2 w-full text-left px-2 py-2 rounded text-xs font-mono mb-1.5 transition-colors border", {
              "bg-brand-blue/10 text-brand-blue border-brand-blue/30": screener[key],
              "text-gray-400 border-transparent hover:text-white hover:bg-white/5": !screener[key],
            })}
          >
            <span>{icon}</span>
            <span className="leading-tight">{label}</span>
            {screener[key] && <span className="ml-auto text-brand-blue">✓</span>}
          </button>
        ))}

        <div className="mt-4 pt-4 border-t border-terminal-border">
          <div className="text-2xs font-mono text-gray-500 mb-2">RESULTS</div>
          <div className="font-mono text-2xl font-bold text-white">{filtered.length}</div>
          <div className="text-2xs font-mono text-gray-500">of {screener.signals.length} scanned</div>
        </div>

        <div className="mt-4 pt-4 border-t border-terminal-border">
          <div className="text-2xs font-mono text-gray-500 mb-2">TOP SIGNAL</div>
          {screener.signals[0] && (
            <div>
              <div className="font-mono font-bold text-brand-amber text-sm">{screener.signals[0].ticker}</div>
              <ScoreBar score={screener.signals[0].score} />
            </div>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto">
        {screener.signals.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">⟳</div>
              <div>Scanning {UNIVERSE.length} symbols…</div>
            </div>
          </div>
        )}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-terminal-bg border-b border-terminal-border z-10">
            <tr>
              {["RANK", "TICKER", "PRICE", "RSI(14)", "SMA(50)", "SMA(200)", "REL VOL", "SIGNALS", "SCORE"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-2xs font-mono font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((sig, idx) => {
              const rsiColor = sig.rsi14 < 30 ? "text-pos" : sig.rsi14 > 70 ? "text-neg" : "text-gray-300";
              const crossColor = sig.signals.includes("GOLDEN_CROSS") ? "text-brand-amber" : sig.signals.includes("DEATH_CROSS") ? "text-neg" : "text-gray-400";
              return (
                <tr
                  key={sig.ticker}
                  className="border-b border-terminal-border/30 hover:bg-terminal-hover transition-colors cursor-pointer"
                  onClick={() => useTerminalStore.getState().setFocusTicker(sig.ticker, "screener")}
                >
                  <td className="px-3 py-2.5 font-mono text-gray-600 tabular-nums">
                    {idx === 0 ? <span className="text-brand-amber">①</span> :
                     idx === 1 ? <span className="text-gray-400">②</span> :
                     idx === 2 ? <span className="text-gray-600">③</span> : idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-mono font-bold text-white">{sig.ticker}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-gray-300">${sig.currentPrice.toFixed(2)}</td>
                  <td className={clsx("px-3 py-2.5 font-mono tabular-nums font-semibold", rsiColor)}>
                    {sig.rsi14.toFixed(1)}
                  </td>
                  <td className={clsx("px-3 py-2.5 font-mono tabular-nums", crossColor)}>
                    ${sig.sma50.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-gray-400">
                    ${sig.sma200.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    <span className={clsx("font-semibold", sig.avgVolume > 0 && sig.currentVolume / sig.avgVolume > 2 ? "text-brand-blue" : "text-gray-500")}>
                      {sig.avgVolume > 0 ? `${(sig.currentVolume / sig.avgVolume).toFixed(2)}x` : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {sig.signals.slice(0, 4).map((flag) => {
                        const meta = SIGNAL_META[flag];
                        return (
                          <span key={flag} className={clsx("text-2xs font-mono px-1.5 py-0.5 rounded border", meta.color)}>
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 w-36">
                    <ScoreBar score={sig.score} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

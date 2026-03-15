/**
 * ============================================================
 * SCREEN 5 — SCREENER MATHÉMATIQUE
 * ✅ Point 2  : MACD signal affiché sur les cartes (vrai histogramme)
 * ✅ Point 8  : Focus Mode — met en avant la fiche du ticker focalisé
 * ============================================================
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Zap, RefreshCw, Search, TrendingUp, TrendingDown,
  Volume2, ArrowLeftRight, Filter, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { useTerminalStore }   from "../store/useTerminalStore";
import { useScreenerRefresh } from "../hooks/useDataRefresh";
import {
  MARKET_UNIVERSE, CAC40_UNIVERSE, GLOBAL_UNIVERSE, getTickerMeta,
} from "../services/dataOrchestrator";
import {
  formatPercent, colorClass, rsiColorClass, formatPrice, currencySymbol,
} from "../utils/financialCalculations";
import type { PivotScreenerSignal, SignalType } from "../services/types";

type UniversePreset = "US" | "FR" | "GLOBAL" | "PORTFOLIO" | "CUSTOM";

const SIGNAL_META: Record<SignalType, {
  label: string; labelFR: string;
  icon: React.FC<{ size?: number; className?: string }>;
  color: string; bg: string;
}> = {
  RSI_OVERSOLD:    { label: "RSI Oversold",   labelFR: "RSI Survendu",   icon: TrendingUp,     color: "text-up",              bg: "bg-up/10 border-up/30" },
  RSI_OVERBOUGHT:  { label: "RSI Overbought", labelFR: "RSI Suracheté",  icon: TrendingDown,   color: "text-down",            bg: "bg-down/10 border-down/30" },
  GOLDEN_CROSS:    { label: "Golden Cross",   labelFR: "Croix Dorée",    icon: Zap,            color: "text-warn",            bg: "bg-warn/10 border-warn/30" },
  DEATH_CROSS:     { label: "Death Cross",    labelFR: "Croix de Mort",  icon: Zap,            color: "text-down",            bg: "bg-down/10 border-down/30" },
  VOLUME_BREAKOUT: { label: "Vol. Breakout",  labelFR: "Breakout Vol.",  icon: Volume2,        color: "text-terminal-accent", bg: "bg-terminal-accent/10 border-terminal-accent/30" },
  PRICE_BREAKOUT:  { label: "MACD Cross",     labelFR: "Signal MACD",    icon: ArrowLeftRight, color: "text-warn",            bg: "bg-warn/10 border-warn/30" },
};

const STRENGTH_ORDER = { strong: 0, moderate: 1, weak: 2 } as const;
const STRENGTH_STYLE: Record<string, string> = {
  strong:   "text-up   border-up/40   bg-up/5",
  moderate: "text-warn border-warn/40 bg-warn/5",
  weak:     "text-terminal-dim border-terminal-border bg-terminal-surface",
};
const EXCHANGE_BADGE: Record<string, string> = {
  EURONEXT: "bg-blue-900/40  text-blue-300  border-blue-700/40",
  NASDAQ:   "bg-purple-900/40 text-purple-300 border-purple-700/40",
  NYSE:     "bg-green-900/40  text-green-300  border-green-700/40",
  XETRA:    "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  LSE:      "bg-red-900/40    text-red-300    border-red-700/40",
};

const UNIVERSE_PRESETS: { id: UniversePreset; label: string; flag: string; tickers: string[] }[] = [
  { id: "US",        label: "S&P 20",    flag: "🇺🇸", tickers: MARKET_UNIVERSE },
  { id: "FR",        label: "CAC 40",    flag: "🇫🇷", tickers: CAC40_UNIVERSE  },
  { id: "GLOBAL",    label: "Global",    flag: "🌐",  tickers: GLOBAL_UNIVERSE.slice(0, 40) },
  { id: "PORTFOLIO", label: "Portfolio", flag: "💼",  tickers: [] },
];

// ─── Progress Bar ─────────────────────────────────────────────

const ProgressBar: React.FC<{ completed: number; total: number; current: string }> = ({ completed, total, current }) => {
  if (!total) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-terminal-elevated border-b border-terminal-border">
      <div className="flex-1 h-1 bg-terminal-muted rounded-full overflow-hidden">
        <div className="h-full bg-terminal-accent rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs font-mono text-terminal-accent w-10 text-right">{pct}%</span>
      <span className="text-2xs font-mono text-terminal-dim truncate max-w-[120px]">{current}</span>
      <span className="text-2xs font-mono text-terminal-dim">{completed}/{total}</span>
    </div>
  );
};

// ─── Stats Panel ──────────────────────────────────────────────

const StatsPanel: React.FC<{ signals: PivotScreenerSignal[] }> = ({ signals }) => {
  if (!signals.length) return null;
  const bullish  = signals.filter((s) => s.signal === "RSI_OVERSOLD" || s.signal === "GOLDEN_CROSS").length;
  const strong   = signals.filter((s) => s.strength === "strong").length;
  const moderate = signals.filter((s) => s.strength === "moderate").length;
  const weak     = signals.filter((s) => s.strength === "weak").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-terminal-border border-b border-terminal-border shrink-0">
      {[
        { label: "Signaux",   val: signals.length, sub: `${strong} forts  ${moderate} moy  ${weak} faibles`, color: "text-terminal-text" },
        { label: "Haussiers", val: bullish,         sub: "Survendu · Golden Cross", color: "text-up"   },
        { label: "Baissiers", val: signals.length - bullish, sub: "Suracheté · Death Cross", color: "text-down" },
        { label: "Forts",     val: strong,          sub: `${moderate + weak} autres`, color: "text-warn" },
      ].map(({ label, val, sub, color }) => (
        <div key={label} className="bg-terminal-surface px-4 py-2">
          <div className="text-2xs font-mono text-terminal-dim tracking-widest uppercase">{label}</div>
          <div className={`text-lg font-mono font-bold ${color}`}>{val}</div>
          <div className="text-2xs font-mono text-terminal-dim/50 mt-0.5">{sub}</div>
        </div>
      ))}
    </div>
  );
};

// ─── Signal Card ──────────────────────────────────────────────

const SignalCard: React.FC<{
  signal: PivotScreenerSignal; onFocus: (t: string) => void; isFocused: boolean;
}> = ({ signal, onFocus, isFocused }) => {
  const meta         = SIGNAL_META[signal.signal];
  const Icon         = meta.icon;
  const rsi          = signal.indicators.rsi14;
  const exchKey      = signal.exchange ?? "NYSE";
  const displayTicker = signal.ticker.replace(/\.[A-Z]+$/, "");
  const isEU         = signal.currency === "EUR" || signal.currency === "GBP";

  return (
    <div
      onClick={() => onFocus(signal.ticker)}
      className={`border rounded-md p-3.5 cursor-pointer transition-all hover:border-terminal-muted flex flex-col gap-2.5
        ${isFocused
          ? "ring-2 ring-terminal-accent bg-terminal-accent/5 border-terminal-accent/40 scale-[1.01]"
          : "border-terminal-border bg-terminal-elevated"
        }`}
    >
      {/* Row 1: Signal + strength */}
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 text-2xs font-mono border px-2 py-1 rounded-sm shrink-0 ${meta.bg}`}>
          <Icon size={9} className={meta.color} />
          <span className={meta.color}>{meta.labelFR}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-2xs font-mono border px-1.5 py-0.5 rounded-sm ${EXCHANGE_BADGE[exchKey] ?? EXCHANGE_BADGE["NYSE"]}`}>
            {exchKey === "EURONEXT" ? "EPA" : exchKey}
          </span>
          <span className={`text-2xs font-mono border px-1.5 py-0.5 rounded-sm ${STRENGTH_STYLE[signal.strength]}`}>
            {signal.strength === "strong" ? "FORT" : signal.strength === "moderate" ? "MOY" : "FAIBLE"}
          </span>
        </div>
      </div>

      {/* Row 2: Ticker + Price */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-mono font-bold text-terminal-text leading-none">{displayTicker}</span>
            {isEU && (
              <span className="text-2xs font-mono text-terminal-dim bg-terminal-surface border border-terminal-border px-1 rounded">
                {signal.currency}
              </span>
            )}
          </div>
          <div className="text-2xs text-terminal-dim truncate max-w-[150px] mt-0.5">{signal.name}</div>
          {signal.sector && <div className="text-2xs text-terminal-dim/60 mt-0.5">{signal.sector}</div>}
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-sm font-mono font-semibold text-terminal-text">
            {formatPrice(signal.price, signal.currency)}
          </div>
          <div className={`text-xs font-mono ${colorClass(signal.changePercent)}`}>
            {formatPercent(signal.changePercent)}
          </div>
        </div>
      </div>

      {/* Row 3: Indicateurs */}
      <div className="bg-terminal-surface/50 rounded px-2.5 py-2 space-y-1.5">
        <p className="text-2xs font-mono text-terminal-dim leading-relaxed">{signal.details}</p>

        {/* RSI gauge */}
        {rsi !== null && (
          <div className="flex items-center gap-2">
            <span className="text-2xs font-mono text-terminal-dim w-12">RSI(14)</span>
            <div className="flex-1 h-1 bg-terminal-muted rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 left-[30%] w-px bg-terminal-border/60" />
              <div className="absolute top-0 bottom-0 left-[70%] w-px bg-terminal-border/60" />
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(Math.max(rsi, 0), 100)}%`,
                  background: rsi <= 30 ? "#00e676" : rsi >= 70 ? "#ff1744" : "#1a9fff",
                }}
              />
            </div>
            <span className={`text-2xs font-mono font-semibold w-8 text-right ${rsiColorClass(rsi)}`}>
              {rsi.toFixed(1)}
            </span>
          </div>
        )}

        {/* MACD histogramme (point 2 corrigé) */}
        {signal.indicators.macdHistogram !== null && signal.indicators.macdHistogram !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-2xs font-mono text-terminal-dim w-12">MACD</span>
            <span className={`text-2xs font-mono font-semibold ${
              signal.indicators.macdHistogram >= 0 ? "text-up" : "text-down"
            }`}>
              {signal.indicators.macdHistogram >= 0 ? "+" : ""}
              {signal.indicators.macdHistogram.toFixed(3)}
            </span>
            <span className="text-2xs font-mono text-terminal-dim/60">
              ({signal.indicators.macdHistogram >= 0 ? "haussier" : "baissier"})
            </span>
          </div>
        )}

        {/* MA levels */}
        {signal.indicators.sma50 != null && signal.indicators.sma200 != null && (
          <div className="flex items-center gap-3">
            <span className="text-2xs font-mono text-terminal-dim">
              SMA50 <span className="text-terminal-text">
                {currencySymbol(signal.currency)}{signal.indicators.sma50.toFixed(2)}
              </span>
            </span>
            <span className="text-2xs font-mono text-terminal-dim">
              SMA200 <span className="text-terminal-text">
                {currencySymbol(signal.currency)}{signal.indicators.sma200.toFixed(2)}
              </span>
            </span>
          </div>
        )}

        {/* Volume ratio */}
        {signal.indicators.volumeRatio != null && (
          <div className="flex items-center gap-2">
            <span className="text-2xs font-mono text-terminal-dim">Vol/avg</span>
            <div className="flex-1 h-1 bg-terminal-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(signal.indicators.volumeRatio * 33, 100)}%`,
                  background: signal.indicators.volumeRatio >= 2 ? "#1a9fff" : "#2a3340",
                }}
              />
            </div>
            <span className={`text-2xs font-mono font-semibold w-8 text-right
              ${signal.indicators.volumeRatio >= 2 ? "text-terminal-accent" : "text-terminal-dim"}`}>
              {signal.indicators.volumeRatio.toFixed(1)}x
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Ticker Chip ──────────────────────────────────────────────

const TickerChip: React.FC<{ ticker: string; onRemove: () => void; isEU: boolean }> = ({ ticker, onRemove, isEU }) => (
  <button
    onClick={onRemove}
    className={`flex items-center gap-1 text-2xs font-mono border px-2 py-0.5 rounded-sm transition-colors group
      ${isEU
        ? "text-blue-300 border-blue-700/40 hover:border-down/40 hover:text-down"
        : "text-terminal-dim border-terminal-border hover:border-down/40 hover:text-down"}`}
  >
    {ticker.replace(/\.[A-Z]+$/, "")}
    <X size={8} className="opacity-50 group-hover:opacity-100" />
  </button>
);

// ─── Main Screen ──────────────────────────────────────────────

export const Screener: React.FC = () => {
  const {
    screenerSignals, setFocusedTicker, focusedTicker, isLoading, positions,
  } = useTerminalStore();

  const [preset,        setPreset]        = useState<UniversePreset>("US");
  const [universe,      setUniverse]      = useState<string[]>(MARKET_UNIVERSE);
  const [customInput,   setCustomInput]   = useState("");
  const [filterSignal,  setFilterSignal]  = useState<SignalType | "ALL">("ALL");
  const [filterSector,  setFilterSector]  = useState<string>("ALL");
  const [filterCountry, setFilterCountry] = useState<"ALL" | "FR" | "US">("ALL");
  const [showChips,     setShowChips]     = useState(true);

  const { refresh, progress } = useScreenerRefresh(universe);
  const isRunning = isLoading["screener"] && progress.total > 0 && progress.completed < progress.total;

  const applyPreset = useCallback((p: UniversePreset) => {
    setPreset(p);
    if (p === "PORTFOLIO") setUniverse(positions.map((pos) => pos.ticker));
    else {
      const found = UNIVERSE_PRESETS.find((u) => u.id === p);
      if (found) setUniverse(found.tickers);
    }
  }, [positions]);

  const sectors = useMemo(() => {
    const s = new Set(screenerSignals.map((sig) => sig.sector).filter(Boolean) as string[]);
    return ["ALL", ...Array.from(s).sort()];
  }, [screenerSignals]);

  // ✅ Point 8 : le ticker focalisé remonte toujours en premier
  const filtered = useMemo(() => {
    let list = [...screenerSignals];
    if (filterSignal  !== "ALL") list = list.filter((s) => s.signal  === filterSignal);
    if (filterSector  !== "ALL") list = list.filter((s) => s.sector  === filterSector);
    if (filterCountry !== "ALL") list = list.filter((s) => s.country === filterCountry);
    list.sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]);

    // Remonter le ticker focalisé en tête
    if (focusedTicker) {
      const idx = list.findIndex((s) => s.ticker === focusedTicker);
      if (idx > 0) {
        const [item] = list.splice(idx, 1);
        list.unshift(item);
      }
    }
    return list;
  }, [screenerSignals, filterSignal, filterSector, filterCountry, focusedTicker]);

  const euCount = universe.filter((t) =>
    [".PA",".BR",".AM",".DE",".L",".MI",".MC"].some((sfx) => t.toUpperCase().endsWith(sfx)),
  ).length;

  const addTicker = () => {
    const t = customInput.trim().toUpperCase();
    if (t && !universe.includes(t)) { setUniverse((prev) => [...prev, t]); setPreset("CUSTOM"); }
    setCustomInput("");
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2 border-b border-terminal-border bg-terminal-bg shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap size={13} className="text-warn" />
            <span className="text-sm font-mono font-semibold text-terminal-text tracking-wider">SCREENER</span>
            <span className="text-2xs font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded">
              {universe.length} titres{euCount > 0 && <span className="ml-1 text-blue-400">· {euCount} EU</span>}
            </span>
            {focusedTicker && (
              <span className="text-2xs font-mono text-terminal-accent border border-terminal-accent/40 px-1.5 py-0.5 rounded animate-pulse">
                ◎ FOCUS: {focusedTicker}
              </span>
            )}
          </div>
          <button
            onClick={() => refresh()}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-2xs font-mono text-terminal-accent border border-terminal-accent/40 hover:border-terminal-accent px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} className={isRunning ? "animate-spin" : ""} />
            {isRunning ? "SCAN EN COURS…" : "LANCER LE SCAN"}
          </button>
        </div>

        {/* Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs font-mono text-terminal-dim mr-1">Univers :</span>
          {UNIVERSE_PRESETS.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`flex items-center gap-1.5 text-2xs font-mono px-2.5 py-1 rounded border transition-colors ${
                preset === p.id
                  ? "text-terminal-accent border-terminal-accent/50 bg-terminal-accent/10"
                  : "text-terminal-dim border-terminal-border hover:text-terminal-text hover:border-terminal-muted"
              }`}
            >
              <span>{p.flag}</span> {p.label}
            </button>
          ))}
        </div>

        {/* Chips tickers */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <button onClick={() => setShowChips((v) => !v)}
              className="flex items-center gap-1 text-2xs font-mono text-terminal-dim hover:text-terminal-text transition-colors">
              {showChips ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              Titres sélectionnés
            </button>
            {universe.length > 0 && (
              <button onClick={() => { setUniverse([]); setPreset("CUSTOM"); }}
                className="text-2xs font-mono text-terminal-dim hover:text-down transition-colors ml-auto">
                Tout effacer
              </button>
            )}
          </div>
          {showChips && (
            <div className="flex items-center gap-1.5 flex-wrap max-h-20 overflow-y-auto">
              {universe.map((t) => (
                <TickerChip key={t} ticker={t}
                  isEU={[".PA",".BR",".AM",".DE",".L"].some((sfx) => t.toUpperCase().endsWith(sfx))}
                  onRemove={() => { setUniverse((prev) => prev.filter((u) => u !== t)); setPreset("CUSTOM"); }}
                />
              ))}
              <div className="flex items-center gap-1">
                <input
                  className="bg-terminal-surface border border-terminal-border rounded px-2 py-0.5 text-2xs font-mono text-terminal-text w-20 focus:outline-none focus:border-terminal-accent uppercase"
                  placeholder="ex: MC.PA"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTicker()}
                />
                <button onClick={addTicker}
                  className="text-2xs text-terminal-accent border border-terminal-accent/40 px-2 py-0.5 rounded font-mono hover:bg-terminal-accent/10 transition-colors">
                  + ADD
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isRunning && <ProgressBar completed={progress.completed} total={progress.total} current={progress.current} />}
      {screenerSignals.length > 0 && !isRunning && <StatsPanel signals={screenerSignals} />}

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-bg shrink-0 flex-wrap">
        <Filter size={10} className="text-terminal-dim" />
        <button onClick={() => setFilterSignal("ALL")}
          className={`text-2xs font-mono px-2 py-1 rounded border transition-colors ${
            filterSignal === "ALL"
              ? "text-terminal-accent border-terminal-accent/40 bg-terminal-accent/10"
              : "text-terminal-dim border-transparent hover:text-terminal-text"
          }`}
        >
          Tous ({screenerSignals.length})
        </button>
        {(Object.keys(SIGNAL_META) as SignalType[]).map((type) => {
          const count = screenerSignals.filter((s) => s.signal === type).length;
          if (!count) return null;
          const m = SIGNAL_META[type];
          return (
            <button key={type} onClick={() => setFilterSignal(type)}
              className={`text-2xs font-mono px-2 py-1 rounded border transition-colors ${
                filterSignal === type ? `${m.color} ${m.bg}` : "text-terminal-dim border-transparent hover:text-terminal-text"
              }`}
            >
              {m.labelFR} ({count})
            </button>
          );
        })}
        <div className="w-px h-3 bg-terminal-border mx-0.5" />
        {(["ALL","FR","US"] as const).map((c) => (
          <button key={c} onClick={() => setFilterCountry(c)}
            className={`text-2xs font-mono px-2 py-1 rounded border transition-colors ${
              filterCountry === c
                ? "text-terminal-accent border-terminal-accent/40 bg-terminal-accent/10"
                : "text-terminal-dim border-transparent hover:text-terminal-text"
            }`}
          >
            {c === "ALL" ? "🌐" : c === "FR" ? "🇫🇷" : "🇺🇸"} {c}
          </button>
        ))}
        {sectors.length > 2 && (
          <>
            <div className="w-px h-3 bg-terminal-border mx-0.5" />
            <select value={filterSector} onChange={(e) => setFilterSector(e.target.value)}
              className="bg-terminal-surface border border-terminal-border rounded px-2 py-1 text-2xs font-mono text-terminal-dim focus:outline-none focus:border-terminal-accent">
              {sectors.map((s) => <option key={s} value={s}>{s === "ALL" ? "Tous secteurs" : s}</option>)}
            </select>
          </>
        )}
        <span className="ml-auto text-2xs font-mono text-terminal-dim">
          {filtered.length} signal{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Signal Grid ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-terminal-dim gap-3">
            <Search size={28} className="opacity-30" />
            {isRunning ? (
              <p className="font-mono text-sm animate-pulse text-terminal-accent">
                Analyse de {universe.length} titres ({euCount} Euronext)…
              </p>
            ) : screenerSignals.length > 0 ? (
              <>
                <p className="font-mono text-sm">Aucun signal avec ces filtres</p>
                <button
                  onClick={() => { setFilterSignal("ALL"); setFilterSector("ALL"); setFilterCountry("ALL"); }}
                  className="text-2xs font-mono text-terminal-accent hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              </>
            ) : (
              <>
                <p className="font-mono text-sm">Aucun signal détecté</p>
                <p className="font-mono text-2xs">Cliquez sur «&nbsp;LANCER LE SCAN&nbsp;» pour analyser {universe.length} titres</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((signal, i) => (
              <SignalCard
                key={`${signal.ticker}-${signal.signal}-${i}`}
                signal={signal}
                onFocus={(t) => setFocusedTicker(focusedTicker === t ? null : t)}
                isFocused={focusedTicker === signal.ticker}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

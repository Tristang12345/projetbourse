/**
 * ============================================================
 * CANDLE CHART — Graphique OHLCV interactif
 * ✅ Point 13 : Clic sur un ticker → graphique de cours détaillé
 * Utilise recharts (déjà installé dans le projet).
 * ============================================================
 */

import React, { useState, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { X, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { getCandles } from "../services/dataOrchestrator";
import { formatPrice, formatPercent, colorClass } from "../utils/financialCalculations";
import type { PivotCandle } from "../services/types";

type TimeRange = "1W" | "1M" | "3M" | "6M" | "1Y";

const RANGE_DAYS: Record<TimeRange, number> = {
  "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365,
};

interface CandleChartProps {
  ticker:   string;
  currency: "USD" | "EUR" | "GBP" | "JPY" | "CHF";
  name:     string;
  onClose:  () => void;
}

// Tooltip personnalisé
const CustomTooltip = ({ active, payload, currency }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return (
    <div className="bg-terminal-elevated border border-terminal-border rounded-md p-3 text-2xs font-mono shadow-panel">
      <div className="text-terminal-dim mb-1">{d.dateStr}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-terminal-dim">Ouv.</span>
        <span className="text-terminal-text">{sym}{d.open?.toFixed(2)}</span>
        <span className="text-terminal-dim">Haut</span>
        <span className="text-up">{sym}{d.high?.toFixed(2)}</span>
        <span className="text-terminal-dim">Bas</span>
        <span className="text-down">{sym}{d.low?.toFixed(2)}</span>
        <span className="text-terminal-dim">Clôt.</span>
        <span className="text-terminal-text font-bold">{sym}{d.close?.toFixed(2)}</span>
        <span className="text-terminal-dim">Var.</span>
        <span className={colorClass(d.change ?? 0)}>{d.change >= 0 ? "+" : ""}{d.change?.toFixed(2)}</span>
      </div>
    </div>
  );
};

export const CandleChart: React.FC<CandleChartProps> = ({ ticker, currency, name, onClose }) => {
  const [range,   setRange]   = useState<TimeRange>("1M");
  const [candles, setCandles] = useState<PivotCandle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCandles(ticker, RANGE_DAYS[range]).then((c) => {
      setCandles(c);
      setLoading(false);
    });
  }, [ticker, range]);

  // Prépare les données pour recharts
  const chartData = candles.map((c) => {
    const date = new Date(c.time);
    const change = c.close - c.open;
    return {
      dateStr: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      open:    c.open,
      high:    c.high,
      low:     c.low,
      close:   c.close,
      volume:  c.volume,
      change,
      // Pour simuler les bougies avec recharts Bar :
      // candleBody = [min(open,close), max(open,close)]
      candleBottom: Math.min(c.open, c.close),
      candleHeight: Math.abs(c.close - c.open),
      wickHigh:     c.high,
      wickLow:      c.low,
      isUp:         c.close >= c.open,
      color:        c.close >= c.open ? "#00e676" : "#ff1744",
    };
  });

  const lastCandle  = candles[candles.length - 1];
  const firstCandle = candles[0];
  const totalChange = lastCandle && firstCandle
    ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100
    : 0;

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-terminal-elevated border border-terminal-border rounded-lg shadow-panel w-[820px] max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-terminal-border">
          <div className="flex items-center gap-3">
            <BarChart2 size={14} className="text-terminal-accent" />
            <div>
              <span className="text-sm font-mono font-bold text-terminal-text">{ticker}</span>
              <span className="text-xs font-mono text-terminal-dim ml-2">{name}</span>
            </div>
            {lastCandle && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-lg font-mono font-bold text-terminal-text">
                  {formatPrice(lastCandle.close, currency)}
                </span>
                <span className={`text-sm font-mono ${colorClass(totalChange)}`}>
                  {totalChange >= 0 ? <TrendingUp size={12} className="inline mr-1" /> : <TrendingDown size={12} className="inline mr-1" />}
                  {formatPercent(totalChange)}
                </span>
              </div>
            )}
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-1">
            {(["1W","1M","3M","6M","1Y"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`text-2xs font-mono px-2.5 py-1 rounded transition-colors border ${
                  range === r
                    ? "text-terminal-accent border-terminal-accent/50 bg-terminal-accent/10"
                    : "text-terminal-dim border-transparent hover:text-terminal-text hover:border-terminal-border"
                }`}
              >
                {r}
              </button>
            ))}
            <button
              onClick={onClose}
              className="ml-3 text-terminal-dim hover:text-terminal-text transition-colors p-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="p-5">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-terminal-dim font-mono text-sm animate-pulse">
              Chargement des données…
            </div>
          ) : candles.length < 2 ? (
            <div className="h-64 flex items-center justify-center text-terminal-dim font-mono text-sm">
              Données insuffisantes
            </div>
          ) : (
            <>
              {/* Price Chart */}
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="dateStr"
                    tick={{ fill: "#6b7280", fontSize: 9, fontFamily: "monospace" }}
                    tickLine={false}
                    interval={Math.floor(chartData.length / 6)}
                  />
                  <YAxis
                    domain={[minPrice * 0.995, maxPrice * 1.005]}
                    tick={{ fill: "#6b7280", fontSize: 9, fontFamily: "monospace" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${currency === "EUR" ? "" : "$"}${v.toFixed(0)}`}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip currency={currency} />} />

                  {/* Wick (high-low) représenté par la ligne close */}
                  <Line
                    dataKey="high"
                    dot={false}
                    stroke="transparent"
                    strokeWidth={0}
                  />

                  {/* Corps de la bougie — approche Bar stacked */}
                  <Bar
                    dataKey="candleHeight"
                    stackId="candle"
                    fill="transparent"
                    stroke="none"
                    // La couleur est définie par isUp dans le Cell
                    shape={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      const color = payload.isUp ? "#00e676" : "#ff1744";
                      // Wick
                      const wickX = x + width / 2;
                      return (
                        <g>
                          {/* High wick */}
                          <line x1={wickX} y1={props.background?.y ?? y - 10}
                            x2={wickX} y2={y}
                            stroke={color} strokeWidth={1} opacity={0.6} />
                          {/* Corps */}
                          <rect x={x + 1} y={y} width={Math.max(width - 2, 1)}
                            height={Math.max(height, 1)}
                            fill={color} opacity={0.8} rx={1} />
                          {/* Low wick */}
                          <line x1={wickX} y1={y + height}
                            x2={wickX} y2={(props.background?.y ?? y) + (props.background?.height ?? 0)}
                            stroke={color} strokeWidth={1} opacity={0.6} />
                        </g>
                      );
                    }}
                  />

                  {/* Ligne de clôture */}
                  <Line
                    dataKey="close"
                    dot={false}
                    stroke="#1a9fff"
                    strokeWidth={1}
                    opacity={0.4}
                  />

                  {/* Ligne de référence : premier cours */}
                  {firstCandle && (
                    <ReferenceLine
                      y={firstCandle.close}
                      stroke="rgba(255,255,255,0.1)"
                      strokeDasharray="4 4"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              {/* Volume Chart */}
              <ResponsiveContainer width="100%" height={60}>
                <ComposedChart data={chartData} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                  <XAxis dataKey="dateStr" hide />
                  <YAxis hide />
                  <Bar
                    dataKey="volume"
                    shape={(props: any) => (
                      <rect
                        {...props}
                        fill={props.payload.isUp ? "rgba(0,230,118,0.4)" : "rgba(255,23,68,0.4)"}
                        rx={1}
                      />
                    )}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-terminal-border">
                {[
                  { label: "Plus haut", val: formatPrice(maxPrice, currency) },
                  { label: "Plus bas",  val: formatPrice(minPrice, currency) },
                  { label: "Clôture",   val: lastCandle ? formatPrice(lastCandle.close, currency) : "—" },
                  { label: "Variation", val: formatPercent(totalChange), color: colorClass(totalChange) },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-2xs font-mono text-terminal-dim">{label}</div>
                    <div className={`text-xs font-mono font-semibold mt-0.5 ${color ?? "text-terminal-text"}`}>{val}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

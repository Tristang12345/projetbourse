/**
 * ============================================================
 * SCREEN 1 — PORTFOLIO (P&L)
 * Live positions with sparklines, unrealized/day P&L,
 * sector grouping, and add/remove position controls.
 * ============================================================
 */

import React, { useState, useEffect } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, BarChart2 } from "lucide-react";
import { useTerminalStore } from "../store/useTerminalStore";
import { usePortfolioRefresh } from "../hooks/useDataRefresh";
import { Sparkline } from "../components/Sparkline";
import { getCandles } from "../services/dataOrchestrator";
import {
  formatCurrency, formatPercent, colorClass
} from "../utils/financialCalculations";

// ─── Add Position Modal ───────────────────────────────────────

interface AddModalProps { onClose: () => void; }

const AddPositionModal: React.FC<AddModalProps> = ({ onClose }) => {
  const { addPosition } = useTerminalStore();
  const [form, setForm] = useState({
    ticker: "", name: "", sector: "Technology", quantity: "", avgCost: "",
  });

  const sectors = ["Technology","Finance","Healthcare","Consumer","Energy",
    "Industrials","Materials","Utilities","Real Estate","Communication"];

  const handleSubmit = () => {
    if (!form.ticker || !form.quantity || !form.avgCost) return;
    addPosition({
      ticker:   form.ticker.toUpperCase(),
      name:     form.name || form.ticker.toUpperCase(),
      sector:   form.sector,
      quantity: parseFloat(form.quantity),
      avgCost:  parseFloat(form.avgCost),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-terminal-elevated border border-terminal-border rounded-lg p-6 w-96 shadow-panel">
        <h3 className="font-mono text-terminal-accent text-sm tracking-widest mb-5 uppercase">
          Add Position
        </h3>
        <div className="space-y-3">
          {[
            { key: "ticker",   label: "Ticker",    placeholder: "AAPL" },
            { key: "name",     label: "Company",   placeholder: "Apple Inc." },
            { key: "quantity", label: "Qty",       placeholder: "100" },
            { key: "avgCost",  label: "PRU (USD)", placeholder: "178.50" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-2xs text-terminal-dim font-mono tracking-widest uppercase block mb-1">
                {label}
              </label>
              <input
                className="w-full bg-terminal-surface border border-terminal-border rounded px-3 py-2 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="text-2xs text-terminal-dim font-mono tracking-widest uppercase block mb-1">
              Sector
            </label>
            <select
              className="w-full bg-terminal-surface border border-terminal-border rounded px-3 py-2 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
            >
              {sectors.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 py-2 border border-terminal-border rounded text-sm font-mono text-terminal-dim hover:text-terminal-text hover:border-terminal-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit}
            className="flex-1 py-2 bg-terminal-accent/10 border border-terminal-accent rounded text-sm font-mono text-terminal-accent hover:bg-terminal-accent/20 transition-colors">
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Portfolio Screen ────────────────────────────────────

export const Portfolio: React.FC = () => {
  usePortfolioRefresh();

  const {
    getPositionsWithPnL, removePosition, setFocusedTicker,
    focusedTicker, isLoading,
  } = useTerminalStore();

  const [sparklines, setSparklines]   = useState<Record<string, number[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortBy, setSortBy]            = useState<"pnl" | "day" | "value" | "ticker">("value");

  const positions = getPositionsWithPnL();

  // Load sparklines for each ticker
  useEffect(() => {
    positions.forEach(async (pos) => {
      if (sparklines[pos.ticker]) return;
      const candles = await getCandles(pos.ticker, 20);
      if (candles.length) {
        setSparklines((prev) => ({
          ...prev,
          [pos.ticker]: candles.slice(-15).map((c) => c.close),
        }));
      }
    });
  }, [positions.map((p) => p.ticker).join(",")]);

  // Sorted positions
  const sorted = [...positions].sort((a, b) => {
    if (sortBy === "pnl")    return b.pnl       - a.pnl;
    if (sortBy === "day")    return b.dayPnL     - a.dayPnL;
    if (sortBy === "value")  return b.marketValue - a.marketValue;
    return a.ticker.localeCompare(b.ticker);
  });

  // Portfolio totals
  const totalValue  = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost   = positions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
  const totalPnL    = positions.reduce((s, p) => s + p.pnl, 0);
  const totalDayPnL = positions.reduce((s, p) => s + p.dayPnL, 0);
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const SortBtn = ({ k, label }: { k: typeof sortBy; label: string }) => (
    <button
      onClick={() => setSortBy(k)}
      className={`text-2xs font-mono tracking-widest uppercase transition-colors ${
        sortBy === k ? "text-terminal-accent" : "text-terminal-dim hover:text-terminal-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Summary Bar ── */}
      <div className="grid grid-cols-4 gap-px bg-terminal-border border-b border-terminal-border shrink-0">
        {[
          { label: "Total Value",    val: formatCurrency(totalValue),  icon: DollarSign, color: "text-terminal-text" },
          { label: "Total Cost",     val: formatCurrency(totalCost),   icon: BarChart2,  color: "text-terminal-dim"  },
          { label: "Unrealized P&L", val: `${formatCurrency(totalPnL)} (${formatPercent(totalPnLPct)})`,
            icon: TrendingUp,  color: colorClass(totalPnL) },
          { label: "Day P&L",        val: formatCurrency(totalDayPnL),
            icon: TrendingDown, color: colorClass(totalDayPnL) },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-terminal-surface px-4 py-3 flex items-center gap-3">
            <Icon size={14} className="text-terminal-dim shrink-0" />
            <div>
              <div className="text-2xs font-mono tracking-widest uppercase text-terminal-dim">{label}</div>
              <div className={`text-sm font-mono font-semibold mt-0.5 ${color}`}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-bg shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-2xs font-mono tracking-widest text-terminal-dim uppercase">
            {positions.length} Positions
          </span>
          <div className="flex items-center gap-3">
            <span className="text-2xs text-terminal-dim font-mono">Sort:</span>
            <SortBtn k="ticker" label="Ticker" />
            <SortBtn k="value"  label="Value"  />
            <SortBtn k="pnl"    label="P&L"    />
            <SortBtn k="day"    label="Day"     />
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 text-2xs font-mono tracking-widest text-terminal-accent hover:text-white border border-terminal-accent/50 hover:border-terminal-accent rounded px-2.5 py-1 transition-colors"
        >
          <Plus size={11} /> ADD POSITION
        </button>
      </div>

      {/* ── Column Headers ── */}
      <div className="grid grid-cols-12 text-2xs font-mono tracking-widest text-terminal-dim uppercase px-4 py-1.5 border-b border-terminal-border bg-terminal-bg shrink-0">
        <div className="col-span-2">Ticker</div>
        <div className="col-span-1 text-right">Price</div>
        <div className="col-span-1 text-right">Chg%</div>
        <div className="col-span-1 text-right">Qty</div>
        <div className="col-span-1 text-right">PRU</div>
        <div className="col-span-2 text-right">Mkt Value</div>
        <div className="col-span-1 text-right">P&L</div>
        <div className="col-span-1 text-right">Day</div>
        <div className="col-span-1 text-right">Chart</div>
        <div className="col-span-1 text-right">Del</div>
      </div>

      {/* ── Position Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {sorted.map((pos) => (
          <div
            key={pos.id}
            onClick={() => setFocusedTicker(
              focusedTicker === pos.ticker ? null : pos.ticker
            )}
            className={`grid grid-cols-12 items-center px-4 py-2.5 border-b border-terminal-border/50 cursor-pointer transition-colors group
              ${focusedTicker === pos.ticker
                ? "bg-terminal-accent/5 border-l-2 border-l-terminal-accent"
                : "hover:bg-terminal-elevated"
              }`}
          >
            {/* Ticker + Name */}
            <div className="col-span-2">
              <div className="text-sm font-mono font-semibold text-terminal-text">{pos.ticker}</div>
              <div className="text-2xs text-terminal-dim truncate max-w-[120px]">{pos.name}</div>
              <div className="text-2xs text-terminal-dim/60 mt-0.5">{pos.sector}</div>
            </div>

            {/* Price */}
            <div className="col-span-1 text-right">
              <span className="text-sm font-mono text-terminal-text">
                ${pos.currentPrice.toFixed(2)}
              </span>
            </div>

            {/* Change % */}
            <div className={`col-span-1 text-right text-xs font-mono font-semibold ${colorClass(pos.changePercent)}`}>
              {formatPercent(pos.changePercent)}
            </div>

            {/* Qty */}
            <div className="col-span-1 text-right text-sm font-mono text-terminal-dim">
              {pos.quantity.toLocaleString()}
            </div>

            {/* PRU */}
            <div className="col-span-1 text-right text-sm font-mono text-terminal-dim">
              ${pos.avgCost.toFixed(2)}
            </div>

            {/* Market Value */}
            <div className="col-span-2 text-right text-sm font-mono text-terminal-text">
              {formatCurrency(pos.marketValue)}
            </div>

            {/* P&L */}
            <div className={`col-span-1 text-right ${colorClass(pos.pnl)}`}>
              <div className="text-xs font-mono font-semibold">{formatPercent(pos.pnlPercent)}</div>
              <div className="text-2xs font-mono">{pos.pnl >= 0 ? "+" : ""}{formatCurrency(pos.pnl)}</div>
            </div>

            {/* Day P&L */}
            <div className={`col-span-1 text-right ${colorClass(pos.dayPnL)}`}>
              <div className="text-xs font-mono font-semibold">{formatPercent(pos.dayPnLPercent)}</div>
              <div className="text-2xs font-mono">{pos.dayPnL >= 0 ? "+" : ""}{formatCurrency(pos.dayPnL)}</div>
            </div>

            {/* Sparkline */}
            <div className="col-span-1 flex justify-end">
              <Sparkline data={sparklines[pos.ticker] ?? []} width={64} height={24} />
            </div>

            {/* Delete */}
            <div className="col-span-1 flex justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); removePosition(pos.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-terminal-dim hover:text-down p-1"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        {positions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-terminal-dim">
            <BarChart2 size={32} className="mb-3 opacity-30" />
            <p className="font-mono text-sm">No positions</p>
            <p className="font-mono text-2xs mt-1">Add your first position to get started</p>
          </div>
        )}
      </div>

      {showAddModal && <AddPositionModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

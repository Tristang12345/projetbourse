/**
 * ============================================================
 * SCREEN 1 — PORTFOLIO (P&L)
 * ✅ Point 6  : Édition position (PRU, quantité)
 * ✅ Point 13 : Clic sur Chart → graphique OHLCV interactif
 * ✅ Point 14 : Export CSV
 * ✅ Point 3  : Badge MARKET CLOSED dans les prix
 * ============================================================
 */

import React, { useState, useEffect } from "react";
import {
  Plus, Trash2, TrendingUp, TrendingDown, DollarSign,
  BarChart2, Bell, BellOff, Edit2, Check, X,
} from "lucide-react";
import { useTerminalStore } from "../store/useTerminalStore";
import { useAlertStore }    from "../store/useAlertStore";
import { usePortfolioRefresh } from "../hooks/useDataRefresh";
import { Sparkline }           from "../components/Sparkline";
import { CandleChart }         from "../components/CandleChart";
import { ExportPortfolioButton } from "../components/ExportButton";
import { getCandles }          from "../services/dataOrchestrator";
import {
  formatCurrency, formatPercent, colorClass, formatPrice,
} from "../utils/financialCalculations";
import { priceFreshness, getMarketStatus } from "../utils/marketHours";

const GRID_COLS = "minmax(0,2fr) repeat(10,minmax(0,1fr)) minmax(0,0.6fr)";

// ─── Alert Modal ─────────────────────────────────────────────

interface AlertModalProps {
  ticker: string; currentPrice: number; currency: string; onClose: () => void;
}

const AlertModal: React.FC<AlertModalProps> = ({ ticker, currentPrice, currency, onClose }) => {
  const { addAlert, alerts, deleteAlert } = useAlertStore();
  const [targetInput, setTargetInput] = useState(currentPrice.toFixed(2));
  const activeAlerts = alerts.filter((a) => a.ticker === ticker && a.status === "active");
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  const handleAdd = () => {
    const target = parseFloat(targetInput);
    if (isNaN(target) || target <= 0) return;
    addAlert({ ticker, targetPrice: target,
      direction: target > currentPrice ? "above" : "below",
      note: `Alerte ${ticker}` });
    setTargetInput(currentPrice.toFixed(2));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-terminal-elevated border border-terminal-border rounded-lg p-5 w-80 shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-warn" />
            <span className="text-sm font-mono font-bold text-terminal-text">Alertes — {ticker}</span>
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text text-lg">×</button>
        </div>
        <div className="flex items-center justify-between mb-4 bg-terminal-bg rounded px-3 py-2">
          <span className="text-2xs font-mono text-terminal-dim uppercase tracking-widest">Prix actuel</span>
          <span className="text-sm font-mono font-bold">{sym}{currentPrice.toFixed(2)}</span>
        </div>
        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <label className="text-2xs font-mono text-terminal-dim uppercase tracking-widest block mb-1">Prix cible ({sym})</label>
            <input type="number" value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
              step="0.01" />
          </div>
          <button onClick={handleAdd}
            className="self-end mb-1 px-3 py-1.5 bg-terminal-accent/15 hover:bg-terminal-accent/25 text-terminal-accent border border-terminal-accent/40 rounded text-xs font-mono transition-colors">
            + Ajouter
          </button>
        </div>
        {activeAlerts.length > 0 && (
          <div className="border-t border-terminal-border pt-3">
            <div className="text-2xs font-mono text-terminal-dim uppercase tracking-widest mb-2">
              Alertes actives ({activeAlerts.length})
            </div>
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between py-1.5 border-b border-terminal-border/40 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${alert.direction === "above" ? "text-up" : "text-down"}`}>
                    {alert.direction === "above" ? "↑" : "↓"}
                  </span>
                  <span className="text-sm font-mono">{sym}{alert.targetPrice.toFixed(2)}</span>
                </div>
                <button onClick={() => deleteAlert(alert.id)} className="text-terminal-dim/40 hover:text-down p-1">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Add Position Modal ───────────────────────────────────────

const AddPositionModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addPosition } = useTerminalStore();
  const [form, setForm] = useState({ ticker: "", name: "", sector: "Technology", quantity: "", avgCost: "" });
  const sectors = ["Technology","Finance","Healthcare","Consumer","Energy",
    "Industrials","Materials","Utilities","Real Estate","Communication"];

  const handleSubmit = () => {
    if (!form.ticker || !form.quantity || !form.avgCost) return;
    addPosition({ ticker: form.ticker.toUpperCase(), name: form.name || form.ticker.toUpperCase(),
      sector: form.sector, quantity: parseFloat(form.quantity), avgCost: parseFloat(form.avgCost) });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-terminal-elevated border border-terminal-border rounded-lg p-6 w-96 shadow-panel">
        <h3 className="font-mono text-terminal-accent text-sm tracking-widest mb-5 uppercase">Add Position</h3>
        <div className="space-y-3">
          {[
            { key: "ticker", label: "Ticker", placeholder: "AAPL" },
            { key: "name",   label: "Company", placeholder: "Apple Inc." },
            { key: "quantity", label: "Qté", placeholder: "100" },
            { key: "avgCost",  label: "PRU (devise locale)", placeholder: "ex: 95.21 pour BNP.PA" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-2xs text-terminal-dim font-mono tracking-widest uppercase block mb-1">{label}</label>
              <input
                className="w-full bg-terminal-surface border border-terminal-border rounded px-3 py-2 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="text-2xs text-terminal-dim font-mono tracking-widest uppercase block mb-1">Secteur</label>
            <select className="w-full bg-terminal-surface border border-terminal-border rounded px-3 py-2 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
              value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
              {sectors.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-terminal-border rounded text-sm font-mono text-terminal-dim hover:text-terminal-text transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 py-2 bg-terminal-accent/10 border border-terminal-accent rounded text-sm font-mono text-terminal-accent hover:bg-terminal-accent/20 transition-colors">Add</button>
        </div>
      </div>
    </div>
  );
};

// ─── Edit Position Inline ─────────────────────────────────────

interface EditRowProps {
  posId: string; currentQty: number; currentPRU: number; currency: string;
  onDone: () => void;
}

const EditRow: React.FC<EditRowProps> = ({ posId, currentQty, currentPRU, currency, onDone }) => {
  const { updatePosition } = useTerminalStore();
  const [qty, setQty] = useState(String(currentQty));
  const [pru, setPru] = useState(String(currentPRU));
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  const save = () => {
    const q = parseFloat(qty), p = parseFloat(pru);
    if (!isNaN(q) && q > 0 && !isNaN(p) && p > 0) {
      updatePosition(posId, { quantity: q, avgCost: p });
    }
    onDone();
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-1">
        <span className="text-2xs font-mono text-terminal-dim">Qté</span>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)}
          className="w-20 bg-terminal-bg border border-terminal-accent/40 rounded px-2 py-0.5 text-xs font-mono text-terminal-text focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-2xs font-mono text-terminal-dim">PRU ({sym})</span>
        <input type="number" value={pru} onChange={(e) => setPru(e.target.value)}
          className="w-24 bg-terminal-bg border border-terminal-accent/40 rounded px-2 py-0.5 text-xs font-mono text-terminal-text focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && save()} step="0.01" />
      </div>
      <button onClick={save} className="p-1 text-up hover:opacity-80"><Check size={12} /></button>
      <button onClick={onDone} className="p-1 text-terminal-dim hover:text-terminal-text"><X size={12} /></button>
    </div>
  );
};

// ─── Main Portfolio Screen ────────────────────────────────────

export const Portfolio: React.FC = () => {
  usePortfolioRefresh();

  const { getPositionsWithPnL, removePosition, setFocusedTicker, focusedTicker, quotes } =
    useTerminalStore();
  const alerts = useAlertStore((s) => s.alerts);

  const [sparklines,   setSparklines]   = useState<Record<string, number[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [alertTicker,  setAlertTicker]  = useState<string | null>(null);
  const [chartTicker,  setChartTicker]  = useState<string | null>(null);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [sortBy,       setSortBy]       = useState<"pnl" | "day" | "value" | "ticker">("value");

  const positions = getPositionsWithPnL();

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

  const priceAge = (ticker: string): "fresh" | "stale" | "closed" | "none" => {
    const q = quotes[ticker];
    if (!q) return "none";
    return priceFreshness(q.timestamp, q.exchange);
  };
  const isPriceAvailable = (ticker: string) => priceAge(ticker) !== "none";

  const sorted = [...positions].sort((a, b) => {
    if (sortBy === "pnl")   return b.pnl        - a.pnl;
    if (sortBy === "day")   return b.dayPnL      - a.dayPnL;
    if (sortBy === "value") return b.marketValue - a.marketValue;
    return a.ticker.localeCompare(b.ticker);
  });

  const totalValue  = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost   = positions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
  const totalPnL    = positions.reduce((s, p) => s + p.pnl, 0);
  const totalDayPnL = positions.reduce((s, p) => s + p.dayPnL, 0);
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const SortBtn = ({ k, label }: { k: typeof sortBy; label: string }) => (
    <button onClick={() => setSortBy(k)}
      className={`text-2xs font-mono tracking-widest uppercase transition-colors ${
        sortBy === k ? "text-terminal-accent" : "text-terminal-dim hover:text-terminal-text"
      }`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full">

      {/* ── Summary Bar ── */}
      <div className="grid grid-cols-4 gap-px bg-terminal-border border-b border-terminal-border shrink-0">
        {[
          { label: "Total Value",    val: formatCurrency(totalValue),  icon: DollarSign, color: "text-terminal-text" },
          { label: "Total Cost",     val: formatCurrency(totalCost),   icon: BarChart2,  color: "text-terminal-dim" },
          { label: "Unrealized P&L", val: `${formatCurrency(totalPnL)} (${formatPercent(totalPnLPct)})`,
            icon: TrendingUp, color: colorClass(totalPnL) },
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

      {/* ── Sort / Add / Export bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-bg shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-2xs font-mono tracking-widest text-terminal-dim uppercase">
            {positions.length} Positions
          </span>
          <div className="flex items-center gap-3">
            <span className="text-2xs text-terminal-dim font-mono">Sort:</span>
            <SortBtn k="ticker" label="Ticker" />
            <SortBtn k="value"  label="Value" />
            <SortBtn k="pnl"    label="P&L" />
            <SortBtn k="day"    label="Day" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* ✅ Point 14 : Export CSV */}
          <ExportPortfolioButton />
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-2xs font-mono tracking-widest text-terminal-accent hover:text-white border border-terminal-accent/50 hover:border-terminal-accent rounded px-2.5 py-1 transition-colors">
            <Plus size={11} /> ADD POSITION
          </button>
        </div>
      </div>

      {/* ── Column Headers ── */}
      <div className="grid text-2xs font-mono tracking-widest text-terminal-dim uppercase px-4 py-1.5 border-b border-terminal-border bg-terminal-bg shrink-0"
        style={{ gridTemplateColumns: GRID_COLS }}>
        <div>Ticker</div>
        <div className="text-right">Prix</div>
        <div className="text-right">Var%</div>
        <div className="text-right">Ouv.</div>
        <div className="text-right">Clôt.</div>
        <div className="text-right">Qté</div>
        <div className="text-right">PRU</div>
        <div className="text-right">Val. mkt</div>
        <div className="text-right">P&amp;L</div>
        <div className="text-right">Jour</div>
        <div className="text-right">Chart</div>
        <div className="text-right">⚡</div>
      </div>

      {/* ── Position Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {sorted.map((pos) => {
          const age     = priceAge(pos.ticker);
          const isClosed = age === "closed";
          const isStale  = age === "stale";
          const hasPrice = age !== "none";
          const q        = quotes[pos.ticker];

          return (
            <div key={pos.id} className="border-b border-terminal-border/50">
              {/* Main row */}
              <div
                onClick={() => setFocusedTicker(focusedTicker === pos.ticker ? null : pos.ticker)}
                style={{ gridTemplateColumns: GRID_COLS }}
                className={`grid items-center px-4 py-2.5 cursor-pointer transition-colors group
                  ${focusedTicker === pos.ticker
                    ? "bg-terminal-accent/5 border-l-2 border-l-terminal-accent"
                    : "hover:bg-terminal-elevated"}`}
              >
                {/* Col 1 — Ticker */}
                <div className="min-w-0">
                  <div className="text-sm font-mono font-semibold text-terminal-text">{pos.ticker}</div>
                  <div className="text-2xs text-terminal-dim truncate">{pos.name}</div>
                  <div className="text-2xs text-terminal-dim/60 mt-0.5">{pos.sector}</div>
                </div>

                {/* Col 2 — Prix */}
                <div className="text-right">
                  {!hasPrice ? (
                    <span className="text-xs font-mono text-terminal-dim">N/A</span>
                  ) : (
                    <div>
                      <div className={`text-sm font-mono ${
                        isClosed ? "text-terminal-dim" :
                        isStale  ? "text-warn" : "text-terminal-text"
                      }`} title={
                        isClosed ? "Marché fermé" :
                        isStale  ? "Prix non mis à jour depuis > 5min" : undefined
                      }>
                        {formatPrice(pos.currentPrice, pos.currency)}
                        {/* ✅ Point 3 : badge CLOSED */}
                        {isClosed && <span className="text-2xs ml-1 text-terminal-dim/50">CLOSED</span>}
                        {isStale  && <span className="text-2xs ml-1">⚠</span>}
                      </div>
                      {pos.currency !== "USD" && (
                        <div className="text-2xs font-mono text-terminal-dim/60">{pos.currency}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Col 3 — Var% */}
                <div className={`text-right text-xs font-mono font-semibold ${
                  hasPrice ? colorClass(pos.changePercent) : "text-terminal-dim"
                }`}>
                  {hasPrice ? formatPercent(pos.changePercent) : "—"}
                </div>

                {/* Col 4 — Ouverture */}
                <div className="text-right text-xs font-mono text-terminal-dim">
                  {hasPrice ? formatPrice(pos.open, pos.currency) : "—"}
                </div>

                {/* Col 5 — Clôture veille */}
                <div className="text-right text-xs font-mono text-terminal-dim">
                  {hasPrice ? formatPrice(pos.prevClose, pos.currency) : "—"}
                </div>

                {/* Col 6 — Quantité */}
                <div className="text-right text-sm font-mono text-terminal-dim">
                  {pos.quantity.toLocaleString()}
                </div>

                {/* Col 7 — PRU */}
                <div className="text-right text-xs font-mono text-terminal-dim">
                  {formatPrice(pos.avgCost, pos.currency)}
                </div>

                {/* Col 8 — Val. marché */}
                <div className="text-right text-sm font-mono text-terminal-text">
                  {formatPrice(pos.marketValue, pos.currency)}
                </div>

                {/* Col 9 — P&L */}
                <div className={`text-right ${colorClass(pos.pnl)}`}>
                  <div className="text-xs font-mono font-semibold">{formatPercent(pos.pnlPercent)}</div>
                  <div className="text-2xs font-mono">
                    {pos.pnl >= 0 ? "+" : ""}{formatPrice(Math.abs(pos.pnl), pos.currency)}
                  </div>
                </div>

                {/* Col 10 — Day P&L */}
                <div className={`text-right ${colorClass(pos.dayPnL)}`}>
                  <div className="text-xs font-mono font-semibold">{formatPercent(pos.dayPnLPercent)}</div>
                  <div className="text-2xs font-mono">
                    {pos.dayPnL >= 0 ? "+" : ""}{formatPrice(Math.abs(pos.dayPnL), pos.currency)}
                  </div>
                </div>

                {/* Col 11 — Sparkline → clic ouvre le graphique */}
                <div className="flex justify-end"
                  onClick={(e) => { e.stopPropagation(); setChartTicker(pos.ticker); }}>
                  <div title="Voir le graphique" className="hover:opacity-80 transition-opacity cursor-pointer">
                    <Sparkline data={sparklines[pos.ticker] ?? []} width={60} height={24} />
                  </div>
                </div>

                {/* Col 12 — Alerte + Edit + Supprimer */}
                <div className="flex justify-end items-center gap-0.5">
                  {/* Alerte */}
                  {(() => {
                    const activeAlerts = alerts.filter(
                      (a) => a.ticker === pos.ticker && a.status === "active",
                    );
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAlertTicker(pos.ticker); }}
                        className="p-1 hover:opacity-80 transition-opacity"
                        title={activeAlerts.length ? `${activeAlerts.length} alerte(s)` : "Créer une alerte"}>
                        {activeAlerts.length > 0
                          ? <Bell    size={10} className="text-warn animate-pulse" />
                          : <BellOff size={10} className="text-terminal-dim hover:text-warn" />}
                      </button>
                    );
                  })()}

                  {/* ✅ Point 6 : Bouton édition */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(pos.id); }}
                    className="p-1 text-terminal-dim/40 hover:text-terminal-accent transition-colors"
                    title="Modifier PRU / quantité">
                    <Edit2 size={10} />
                  </button>

                  {/* Supprimer */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removePosition(pos.id); }}
                    className="p-1 text-terminal-dim/40 hover:text-down transition-colors"
                    title="Supprimer">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>

              {/* ✅ Ligne d'édition inline */}
              {editingId === pos.id && (
                <div className="px-6 pb-2 bg-terminal-elevated">
                  <EditRow
                    posId={pos.id}
                    currentQty={pos.quantity}
                    currentPRU={pos.avgCost}
                    currency={pos.currency}
                    onDone={() => setEditingId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}

        {positions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-terminal-dim">
            <BarChart2 size={32} className="mb-3 opacity-30" />
            <p className="font-mono text-sm">No positions</p>
            <p className="font-mono text-2xs mt-1">Add your first position to get started</p>
          </div>
        )}
      </div>

      {showAddModal && <AddPositionModal onClose={() => setShowAddModal(false)} />}

      {alertTicker && (() => {
        const pos = positions.find((p) => p.ticker === alertTicker);
        const q   = quotes[alertTicker];
        if (!pos) return null;
        return (
          <AlertModal ticker={alertTicker}
            currentPrice={q?.price ?? pos.avgCost}
            currency={q?.currency ?? "USD"}
            onClose={() => setAlertTicker(null)} />
        );
      })()}

      {/* ✅ Point 13 : Graphique OHLCV */}
      {chartTicker && (() => {
        const pos = positions.find((p) => p.ticker === chartTicker);
        if (!pos) return null;
        const q = quotes[chartTicker];
        return (
          <CandleChart
            ticker={chartTicker}
            currency={q?.currency ?? "USD"}
            name={pos.name}
            onClose={() => setChartTicker(null)}
          />
        );
      })()}
    </div>
  );
};

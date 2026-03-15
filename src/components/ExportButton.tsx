/**
 * ============================================================
 * EXPORT CSV — Portfolio & Screener
 * ✅ Point 14 : Export des données en CSV téléchargeable.
 * Utilise l'API Tauri fs (write file) si disponible,
 * sinon blob download navigateur standard.
 * ============================================================
 */

import React, { useState } from "react";
import { Download, CheckCircle } from "lucide-react";
import { useTerminalStore } from "../store/useTerminalStore";
import { formatPrice, formatPercent } from "../utils/financialCalculations";
import type { PivotScreenerSignal } from "../services/types";

// ─── CSV helpers ──────────────────────────────────────────────

const escapeCSV = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const buildCSV = (headers: string[], rows: (string | number | null)[][]): string => {
  const lines = [
    headers.map(escapeCSV).join(","),
    ...rows.map((r) => r.map(escapeCSV).join(",")),
  ];
  return lines.join("\n");
};

const downloadCSV = async (filename: string, content: string) => {
  const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

  if (isTauri) {
    try {
      const { save }      = await import("@tauri-apps/api/dialog");
      const { writeTextFile } = await import("@tauri-apps/api/fs");
      const path = await save({ defaultPath: filename, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (path) await writeTextFile(path, content);
      return;
    } catch { /* fallback */ }
  }

  // Browser fallback
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Portfolio Export ─────────────────────────────────────────

export const ExportPortfolioButton: React.FC = () => {
  const [done, setDone] = useState(false);
  const { getPositionsWithPnL, quotes } = useTerminalStore();

  const handleExport = async () => {
    const positions = getPositionsWithPnL();

    const headers = [
      "Ticker","Nom","Secteur","Quantité","PRU","Devise",
      "Prix actuel","Valeur marché","P&L total","P&L %",
      "Day P&L","Day P&L %","Variation jour %",
    ];

    const rows = positions.map((p) => [
      p.ticker, p.name, p.sector, p.quantity, p.avgCost, p.currency,
      p.currentPrice, p.marketValue,
      p.pnl.toFixed(2), p.pnlPercent.toFixed(2) + "%",
      p.dayPnL.toFixed(2), p.dayPnLPercent.toFixed(2) + "%",
      p.changePercent.toFixed(2) + "%",
    ]);

    const csv = buildCSV(headers, rows);
    const date = new Date().toISOString().split("T")[0];
    await downloadCSV(`portfolio_${date}.csv`, csv);

    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };

  return (
    <button
      onClick={handleExport}
      title="Exporter le portfolio en CSV"
      className="flex items-center gap-1.5 text-2xs font-mono text-terminal-dim hover:text-terminal-accent border border-terminal-border hover:border-terminal-accent/40 rounded px-2.5 py-1 transition-colors"
    >
      {done
        ? <><CheckCircle size={11} className="text-up" /> Exporté</>
        : <><Download size={11} /> CSV</>
      }
    </button>
  );
};

// ─── Screener Export ──────────────────────────────────────────

interface ExportScreenerButtonProps {
  signals: PivotScreenerSignal[];
}

export const ExportScreenerButton: React.FC<ExportScreenerButtonProps> = ({ signals }) => {
  const [done, setDone] = useState(false);

  const handleExport = async () => {
    const headers = [
      "Ticker","Nom","Signal","Force","Prix","Devise",
      "Variation %","Secteur","Exchange","RSI(14)",
      "SMA50","SMA200","Vol/Avg","Détails","Détecté le",
    ];

    const rows = signals.map((s) => [
      s.ticker, s.name, s.signal, s.strength,
      s.price.toFixed(2), s.currency,
      s.changePercent.toFixed(2) + "%",
      s.sector ?? "", s.exchange ?? "",
      s.indicators.rsi14?.toFixed(1) ?? "",
      s.indicators.sma50?.toFixed(2)  ?? "",
      s.indicators.sma200?.toFixed(2) ?? "",
      s.indicators.volumeRatio?.toFixed(2) ?? "",
      s.details,
      new Date(s.detectedAt).toLocaleString("fr-FR"),
    ]);

    const csv = buildCSV(headers, rows);
    const date = new Date().toISOString().split("T")[0];
    await downloadCSV(`screener_${date}.csv`, csv);

    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };

  return (
    <button
      onClick={handleExport}
      disabled={!signals.length}
      title="Exporter les signaux en CSV"
      className="flex items-center gap-1.5 text-2xs font-mono text-terminal-dim hover:text-terminal-accent border border-terminal-border hover:border-terminal-accent/40 rounded px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {done
        ? <><CheckCircle size={11} className="text-up" /> Exporté</>
        : <><Download size={11} /> CSV ({signals.length})</>
      }
    </button>
  );
};

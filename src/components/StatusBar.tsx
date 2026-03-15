/**
 * ============================================================
 * STATUS BAR
 * ✅ Point 3  : Badge MARKET CLOSED (weekend + jours fériés)
 * ✅ Point 11 : Badge QUOTA quand un service est saturé
 * ✅ DELAYED 15min pour Polygon actif
 * ============================================================
 */

import React, { useState, useEffect } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import { formatDistanceToNow } from "date-fns";
import { getMarketStatus } from "../utils/marketHours";

// Retourne label + couleur Tailwind à partir du statut
const resolveMarketDisplay = (exchange: "NYSE" | "EURONEXT") => {
  const status = getMarketStatus(exchange);
  const labels = { open: "OPEN", pre: "PRE-MKT", post: "AFTER-HRS", closed: "CLOSED" };
  const colors = { open: "text-up", pre: "text-warn", post: "text-warn", closed: "text-terminal-dim" };
  return { label: labels[status], color: colors[status] };
};

export const StatusBar: React.FC = () => {
  const { apiStatus, lastSnapshot, saveSnapshot } = useTerminalStore();
  const focusedTicker    = useTerminalStore((s) => s.focusedTicker);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const nyseStatus = resolveMarketDisplay("NYSE");
  const euStatus   = resolveMarketDisplay("EURONEXT");

  const statusDot = (s: string) => {
    if (s === "ok")      return "bg-up";
    if (s === "limited") return "bg-warn";
    if (s === "error")   return "bg-down";
    return "bg-terminal-muted";
  };

  // ✅ Point 11 : label "QUOTA" si le service est à la limite
  const apiLabel = (svc: "finnhub" | "polygon" | "alphavantage") => {
    const s = apiStatus[svc];
    if (s === "limited") return "QUOTA";
    if (s === "error")   return "ERR";
    return svc.slice(0, 3).toUpperCase();
  };

  const polygonActive = apiStatus.polygon === "ok" || apiStatus.polygon === "limited";

  const timeStr = clock.toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const dateStr = clock.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "2-digit", year: "numeric",
  });

  return (
    <div className="h-7 bg-terminal-bg border-t border-terminal-border flex items-center justify-between px-4 text-2xs font-mono text-terminal-dim shrink-0 gap-3 overflow-hidden">

      {/* ── Left: API status ── */}
      <div className="flex items-center gap-3 shrink-0">
        {(["finnhub", "polygon", "alphavantage"] as const).map((svc) => (
          <div key={svc} className="flex items-center gap-1"
            title={`${svc}: ${apiStatus[svc]}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot(apiStatus[svc])}`} />
            <span className={`uppercase tracking-wider ${
              apiStatus[svc] === "limited" ? "text-warn" :
              apiStatus[svc] === "error"   ? "text-down" : ""
            }`}>
              {apiLabel(svc)}
            </span>
          </div>
        ))}

        {/* ✅ DELAYED badge Polygon */}
        {polygonActive && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-warn/40 bg-warn/10"
            title="Données Polygon retardées de 15 minutes (plan gratuit)"
          >
            <span className="text-warn font-semibold">DELAYED 15min</span>
          </div>
        )}
      </div>

      {/* ── Center: Market status + Focus ── */}
      <div className="flex items-center gap-3 min-w-0">
        {/* ✅ Point 3 : badges marché NYSE et EURONEXT */}
        <div className={`flex items-center gap-1 text-2xs font-mono ${nyseStatus.color}`}
          title="New York Stock Exchange">
          <span className="text-terminal-dim">NYSE</span>
          <span className="font-semibold">{nyseStatus.label}</span>
        </div>
        <div className={`flex items-center gap-1 text-2xs font-mono ${euStatus.color}`}
          title="Euronext Paris">
          <span className="text-terminal-dim">EPA</span>
          <span className="font-semibold">{euStatus.label}</span>
        </div>

        {focusedTicker && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse" />
            <span className="text-terminal-accent tracking-widest font-semibold truncate">
              FOCUS: {focusedTicker}
            </span>
          </div>
        )}
      </div>

      {/* ── Right: Snapshot + Clock ── */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={saveSnapshot}
          className="text-terminal-dim hover:text-terminal-accent transition-colors px-2 py-0.5 border border-terminal-border hover:border-terminal-accent rounded-sm tracking-widest"
        >
          SNAPSHOT{lastSnapshot ? ` · ${formatDistanceToNow(lastSnapshot, { addSuffix: true })}` : ""}
        </button>
        <div className="text-terminal-dim tracking-wider">
          {dateStr} &nbsp; <span className="text-terminal-text">{timeStr}</span>
        </div>
      </div>
    </div>
  );
};

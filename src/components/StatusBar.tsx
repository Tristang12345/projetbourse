/**
 * StatusBar — Bottom bar showing clock, API status, last refresh,
 * and snapshot controls.
 */

import React, { useState, useEffect } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import { formatDistanceToNow } from "date-fns";

export const StatusBar: React.FC = () => {
  const { apiStatus, focusedTicker, lastSnapshot, saveSnapshot } = useTerminalStore();
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const statusDot = (s: string) => {
    if (s === "ok")      return "bg-up";
    if (s === "limited") return "bg-warn";
    if (s === "error")   return "bg-down";
    return "bg-terminal-muted";
  };

  const timeStr = clock.toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const dateStr = clock.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "2-digit", year: "numeric",
  });

  return (
    <div className="h-7 bg-terminal-bg border-t border-terminal-border flex items-center justify-between px-4 text-2xs font-mono text-terminal-dim shrink-0">
      {/* Left: API status indicators */}
      <div className="flex items-center gap-4">
        {(["finnhub", "polygon", "alphavantage"] as const).map((svc) => (
          <div key={svc} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot(apiStatus[svc])}`} />
            <span className="uppercase tracking-wider">{svc.slice(0, 3)}</span>
          </div>
        ))}
      </div>

      {/* Center: Focused ticker */}
      {focusedTicker && (
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse" />
          <span className="text-terminal-accent tracking-widest font-semibold">
            FOCUS: {focusedTicker}
          </span>
        </div>
      )}

      {/* Right: Snapshot + Clock */}
      <div className="flex items-center gap-6">
        <button
          onClick={saveSnapshot}
          className="text-terminal-dim hover:text-terminal-accent transition-colors px-2 py-0.5 border border-terminal-border hover:border-terminal-accent rounded-sm tracking-widest"
        >
          SNAPSHOT {lastSnapshot ? `· ${formatDistanceToNow(lastSnapshot, { addSuffix: true })}` : ""}
        </button>
        <div className="text-terminal-dim tracking-wider">
          {dateStr} &nbsp; <span className="text-terminal-text">{timeStr}</span>
        </div>
      </div>
    </div>
  );
};

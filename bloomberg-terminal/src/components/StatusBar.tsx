// Bottom status bar with market status, time, refresh indicator
import { useState, useEffect } from "react";
import { useTerminalStore } from "@/store";

export function StatusBar() {
  const [time, setTime] = useState(new Date());
  const { portfolio, focusTicker, saveSnapshot } = useTerminalStore();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isMarketOpen = (() => {
    const h = time.getHours(), m = time.getMinutes();
    const total = h * 60 + m;
    const day = time.getDay();
    return day >= 1 && day <= 5 && total >= 570 && total <= 960; // 9:30 - 16:00 ET
  })();

  return (
    <div className="flex items-center justify-between px-4 py-1 bg-terminal-surface border-t border-terminal-border text-2xs font-mono">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isMarketOpen ? "bg-pos animate-pulse" : "bg-gray-500"}`} />
          <span className={isMarketOpen ? "text-pos" : "text-gray-500"}>
            {isMarketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
          </span>
        </span>
        {focusTicker && (
          <span className="text-brand-amber">
            FOCUS: <strong>{focusTicker.ticker}</strong>
          </span>
        )}
        {portfolio.lastUpdate > 0 && (
          <span className="text-gray-500">
            LAST UPDATE: {new Date(portfolio.lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => saveSnapshot(`Snapshot ${time.toLocaleTimeString()}`)}
          className="text-gray-400 hover:text-brand-amber transition-colors px-2 py-0.5 border border-terminal-border rounded hover:border-brand-amber/50"
        >
          ⊞ SNAPSHOT
        </button>
        <span className="text-gray-400">
          {time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <span className="text-white font-semibold tabular-nums">
          {time.toLocaleTimeString("en-US", { hour12: false })}
        </span>
      </div>
    </div>
  );
}

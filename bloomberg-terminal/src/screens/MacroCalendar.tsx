// ============================================================
// SCREEN 4 — MACRO & ECONOMIC CALENDAR
// VIX, DXY, yields, FX + filterable calendar
// ============================================================
import { useEffect } from "react";
import clsx from "clsx";
import { useTerminalStore } from "@/store";
import { getApiService } from "@/services/apiService";
import { formatPct } from "@/lib/financialCalc";
import type { MacroIndicator } from "@/types";

function MacroCard({ ind }: { ind: MacroIndicator }) {
  const isPos = ind.changePct >= 0;
  // VIX: inverse sentiment
  const isVIX = ind.symbol === "VIX";
  const bullish = isVIX ? !isPos : isPos;
  return (
    <div className={clsx("bg-terminal-surface border rounded-sm p-4 transition-all hover:border-white/20", {
      "border-pos/30": bullish,
      "border-neg/30": !bullish,
      "border-terminal-border": Math.abs(ind.changePct) < 0.1,
    })}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-mono font-bold text-white text-lg tabular-nums">{ind.value.toLocaleString()}</div>
          <div className="text-2xs font-mono text-gray-500 mt-0.5">{ind.name}</div>
        </div>
        <span className="text-2xl font-bold text-gray-700 font-mono">{ind.symbol}</span>
      </div>
      <div className={clsx("text-sm font-mono font-semibold tabular-nums", isPos ? "text-pos" : "text-neg")}>
        {isPos ? "▲" : "▼"} {formatPct(Math.abs(ind.changePct))}
        <span className="text-gray-500 font-normal ml-2 text-xs">
          ({isPos ? "+" : ""}{ind.change.toFixed(ind.value > 100 ? 0 : ind.value > 10 ? 2 : 4)})
        </span>
      </div>
    </div>
  );
}

const IMPORTANCE_COLORS = {
  high: "text-neg bg-neg-muted border-neg/30",
  medium: "text-brand-amber bg-brand-amber/10 border-brand-amber/30",
  low: "text-gray-500 bg-white/5 border-white/10",
};
const IMPORTANCE_ICONS = { high: "●●●", medium: "●●○", low: "●○○" };

export function MacroScreen() {
  const { macro, setMacroIndicators, setCalendarEvents, setCalendarFilter, settings } = useTerminalStore();
  const api = getApiService();

  useEffect(() => {
    const load = async () => {
      const [indicators, calendar] = await Promise.all([
        api.fetchMacroIndicators(),
        api.fetchCalendar(),
      ]);
      setMacroIndicators(indicators);
      setCalendarEvents(calendar);
    };
    load();
    const interval = setInterval(load, settings.refreshIntervalSlow);
    return () => clearInterval(interval);
  }, []);

  const filteredCalendar = macro.calendar.filter((e) => {
    if (macro.calendarFilter === "high") return e.importance === "high";
    if (macro.calendarFilter === "medium") return e.importance === "high" || e.importance === "medium";
    return true;
  });

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Macro grid */}
      <div>
        <div className="text-2xs font-mono font-semibold text-gray-500 uppercase tracking-widest mb-2">GLOBAL MACRO</div>
        <div className="grid grid-cols-4 gap-2">
          {macro.indicators.map((ind) => (
            <MacroCard key={ind.symbol} ind={ind} />
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 bg-terminal-surface border border-terminal-border rounded-sm overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border">
          <span className="text-2xs font-mono font-semibold text-gray-500 uppercase tracking-widest">
            ECONOMIC CALENDAR — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </span>
          <div className="flex gap-1">
            {(["all", "medium", "high"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setCalendarFilter(f)}
                className={clsx("text-2xs font-mono px-2 py-1 rounded transition-colors border", {
                  "bg-neg-muted text-neg border-neg/30": macro.calendarFilter === f && f === "high",
                  "bg-brand-amber/10 text-brand-amber border-brand-amber/30": macro.calendarFilter === f && f === "medium",
                  "bg-white/10 text-white border-white/20": macro.calendarFilter === f && f === "all",
                  "text-gray-500 border-terminal-border hover:text-white": macro.calendarFilter !== f,
                })}
              >
                {f === "all" ? "ALL" : f === "medium" ? "MED+" : "HIGH"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-terminal-bg border-b border-terminal-border">
              <tr>
                {["TIME", "COUNTRY", "EVENT", "IMPORTANCE", "ACTUAL", "FORECAST", "PREVIOUS", "SURPRISE"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-2xs font-mono font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCalendar.map((event) => {
                const hasSurprise = event.actual !== undefined && event.forecast !== undefined;
                const surprise = hasSurprise ? event.actual! - event.forecast! : null;
                return (
                  <tr key={event.id} className="border-b border-terminal-border/30 hover:bg-terminal-hover transition-colors">
                    <td className="px-3 py-2.5 font-mono text-gray-400 tabular-nums">{event.time ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-gray-300">{event.country}</span>
                    </td>
                    <td className="px-3 py-2.5 text-white max-w-xs">{event.event}</td>
                    <td className="px-3 py-2.5">
                      <span className={clsx("font-mono text-2xs px-1.5 py-0.5 rounded border", IMPORTANCE_COLORS[event.importance])}>
                        {IMPORTANCE_ICONS[event.importance]}
                      </span>
                    </td>
                    <td className={clsx("px-3 py-2.5 font-mono font-semibold tabular-nums", {
                      "text-pos": hasSurprise && surprise! > 0,
                      "text-neg": hasSurprise && surprise! < 0,
                      "text-gray-400": !hasSurprise,
                    })}>
                      {event.actual !== undefined ? `${event.actual}${event.unit ?? ""}` : <span className="text-brand-amber animate-blink">PENDING</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-400 tabular-nums">
                      {event.forecast !== undefined ? `${event.forecast}${event.unit ?? ""}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-500 tabular-nums">
                      {event.previous !== undefined ? `${event.previous}${event.unit ?? ""}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {surprise !== null && (
                        <span className={clsx("font-mono font-bold text-xs tabular-nums", surprise > 0 ? "text-pos" : "text-neg")}>
                          {surprise > 0 ? "▲" : "▼"} {Math.abs(surprise).toFixed(2)}{event.unit ?? ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

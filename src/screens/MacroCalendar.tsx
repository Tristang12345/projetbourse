/**
 * ============================================================
 * SCREEN 4 — MACRO & CALENDAR
 * VIX, DXY, SPY, Gold, Oil, BTC widgets +
 * Filterable economic calendar.
 * ============================================================
 */

import React, { useState } from "react";
import { Activity, Calendar, Globe2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { format, isToday, isTomorrow, isPast, addDays, startOfDay, endOfDay, isSameDay, isWithinInterval } from "date-fns";
import { useTerminalStore } from "../store/useTerminalStore";
import { useMacroRefresh } from "../hooks/useDataRefresh";
import { colorClass, formatPercent } from "../utils/financialCalculations";
import type { EventImportance } from "../services/types";

// ─── Macro Tile ───────────────────────────────────────────────

interface MacroTileProps {
  label:  string;
  value:  number | null;
  change?: number | null;
  unit?:  string;
  alert?: boolean;
}

const MacroTile: React.FC<MacroTileProps> = ({
  label, value, change, unit = "", alert = false,
}) => {
  const hasPct = change !== undefined && change !== null;
  const upDown = hasPct ? (change >= 0 ? "up" : "down") : null;

  return (
    <div
      className={`bg-terminal-elevated border rounded-md p-3.5 flex flex-col gap-1.5 transition-all
        ${alert ? "border-vix/40 shadow-[0_0_12px_rgba(255,109,0,0.15)]" : "border-terminal-border hover:border-terminal-muted"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xs font-mono tracking-widest text-terminal-dim uppercase">
          {label}
        </span>
        {alert && (
          <span className="text-2xs font-mono text-vix animate-pulse">HIGH</span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl font-mono font-bold text-terminal-text">
          {value !== null ? `${value.toFixed(2)}${unit}` : "—"}
        </span>
        {hasPct && (
          <span className={`text-xs font-mono mb-0.5 ${colorClass(change!)}`}>
            {upDown === "up" ? <ChevronUp className="inline" size={12} /> : <ChevronDown className="inline" size={12} />}
            {formatPercent(change!)}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Calendar Row ─────────────────────────────────────────────

const importanceDot = (imp: EventImportance) => {
  if (imp === "high")   return "bg-down";
  if (imp === "medium") return "bg-warn";
  return "bg-terminal-dim";
};

const importanceLabel = (imp: EventImportance) => {
  if (imp === "high")   return "text-down";
  if (imp === "medium") return "text-warn";
  return "text-terminal-dim";
};

const CalendarRow: React.FC<{
  event: import("../services/types").PivotEconomicEvent;
}> = ({ event }) => {
  const dt     = new Date(event.datetime);
  const past   = isPast(dt);
  const today  = isToday(dt);
  const tmrw   = isTomorrow(dt);

  return (
    <div
      className={`grid grid-cols-12 items-center px-4 py-3 border-b border-terminal-border/50 transition-colors hover:bg-terminal-elevated
        ${past ? "opacity-50" : ""}`}
    >
      {/* Date/Time */}
      <div className="col-span-2">
        <div className={`text-xs font-mono ${today ? "text-terminal-accent" : tmrw ? "text-warn" : "text-terminal-dim"}`}>
          {today ? "TODAY" : tmrw ? "TOMORROW" : format(dt, "MMM dd")}
        </div>
        <div className="text-2xs font-mono text-terminal-dim">
          {format(dt, "HH:mm")} UTC
        </div>
      </div>

      {/* Importance */}
      <div className="col-span-1 flex items-center justify-center">
        <div className={`w-2 h-2 rounded-full ${importanceDot(event.importance)}`} />
      </div>

      {/* Country */}
      <div className="col-span-1 text-xs font-mono font-bold text-terminal-dim">
        {event.country}
      </div>

      {/* Title */}
      <div className="col-span-4 text-sm text-terminal-text font-sans leading-tight">
        {event.title}
      </div>

      {/* Actual */}
      <div className={`col-span-1 text-sm font-mono text-right font-semibold ${
        event.actual
          ? (event.forecast && event.actual > event.forecast ? "text-up" : "text-down")
          : "text-terminal-dim"
      }`}>
        {event.actual ?? "—"}
      </div>

      {/* Forecast */}
      <div className="col-span-1 text-sm font-mono text-right text-terminal-dim">
        {event.forecast ?? "—"}
      </div>

      {/* Previous */}
      <div className="col-span-1 text-sm font-mono text-right text-terminal-dim">
        {event.previous ?? "—"}
      </div>

      {/* Currency */}
      <div className="col-span-1 text-right">
        <span className="text-2xs font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded-sm">
          {event.currency}
        </span>
      </div>
    </div>
  );
};

// ─── Main Screen ──────────────────────────────────────────────

export const MacroCalendar: React.FC = () => {
  // ── Gestion de la plage de dates ───────────────────────────────────────────
  // rangeStart = null → mode live (calendrier centré sur aujourd'hui)
  // rangeStart seul = date unique sélectionnée (en cours de sélection)
  // rangeStart + rangeEnd = plage complète
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<Date | null>(null);
  const [selecting,  setSelecting]  = useState(false);  // 1er clic en cours

  // La date passée à useMacroRefresh = milieu de la plage (ou date unique)
  const anchorDate = rangeStart
    ? (rangeEnd
        ? new Date((rangeStart.getTime() + rangeEnd.getTime()) / 2)
        : rangeStart)
    : undefined;

  useMacroRefresh(anchorDate);

  const { macroData, economicEvents, isLoading } = useTerminalStore();
  const [impFilter, setImpFilter] = useState<EventImportance | "ALL">("ALL");
  const [countryFilter, setCountryFilter] = useState("ALL");

  const macro = macroData;

  const isLive = rangeStart === null;

  const resetLive = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setSelecting(false);
  };

  // Clic sur une date dans le mini-calendrier
  const handleDateClick = (d: Date) => {
    if (!selecting || !rangeStart) {
      // Premier clic: début de plage
      setRangeStart(startOfDay(d));
      setRangeEnd(null);
      setSelecting(true);
    } else {
      // Deuxième clic: fin de plage
      const start = d < rangeStart ? startOfDay(d) : rangeStart;
      const end   = d < rangeStart ? rangeEnd ?? rangeStart : startOfDay(d);
      setRangeStart(start);
      setRangeEnd(d < rangeStart ? rangeStart : startOfDay(d));
      setSelecting(false);
    }
  };

  // Navigation mois
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const shiftMonth = (delta: number) =>
    setDisplayMonth((p) => new Date(p.getFullYear(), p.getMonth() + delta, 1));

  // Filtrage par plage de dates + autres filtres
  const filteredEvents = economicEvents
    .filter((e) => {
      if (!rangeStart) return true;
      const dt = new Date(e.datetime);
      if (rangeEnd) {
        return isWithinInterval(dt, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) });
      }
      return isSameDay(dt, rangeStart);
    })
    .filter((e) => impFilter === "ALL" || e.importance === impFilter)
    .filter((e) => countryFilter === "ALL" || e.country === countryFilter)
    .sort((a, b) => a.datetime - b.datetime);

  const countries = ["ALL", ...new Set(economicEvents.map((e) => e.country))];

  // ── Mini calendrier ────────────────────────────────────────────────────────
  const CalendarPicker: React.FC = () => {
    const year  = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay + 6) % 7; // Mon-first

    const isInRange = (d: Date) => {
      if (!rangeStart || !rangeEnd) return false;
      return isWithinInterval(d, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) });
    };
    const isStart = (d: Date) => rangeStart ? isSameDay(d, rangeStart) : false;
    const isEnd   = (d: Date) => rangeEnd   ? isSameDay(d, rangeEnd)   : false;

    return (
      <div className="absolute top-full left-0 mt-1 z-50 bg-terminal-elevated border border-terminal-border rounded-lg shadow-panel p-3 w-60">
        {/* Header mois */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shiftMonth(-1)} className="p-1 text-terminal-dim hover:text-terminal-text">
            <ChevronLeft size={13} />
          </button>
          <span className="text-xs font-mono font-semibold text-terminal-text">
            {format(displayMonth, "MMMM yyyy")}
          </span>
          <button onClick={() => shiftMonth(+1)} className="p-1 text-terminal-dim hover:text-terminal-text">
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Jours de la semaine */}
        <div className="grid grid-cols-7 mb-1">
          {["L","M","M","J","V","S","D"].map((d, i) => (
            <div key={i} className="text-center text-2xs font-mono text-terminal-dim/60">{d}</div>
          ))}
        </div>

        {/* Grille de jours */}
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d    = new Date(year, month, i + 1);
            const inR  = isInRange(d);
            const isS  = isStart(d);
            const isE  = isEnd(d);
            const isT  = isToday(d);
            return (
              <button
                key={i}
                onClick={() => handleDateClick(d)}
                className={`text-center text-2xs font-mono py-1 rounded transition-colors
                  ${isS || isE
                    ? "bg-terminal-accent text-white font-bold"
                    : inR
                    ? "bg-terminal-accent/20 text-terminal-accent"
                    : isT
                    ? "border border-terminal-accent/50 text-terminal-accent"
                    : "text-terminal-text hover:bg-terminal-border"
                  }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-terminal-border">
          {rangeStart && (
            <span className="text-2xs font-mono text-terminal-dim">
              {format(rangeStart, "dd/MM")}
              {rangeEnd ? ` → ${format(rangeEnd, "dd/MM")}` : (selecting ? " → …" : "")}
            </span>
          )}
          <button
            onClick={resetLive}
            className="ml-auto text-2xs font-mono text-terminal-accent hover:text-white transition-colors"
          >
            Live
          </button>
        </div>
      </div>
    );
  };

  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Macro Tiles ── */}
      <div className="p-4 border-b border-terminal-border shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={13} className="text-terminal-dim" />
          <span className="text-2xs font-mono tracking-widest text-terminal-dim uppercase">
            Global Markets
          </span>
          {isLoading["macro"] && (
            <span className="text-2xs font-mono text-terminal-accent animate-pulse ml-2">● Updating</span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <MacroTile
            label="VIX"
            value={macro?.vix ?? null}
            alert={(macro?.vix ?? 0) > 25}
          />
          <MacroTile label="DXY"  value={macro?.dxy ?? null} unit="" />
          <MacroTile label="SPY"  value={macro?.sp500 ?? null}
            change={macro?.sp500Change ?? null} />
          <MacroTile label="GOLD" value={macro?.gold ?? null}
            change={macro?.goldChange ?? null} />
          <MacroTile label="OIL"  value={macro?.oil ?? null}
            change={macro?.oilChange ?? null} />
          <MacroTile label="BTC"  value={macro?.btc ?? null}
            change={macro?.btcChange ?? null} />
          <MacroTile label="US10Y" value={macro?.us10y ?? null} unit="%" />
          {/* Placeholder for last slot */}
          <div className="bg-terminal-elevated border border-terminal-border rounded-md p-3.5 flex items-center justify-center">
            <Globe2 size={18} className="text-terminal-dim/30" />
          </div>
        </div>
      </div>

      {/* ── Calendar ── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Calendar Header */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-terminal-border bg-terminal-bg shrink-0">
          <Calendar size={13} className="text-terminal-dim" />
          <span className="text-2xs font-mono tracking-widest text-terminal-dim uppercase">
            Economic Calendar
          </span>

          {/* Importance filter */}
          <div className="flex items-center gap-1">
            {(["ALL", "high", "medium", "low"] as const).map((imp) => (
              <button
                key={imp}
                onClick={() => setImpFilter(imp)}
                className={`text-2xs font-mono px-2 py-1 rounded transition-colors ${
                  impFilter === imp
                    ? imp === "high"   ? "text-down bg-down/10 border border-down/30"
                    : imp === "medium" ? "text-warn bg-warn/10 border border-warn/30"
                    : "bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/40"
                    : "text-terminal-dim hover:text-terminal-text border border-transparent"
                }`}
              >
                {imp === "ALL" ? "ALL" : imp.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Country filter */}
          <div className="flex items-center gap-1 ml-2">
            {countries.map((c) => (
              <button
                key={c}
                onClick={() => setCountryFilter(c)}
                className={`text-2xs font-mono px-2 py-1 rounded transition-colors ${
                  countryFilter === c
                    ? "bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/40"
                    : "text-terminal-dim hover:text-terminal-text border border-transparent"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* ── Date Range Picker ── */}
          <div className="ml-auto flex items-center gap-2 relative">
            {!isLive && (
              <button
                onClick={resetLive}
                className="flex items-center gap-1 text-2xs font-mono text-terminal-accent hover:text-white border border-terminal-accent/40 hover:border-terminal-accent rounded px-2 py-1 transition-colors"
              >
                <RotateCcw size={9} /> Live
              </button>
            )}

            {/* Bouton calendrier — affiche la plage sélectionnée */}
            <button
              onClick={() => setShowPicker((p) => !p)}
              className={`flex items-center gap-2 px-3 py-1 border rounded text-2xs font-mono transition-colors
                ${showPicker
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                  : "border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-muted"
                }`}
            >
              <Calendar size={11} />
              {isLive
                ? "Aujourd'hui"
                : rangeEnd
                  ? `${format(rangeStart!, "dd/MM")} → ${format(rangeEnd, "dd/MM")}`
                  : format(rangeStart!, "dd/MM/yyyy")
              }
            </button>

            {/* Mini calendrier popup */}
            {showPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowPicker(false)}
                />
                <CalendarPicker />
              </>
            )}

            <span className="text-2xs font-mono text-terminal-dim">
              {filteredEvents.length} evt
            </span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-12 px-4 py-1.5 border-b border-terminal-border bg-terminal-bg text-2xs font-mono tracking-widest text-terminal-dim uppercase shrink-0">
          <div className="col-span-2">Date/Time</div>
          <div className="col-span-1 text-center">Imp</div>
          <div className="col-span-1">Ctry</div>
          <div className="col-span-4">Event</div>
          <div className="col-span-1 text-right">Actual</div>
          <div className="col-span-1 text-right">Fcst</div>
          <div className="col-span-1 text-right">Prev</div>
          <div className="col-span-1 text-right">CCY</div>
        </div>

        {/* Events */}
        <div className="flex-1 overflow-y-auto">
          {filteredEvents.map((evt) => (
            <CalendarRow key={evt.id} event={evt} />
          ))}
        </div>
      </div>
    </div>
  );
};

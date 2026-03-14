/**
 * ============================================================
 * DATA REFRESH HOOK
 * Manages interval-based data fetching with cleanup.
 * Each screen uses this hook to orchestrate its data needs.
 * ============================================================
 */

import { useEffect, useCallback, useState } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import * as Orchestrator from "../services/dataOrchestrator";
import { REFRESH_INTERVALS } from "../utils/throttle";

/** Refresh real-time portfolio quotes */
export const usePortfolioRefresh = () => {
  const { positions, setQuotes, setLoading } = useTerminalStore();
  const tickers = positions.map((p) => p.ticker);

  const refresh = useCallback(async () => {
    if (tickers.length === 0) return;
    setLoading("portfolio", true);
    const quotes = await Orchestrator.getBatchQuotes(tickers);
    setQuotes(Array.from(quotes.values()));
    setLoading("portfolio", false);
  }, [tickers.join(",")]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.REALTIME);
    return () => clearInterval(id);
  }, [refresh]);
};

/** Refresh news feed */
export const useNewsRefresh = () => {
  const { positions, setNews, setLoading } = useTerminalStore();
  const tickers = positions.map((p) => p.ticker);

  const refresh = useCallback(async () => {
    setLoading("news", true);
    const news = await Orchestrator.getPortfolioNews(tickers);
    setNews(news);
    setLoading("news", false);
  }, [tickers.join(",")]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.NEWS);
    return () => clearInterval(id);
  }, [refresh]);
};

/** Refresh macro dashboard — accepte une date optionnelle pour le calendrier */
export const useMacroRefresh = (calendarDate?: Date) => {
  const { setMacroData, setEconomicEvents, setLoading } = useTerminalStore();

  const refresh = useCallback(async () => {
    setLoading("macro", true);
    const [macro, calendar] = await Promise.allSettled([
      Orchestrator.getMacroData(),
      Orchestrator.getEconomicCalendar(calendarDate),
    ]);
    if (macro.status === "fulfilled")     setMacroData(macro.value);
    if (calendar.status === "fulfilled")  setEconomicEvents(calendar.value);
    setLoading("macro", false);
  }, [calendarDate?.toDateString()]);  // re-fetch quand la date change

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.MACRO);
    return () => clearInterval(id);
  }, [refresh]);
};

/** Refresh market overview for the given region (default US) */
export const useMarketRefresh = (region: import("../services/dataOrchestrator").MarketRegion = "US") => {
  const { setQuotes, setLoading } = useTerminalStore();

  const refresh = useCallback(async () => {
    setLoading("market", true);
    const quotes = await Orchestrator.getMarketOverview(region);
    setQuotes(quotes);
    setLoading("market", false);
  }, [region]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.MARKET);
    return () => clearInterval(id);
  }, [refresh]);

  return { refresh };
};

/** Run screener with live progress */
export const useScreenerRefresh = (universe: string[]) => {
  const { setScreenerSignals, setLoading } = useTerminalStore();
  const [progress, setProgress] = useState({ completed: 0, total: 0, current: "" });

  const refresh = useCallback(async () => {
    if (!universe.length) return;
    setLoading("screener", true);
    setProgress({ completed: 0, total: universe.length, current: "" });

    const signals = await Orchestrator.runScreener(
      universe,
      (completed, total, current) =>
        setProgress({ completed, total, current }),
    );

    setScreenerSignals(signals);
    setLoading("screener", false);
    setProgress((p) => ({ ...p, completed: p.total }));
  }, [universe.join(",")]);

  useEffect(() => {
    refresh();                                               // run immediately on mount
    const id = setInterval(refresh, REFRESH_INTERVALS.TECHNICAL);
    return () => clearInterval(id);
  }, [refresh]);

  return { refresh, progress };
};

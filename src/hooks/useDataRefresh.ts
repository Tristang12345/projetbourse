/**
 * ============================================================
 * DATA REFRESH HOOKS
 * Corrections :
 *   - Alertes de prix fonctionnelles avec notification Tauri native
 *   - usePortfolioRefresh intègre le check d'alertes à chaque refresh
 * ============================================================
 */

import { useEffect, useCallback, useState } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import { useAlertStore }    from "../store/useAlertStore";
import * as Orchestrator    from "../services/dataOrchestrator";
import { REFRESH_INTERVALS } from "../utils/throttle";

// Détecte si on est dans Tauri pour les notifications natives
const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI__" in window;

/**
 * Déclenche une notification Tauri native quand une alerte prix est franchie.
 * Fallback sur la Web Notifications API si hors Tauri (dev browser).
 */
const sendPriceNotification = async (ticker: string, price: number, direction: "above" | "below", target: number) => {
  const title = `⚡ Alerte ${ticker}`;
  const body  = `Prix ${direction === "above" ? "≥" : "≤"} ${target.toFixed(2)} — Cours actuel : ${price.toFixed(2)}`;

  if (isTauri()) {
    try {
      const { sendNotification } = await import("@tauri-apps/api/notification");
      await sendNotification({ title, body });
      return;
    } catch { /* fallback */ }
  }

  // Fallback : Web Notifications API (navigateur)
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      const perm = await Notification.requestPermission();
      if (perm === "granted") new Notification(title, { body });
    }
  }
};

// ─── Portfolio Refresh ────────────────────────────────────────

/** Rafraîchit les quotes du portfolio + vérifie les alertes prix */
export const usePortfolioRefresh = () => {
  const { positions, setQuotes, setLoading, quotes } = useTerminalStore();
  const { checkAlerts } = useAlertStore();
  const tickers = positions.map((p) => p.ticker);

  const refresh = useCallback(async () => {
    if (!tickers.length) return;
    setLoading("portfolio", true);
    const freshQuotes = await Orchestrator.getBatchQuotes(tickers);
    setQuotes(Array.from(freshQuotes.values()));

    // ── Vérification des alertes prix ────────────────────────
    // À chaque refresh, on compare les prix reçus aux alertes actives.
    const prices: Record<string, number> = {};
    freshQuotes.forEach((q, t) => { prices[t] = q.price; });
    const triggered = checkAlerts(prices);

    // Envoyer une notification Tauri pour chaque alerte déclenchée
    for (const alert of triggered) {
      const currentPrice = prices[alert.ticker] ?? alert.targetPrice;
      await sendPriceNotification(
        alert.ticker, currentPrice, alert.direction, alert.targetPrice,
      );
    }

    setLoading("portfolio", false);
  }, [tickers.join(",")]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.REALTIME);
    return () => clearInterval(id);
  }, [refresh]);
};

// ─── News Refresh ─────────────────────────────────────────────

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

// ─── Macro Refresh ────────────────────────────────────────────

export const useMacroRefresh = (calendarDate?: Date) => {
  const { setMacroData, setEconomicEvents, setLoading } = useTerminalStore();

  const refresh = useCallback(async () => {
    setLoading("macro", true);
    const [macro, calendar] = await Promise.allSettled([
      Orchestrator.getMacroData(),
      Orchestrator.getEconomicCalendar(calendarDate),
    ]);
    if (macro.status    === "fulfilled") setMacroData(macro.value);
    if (calendar.status === "fulfilled") setEconomicEvents(calendar.value);
    setLoading("macro", false);
  }, [calendarDate?.toDateString()]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.MACRO);
    return () => clearInterval(id);
  }, [refresh]);
};

// ─── Market Refresh ───────────────────────────────────────────

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

// ─── Screener Refresh ─────────────────────────────────────────

export const useScreenerRefresh = (universe: string[]) => {
  const { setScreenerSignals, setLoading } = useTerminalStore();
  const [progress, setProgress] = useState({ completed: 0, total: 0, current: "" });

  const refresh = useCallback(async () => {
    if (!universe.length) return;
    setLoading("screener", true);
    setProgress({ completed: 0, total: universe.length, current: "" });

    const signals = await Orchestrator.runScreener(
      universe,
      (completed, total, current) => setProgress({ completed, total, current }),
    );

    setScreenerSignals(signals);
    setLoading("screener", false);
    setProgress((p) => ({ ...p, completed: p.total }));
  }, [universe.join(",")]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVALS.TECHNICAL);
    return () => clearInterval(id);
  }, [refresh]);

  return { refresh, progress };
};

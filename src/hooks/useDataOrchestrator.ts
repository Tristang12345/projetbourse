/**
 * useDataOrchestrator — Central data-fetching hook.
 * Manages refresh intervals, throttling, and cache writing.
 *
 * Refresh cadences:
 *  - Portfolio P&L  : every 15s
 *  - Market activity: every 30s
 *  - News           : every 5min
 *  - Macro          : every 5min
 *  - Screener       : every 10min (on demand)
 */
import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import { fetchQuote, fetchNews, fetchCandles } from "../services/api/finnhub";
import { fetchRSI, fetchSMA } from "../services/api/alphavantage";
import { db } from "../services/db";
import {
  computePnL, computeRSI, computeSMA, computeRelVolume,
  detectSignals, computeScore, normalizeSparkline,
} from "../utils/finance";
import type { PositionPnL, PivotMacro, ScreenerResult } from "../types";
import { format, subDays } from "date-fns";

const MACRO_TICKERS = ["^VIX", "DX-Y.NYB", "SPY", "QQQ", "GLD", "USO", "BTC-USD"];

export function useDataOrchestrator() {
  const store          = useStore();
  const intervalsRef   = useRef<ReturnType<typeof setInterval>[]>([]);

  const clearIntervals = () => {
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current = [];
  };

  // ── Load positions from SQLite on mount ──────────────────────
  const loadPositions = useCallback(async () => {
    try {
      const positions = await db.getPositions();
      store.setPositions(positions);
    } catch (e) {
      console.error("loadPositions:", e);
    }
  }, []);

  // ── Refresh portfolio P&L ─────────────────────────────────────
  const refreshPortfolio = useCallback(async () => {
    const { positions, config } = useStore.getState();
    if (!positions.length || !config.finnhubKey) return;
    store.setLoading("portfolio", true);
    try {
      const today    = format(new Date(), "yyyy-MM-dd");
      const weekAgo  = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const nowTs    = Math.floor(Date.now() / 1000);
      const weekTs   = Math.floor(subDays(new Date(), 7).getTime() / 1000);

      const pnls = await Promise.all(positions.map(async (pos) => {
        const [quote, candles] = await Promise.allSettled([
          fetchQuote(pos.ticker, config.finnhubKey),
          fetchCandles(pos.ticker, config.finnhubKey, "D", weekTs, nowTs),
        ]);
        const q = quote.status === "fulfilled" ? quote.value : null;
        const c = candles.status === "fulfilled" ? candles.value : [];
        const price = q?.price ?? 0;
        const { marketValue, pnlAbsolute, pnlPercent } = computePnL(pos.quantity, pos.avg_cost, price);
        if (q) store.upsertQuote(q);
        return {
          ...pos,
          currentPrice: price,
          marketValue,
          pnlAbsolute,
          pnlPercent,
          dayChange:    q?.change ?? 0,
          dayChangePct: q?.changePct ?? 0,
          candles:      c,
        } as PositionPnL;
      }));
      store.setPositionPnLs(pnls);
      store.stampRefresh("portfolio");
    } finally {
      store.setLoading("portfolio", false);
    }
  }, []);

  // ── Refresh news ──────────────────────────────────────────────
  const refreshNews = useCallback(async () => {
    const { positions, config } = useStore.getState();
    if (!positions.length || !config.finnhubKey) return;
    store.setLoading("news", true);
    try {
      const today   = format(new Date(), "yyyy-MM-dd");
      const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const allNews = (await Promise.allSettled(
        positions.map(p => fetchNews(p.ticker, config.finnhubKey, weekAgo, today))
      ))
        .flatMap(r => r.status === "fulfilled" ? r.value : [])
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

      store.setNews(allNews);
      await db.cacheNews(allNews);
      store.stampRefresh("news");
    } finally {
      store.setLoading("news", false);
    }
  }, []);

  // ── Refresh macro ─────────────────────────────────────────────
  const refreshMacro = useCallback(async () => {
    const { config } = useStore.getState();
    if (!config.finnhubKey) return;
    store.setLoading("macro", true);
    try {
      const results = await Promise.allSettled(
        MACRO_TICKERS.map(t => fetchQuote(t, config.finnhubKey))
      );
      const [vix, dxy, sp500, nasdaq, gold, oil, btc] = results.map(
        r => r.status === "fulfilled" ? r.value : null
      );
      store.setMacro({ vix, dxy, sp500, nasdaq, gold, oil, btc, tenYrYield: null });
      store.stampRefresh("macro");
    } finally {
      store.setLoading("macro", false);
    }
  }, []);

  // ── Run screener ──────────────────────────────────────────────
  const runScreener = useCallback(async () => {
    const { positions, quotes, config } = useStore.getState();
    if (!positions.length) return;
    store.setLoading("screener", true);
    try {
      const results: ScreenerResult[] = await Promise.all(
        positions.map(async (pos) => {
          const quote = quotes[pos.ticker];
          const [rsi, sma50, sma200] = await Promise.allSettled([
            fetchRSI(pos.ticker, config.alphaVantageKey),
            fetchSMA(pos.ticker, config.alphaVantageKey, 50),
            fetchSMA(pos.ticker, config.alphaVantageKey, 200),
          ]);
          const r   = rsi.status === "fulfilled" ? rsi.value : 50;
          const s50 = sma50.status === "fulfilled" ? sma50.value : 0;
          const s200 = sma200.status === "fulfilled" ? sma200.value : 0;
          const relVol = computeRelVolume(quote?.volume ?? 0, quote?.avgVolume30d ?? 1);
          const signals = detectSignals(r, s50, s200, relVol, quote?.price ?? 0, quote?.week52High ?? 0, quote?.week52Low ?? 0);
          const score   = computeScore(signals, r, relVol);
          return {
            ticker:    pos.ticker,
            name:      pos.name,
            price:     quote?.price ?? 0,
            changePct: quote?.changePct ?? 0,
            rsi:       r,
            sma50:     s50,
            sma200:    s200,
            relVolume: relVol,
            signals,
            score,
          };
        })
      );
      store.setScreenerResults(results.sort((a, b) => b.score - a.score));
      store.stampRefresh("screener");
    } finally {
      store.setLoading("screener", false);
    }
  }, []);

  // ── Wire up intervals ─────────────────────────────────────────
  useEffect(() => {
    // Initial load
    loadPositions().then(() => {
      refreshPortfolio();
      refreshNews();
      refreshMacro();
    });

    // Schedule refreshes
    intervalsRef.current = [
      setInterval(refreshPortfolio, 15_000),
      setInterval(refreshNews,      5 * 60_000),
      setInterval(refreshMacro,     5 * 60_000),
    ];

    return clearIntervals;
  }, []);

  return { refreshPortfolio, refreshNews, refreshMacro, runScreener, loadPositions };
}

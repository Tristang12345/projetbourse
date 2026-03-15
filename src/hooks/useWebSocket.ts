/**
 * ============================================================
 * useWebSocket — Prix temps réel via WebSocket Finnhub.
 *
 * Résout le point 7 : les tickers EU (.PA, .DE, etc.) étaient lents
 * car chaque prix nécessitait un appel HTTP séquentiel.
 * Ce hook ouvre UNE SEULE connexion WebSocket Finnhub et pousse
 * tous les prix en temps réel simultanément.
 *
 * Pour les tickers EU non supportés par Finnhub WS (Euronext),
 * on utilise Yahoo Finance en polling court (5s) — solution hybride.
 * ============================================================
 */

import { useEffect, useRef, useCallback } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import { loadApiKeys } from "../hooks/useApiKeys";
import type { PivotQuote } from "../services/types";
import * as Yahoo from "../services/yahooFinanceService";

// Finnhub WebSocket ne supporte que les tickers US (pas .PA, .DE, etc.)
const isWSSupported = (ticker: string): boolean =>
  !ticker.includes(".");

interface FinnhubTrade {
  type: "trade";
  data: Array<{
    s: string;  // symbol
    p: number;  // price
    t: number;  // timestamp ms
    v: number;  // volume
  }>;
}

/**
 * Hook principal — à appeler une seule fois dans App.tsx.
 * Gère :
 *   - WebSocket Finnhub pour tickers US (instantané)
 *   - Polling Yahoo Finance 5s pour tickers EU (rapide)
 *   - Reconnexion automatique si la connexion se coupe
 */
export const useRealtimePrices = (tickers: string[]) => {
  const { setQuote, quotes } = useTerminalStore();
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── WebSocket Finnhub pour tickers US ─────────────────────
  const connectWS = useCallback(async () => {
    const keys = await loadApiKeys();
    if (!keys.finnhub) return;

    const usTickers = tickers.filter(isWSSupported);
    if (!usTickers.length) return;

    // Fermer la connexion précédente si elle existe
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(`wss://ws.finnhub.io?token=${keys.finnhub}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // S'abonner à tous les tickers US en une fois
      usTickers.forEach((ticker) => {
        ws.send(JSON.stringify({ type: "subscribe", symbol: ticker }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg: FinnhubTrade = JSON.parse(event.data);
        if (msg.type !== "trade" || !msg.data?.length) return;

        msg.data.forEach((trade) => {
          const existing = quotes[trade.s];
          if (!existing) return;

          // Mise à jour partielle : seul le prix change en temps réel
          const updated: PivotQuote = {
            ...existing,
            price:         trade.p,
            change:        trade.p - existing.prevClose,
            changePercent: existing.prevClose > 0
              ? ((trade.p - existing.prevClose) / existing.prevClose) * 100
              : 0,
            volume:    existing.volume + trade.v,
            timestamp: trade.t,
          };
          setQuote(trade.s, updated);
        });
      } catch {
        // Ignorer les messages malformés
      }
    };

    ws.onerror = () => { ws.close(); };

    ws.onclose = () => {
      wsRef.current = null;
      // Reconnexion dans 5s si des tickers US sont toujours actifs
      if (tickers.some(isWSSupported)) {
        setTimeout(connectWS, 5000);
      }
    };
  }, [tickers, quotes, setQuote]);

  // ── Polling Yahoo Finance 5s pour tickers EU ──────────────
  const pollEuTickers = useCallback(async () => {
    const euTickers = tickers.filter((t) => !isWSSupported(t));
    if (!euTickers.length) return;

    // Fetch en parallèle, batch de 5 pour ne pas saturer Yahoo
    const BATCH = 5;
    for (let i = 0; i < euTickers.length; i += BATCH) {
      const batch = euTickers.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (ticker) => {
          const q = await Yahoo.fetchQuote(ticker);
          if (q) setQuote(ticker, q);
        }),
      );
    }
  }, [tickers, setQuote]);

  // ── Montage ───────────────────────────────────────────────
  useEffect(() => {
    if (!tickers.length) return;

    // Démarrer le WebSocket US
    connectWS();

    // Polling EU toutes les 5s (Yahoo Finance est rapide et gratuit)
    pollEuTickers(); // Fetch immédiat au montage
    timerRef.current = setInterval(pollEuTickers, 5_000);

    return () => {
      // Nettoyage
      if (wsRef.current) {
        const usTickers = tickers.filter(isWSSupported);
        usTickers.forEach((t) => {
          wsRef.current?.send(JSON.stringify({ type: "unsubscribe", symbol: t }));
        });
        wsRef.current.close();
        wsRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tickers.join(",")]); // Re-run si la liste de tickers change
};

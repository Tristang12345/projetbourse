/**
 * ============================================================
 * CONNECTION STATE HOOK
 * Detects online/offline status and API health.
 * Drives the mock-mode banner and status bar indicators.
 * ============================================================
 */

import { useState, useEffect, useCallback } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import { isMockMode } from "../services/mockDataService";

export type ConnectionStatus = "online" | "offline" | "mock";

interface ConnectionState {
  status:        ConnectionStatus;
  isOnline:      boolean;
  isMock:        boolean;
  lastPingMs:    number | null;     // last successful API ping latency
}

/**
 * Lightweight probe — tries to reach Finnhub status endpoint.
 * Returns latency in ms or null on failure.
 */
const probeConnectivity = async (): Promise<number | null> => {
  const start = performance.now();
  try {
    // Utilise une URL publique sans authentification.
    // Finnhub /status retourne 401 sans clé → faux "hors ligne".
    await fetch("https://www.google.com/generate_204", {
      method: "HEAD",
      signal: AbortSignal.timeout(4_000),
      mode:   "no-cors",  // évite les erreurs CORS, on veut juste savoir si le réseau répond
    });
    return Math.round(performance.now() - start);
  } catch {
    return null;
  }
};

export const useConnectionState = (): ConnectionState => {
  const { setApiStatus } = useTerminalStore();

  const [state, setState] = useState<ConnectionState>({
    status:     isMockMode() ? "mock" : navigator.onLine ? "online" : "offline",
    isOnline:   navigator.onLine,
    isMock:     isMockMode(),
    lastPingMs: null,
  });

  const checkStatus = useCallback(async () => {
    if (isMockMode()) {
      setState((s) => ({ ...s, status: "mock" }));
      return;
    }

    const isOnline = navigator.onLine;
    if (!isOnline) {
      setState((s) => ({ ...s, status: "offline", isOnline: false }));
      setApiStatus({ finnhub: "error", polygon: "error", alphavantage: "error" });
      return;
    }

    const latency = await probeConnectivity();
    // Si le ping arrive = online. Si null = réseau instable mais on reste "online"
    // (les APIs individuelles gèrent leurs propres erreurs)
    const status: ConnectionStatus = latency !== null ? "online" : "offline";
    setState({ status, isOnline: latency !== null, isMock: false, lastPingMs: latency });
    setApiStatus({ finnhub: latency !== null ? "ok" : "error" });
  }, [setApiStatus]);

  useEffect(() => {
    checkStatus();

    // Re-check on browser online/offline events
    const onOnline  = () => checkStatus();
    const onOffline = () => {
      setState((s) => ({ ...s, status: "offline", isOnline: false }));
    };
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    // Periodic probe every 2 min
    const id = setInterval(checkStatus, 120_000);

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(id);
    };
  }, [checkStatus]);

  return state;
};

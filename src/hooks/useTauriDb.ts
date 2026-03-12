/**
 * ============================================================
 * TAURI DATABASE BRIDGE
 * Wraps Tauri invoke() calls with type safety.
 * Falls back to no-op in browser mode (dev without Tauri).
 * ============================================================
 */

import { useEffect, useCallback } from "react";
import { useTerminalStore } from "../store/useTerminalStore";
import type { Position } from "../services/types";

// Detect if running inside Tauri (desktop) or plain browser
const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI__" in window;

// Dynamic import to avoid crash in browser mode
const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  if (!isTauri()) {
    console.debug(`[TauriDB] Browser mode — skipping invoke(${cmd})`);
    return null;
  }
  try {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/tauri");
    return tauriInvoke<T>(cmd, args);
  } catch (err) {
    console.error(`[TauriDB] invoke(${cmd}) failed:`, err);
    return null;
  }
};

// ─── Position Sync ────────────────────────────────────────────

/**
 * On mount: load positions from SQLite.
 * On position change: persist to SQLite.
 */
export const usePersistPositions = () => {
  const { positions, addPosition } = useTerminalStore();

  // Initial load from DB
  useEffect(() => {
    const loadFromDb = async () => {
      const dbPositions = await invoke<any[]>("get_positions");
      if (!dbPositions?.length) return;
      // Only seed if Zustand has no persisted data
      const storeHas = useTerminalStore.getState().positions.length > 0;
      if (storeHas) return;
      dbPositions.forEach((p) => addPosition({
        ticker:   p.ticker,
        name:     p.name,
        sector:   p.sector,
        quantity: p.quantity,
        avgCost:  p.avg_cost,
      }));
    };
    loadFromDb();
  }, []);

  // Persist changes
  useEffect(() => {
    const persistAll = async () => {
      for (const pos of positions) {
        await invoke("save_position", {
          position: {
            id:       pos.id,
            ticker:   pos.ticker,
            name:     pos.name,
            sector:   pos.sector,
            quantity: pos.quantity,
            avg_cost: pos.avgCost,
            added_at: pos.addedAt,
          },
        });
      }
    };
    persistAll();
  }, [positions]);
};

// ─── Snapshot Persistence ─────────────────────────────────────

/**
 * Save current terminal state as a DB snapshot.
 */
export const useSaveSnapshot = () => {
  const { quotes, positions, macroData, screenerSignals } = useTerminalStore();

  return useCallback(async (label?: string) => {
    const snapshotLabel = label ?? `Snapshot ${new Date().toLocaleString()}`;
    const data = JSON.stringify({
      quotes:          Object.fromEntries(Object.entries(quotes)),
      positions,
      macroData,
      screenerSignals,
      savedAt:         Date.now(),
    });
    const id = await invoke<number>("create_snapshot", {
      label:    snapshotLabel,
      dataJson: data,
    });
    return id;
  }, [quotes, positions, macroData, screenerSignals]);
};

// ─── News Cache ───────────────────────────────────────────────

/**
 * Persist news items to local cache for offline viewing.
 */
export const useCacheNews = () => {
  const { news } = useTerminalStore();

  useEffect(() => {
    if (!news.length) return;
    const persist = async () => {
      const items = news.map((n) => ({
        id:           n.id,
        ticker:       n.ticker ?? null,
        headline:     n.headline,
        summary:      n.summary,
        source:       n.source,
        url:          n.url,
        published_at: n.publishedAt,
        tags_json:    JSON.stringify(n.tags),
        sentiment:    n.sentiment ?? null,
      }));
      await invoke("cache_news", { items });
    };
    persist();
  }, [news.length]);
};

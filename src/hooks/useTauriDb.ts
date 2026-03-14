/**
 * ============================================================
 * TAURI DATABASE BRIDGE
 * Wraps Tauri invoke() calls with type safety.
 * Falls back to no-op in browser mode (dev without Tauri).
 * ============================================================
 */

import React, { useEffect, useCallback, useRef } from "react";
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

  // ── Hydration depuis SQLite au démarrage ──────────────────────────────
  // `init_database` est la source de vérité : il initialise le schéma ET
  // retourne toutes les positions persistées. On écrase le Store Zustand
  // avec ces données (SQLite prime sur le cache localStorage de Zustand).
  useEffect(() => {
    const hydrateFromDb = async () => {
      // Appel init_database (crée le schéma si absent + retourne les positions)
      const dbPositions = await invoke<any[]>("init_database", {});

      if (dbPositions?.length) {
        // SQLite est la source de vérité : remplace l'état Zustand.
        useTerminalStore.setState({
          positions: dbPositions.map((p) => ({
            id:       p.id,
            ticker:   p.ticker,
            name:     p.name,
            sector:   p.sector,
            quantity: p.quantity,
            avgCost:  p.avg_cost,
            addedAt:  p.added_at ?? Date.now(),
          })),
        });
      } else {
        // DB vide (premier lancement) : synchroniser depuis Zustand vers SQLite.
        // Si Zustand a déjà des positions (via onRehydrateStorage), on les persiste.
        const { positions } = useTerminalStore.getState();
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
      }
    };
    hydrateFromDb();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // IDs précédemment connus — permet de détecter les suppressions
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Persist changes: upsert positions ajoutées/modifiées + delete positions supprimées
  useEffect(() => {
    const syncPositions = async () => {
      const currentIds = new Set(positions.map((p) => p.id));

      // ── Suppressions : IDs qui étaient là avant et ne sont plus là ────────
      for (const oldId of prevIdsRef.current) {
        if (!currentIds.has(oldId)) {
          await invoke("delete_position", { id: oldId });
        }
      }

      // ── Upserts : toutes les positions actuelles ───────────────────────────
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

      prevIdsRef.current = currentIds;
    };
    syncPositions();
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

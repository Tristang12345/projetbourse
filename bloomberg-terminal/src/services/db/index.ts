/**
 * Database Service — Tauri command wrappers for SQLite operations.
 * All persistence flows through this module.
 */
import { invoke } from "@tauri-apps/api/tauri";
import type { Position, PivotNews } from "../../types";

// ── POSITIONS ─────────────────────────────────────────────────
export const db = {
  async upsertPosition(position: Position): Promise<number> {
    return invoke("upsert_position", { position });
  },

  async getPositions(): Promise<Position[]> {
    return invoke("get_positions");
  },

  async deletePosition(ticker: string): Promise<void> {
    return invoke("delete_position", { ticker });
  },

  // ── NEWS CACHE ─────────────────────────────────────────────
  async cacheNews(items: PivotNews[]): Promise<number> {
    const serialized = items.map(n => ({
      ticker:       n.ticker,
      headline:     n.headline,
      summary:      n.summary,
      source:       n.source,
      url:          n.url,
      published_at: n.publishedAt.toISOString(),
      sentiment:    n.sentiment,
      tags:         JSON.stringify(n.tags),
    }));
    return invoke("cache_news", { items: serialized });
  },

  async getCachedNews(tickers: string[], limit = 100): Promise<PivotNews[]> {
    const raw: {
      id: number; ticker: string; headline: string; summary: string;
      source: string; url: string; published_at: string;
      sentiment: number | null; tags: string | null;
    }[] = await invoke("get_news", { tickers, limit });
    return raw.map(r => ({
      id:          String(r.id),
      ticker:      r.ticker,
      headline:    r.headline,
      summary:     r.summary ?? "",
      source:      r.source ?? "",
      url:         r.url ?? "",
      publishedAt: new Date(r.published_at),
      sentiment:   r.sentiment ?? 0,
      tags:        r.tags ? JSON.parse(r.tags) : [],
    }));
  },

  // ── SNAPSHOTS ─────────────────────────────────────────────
  async saveSnapshot(label: string, data: unknown): Promise<string> {
    return invoke("save_snapshot", { label, data: JSON.stringify(data) });
  },

  async listSnapshots(): Promise<{ id: number; snapshot_id: string; label: string; created_at: string }[]> {
    return invoke("list_snapshots");
  },

  async loadSnapshot(snapshotId: string): Promise<{ data: string }> {
    return invoke("load_snapshot", { snapshot_id: snapshotId });
  },
};

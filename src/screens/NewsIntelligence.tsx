/**
 * ============================================================
 * SCREEN 2 — NEWS INTELLIGENCE
 * ✅ Point 8 : Focus Mode — filtre automatiquement sur le ticker focalisé
 * ============================================================
 */

import React, { useState, useMemo } from "react";
import { ExternalLink, Filter, Tag, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTerminalStore } from "../store/useTerminalStore";
import { useNewsRefresh }   from "../hooks/useDataRefresh";
import type { PivotNewsItem } from "../services/types";

const SECTOR_COLORS: Record<string, string> = {
  Technology:    "text-blue-400   border-blue-400/40   bg-blue-400/5",
  Finance:       "text-green-400  border-green-400/40  bg-green-400/5",
  Healthcare:    "text-red-400    border-red-400/40    bg-red-400/5",
  Consumer:      "text-yellow-400 border-yellow-400/40 bg-yellow-400/5",
  Energy:        "text-orange-400 border-orange-400/40 bg-orange-400/5",
  Industrials:   "text-purple-400 border-purple-400/40 bg-purple-400/5",
  Communication: "text-cyan-400   border-cyan-400/40   bg-cyan-400/5",
};

const getSectorColor = (sector?: string): string =>
  SECTOR_COLORS[sector ?? ""] ?? "text-terminal-dim border-terminal-muted bg-terminal-muted/20";

const sentimentColor = (s?: string) => {
  if (s === "bullish") return "text-up";
  if (s === "bearish") return "text-down";
  return "text-terminal-dim";
};

const NewsCard: React.FC<{ item: PivotNewsItem; isFocused: boolean }> = ({ item, isFocused }) => {
  const { positions, setFocusedTicker, focusedTicker } = useTerminalStore();
  const sector = positions.find((p) => p.ticker === item.ticker)?.sector;

  return (
    <div
      className={`border-b border-terminal-border/50 px-5 py-3.5 transition-colors hover:bg-terminal-elevated cursor-pointer
        ${isFocused ? "bg-terminal-accent/5 border-l-2 border-l-terminal-accent" : ""}`}
      onClick={() => item.ticker && setFocusedTicker(
        focusedTicker === item.ticker ? null : item.ticker
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {item.ticker && (
            <span className="text-2xs font-mono font-semibold text-terminal-accent border border-terminal-accent/30 bg-terminal-accent/5 px-1.5 py-0.5 rounded-sm">
              {item.ticker}
            </span>
          )}
          {sector && (
            <span className={`text-2xs font-mono border px-1.5 py-0.5 rounded-sm ${getSectorColor(sector)}`}>
              {sector}
            </span>
          )}
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-2xs font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded-sm">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-2xs text-terminal-dim font-mono shrink-0">
          <Clock size={9} />
          {formatDistanceToNow(item.publishedAt, { addSuffix: true })}
        </div>
      </div>
      <p className="text-sm text-terminal-text font-sans leading-snug mb-1.5">{item.headline}</p>
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-terminal-dim font-sans leading-relaxed line-clamp-2 flex-1">{item.summary}</p>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className={`text-2xs font-mono ${sentimentColor(item.sentiment)}`}>
            {item.sentiment?.toUpperCase()}
          </span>
          <a href={item.url} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer"
            className="text-terminal-dim hover:text-terminal-accent transition-colors">
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
      <div className="mt-1">
        <span className="text-2xs font-mono text-terminal-dim/60">{item.source}</span>
      </div>
    </div>
  );
};

export const NewsIntelligence: React.FC = () => {
  useNewsRefresh();

  const { news, positions, focusedTicker, isLoading } = useTerminalStore();
  const [filterTicker,    setFilterTicker]    = useState<string>("ALL");
  const [filterSentiment, setFilterSentiment] = useState<string>("ALL");
  const [searchQuery,     setSearchQuery]     = useState("");

  // ✅ Point 8 : si un ticker est focalisé, on l'applique automatiquement comme filtre
  // L'utilisateur peut toujours choisir "ALL" pour voir toutes les news
  const effectiveTicker = focusedTicker && filterTicker === "ALL" ? focusedTicker : filterTicker;

  const tickers = ["ALL", ...positions.map((p) => p.ticker)];

  const filtered = useMemo(() => {
    let items = [...news];
    if (effectiveTicker !== "ALL") {
      items = items.filter((n) => n.ticker === effectiveTicker);
    }
    if (filterSentiment !== "ALL") {
      items = items.filter((n) => n.sentiment === filterSentiment.toLowerCase());
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((n) =>
        n.headline.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.source.toLowerCase().includes(q),
      );
    }
    return items;
  }, [news, effectiveTicker, filterSentiment, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* ✅ Bandeau Focus Mode actif */}
      {focusedTicker && filterTicker === "ALL" && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-terminal-accent/5 border-b border-terminal-accent/20 text-2xs font-mono shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse" />
          <span className="text-terminal-accent">Focus Mode actif</span>
          <span className="text-terminal-dim">— affichage des news pour</span>
          <span className="text-terminal-text font-bold">{focusedTicker}</span>
          <button onClick={() => setFilterTicker(focusedTicker)}
            className="ml-auto text-terminal-dim hover:text-terminal-text underline">
            Voir tout
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-terminal-border bg-terminal-bg shrink-0 flex-wrap">
        <Filter size={13} className="text-terminal-dim" />
        <div className="flex items-center gap-1">
          {tickers.map((t) => (
            <button key={t} onClick={() => setFilterTicker(t)}
              className={`text-2xs font-mono px-2 py-1 rounded transition-colors ${
                filterTicker === t
                  ? "bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/40"
                  : "text-terminal-dim hover:text-terminal-text border border-transparent"
              }`}>
              {t}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-terminal-border mx-1" />
        {["ALL","BULLISH","BEARISH","NEUTRAL"].map((s) => (
          <button key={s} onClick={() => setFilterSentiment(s)}
            className={`text-2xs font-mono px-2 py-1 rounded transition-colors ${
              filterSentiment === s
                ? s === "BULLISH" ? "text-up bg-up/10 border border-up/30"
                : s === "BEARISH" ? "text-down bg-down/10 border border-down/30"
                : "bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/40"
                : "text-terminal-dim hover:text-terminal-text border border-transparent"
            }`}>
            {s}
          </button>
        ))}
        <div className="ml-auto">
          <input
            className="bg-terminal-surface border border-terminal-border rounded px-3 py-1 text-xs font-mono text-terminal-text placeholder-terminal-dim focus:outline-none focus:border-terminal-accent w-48"
            placeholder="Search news..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span className="text-2xs font-mono text-terminal-dim">
          {filtered.length} items
          {isLoading["news"] && <span className="ml-2 text-terminal-accent animate-pulse">● LIVE</span>}
        </span>
      </div>

      {/* ── News Feed ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-terminal-dim">
            <Tag size={28} className="mb-3 opacity-30" />
            <p className="font-mono text-sm">No news matching filters</p>
          </div>
        ) : (
          filtered.map((item) => (
            <NewsCard key={item.id} item={item}
              isFocused={!!focusedTicker && item.ticker === focusedTicker} />
          ))
        )}
      </div>
    </div>
  );
};

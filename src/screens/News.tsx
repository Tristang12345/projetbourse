/**
 * News Intelligence — Filtered news feed with sector tagging and sentiment.
 */
import { useState, useMemo } from "react";
import { useStore, selectFilteredNews } from "../store";
import { TickerBadge } from "../components/TickerBadge";
import { SectionLoader } from "../components/Loading";
import { sentimentLabel, formatCurrency } from "../utils/finance";
import { formatDistanceToNow } from "date-fns";

const SECTOR_COLORS: Record<string, string> = {
  Technology:    "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Healthcare:    "bg-green-500/20 text-green-300 border-green-500/30",
  Finance:       "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Energy:        "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Consumer:      "bg-pink-500/20 text-pink-300 border-pink-500/30",
  Industrial:    "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

function SentimentBar({ score }: { score: number }) {
  const pct    = ((score + 1) / 2) * 100;
  const isPos  = score >= 0;
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-1 bg-terminal-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isPos ? "bg-bull" : "bg-bear"}`}
          style={{ width: `${Math.abs(pct - 50) + 50}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-12 text-right ${isPos ? "text-bull" : score < -0.1 ? "text-bear" : "text-terminal-dim"}`}>
        {sentimentLabel(score).label}
      </span>
    </div>
  );
}

export function NewsScreen() {
  const { news, loading, newsFilter, setNewsFilter, positions } = useStore(s => ({
    news:          selectFilteredNews(s),
    loading:       s.loading.news,
    newsFilter:    s.newsFilter,
    setNewsFilter: s.setNewsFilter,
    positions:     s.positions,
  }));

  const [activeSector, setActiveSector] = useState<string>("All");

  const sectors = useMemo(() => {
    const secs = new Set<string>(positions.map(p => p.sector));
    return ["All", ...Array.from(secs)];
  }, [positions]);

  const filtered = useMemo(() => {
    if (activeSector === "All") return news;
    const tickers = positions.filter(p => p.sector === activeSector).map(p => p.ticker);
    return news.filter(n => tickers.includes(n.ticker));
  }, [news, activeSector, positions]);

  return (
    <div className="flex h-full">
      {/* ── Sidebar filters ──────────────────────────────────── */}
      <div className="w-48 border-r border-terminal-border flex flex-col bg-terminal-surface/30 shrink-0">
        <div className="px-3 py-3 border-b border-terminal-border">
          <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-2">Search</div>
          <input
            type="text"
            placeholder="Ticker / keyword…"
            value={newsFilter}
            onChange={e => setNewsFilter(e.target.value)}
            className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1.5
                       text-xs font-mono text-terminal-text focus:border-terminal-accent outline-none"
          />
        </div>
        <div className="px-3 py-3">
          <div className="text-xs font-mono text-terminal-dim uppercase tracking-widest mb-2">Sector</div>
          <div className="flex flex-col gap-1">
            {sectors.map(s => (
              <button
                key={s}
                onClick={() => setActiveSector(s)}
                className={`text-left text-xs font-mono px-2 py-1.5 rounded transition-colors
                  ${activeSector === s
                    ? "bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/30"
                    : "text-terminal-dim hover:text-terminal-text hover:bg-terminal-muted/30"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 py-3 mt-auto border-t border-terminal-border">
          <div className="text-xs font-mono text-terminal-dim">{filtered.length} articles</div>
        </div>
      </div>

      {/* ── News feed ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading && filtered.length === 0 ? (
          <SectionLoader label="Fetching news…" />
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-terminal-dim font-mono text-sm">
            No news found for current filters.
          </div>
        ) : (
          <div className="divide-y divide-terminal-border/50">
            {filtered.map(item => {
              const sentiment = sentimentLabel(item.sentiment);
              return (
                <article
                  key={item.id}
                  className="px-6 py-4 hover:bg-terminal-surface/40 transition-colors cursor-pointer group"
                  onClick={() => item.url && window.open(item.url, "_blank")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <TickerBadge ticker={item.ticker} size="sm" />
                        {item.tags.map(tag => (
                          <span
                            key={tag}
                            className={`text-xs px-1.5 py-0.5 rounded border font-mono
                              ${SECTOR_COLORS[tag] ?? "bg-terminal-muted/30 text-terminal-dim border-terminal-border"}`}
                          >
                            {tag}
                          </span>
                        ))}
                        <span className="text-xs text-terminal-dim font-mono">{item.source}</span>
                        <span className="text-xs text-terminal-dim/60 font-mono">
                          {formatDistanceToNow(item.publishedAt, { addSuffix: true })}
                        </span>
                      </div>

                      {/* Headline */}
                      <h3 className="text-sm font-ui font-medium text-terminal-text group-hover:text-terminal-accent
                                     transition-colors leading-snug mb-1">
                        {item.headline}
                      </h3>

                      {/* Summary */}
                      {item.summary && (
                        <p className="text-xs text-terminal-dim leading-relaxed line-clamp-2">
                          {item.summary}
                        </p>
                      )}
                    </div>

                    {/* Sentiment */}
                    <div className="shrink-0">
                      <SentimentBar score={item.sentiment} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 2 — NEWS INTELLIGENCE
// Portfolio-filtered news feed with sentiment + sector tagging
// ============================================================
import { useEffect } from "react";
import clsx from "clsx";
import { useTerminalStore } from "@/store";
import { getApiService } from "@/services/apiService";
import { formatDistanceToNow } from "date-fns";

const SENTIMENT_COLORS = {
  positive: "border-l-pos text-pos",
  negative: "border-l-neg text-neg",
  neutral: "border-l-gray-500 text-gray-400",
};
const SECTOR_COLORS: Record<string, string> = {
  Technology: "text-brand-blue bg-brand-blue/10 border-brand-blue/20",
  Financials: "text-brand-purple bg-brand-purple/10 border-brand-purple/20",
  Healthcare: "text-brand-cyan bg-brand-cyan/10 border-brand-cyan/20",
  Energy: "text-brand-amber bg-brand-amber/10 border-brand-amber/20",
  Consumer: "text-pos bg-pos-muted border-pos/20",
};

export function NewsScreen() {
  const { news, setNewsItems, setNewsFilter, setNewsSectorFilter, portfolio, settings, setFocusTicker } = useTerminalStore();
  const api = getApiService();

  useEffect(() => {
    const load = async () => {
      const tickers = news.filter === "portfolio"
        ? portfolio.positions.map((p) => p.ticker)
        : ["AAPL", "MSFT", "NVDA", "TSLA", "SPY"];
      const items = await api.fetchNews(tickers);
      setNewsItems(items);
    };
    load();
    const interval = setInterval(load, settings.refreshIntervalSlow);
    return () => clearInterval(interval);
  }, [news.filter, portfolio.positions.length]);

  const filtered = news.items.filter((item) => {
    if (news.sectorFilter && !item.sectors.includes(news.sectorFilter)) return false;
    return true;
  });

  const allSectors = [...new Set(news.items.flatMap((n) => n.sectors))].filter(Boolean);

  return (
    <div className="flex h-full gap-0">
      {/* Sidebar filters */}
      <div className="w-48 border-r border-terminal-border p-3 flex flex-col gap-4 bg-terminal-surface/50">
        <div>
          <div className="text-2xs font-mono text-gray-500 uppercase tracking-widest mb-2">SOURCE</div>
          {(["portfolio", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setNewsFilter(f)}
              className={clsx("block w-full text-left px-2 py-1.5 rounded text-2xs font-mono transition-colors mb-1", {
                "bg-brand-blue/10 text-brand-blue border border-brand-blue/20": news.filter === f,
                "text-gray-400 hover:text-white": news.filter !== f,
              })}
            >
              {f === "portfolio" ? "📊 Portfolio" : "🌍 All Market"}
            </button>
          ))}
        </div>
        <div>
          <div className="text-2xs font-mono text-gray-500 uppercase tracking-widest mb-2">SECTORS</div>
          <button
            onClick={() => setNewsSectorFilter(null)}
            className={clsx("block w-full text-left px-2 py-1.5 rounded text-2xs font-mono transition-colors mb-1", {
              "bg-white/10 text-white": !news.sectorFilter,
              "text-gray-400 hover:text-white": !!news.sectorFilter,
            })}
          >
            All sectors
          </button>
          {allSectors.map((sector) => (
            <button
              key={sector}
              onClick={() => setNewsSectorFilter(sector === news.sectorFilter ? null : sector)}
              className={clsx("block w-full text-left px-2 py-1.5 rounded text-2xs font-mono transition-colors mb-1 truncate",
                SECTOR_COLORS[sector] ?? "text-gray-400", {
                  "border": news.sectorFilter === sector,
                  "border-transparent hover:text-white": news.sectorFilter !== sector,
                }
              )}
            >
              {sector}
            </button>
          ))}
        </div>
        <div className="mt-auto">
          <div className="text-2xs font-mono text-gray-600 text-center">
            {filtered.length} articles
          </div>
        </div>
      </div>

      {/* News feed */}
      <div className="flex-1 overflow-y-auto">
        {!filtered.length && (
          <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
            No news available
          </div>
        )}
        {filtered.map((item) => (
          <article
            key={item.id}
            className={clsx(
              "border-b border-terminal-border/50 p-4 hover:bg-terminal-hover transition-colors",
              "border-l-2", SENTIMENT_COLORS[item.sentiment]
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-sm text-white font-display font-medium leading-snug flex-1 hover:text-brand-cyan cursor-pointer"
                  onClick={() => item.url !== "#" && window.open(item.url, "_blank")}>
                {item.headline}
              </h3>
              <span className={clsx("text-2xs font-mono font-semibold shrink-0 px-1.5 py-0.5 rounded", {
                "text-pos bg-pos-muted": item.sentiment === "positive",
                "text-neg bg-neg-muted": item.sentiment === "negative",
                "text-gray-500 bg-white/5": item.sentiment === "neutral",
              })}>
                {item.sentiment === "positive" ? "▲ BULL" : item.sentiment === "negative" ? "▼ BEAR" : "◆ NEUT"}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">{item.summary}</p>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xs font-mono text-gray-600">
                {item.source} · {formatDistanceToNow(item.publishedAt, { addSuffix: true })}
              </span>
              <div className="flex gap-1 flex-wrap">
                {item.tickers.map((t) => (
                  <button key={t}
                    onClick={() => setFocusTicker(t, "news")}
                    className="text-2xs font-mono font-bold text-brand-cyan bg-brand-cyan/10 border border-brand-cyan/20 px-1.5 py-0.5 rounded hover:bg-brand-cyan/20 transition-colors"
                  >
                    ${t}
                  </button>
                ))}
                {item.sectors.map((s) => (
                  <span key={s} className={clsx("text-2xs font-mono px-1.5 py-0.5 rounded border", SECTOR_COLORS[s] ?? "text-gray-500 bg-white/5 border-white/10")}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

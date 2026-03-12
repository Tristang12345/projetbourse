// Scrolling ticker tape at the top
import { useTerminalStore } from "@/store";
import { formatPct } from "@/lib/financialCalc";
import clsx from "clsx";

export function TickerTape() {
  const { market } = useTerminalStore();
  const quotes = Object.values(market.quotes).slice(0, 15);
  if (!quotes.length) return null;

  const items = [...quotes, ...quotes]; // duplicate for seamless loop

  return (
    <div className="bg-terminal-surface border-b border-terminal-border overflow-hidden h-7 flex items-center">
      <div className="flex animate-ticker-scroll whitespace-nowrap">
        {items.map((q, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-4 text-2xs font-mono">
            <span className="text-white font-bold">{q.ticker}</span>
            <span className="text-gray-400">{q.price.toFixed(2)}</span>
            <span className={clsx("font-semibold", q.changePct >= 0 ? "text-pos" : "text-neg")}>
              {formatPct(q.changePct)}
            </span>
            <span className="text-terminal-border">│</span>
          </span>
        ))}
      </div>
    </div>
  );
}

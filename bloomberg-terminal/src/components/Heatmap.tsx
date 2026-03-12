// Market heatmap — treemap-style grid
import clsx from "clsx";
import type { QuoteSnapshot } from "@/types";
import { formatPct } from "@/lib/financialCalc";
import { useTerminalStore } from "@/store";

interface Props { quotes: QuoteSnapshot[]; }

function getHeatColor(pct: number): string {
  const clamp = Math.max(-5, Math.min(5, pct));
  if (clamp >= 3) return "bg-pos shadow-pos-glow text-black";
  if (clamp >= 1.5) return "bg-green-500 text-black";
  if (clamp >= 0.5) return "bg-green-700 text-white";
  if (clamp >= 0) return "bg-green-900/60 text-white";
  if (clamp >= -0.5) return "bg-red-900/60 text-white";
  if (clamp >= -1.5) return "bg-red-700 text-white";
  if (clamp >= -3) return "bg-red-500 text-white";
  return "bg-neg shadow-neg-glow text-white";
}

export function Heatmap({ quotes }: Props) {
  const { setFocusTicker, activeScreen } = useTerminalStore();
  if (!quotes.length) return <div className="text-gray-500 text-sm p-8 text-center">No data available</div>;
  return (
    <div className="grid gap-1 p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
      {quotes.map((q) => (
        <button
          key={q.ticker}
          onClick={() => setFocusTicker(q.ticker, activeScreen)}
          className={clsx(
            "rounded p-2 flex flex-col items-center justify-center h-16 transition-all cursor-pointer",
            "border border-white/10 hover:border-white/30 hover:scale-105",
            getHeatColor(q.changePct)
          )}
        >
          <span className="font-mono font-bold text-xs">{q.ticker}</span>
          <span className="font-mono text-xs font-semibold">{formatPct(q.changePct)}</span>
        </button>
      ))}
    </div>
  );
}

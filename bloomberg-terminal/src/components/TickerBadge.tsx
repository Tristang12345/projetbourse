/**
 * TickerBadge — Clickable ticker that triggers Global Focus Mode.
 */
import { useStore } from "../store";
import clsx from "clsx";

interface Props {
  ticker:  string;
  active?: boolean;
  size?:   "sm" | "md";
}

export function TickerBadge({ ticker, active, size = "md" }: Props) {
  const setFocus = useStore(s => s.setFocusTicker);
  return (
    <button
      onClick={() => setFocus(ticker)}
      className={clsx(
        "font-mono font-bold rounded border transition-all duration-150",
        "hover:border-terminal-accent hover:text-terminal-accent",
        size === "sm"
          ? "px-1.5 py-0.5 text-xs"
          : "px-2 py-1 text-sm",
        active
          ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
          : "border-terminal-border text-terminal-text bg-terminal-surface"
      )}
    >
      {ticker}
    </button>
  );
}

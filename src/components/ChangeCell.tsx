/**
 * ChangeCell — Colored change display with flash animation on update.
 */
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { formatPct } from "../utils/finance";

interface Props {
  value:     number;
  isPct?:    boolean;
  prefix?:   string;
  suffix?:   string;
  animate?:  boolean;
}

export function ChangeCell({ value, isPct = false, prefix = "", suffix = "", animate = true }: Props) {
  const isPos  = value >= 0;
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev   = useRef(value);

  useEffect(() => {
    if (!animate || value === prev.current) return;
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [value]);

  const formatted = isPct
    ? formatPct(value)
    : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

  return (
    <span
      className={clsx(
        "font-mono tabular-nums transition-colors duration-300 rounded px-1",
        isPos ? "text-bull" : "text-bear",
        flash === "up"   && "bg-bull/20",
        flash === "down" && "bg-bear/20"
      )}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
}

/**
 * ============================================================
 * MARKET HOURS — Statut d'ouverture des marchés en temps réel.
 * Correction : ajout état "closed" (weekend / hors horaires)
 * affiché clairement dans l'UI au lieu de silence.
 * ============================================================
 */

export type MarketStatus = "open" | "closed" | "pre" | "post";

/** Jours fériés US (NYSE/NASDAQ) — année courante */
const US_HOLIDAYS_2025 = [
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
  "2025-11-27", "2025-12-25",
];
const US_HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
];

/** Jours fériés Euronext Paris */
const EU_HOLIDAYS_2025 = [
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-01",
  "2025-12-25", "2025-12-26",
];
const EU_HOLIDAYS_2026 = [
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01",
  "2026-12-25", "2026-12-28",
];

const ALL_US_HOLIDAYS = new Set([...US_HOLIDAYS_2025, ...US_HOLIDAYS_2026]);
const ALL_EU_HOLIDAYS = new Set([...EU_HOLIDAYS_2025, ...EU_HOLIDAYS_2026]);

const toDateStr = (d: Date): string => d.toISOString().split("T")[0];
const isWeekend = (d: Date): boolean => { const day = d.getUTCDay(); return day === 0 || day === 6; };

/**
 * Retourne le statut détaillé du marché en ce moment.
 * "open"   : séance normale
 * "pre"    : pré-marché (US seulement, 4h–9h30 EST)
 * "post"   : après-marché (US seulement, 16h–20h EST)
 * "closed" : fermé (weekend, férié, hors horaires)
 */
export const getMarketStatus = (
  exchange: "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE" | undefined,
): MarketStatus => {
  const now = new Date();
  if (isWeekend(now)) return "closed";

  const dateStr  = toDateStr(now);
  const utcH     = now.getUTCHours();
  const utcM     = now.getUTCMinutes();
  const utcMins  = utcH * 60 + utcM;

  switch (exchange) {
    case "NYSE":
    case "NASDAQ": {
      if (ALL_US_HOLIDAYS.has(dateStr)) return "closed";
      if (utcMins >= 9 * 60 && utcMins < 14 * 60 + 30)  return "pre";   // 4h–9h30 EST
      if (utcMins >= 14 * 60 + 30 && utcMins < 21 * 60)  return "open";  // 9h30–16h EST
      if (utcMins >= 21 * 60 && utcMins < 24 * 60)        return "post";  // 16h–20h EST
      return "closed";
    }
    case "LSE":
    case "XETRA":
    case "EURONEXT":
    default: {
      if (ALL_EU_HOLIDAYS.has(dateStr)) return "closed";
      if (utcMins >= 7 * 60 && utcMins < 8 * 60)          return "pre";   // 7h–8h UTC
      if (utcMins >= 8 * 60 && utcMins < 16 * 60 + 30)    return "open";  // 8h–16h30 UTC
      return "closed";
    }
  }
};

/** Rétrocompat — retourne true si le marché est ouvert */
export const isMarketOpen = (
  exchange: "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE" | undefined,
): boolean => getMarketStatus(exchange) === "open";

/**
 * Fraîcheur d'un prix pour l'affichage dans le Portfolio.
 * "fresh"  : prix récent (< 5min) OU marché fermé (clôture valide)
 * "stale"  : marché ouvert + prix > 5min (afficher ⚠ orange)
 * "none"   : aucun prix disponible → N/A
 */
export const priceFreshness = (
  timestamp: number | undefined,
  exchange:  "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE" | undefined,
): "fresh" | "stale" | "none" => {
  if (!timestamp) return "none";
  const status = getMarketStatus(exchange);
  if (status !== "open") return "fresh"; // fermé → clôture = toujours valide
  return Date.now() - timestamp < 5 * 60 * 1000 ? "fresh" : "stale";
};

/**
 * Label lisible pour afficher dans la StatusBar / Portfolio.
 * Ex: "CLOSED", "OPEN", "PRE-MARKET", "AFTER-HOURS"
 */
export const marketStatusLabel = (status: MarketStatus): string => {
  switch (status) {
    case "open":   return "OPEN";
    case "pre":    return "PRE-MARKET";
    case "post":   return "AFTER-HOURS";
    case "closed": return "CLOSED";
  }
};

/** Couleur Tailwind associée au statut */
export const marketStatusColor = (status: MarketStatus): string => {
  switch (status) {
    case "open":   return "text-up";
    case "pre":    return "text-warn";
    case "post":   return "text-warn";
    case "closed": return "text-terminal-dim";
  }
};

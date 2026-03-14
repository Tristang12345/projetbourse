/**
 * ============================================================
 * MARKET HOURS
 * Détecte si un marché est actuellement ouvert.
 * Utilisé pour l'affichage de la fraîcheur des prix :
 *   - Marché ouvert + prix > 5min → orange ⚠
 *   - Marché fermé               → prix de clôture affiché normalement
 * ============================================================
 */

/** Retourne true si la date est un week-end (UTC) */
const isWeekend = (d: Date): boolean => {
  const day = d.getUTCDay();
  return day === 0 || day === 6; // 0=dimanche, 6=samedi
};

/**
 * Vérifie si un marché est ouvert en ce moment.
 * @param exchange "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE"
 */
export const isMarketOpen = (
  exchange: "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE" | undefined,
): boolean => {
  const now = new Date();

  if (isWeekend(now)) return false;

  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcMins = utcH * 60 + utcM;

  switch (exchange) {
    case "NYSE":
    case "NASDAQ":
      // 14h30–21h00 UTC (9h30–16h00 EST)
      return utcMins >= 14 * 60 + 30 && utcMins < 21 * 60;

    case "XETRA":
      // 08h00–16h30 UTC
      return utcMins >= 8 * 60 && utcMins < 16 * 60 + 30;

    case "LSE":
      // 08h00–16h30 UTC
      return utcMins >= 8 * 60 && utcMins < 16 * 60 + 30;

    case "EURONEXT":
    default:
      // 08h00–16h30 UTC (09h00–17h30 Paris)
      return utcMins >= 8 * 60 && utcMins < 16 * 60 + 30;
  }
};

/**
 * Fraîcheur d'un prix pour l'affichage.
 * - "fresh"  : prix récent (< 5min) ou marché fermé (prix de clôture = normal)
 * - "stale"  : marché ouvert + prix > 5min → afficher en orange
 * - "none"   : aucun prix disponible → afficher N/A
 */
export const priceFreshness = (
  timestamp: number | undefined,
  exchange:  "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE" | undefined,
): "fresh" | "stale" | "none" => {
  if (!timestamp) return "none";

  // Marché fermé → le cours de clôture est toujours valide, pas d'orange
  if (!isMarketOpen(exchange)) return "fresh";

  // Marché ouvert → vérifier la fraîcheur
  const FIVE_MIN = 5 * 60 * 1000;
  return Date.now() - timestamp < FIVE_MIN ? "fresh" : "stale";
};

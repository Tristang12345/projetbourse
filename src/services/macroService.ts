/**
 * ============================================================
 * MACRO SERVICE
 * Sources gratuites sans quota journalier:
 *   - Yahoo Finance: VIX (^VIX), SPY, GLD, USO, DXY (DX-Y.NYB), US10Y (^TNX)
 *   - CoinGecko: BTC prix temps réel (public API, 10-30 req/min)
 * 
 * Remplace Alpha Vantage pour les données macro (quota 25 req/jour trop limité)
 * ============================================================
 */

import { PivotMacroData } from "./types";

// ─── Yahoo Finance ────────────────────────────────────────────

const fetchYahooPrice = async (
  symbol: string,
): Promise<{ price: number; change: number; changePercent: number } | null> => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: {
        "Accept":     "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) return null;
    return {
      price:         m.regularMarketPrice,
      change:        m.regularMarketChange        ?? 0,
      changePercent: m.regularMarketChangePercent ?? 0,
    };
  } catch {
    return null;
  }
};

// ─── CoinGecko ────────────────────────────────────────────────

const fetchCoinGeckoPrice = async (): Promise<{
  price: number; change: number; changePercent: number;
} | null> => {
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const btc  = data?.bitcoin;
    if (!btc?.usd) return null;
    const changePercent = btc.usd_24h_change ?? 0;
    const change        = (btc.usd * changePercent) / 100;
    return { price: btc.usd, change, changePercent };
  } catch {
    return null;
  }
};

// ─── Public API ───────────────────────────────────────────────

/**
 * Récupère toutes les données macro en parallèle.
 * Utilise Yahoo Finance + CoinGecko — pas de clé API, pas de quota journalier.
 */
export const fetchMacroMarket = async (): Promise<PivotMacroData> => {
  const [vixR, spyR, goldR, oilR, btcR, dxyR, us10yR] = await Promise.allSettled([
    fetchYahooPrice("^VIX"),
    fetchYahooPrice("SPY"),
    fetchYahooPrice("GLD"),
    fetchYahooPrice("USO"),
    fetchCoinGeckoPrice(),
    fetchYahooPrice("DX-Y.NYB"),
    fetchYahooPrice("^TNX"),
  ]);

  const ok = <T>(r: PromiseSettledResult<T | null>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const vix   = ok(vixR);
  const spy   = ok(spyR);
  const gold  = ok(goldR);
  const oil   = ok(oilR);
  const btc   = ok(btcR);
  const dxy   = ok(dxyR);
  const us10y = ok(us10yR);

  return {
    vix:         vix?.price        ?? null,
    dxy:         dxy?.price        ?? null,
    sp500:       spy?.price        ?? null,
    sp500Change: spy?.changePercent ?? null,
    gold:        gold?.price       ?? null,
    goldChange:  gold?.changePercent ?? null,
    oil:         oil?.price        ?? null,
    oilChange:   oil?.changePercent  ?? null,
    btc:         btc?.price        ?? null,
    btcChange:   btc?.changePercent  ?? null,
    us10y:       us10y?.price      ?? null,
    timestamp:   Date.now(),
  };
};

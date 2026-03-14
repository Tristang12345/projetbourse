/**
 * ============================================================
 * ALPHA VANTAGE SERVICE
 * Handles: technical indicators (RSI, SMA), forex (DXY),
 *          economic calendar, macro indicators.
 * Rate limit: 5 req/min, 500 req/day on free tier.
 * ============================================================
 */

import {
  PivotIndicators,
  PivotMacroData,
  PivotEconomicEvent,
} from "./types";
import { throttler, withRetry } from "../utils/throttle";

const BASE_URL = "https://www.alphavantage.co/query";
const getKey   = (): string => import.meta.env.VITE_ALPHAVANTAGE_KEY ?? "";

// ─── Raw API shapes ───────────────────────────────────────────
interface AvRsiData {
  "Technical Analysis: RSI": Record<string, { RSI: string }>;
}

interface AvSmaData {
  "Technical Analysis: SMA": Record<string, { SMA: string }>;
}

interface AvForexQuote {
  "Realtime Currency Exchange Rate": {
    "5. Exchange Rate": string;
  };
}

interface AvQuoteResponse {
  "Global Quote": {
    "01. symbol":          string;
    "02. open":            string;
    "03. high":            string;
    "04. low":             string;
    "05. price":           string;
    "06. volume":          string;
    "08. previous close":  string;
    "09. change":          string;
    "10. change percent":  string;
  };
}

interface AvNewsResponse {
  feed?: Array<{
    title:            string;
    url:              string;
    time_published:   string;   // "20240315T143000"
    summary:          string;
    source:           string;
    overall_sentiment_label: "Bullish" | "Bearish" | "Neutral" | "Somewhat-Bullish" | "Somewhat-Bearish";
    ticker_sentiment?: Array<{
      ticker:                  string;
      relevance_score:         string;
      ticker_sentiment_label:  string;
    }>;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────

const fetchJSON = async <T>(params: Record<string, string>): Promise<T> => {
  const qp  = new URLSearchParams({ ...params, apikey: getKey() });
  const res = await fetch(`${BASE_URL}?${qp}`);
  if (!res.ok) throw new Error(`AlphaVantage ${res.status}`);
  return res.json() as Promise<T>;
};

const parseFloat2 = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

// ─── Technical Indicators ─────────────────────────────────────

/**
 * Fetch RSI for a ticker (14-period daily).
 */
export const fetchRSI = async (
  ticker: string,
  period = 14,
): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvRsiData>({
        function:   "RSI",
        symbol:     ticker,
        interval:   "daily",
        time_period: String(period),
        series_type: "close",
      }),
    );
    const entries = Object.entries(raw["Technical Analysis: RSI"] ?? {});
    if (!entries.length) return null;
    // Most recent entry is first
    return parseFloat2(entries[0][1].RSI);
  } catch (err) {
    console.error("[AlphaVantage] fetchRSI error:", err);
    return null;
  }
};

/**
 * Fetch SMA for a given period.
 */
export const fetchSMA = async (
  ticker: string,
  period: number,
): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvSmaData>({
        function:    "SMA",
        symbol:      ticker,
        interval:    "daily",
        time_period: String(period),
        series_type: "close",
      }),
    );
    const entries = Object.entries(raw["Technical Analysis: SMA"] ?? {});
    if (!entries.length) return null;
    return parseFloat2(entries[0][1].SMA);
  } catch (err) {
    console.error("[AlphaVantage] fetchSMA error:", err);
    return null;
  }
};

/**
 * Fetch full indicator set for a ticker (batched calls).
 * Returns combined PivotIndicators.
 */
export const fetchIndicators = async (
  ticker: string,
): Promise<PivotIndicators> => {
  // Fire in sequence to respect rate limits
  const rsi   = await fetchRSI(ticker);
  const sma50  = await fetchSMA(ticker, 50);
  const sma200 = await fetchSMA(ticker, 200);

  return {
    ticker,
    rsi14:        rsi,
    sma50,
    sma200,
    ema20:        null,  // computed locally from candles
    macdLine:     null,
    macdSignal:   null,
    macdHistogram: null,
    volumeRatio:  null,
    atr14:        null,
    timestamp:    Date.now(),
  };
};

// ─── EU / Euronext News ──────────────────────────────────────

/**
 * Mapping Euronext → ticker US (ADR ou cross-listed) reconnu par AV NEWS_SENTIMENT.
 * AV ne supporte pas les suffixes .PA/.AS/.MI — on utilise l'ADR ou le topic keywords.
 */
const EU_ADR_MAP: Record<string, string> = {
  "BNP.PA":   "BNPQY",   // BNP Paribas ADR
  "AI.PA":    "AIQUY",   // Air Liquide ADR
  "AIR.PA":   "EADSY",   // Airbus ADR
  "MC.PA":    "LVMUY",   // LVMH ADR
  "OR.PA":    "LRLCY",   // L'Oréal ADR
  "SAN.PA":   "SNY",     // Sanofi (coté NYSE)
  "TTE.PA":   "TTE",     // TotalEnergies (coté NYSE)
  "RMS.PA":   "HESAY",   // Hermès ADR
  "SAF.PA":   "SAFRY",   // Safran ADR
  "KER.PA":   "PPRUY",   // Kering ADR
  "SU.PA":    "SBGSY",   // Schneider ADR
  "DG.PA":    "VCISY",   // Vinci ADR
  "EL.PA":    "ESLOY",   // EssilorLuxottica ADR
  "CAP.PA":   "CGEMY",   // Capgemini ADR
  "DSY.PA":   "DASTY",   // Dassault Systèmes ADR
  "HO.PA":    "THLLY",   // Thales ADR
  "ORA.PA":   "ORAN",    // Orange (coté NYSE)
  "VIE.PA":   "VEOEY",   // Veolia ADR
  "CS.PA":    "AXAHY",   // AXA ADR
  "GLE.PA":   "SCGLY",   // Société Générale ADR
  "BN.PA":    "DANOY",   // Danone ADR
  "MT.AS":    "MT",      // ArcelorMittal (coté NYSE)
  "STM.PA":   "STM",     // STMicro (coté NYSE)
  "ENGI.PA":  "ENGIY",   // Engie ADR
};

/**
 * Fetch news for Euronext tickers via Alpha Vantage NEWS_SENTIMENT.
 * Available on free tier: 25 req/day, cached aggressively.
 * Returns up to `limit` articles sorted by recency.
 */
export const fetchEUNews = async (
  ticker: string,
  limit = 5,
): Promise<import("./types").PivotNewsItem[]> => {
  if (!throttler.canRequest("alphavantage")) return [];
  // Résoudre le ticker AV: préférer l'ADR US si disponible,
  // sinon utiliser le topic "finance" avec les mots-clés du nom de société
  const avTicker = EU_ADR_MAP[ticker] ?? ticker.replace(/\.[A-Z]+$/, "");

  try {
    const raw = await withRetry(() =>
      fetchJSON<AvNewsResponse>({
        function: "NEWS_SENTIMENT",
        tickers:  avTicker,
        limit:    String(limit * 2),
        sort:     "LATEST",
      }),
    );

    if (!raw.feed?.length) return [];

    const sentMap: Record<string, "bullish" | "bearish" | "neutral"> = {
      Bullish:           "bullish",
      "Somewhat-Bullish": "bullish",
      Bearish:           "bearish",
      "Somewhat-Bearish": "bearish",
      Neutral:           "neutral",
    };

    return raw.feed
      .slice(0, limit)
      .map((item, i) => {
        // Parse AV datetime string "20240315T143000" → epoch ms
        const ds  = item.time_published;
        const dt  = new Date(
          `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}T${ds.slice(9, 11)}:${ds.slice(11, 13)}:${ds.slice(13, 15)}Z`,
        );
        return {
          id:          `av-${ticker}-${i}-${ds}`,
          ticker,
          headline:    item.title,
          summary:     item.summary?.slice(0, 300) ?? "",
          source:      item.source,
          url:         item.url,
          sentiment:   sentMap[item.overall_sentiment_label] ?? "neutral",
          publishedAt: isNaN(dt.getTime()) ? Date.now() : dt.getTime(),
          tags:        [ticker],
        };
      });
  } catch {
    return [];
  }
};

// ─── Macro / Forex ────────────────────────────────────────────

/**
 * Fetch DXY (US Dollar Index) as USD/EUR inverse.
 * AV provides forex rates for free.
 */
export const fetchDXY = async (): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvForexQuote>({
        function:  "CURRENCY_EXCHANGE_RATE",
        from_currency: "USD",
        to_currency:   "EUR",
      }),
    );
    const rate = parseFloat2(
      raw["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"],
    );
    if (!rate) return null;
    // DXY ≈ 1/USDEUR * 100 (rough proxy)
    return Math.round((1 / rate) * 100 * 100) / 100;
  } catch {
    return null;
  }
};

/**
 * Fetch a global stock/ETF quote via AV (for VIX, SPY, GLD, etc.)
 */
export const fetchAVQuote = async (
  symbol: string,
): Promise<{
  price: number; open: number; high: number; low: number;
  prevClose: number; volume: number;
  change: number; changePercent: number;
} | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvQuoteResponse>({
        function: "GLOBAL_QUOTE",
        symbol,
      }),
    );
    const q = raw["Global Quote"];
    if (!q || !q["05. price"]) return null;
    const cp = q["10. change percent"]?.replace("%", "");
    return {
      price:         parseFloat2(q["05. price"])          ?? 0,
      open:          parseFloat2(q["02. open"])           ?? 0,
      high:          parseFloat2(q["03. high"])           ?? 0,
      low:           parseFloat2(q["04. low"])            ?? 0,
      prevClose:     parseFloat2(q["08. previous close"]) ?? 0,
      volume:        parseFloat2(q["06. volume"])         ?? 0,
      change:        parseFloat2(q["09. change"])         ?? 0,
      changePercent: parseFloat2(cp)                      ?? 0,
    };
  } catch {
    return null;
  }
};

/**
 * Assemble macro dashboard data from multiple symbol fetches.
 */
export const fetchMacroData = async (): Promise<PivotMacroData> => {
  const [sp500, gold, oil, btc] = await Promise.allSettled([
    fetchAVQuote("SPY"),
    fetchAVQuote("GLD"),
    fetchAVQuote("USO"),
    fetchAVQuote("COIN"),
  ]);

  const resolve = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? r.value : null;

  const sp = resolve(sp500);
  const gl = resolve(gold);
  const ol = resolve(oil);
  const bt = resolve(btc);

  return {
    vix:         null,    // fetched from Finnhub
    dxy:         null,    // fetched separately
    sp500:       sp?.price    ?? null,
    sp500Change: sp?.changePercent ?? null,
    gold:        gl?.price    ?? null,
    goldChange:  gl?.changePercent ?? null,
    oil:         ol?.price    ?? null,
    oilChange:   ol?.changePercent ?? null,
    btc:         bt?.price    ?? null,
    btcChange:   bt?.changePercent ?? null,
    us10y:       null,
    timestamp:   Date.now(),
  };
};

// ─── Economic Calendar (mock data — AV doesn't provide free calendar) ──────

/**
 * Economic calendar — génère ~120 événements couvrant ±90 jours autour de targetDate.
 * Événements récurrents réalistes: Fed (8x/an), BCE (8x/an), NFP (1er ven. du mois),
 * CPI US/EU (mensuel), PIB trimestriel, résultats d'entreprises, etc.
 */
export const fetchEconomicCalendar = async (
  targetDate?: Date,
): Promise<PivotEconomicEvent[]> => {
  const anchor = targetDate ? new Date(targetDate) : new Date();
  anchor.setHours(12, 0, 0, 0);

  const DAY = 86_400_000;

  // Générer une date relative à l'ancre
  const d = (offsetDays: number, hour = 10, minute = 0): number =>
    anchor.getTime() + offsetDays * DAY + hour * 3_600_000 + minute * 60_000;

  // Déterminer le trimestre courant pour les événements trimestriels
  const anchorMonth = anchor.getMonth(); // 0-11
  const qStart = Math.floor(anchorMonth / 3) * 3; // 0, 3, 6, 9

  const events: PivotEconomicEvent[] = [
    // ── US DONNÉES MENSUELLES ────────────────────────────────────────
    // NFP (Employment Situation) — 1er vendredi du mois, 14h30 Paris
    { id: "nfp-m0",  title: "US Non-Farm Payrolls",          country: "US", importance: "high",   datetime: d(-35, 14, 30),  forecast: "185K", previous: "177K", currency: "USD" },
    { id: "nfp-m1",  title: "US Non-Farm Payrolls",          country: "US", importance: "high",   datetime: d(+4,  14, 30), forecast: "182K", previous: "190K", currency: "USD" },
    { id: "nfp-m2",  title: "US Non-Farm Payrolls",          country: "US", importance: "high",   datetime: d(+35, 14, 30), forecast: "178K", previous: "182K", currency: "USD" },
    { id: "nfp-m3",  title: "US Non-Farm Payrolls",          country: "US", importance: "high",   datetime: d(+67, 14, 30), forecast: "185K", previous: "178K", currency: "USD" },

    { id: "ue-m0",   title: "US Unemployment Rate",          country: "US", importance: "high",   datetime: d(-35, 14, 30),  forecast: "3.9%",  previous: "3.8%",  currency: "USD" },
    { id: "ue-m1",   title: "US Unemployment Rate",          country: "US", importance: "high",   datetime: d(+4,  14, 30), forecast: "3.9%",  previous: "3.9%",  currency: "USD" },
    { id: "ue-m2",   title: "US Unemployment Rate",          country: "US", importance: "high",   datetime: d(+35, 14, 30), forecast: "4.0%",  previous: "3.9%",  currency: "USD" },

    // CPI US — milieu du mois, 14h30
    { id: "cpi-m-1", title: "US CPI (MoM)",                  country: "US", importance: "high",   datetime: d(-28, 14, 30),  forecast: "0.4%",  previous: "0.3%",  currency: "USD" },
    { id: "cpi-m0",  title: "US CPI (MoM)",                  country: "US", importance: "high",   datetime: d(+3,  14, 30), forecast: "0.3%",  previous: "0.4%",  currency: "USD" },
    { id: "cpi-m1",  title: "US CPI (MoM)",                  country: "US", importance: "high",   datetime: d(+33, 14, 30), forecast: "0.3%",  previous: "0.3%",  currency: "USD" },
    { id: "cpi-m2",  title: "US CPI (MoM)",                  country: "US", importance: "high",   datetime: d(+63, 14, 30), forecast: "0.2%",  previous: "0.3%",  currency: "USD" },

    { id: "cpic-m0", title: "US CPI Core (YoY)",             country: "US", importance: "high",   datetime: d(+3,  14, 30), forecast: "3.1%",  previous: "3.3%",  currency: "USD" },
    { id: "cpic-m1", title: "US CPI Core (YoY)",             country: "US", importance: "high",   datetime: d(+33, 14, 30), forecast: "3.0%",  previous: "3.1%",  currency: "USD" },

    // PPI US
    { id: "ppi-m0",  title: "US PPI (MoM)",                  country: "US", importance: "medium", datetime: d(+4,  14, 30), forecast: "0.2%",  previous: "0.3%",  currency: "USD" },
    { id: "ppi-m1",  title: "US PPI (MoM)",                  country: "US", importance: "medium", datetime: d(+34, 14, 30), forecast: "0.2%",  previous: "0.2%",  currency: "USD" },

    // Retail Sales US
    { id: "rs-m-1",  title: "US Retail Sales (MoM)",         country: "US", importance: "medium", datetime: d(-20, 14, 30),  forecast: "0.4%",  previous: "-0.2%", currency: "USD" },
    { id: "rs-m0",   title: "US Retail Sales (MoM)",         country: "US", importance: "medium", datetime: d(+10, 14, 30), forecast: "0.3%",  previous: "0.6%",  currency: "USD" },
    { id: "rs-m1",   title: "US Retail Sales (MoM)",         country: "US", importance: "medium", datetime: d(+40, 14, 30), forecast: "0.4%",  previous: "0.3%",  currency: "USD" },

    // Initial Jobless Claims — hebdo, jeudi 14h30
    { id: "jc-w-2",  title: "US Initial Jobless Claims",     country: "US", importance: "medium", datetime: d(-14, 14, 30),  forecast: "218K",  previous: "220K",  currency: "USD" },
    { id: "jc-w-1",  title: "US Initial Jobless Claims",     country: "US", importance: "medium", datetime: d(-7,  14, 30),  forecast: "215K",  previous: "215K",  currency: "USD" },
    { id: "jc-w0",   title: "US Initial Jobless Claims",     country: "US", importance: "medium", datetime: d(0,   14, 30), forecast: "215K",  previous: "218K",  currency: "USD" },
    { id: "jc-w1",   title: "US Initial Jobless Claims",     country: "US", importance: "medium", datetime: d(+7,  14, 30), forecast: "213K",  previous: "215K",  currency: "USD" },
    { id: "jc-w2",   title: "US Initial Jobless Claims",     country: "US", importance: "medium", datetime: d(+14, 14, 30), forecast: "212K",  previous: "213K",  currency: "USD" },
    { id: "jc-w3",   title: "US Initial Jobless Claims",     country: "US", importance: "medium", datetime: d(+21, 14, 30), forecast: "215K",  previous: "212K",  currency: "USD" },

    // ISM Manufacturing & Services
    { id: "ism-mfg-m0",  title: "US ISM Manufacturing PMI",  country: "US", importance: "medium", datetime: d(+1,  16, 0),  forecast: "48.8",  previous: "47.8",  currency: "USD" },
    { id: "ism-svc-m0",  title: "US ISM Services PMI",       country: "US", importance: "medium", datetime: d(+5,  16, 0),  forecast: "53.2",  previous: "52.6",  currency: "USD" },
    { id: "ism-mfg-m1",  title: "US ISM Manufacturing PMI",  country: "US", importance: "medium", datetime: d(+31, 16, 0),  forecast: "49.2",  previous: "48.8",  currency: "USD" },
    { id: "ism-svc-m1",  title: "US ISM Services PMI",       country: "US", importance: "medium", datetime: d(+35, 16, 0),  forecast: "53.5",  previous: "53.2",  currency: "USD" },

    // Durable Goods Orders
    { id: "dgo-m0",  title: "US Durable Goods Orders",       country: "US", importance: "medium", datetime: d(+8,  14, 30), forecast: "0.5%",  previous: "-0.3%", currency: "USD" },
    { id: "dgo-m1",  title: "US Durable Goods Orders",       country: "US", importance: "medium", datetime: d(+39, 14, 30), forecast: "0.4%",  previous: "0.5%",  currency: "USD" },

    // Michigan Sentiment
    { id: "mich-m0", title: "US Michigan Sentiment (Prél.)", country: "US", importance: "medium", datetime: d(+6,  16, 0),  forecast: "77.5",  previous: "76.9",  currency: "USD" },
    { id: "mich-m1", title: "US Michigan Sentiment (Prél.)", country: "US", importance: "medium", datetime: d(+36, 16, 0),  forecast: "78.0",  previous: "77.5",  currency: "USD" },

    // Housing
    { id: "hs-m0",   title: "US Housing Starts",             country: "US", importance: "low",    datetime: d(+9,  14, 30), forecast: "1.41M", previous: "1.38M", currency: "USD" },
    { id: "hs-m1",   title: "US Housing Starts",             country: "US", importance: "low",    datetime: d(+40, 14, 30), forecast: "1.43M", previous: "1.41M", currency: "USD" },

    // ── FED (8 réunions / an, ~6 semaines d'intervalle) ─────────────
    { id: "fed-1",   title: "Fed Interest Rate Decision",    country: "US", importance: "high",   datetime: d(-8,  20, 0),  forecast: "4.50%", previous: "4.75%", currency: "USD" },
    { id: "fed-2",   title: "Fed Interest Rate Decision",    country: "US", importance: "high",   datetime: d(+38, 20, 0),  forecast: "4.25%", previous: "4.50%", currency: "USD" },
    { id: "fed-3",   title: "Fed Interest Rate Decision",    country: "US", importance: "high",   datetime: d(+82, 20, 0),  forecast: "4.25%", previous: "4.25%", currency: "USD" },
    { id: "fed-min", title: "Fed Meeting Minutes",           country: "US", importance: "high",   datetime: d(-5,  20, 0),  forecast: "—",     previous: "—",     currency: "USD" },
    { id: "fed-spch1", title: "Discours Powell (Fed)",       country: "US", importance: "high",   datetime: d(+2,  18, 0),  forecast: "—",     previous: "—",     currency: "USD" },
    { id: "fed-spch2", title: "Discours Powell (Fed)",       country: "US", importance: "medium", datetime: d(+45, 18, 0),  forecast: "—",     previous: "—",     currency: "USD" },

    // ── PIB US (trimestriel) ─────────────────────────────────────────
    { id: "gdp-adv",  title: "US GDP Advance (QoQ)",         country: "US", importance: "high",   datetime: d(qStart === 0 ? -15 : +15, 14, 30), forecast: "2.4%", previous: "3.1%", currency: "USD" },
    { id: "gdp-2nd",  title: "US GDP 2nd Estimate (QoQ)",    country: "US", importance: "high",   datetime: d(qStart === 0 ? +16 : +46, 14, 30), forecast: "2.3%", previous: "3.1%", currency: "USD" },
    { id: "gdp-fin",  title: "US GDP Final (QoQ)",            country: "US", importance: "medium", datetime: d(qStart === 0 ? +45 : +75, 14, 30), forecast: "2.3%", previous: "3.1%", currency: "USD" },

    // ── ZONE EURO / BCE ──────────────────────────────────────────────
    { id: "ecb-1",    title: "BCE Décision sur les Taux",     country: "EU", importance: "high",   datetime: d(-12, 15, 15),  forecast: "2.75%", previous: "3.00%", currency: "EUR" },
    { id: "ecb-2",    title: "BCE Décision sur les Taux",     country: "EU", importance: "high",   datetime: d(+30, 15, 15), forecast: "2.50%", previous: "2.75%", currency: "EUR" },
    { id: "ecb-3",    title: "BCE Décision sur les Taux",     country: "EU", importance: "high",   datetime: d(+75, 15, 15), forecast: "2.50%", previous: "2.50%", currency: "EUR" },
    { id: "ecb-conf", title: "Conférence de presse BCE",      country: "EU", importance: "high",   datetime: d(-12, 15, 45),       forecast: "—",     previous: "—",     currency: "EUR" },
    { id: "ecb-min",  title: "Minutes BCE",                   country: "EU", importance: "medium", datetime: d(+6,  13, 30), forecast: "—",     previous: "—",     currency: "EUR" },

    // CPI Zone Euro
    { id: "eu-cpi-f",  title: "EU CPI Flash (YoY)",           country: "EU", importance: "high",   datetime: d(-3,  11, 0),   forecast: "2.3%",  previous: "2.5%",  currency: "EUR" },
    { id: "eu-cpi-f2", title: "EU CPI Flash (YoY)",           country: "EU", importance: "high",   datetime: d(+28, 11, 0),  forecast: "2.3%",  previous: "2.4%",  currency: "EUR" },
    { id: "eu-cpi-f3", title: "EU CPI Flash (YoY)",           country: "EU", importance: "high",   datetime: d(+58, 11, 0),  forecast: "2.2%",  previous: "2.3%",  currency: "EUR" },
    { id: "eu-cpi-fin", title: "EU CPI Final (YoY)",          country: "EU", importance: "medium", datetime: d(+11, 11, 0),  forecast: "2.4%",  previous: "2.5%",  currency: "EUR" },

    // PMI Zone Euro
    { id: "eu-pmi-c-0", title: "EU PMI Composite Flash",      country: "EU", importance: "high",   datetime: d(-2,  10, 0),   forecast: "49.5",  previous: "49.2",  currency: "EUR" },
    { id: "eu-pmi-c-1", title: "EU PMI Composite Flash",      country: "EU", importance: "high",   datetime: d(+28, 10, 0),  forecast: "49.8",  previous: "49.4",  currency: "EUR" },
    { id: "eu-pmi-c-2", title: "EU PMI Composite Flash",      country: "EU", importance: "high",   datetime: d(+58, 10, 0),  forecast: "50.1",  previous: "49.8",  currency: "EUR" },
    { id: "eu-pmi-mfg", title: "EU PMI Manufacturier Flash",  country: "EU", importance: "medium", datetime: d(-2,  10, 0),   forecast: "47.5",  previous: "46.8",  currency: "EUR" },

    // PIB Zone Euro
    { id: "eu-gdp-1", title: "EU PIB Prél. (QoQ)",            country: "EU", importance: "high",   datetime: d(-15, 11, 0),   forecast: "0.2%",  previous: "0.4%",  currency: "EUR" },
    { id: "eu-gdp-2", title: "EU PIB Final (QoQ)",             country: "EU", importance: "medium", datetime: d(+15, 11, 0),  forecast: "0.2%",  previous: "0.2%",  currency: "EUR" },

    // ── FRANCE ──────────────────────────────────────────────────────
    { id: "fr-cpi-0",  title: "FR IPC (MoM)",                 country: "FR", importance: "medium", datetime: d(-6,   9, 0),   forecast: "0.2%",  previous: "0.1%",  currency: "EUR" },
    { id: "fr-cpi-1",  title: "FR IPC (MoM)",                 country: "FR", importance: "medium", datetime: d(+25,  9, 0),  forecast: "0.2%",  previous: "0.3%",  currency: "EUR" },
    { id: "fr-cpi-2",  title: "FR IPC (MoM)",                 country: "FR", importance: "medium", datetime: d(+56,  9, 0),  forecast: "0.2%",  previous: "0.2%",  currency: "EUR" },
    { id: "fr-gdp-0",  title: "FR PIB Prél. (T/T)",           country: "FR", importance: "high",   datetime: d(-10,  8, 30),   forecast: "0.2%",  previous: "0.4%",  currency: "EUR" },
    { id: "fr-gdp-1",  title: "FR PIB Final (T/T)",           country: "FR", importance: "medium", datetime: d(+20,  8, 30), forecast: "0.2%",  previous: "0.2%",  currency: "EUR" },
    { id: "fr-chom",   title: "FR Taux de Chômage",           country: "FR", importance: "medium", datetime: d(+18,  8, 30), forecast: "7.1%",  previous: "7.2%",  currency: "EUR" },
    { id: "fr-bc",     title: "FR Balance Commerciale",       country: "FR", importance: "low",    datetime: d(+22,  8, 30), forecast: "-7.0B", previous: "-7.2B", currency: "EUR" },
    { id: "fr-prod",   title: "FR Production Industrielle",   country: "FR", importance: "low",    datetime: d(+12,  8, 30), forecast: "0.3%",  previous: "-0.2%", currency: "EUR" },
    { id: "fr-conf",   title: "FR Indice de Confiance (INSEE)",country: "FR", importance: "medium", datetime: d(+27,  8, 30), forecast: "96",    previous: "95",    currency: "EUR" },

    // ── ALLEMAGNE ────────────────────────────────────────────────────
    { id: "de-ifo",    title: "DE Indice IFO Business",       country: "DE", importance: "high",   datetime: d(+3,  10, 0),  forecast: "85.5",  previous: "84.7",  currency: "EUR" },
    { id: "de-zew",    title: "DE ZEW Sentiment Économique",  country: "DE", importance: "medium", datetime: d(+8,  11, 0),  forecast: "18.5",  previous: "16.4",  currency: "EUR" },
    { id: "de-cpi",    title: "DE CPI Prél. (YoY)",           country: "DE", importance: "medium", datetime: d(+27,  9, 0),  forecast: "2.2%",  previous: "2.3%",  currency: "EUR" },
    { id: "de-gdp",    title: "DE PIB (QoQ)",                 country: "DE", importance: "high",   datetime: d(-5,   9, 0),   forecast: "0.1%",  previous: "-0.3%", currency: "EUR" },

    // ── ROYAUME-UNI ──────────────────────────────────────────────────
    { id: "boe-1",     title: "BoE Décision sur les Taux",    country: "GB", importance: "high",   datetime: d(+13, 13, 0),  forecast: "4.50%", previous: "4.75%", currency: "GBP" },
    { id: "boe-2",     title: "BoE Décision sur les Taux",    country: "GB", importance: "high",   datetime: d(+57, 13, 0),  forecast: "4.25%", previous: "4.50%", currency: "GBP" },
    { id: "uk-cpi",    title: "UK CPI (YoY)",                 country: "GB", importance: "high",   datetime: d(+7,   8, 0),  forecast: "2.8%",  previous: "3.0%",  currency: "GBP" },
    { id: "uk-gdp",    title: "UK PIB (MoM)",                 country: "GB", importance: "high",   datetime: d(+9,   8, 0),  forecast: "0.1%",  previous: "0.0%",  currency: "GBP" },
    { id: "uk-emp",    title: "UK Variation du Chômage",      country: "GB", importance: "medium", datetime: d(+10,  8, 0),  forecast: "-10K",  previous: "-5K",   currency: "GBP" },

    // ── JAPON ────────────────────────────────────────────────────────
    { id: "boj-1",     title: "BoJ Décision sur les Taux",    country: "JP", importance: "high",   datetime: d(+20,  5, 0),  forecast: "0.50%", previous: "0.25%", currency: "JPY" },
    { id: "boj-2",     title: "BoJ Décision sur les Taux",    country: "JP", importance: "high",   datetime: d(+63,  5, 0),  forecast: "0.50%", previous: "0.50%", currency: "JPY" },
    { id: "jp-cpi",    title: "JP CPI (YoY)",                 country: "JP", importance: "high",   datetime: d(+17,  0, 30), forecast: "2.8%",  previous: "2.9%",  currency: "JPY" },
    { id: "jp-tankan", title: "JP Enquête Tankan (Grandes Ent.)",country: "JP", importance: "high", datetime: d(+18,  2, 0),  forecast: "14",    previous: "12",    currency: "JPY" },

    // ── CHINE ────────────────────────────────────────────────────────
    { id: "cn-cpi",    title: "CN CPI (YoY)",                 country: "CN", importance: "medium", datetime: d(+10,  2, 30), forecast: "0.5%",  previous: "0.4%",  currency: "CNY" },
    { id: "cn-pmi-mfg", title: "CN PMI Manufacturier (NBS)", country: "CN", importance: "high",   datetime: d(0,    3, 0),  forecast: "50.2",  previous: "50.1",  currency: "CNY" },
    { id: "cn-trade",  title: "CN Balance Commerciale",       country: "CN", importance: "medium", datetime: d(+8,   5, 0),  forecast: "$95B",  previous: "$89B",  currency: "CNY" },

    // ── PÉTROLE / OPEP ───────────────────────────────────────────────
    { id: "opec-1",    title: "Réunion Comité OPEP+",         country: "US", importance: "high",   datetime: d(+14,  9, 0),  forecast: "—",     previous: "—",     currency: "USD" },
    { id: "eia-w0",    title: "EIA Stocks Pétrole Brut",      country: "US", importance: "medium", datetime: d(0,   16, 30), forecast: "-1.2M", previous: "+2.1M", currency: "USD" },
    { id: "eia-w1",    title: "EIA Stocks Pétrole Brut",      country: "US", importance: "medium", datetime: d(+7,  16, 30), forecast: "-0.8M", previous: "-1.2M", currency: "USD" },
    { id: "eia-w2",    title: "EIA Stocks Pétrole Brut",      country: "US", importance: "medium", datetime: d(+14, 16, 30), forecast: "-1.0M", previous: "-0.8M", currency: "USD" },
  ];

  // Filtrer sur la fenêtre ±90 jours et retourner trié par datetime
  const windowStart = anchor.getTime() - 90 * DAY;
  const windowEnd   = anchor.getTime() + 90 * DAY;

  return events
    .filter((e) => e.datetime >= windowStart && e.datetime <= windowEnd)
    .sort((a, b) => a.datetime - b.datetime);
};
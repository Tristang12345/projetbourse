/**
 * ============================================================
 * MOCK DATA SERVICE
 * Provides realistic offline/dev data when APIs are unavailable
 * or when running without API keys (CI, demos, offline mode).
 *
 * Includes full CAC 40 index + S&P 500 top 20.
 * All prices are seeded with deterministic pseudo-random
 * variation so sparklines look meaningful.
 * ============================================================
 */

import type {
  PivotQuote, PivotCandle, PivotNewsItem,
  PivotMacroData, PivotEconomicEvent, PivotScreenerSignal,
} from "./types";

// ─── Ticker Registry ─────────────────────────────────────────

export interface TickerMeta {
  ticker:   string;
  name:     string;
  sector:   string;
  exchange: "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA";
  country:  "US" | "FR" | "DE" | "NL" | "BE";
  basePrice: number;
}

/** Full CAC 40 composition (as of 2024) */
export const CAC40_TICKERS: TickerMeta[] = [
  { ticker: "AI.PA",    name: "Air Liquide",           sector: "Materials",      exchange: "EURONEXT", country: "FR", basePrice: 170.88  },
  { ticker: "AIR.PA",   name: "Airbus SE",              sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 178.0  },
  { ticker: "ALO.PA",   name: "Alstom",                 sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 10.8   },
  { ticker: "ATO.PA",   name: "Atos SE",                sector: "Technology",     exchange: "EURONEXT", country: "FR", basePrice: 0.48   },
  { ticker: "BN.PA",    name: "Danone",                 sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 71.92   },
  { ticker: "BNP.PA",   name: "BNP Paribas",            sector: "Finance",        exchange: "EURONEXT", country: "FR", basePrice: 85.0   },
  { ticker: "CA.PA",    name: "Carrefour",              sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 15.5   },
  { ticker: "CAP.PA",   name: "Capgemini",              sector: "Technology",     exchange: "EURONEXT", country: "FR", basePrice: 107.8  },
  { ticker: "CS.PA",    name: "AXA SA",                 sector: "Finance",        exchange: "EURONEXT", country: "FR", basePrice: 37.8   },
  { ticker: "DG.PA",    name: "Vinci SA",               sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 118.0  },
  { ticker: "DSY.PA",   name: "Dassault Systèmes",      sector: "Technology",     exchange: "EURONEXT", country: "FR", basePrice: 18.5   },
  { ticker: "EL.PA",    name: "EssilorLuxottica",       sector: "Healthcare",     exchange: "EURONEXT", country: "FR", basePrice: 180.0  },
  { ticker: "EN.PA",    name: "Bouygues SA",            sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 49.81   },
  { ticker: "ENGI.PA",  name: "Engie SA",               sector: "Energy",         exchange: "EURONEXT", country: "FR", basePrice: 27.64   },
  { ticker: "ERF.PA",   name: "Eurofins Scientific",    sector: "Healthcare",     exchange: "EURONEXT", country: "FR", basePrice: 53.0   },
  { ticker: "GLE.PA",   name: "Société Générale",       sector: "Finance",        exchange: "EURONEXT", country: "FR", basePrice: 38.5   },
  { ticker: "HO.PA",    name: "Thales SA",              sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 225.0  },
  { ticker: "KER.PA",   name: "Kering SA",              sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 210.0  },
  { ticker: "LR.PA",    name: "Legrand SA",             sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 106.0   },
  { ticker: "MC.PA",    name: "LVMH",                   sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 504.0  },
  { ticker: "ML.PA",    name: "Michelin",               sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 33.5   },
  { ticker: "MT.AS",    name: "ArcelorMittal",          sector: "Materials",      exchange: "EURONEXT", country: "NL", basePrice: 22.0   },
  { ticker: "OR.PA",    name: "L'Oréal SA",             sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 305.0  },
  { ticker: "ORA.PA",   name: "Orange SA",              sector: "Communication",  exchange: "EURONEXT", country: "FR", basePrice: 17.52    },
  { ticker: "PUB.PA",   name: "Publicis Groupe",        sector: "Communication",  exchange: "EURONEXT", country: "FR", basePrice: 75.62   },
  { ticker: "RI.PA",    name: "Pernod Ricard",          sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 68.0   },
  { ticker: "RMS.PA",   name: "Hermès International",   sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 1948.0 },
  { ticker: "SAF.PA",   name: "Safran SA",              sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 285.0  },
  { ticker: "SAN.PA",   name: "Sanofi SA",              sector: "Healthcare",     exchange: "EURONEXT", country: "FR", basePrice: 105.0   },
  { ticker: "SGO.PA",   name: "Saint-Gobain",           sector: "Materials",      exchange: "EURONEXT", country: "FR", basePrice: 82.0   },
  { ticker: "STLAM.MI", name: "Stellantis NV",          sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 10.5   },
  { ticker: "STM.PA",   name: "STMicroelectronics",     sector: "Technology",     exchange: "EURONEXT", country: "FR", basePrice: 18.5   },
  { ticker: "SU.PA",    name: "Schneider Electric",     sector: "Industrials",    exchange: "EURONEXT", country: "FR", basePrice: 288.0  },
  { ticker: "SW.PA",    name: "Sodexo SA",              sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 73.0   },
  { ticker: "TEC.PA",   name: "Technip Energies",       sector: "Energy",         exchange: "EURONEXT", country: "FR", basePrice: 30.5   },
  { ticker: "TTE.PA",   name: "TotalEnergies SE",       sector: "Energy",         exchange: "EURONEXT", country: "FR", basePrice: 70.5   },
  { ticker: "VIE.PA",   name: "Veolia Environnement",   sector: "Utilities",      exchange: "EURONEXT", country: "FR", basePrice: 30.5   },
  { ticker: "VIV.PA",   name: "Vivendi SE",             sector: "Communication",  exchange: "EURONEXT", country: "FR", basePrice: 3.6   },
  { ticker: "WLN.PA",   name: "Worldline SA",           sector: "Technology",     exchange: "EURONEXT", country: "FR", basePrice: 4.2    },
  { ticker: "FR.PA",    name: "Valeo SE",               sector: "Consumer",       exchange: "EURONEXT", country: "FR", basePrice: 7.8    },
];

/** S&P 500 top 20 for comparison */
export const SP500_TOP20: TickerMeta[] = [
  { ticker: "AAPL",  name: "Apple Inc.",         sector: "Technology",    exchange: "NASDAQ", country: "US", basePrice: 218.0  },
  { ticker: "MSFT",  name: "Microsoft Corp.",    sector: "Technology",    exchange: "NASDAQ", country: "US", basePrice: 415.0  },
  { ticker: "NVDA",  name: "NVIDIA Corp.",       sector: "Technology",    exchange: "NASDAQ", country: "US", basePrice: 115.0  },
  { ticker: "GOOGL", name: "Alphabet Inc.",      sector: "Communication", exchange: "NASDAQ", country: "US", basePrice: 186.0  },
  { ticker: "AMZN",  name: "Amazon.com Inc.",    sector: "Consumer",      exchange: "NASDAQ", country: "US", basePrice: 228.0  },
  { ticker: "META",  name: "Meta Platforms",     sector: "Technology",    exchange: "NASDAQ", country: "US", basePrice: 615.0  },
  { ticker: "TSLA",  name: "Tesla Inc.",         sector: "Consumer",      exchange: "NASDAQ", country: "US", basePrice: 285.0  },
  { ticker: "AVGO",  name: "Broadcom Inc.",      sector: "Technology",    exchange: "NASDAQ", country: "US", basePrice: 1420.0 },
  { ticker: "JPM",   name: "JPMorgan Chase",     sector: "Finance",       exchange: "NYSE",   country: "US", basePrice: 256.0  },
  { ticker: "V",     name: "Visa Inc.",          sector: "Finance",       exchange: "NYSE",   country: "US", basePrice: 325.0  },
  { ticker: "MA",    name: "Mastercard Inc.",    sector: "Finance",       exchange: "NYSE",   country: "US", basePrice: 545.0  },
  { ticker: "UNH",   name: "UnitedHealth Group", sector: "Healthcare",    exchange: "NYSE",   country: "US", basePrice: 490.0  },
  { ticker: "WMT",   name: "Walmart Inc.",       sector: "Consumer",      exchange: "NYSE",   country: "US", basePrice: 98.0   },
  { ticker: "JNJ",   name: "Johnson & Johnson",  sector: "Healthcare",    exchange: "NYSE",   country: "US", basePrice: 162.0  },
  { ticker: "PG",    name: "Procter & Gamble",   sector: "Consumer",      exchange: "NYSE",   country: "US", basePrice: 172.0  },
  { ticker: "HD",    name: "Home Depot",         sector: "Consumer",      exchange: "NYSE",   country: "US", basePrice: 395.0  },
  { ticker: "MRK",   name: "Merck & Co.",        sector: "Healthcare",    exchange: "NYSE",   country: "US", basePrice: 118.0  },
  { ticker: "CVX",   name: "Chevron Corp.",      sector: "Energy",        exchange: "NYSE",   country: "US", basePrice: 155.0  },
  { ticker: "BAC",   name: "Bank of America",    sector: "Finance",       exchange: "NYSE",   country: "US", basePrice: 48.0   },
  { ticker: "ABBV",  name: "AbbVie Inc.",        sector: "Healthcare",    exchange: "NYSE",   country: "US", basePrice: 195.0  },
];

/** Combined lookup map: ticker → meta */
export const TICKER_REGISTRY = new Map<string, TickerMeta>(
  [...CAC40_TICKERS, ...SP500_TOP20].map((m) => [m.ticker, m]),
);

// ─── Pseudo-random Price Generator ───────────────────────────

/**
 * Seeded LCG PRNG — same ticker always produces the same sequence.
 * Used to generate stable, reproducible mock prices.
 */
const lcg = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff; // [0, 1)
  };
};

const tickerSeed = (ticker: string): number =>
  ticker.split("").reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0);

/**
 * Generate N daily candles seeded by ticker name.
 * Applies a random walk with slight upward drift.
 */
export const generateMockCandles = (
  ticker:    string,
  days       = 60,
  basePrice?: number,
): PivotCandle[] => {
  const meta  = TICKER_REGISTRY.get(ticker);
  const start = basePrice ?? meta?.basePrice ?? 100;
  const rand  = lcg(tickerSeed(ticker));
  const now   = Date.now();
  let   price = start;

  // Ticker-seeded bias: each ticker gets a deterministic trend
  // so that ~33% show overbought RSI, ~33% oversold, ~33% neutral
  // This guarantees screener signals in mock mode.
  const bias = tickerSeed(ticker) % 3; // 0=oversold 1=neutral 2=overbought
  const trendDrift = bias === 0
    ? -start * 0.004   // strong downtrend → oversold RSI
    : bias === 2
    ? +start * 0.005   // strong uptrend  → overbought RSI
    : start * 0.0002;  // flat            → neutral

  // Volume pattern: some tickers have a breakout in last 5 days
  const hasVolBreakout = (tickerSeed(ticker) % 5) === 0;

  return Array.from({ length: days }, (_, i) => {
    const dailyVol  = start * 0.022;          // 2.2% daily vol — enough for clear RSI divergence
    const change    = (rand() - 0.48) * dailyVol + trendDrift;
    const open      = price;
    price           = Math.max(price + change, start * 0.2);
    const high      = Math.max(open, price) * (1 + rand() * 0.008);
    const low       = Math.min(open, price) * (1 - rand() * 0.008);

    // Volume spike in last 5 days for breakout tickers
    const volMultiplier = hasVolBreakout && i >= days - 5 ? 3.5 : 1;
    const volume    = Math.floor(
      (rand() * 1_500_000 + 500_000) * (start < 50 ? 5 : 1) * volMultiplier
    );

    return {
      ticker,
      time:   now - (days - i) * 86_400_000,
      open:   parseFloat(open.toFixed(2)),
      high:   parseFloat(high.toFixed(2)),
      low:    parseFloat(low.toFixed(2)),
      close:  parseFloat(price.toFixed(2)),
      volume,
    };
  });
};

/**
 * Build a PivotQuote from mock candle data.
 */
export const generateMockQuote = (ticker: string): PivotQuote => {
  const meta      = TICKER_REGISTRY.get(ticker);
  const basePrice = meta?.basePrice ?? 100;
  const candles   = generateMockCandles(ticker, 32, basePrice);
  const rand      = lcg(tickerSeed(ticker) + 999);
  const avgVol    = candles.reduce((s, c) => s + c.volume, 0) / candles.length;

  // Ancrer le prix final autour du basePrice (±1.5% intraday noise)
  // évite que le random walk dérive trop loin de la réalité
  const noise     = (rand() - 0.5) * 0.03;     // ±1.5%
  const price     = parseFloat((basePrice * (1 + noise)).toFixed(2));
  const prevClose = parseFloat((basePrice * (1 + (rand() - 0.5) * 0.02)).toFixed(2));
  const open      = parseFloat((basePrice * (1 + (rand() - 0.5) * 0.015)).toFixed(2));
  const high      = parseFloat((Math.max(price, open, prevClose) * (1 + rand() * 0.005)).toFixed(2));
  const low       = parseFloat((Math.min(price, open, prevClose) * (1 - rand() * 0.005)).toFixed(2));

  const isEuronext = meta?.exchange === "EURONEXT";
  const isXetra    = meta?.exchange === "XETRA";
  const isLSE      = meta?.exchange === "LSE";

  return {
    ticker,
    name:          meta?.name    ?? ticker,
    price,
    open,
    high,
    low,
    prevClose,
    change:        parseFloat((price - prevClose).toFixed(2)),
    changePercent: parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)),
    volume:        Math.floor(avgVol * (0.8 + rand() * 0.8)),
    avgVolume30d:  Math.floor(avgVol),
    marketCap:     undefined,
    sector:        meta?.sector,
    currency:      isEuronext || isXetra ? "EUR" : isLSE ? "GBP" : "USD",
    exchange:      meta?.exchange,
    country:       meta?.country,
    timestamp:     Date.now(),
    source:        "mock",
  };
};

// ─── Mock News ────────────────────────────────────────────────

const NEWS_TEMPLATES = [
  { t: "bullish",  h: "{name} dépasse les attentes au T{q} avec un BPA de {eps}€",    s: "Les résultats trimestriels surpassent les estimations des analystes. La direction maintient ses prévisions annuelles." },
  { t: "bearish",  h: "{name} révise à la baisse ses prévisions de croissance",        s: "Dans un communiqué, la direction cite les pressions inflationnistes et la faiblesse de la demande en Asie." },
  { t: "neutral",  h: "{name} annonce un partenariat stratégique avec {partner}",      s: "L'accord prévoit le développement conjoint de nouvelles technologies sur 3 ans pour un montant non divulgué." },
  { t: "bullish",  h: "{name} lance un programme de rachat d'actions de {amount}Md€", s: "Le conseil d'administration a approuvé un programme de rachat jusqu'à {amount} milliards d'euros d'actions propres." },
  { t: "bearish",  h: "Downgrade de {name} par Goldman Sachs : objectif réduit",       s: "Les analystes citent des valorisations tendues et une croissance organique décevante pour justifier la révision." },
  { t: "neutral",  h: "{name} nomme un nouveau directeur financier",                   s: "La prise de poste est prévue pour le prochain trimestre. L'ancien CFO rejoint le conseil de surveillance." },
];

const PARTNERS = ["Microsoft", "Google", "Salesforce", "SAP", "AWS", "Oracle"];

export const generateMockNews = (tickers: string[]): PivotNewsItem[] => {
  const items: PivotNewsItem[] = [];
  const now = Date.now();

  tickers.forEach((ticker, ti) => {
    const meta = TICKER_REGISTRY.get(ticker);
    const rand = lcg(tickerSeed(ticker) + 42);
    const count = Math.floor(rand() * 3) + 1; // 1-3 news per ticker

    for (let i = 0; i < count; i++) {
      const tpl     = NEWS_TEMPLATES[Math.floor(rand() * NEWS_TEMPLATES.length)];
      const q       = Math.floor(rand() * 4) + 1;
      const eps     = (rand() * 3 + 0.5).toFixed(2);
      const amount  = (rand() * 2 + 0.5).toFixed(1);
      const partner = PARTNERS[Math.floor(rand() * PARTNERS.length)];

      const headline = tpl.h
        .replace("{name}", meta?.name ?? ticker)
        .replace("{q}",    String(q))
        .replace("{eps}",  eps)
        .replace("{amount}", amount)
        .replace("{partner}", partner);

      const summary = tpl.s.replace("{amount}", amount);
      const hoursAgo = Math.floor(rand() * 48);

      items.push({
        id:          `mock-${ticker}-${i}-${ti}`,
        ticker,
        headline,
        summary,
        source:      ["Reuters", "Bloomberg", "Les Echos", "Le Figaro", "WSJ"][Math.floor(rand() * 5)],
        url:         `https://example.com/news/${ticker.toLowerCase()}-${i}`,
        sentiment:   tpl.t as "bullish" | "bearish" | "neutral",
        publishedAt: now - hoursAgo * 3_600_000,
        tags:        [ticker, meta?.sector ?? "", meta?.country ?? ""].filter(Boolean),
      });
    }
  });

  return items.sort((a, b) => b.publishedAt - a.publishedAt);
};

// ─── Mock Macro ───────────────────────────────────────────────

export const generateMockMacroData = (): PivotMacroData => ({
  vix:         null,
  dxy:         null,
  sp500:       null,
  sp500Change: null,
  gold:        null,
  goldChange:  null,
  oil:         null,
  oilChange:   null,
  btc:         null,
  btcChange:   null,
  us10y:       null,
  timestamp:   Date.now(),
});

// ─── Mode Detection ───────────────────────────────────────────

/** Returns true when all API keys are missing — enables full mock mode */
export const isMockMode = (): boolean =>
  !import.meta.env.VITE_FINNHUB_KEY &&
  !import.meta.env.VITE_POLYGON_KEY &&
  !import.meta.env.VITE_ALPHAVANTAGE_KEY;

/** Log the active mode once at startup */
if (isMockMode()) {
  console.info(
    "[MockData] ⚠️  No API keys detected — running in MOCK MODE.\n" +
    "           Add keys to .env.local to enable live data.",
  );
}

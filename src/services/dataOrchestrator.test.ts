/**
 * ============================================================
 * TESTS — dataOrchestrator.ts
 * Couvre : cache, routing EU/US, fallback mock, screener signals.
 * Run: npm test
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks des services externes ─────────────────────────────
// On isole l'orchestrateur de tout appel réseau réel.

vi.mock("../services/finnhubService", () => ({
  fetchQuote:        vi.fn().mockResolvedValue(null),
  fetchCompanyNews:  vi.fn().mockResolvedValue([]),
  fetchCandles:      vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/polygonService", () => ({
  fetchSnapshots:      vi.fn().mockResolvedValue([]),
  fetchDailyCandles:   vi.fn().mockResolvedValue([]),
  computeAvgVolume:    vi.fn().mockReturnValue(0),
}));

vi.mock("../services/alphaVantageService", () => ({
  fetchAVQuote:          vi.fn().mockResolvedValue(null),
  fetchEUNews:           vi.fn().mockResolvedValue([]),
  fetchEconomicCalendar: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/macroService", () => ({
  fetchMacroMarket: vi.fn().mockResolvedValue({
    vix: 18.5, dxy: 104.2, sp500: 5100, sp500Change: 0.5,
    gold: 2050, goldChange: 0.2, oil: 78, oilChange: -0.3,
    btc: 65000, btcChange: 1.2, us10y: 4.35, timestamp: Date.now(),
  }),
}));

vi.mock("../services/yahooFinanceService", () => ({
  fetchQuote:   vi.fn().mockResolvedValue(null),
  fetchCandles: vi.fn().mockResolvedValue([]),
}));

// ─── Import après les mocks ───────────────────────────────────

import * as Orchestrator from "../services/dataOrchestrator";
import * as Finnhub      from "../services/finnhubService";
import * as Polygon      from "../services/polygonService";
import * as AlphaVantage from "../services/alphaVantageService";
import * as Yahoo        from "../services/yahooFinanceService";

// ─── Helpers ─────────────────────────────────────────────────

/** Crée un PivotQuote minimal pour les mocks */
const makeMockQuote = (ticker: string) => ({
  ticker,
  name:          ticker,
  price:         100,
  open:          99,
  high:          102,
  low:           98,
  prevClose:     99,
  change:        1,
  changePercent: 1.01,
  volume:        1_000_000,
  avgVolume30d:  500_000,
  currency:      "USD" as const,
  exchange:      "NYSE" as const,
  country:       "US" as const,
  timestamp:     Date.now(),
  source:        "finnhub" as const,
});

const makeMockCandle = (ticker: string, close: number, i: number) => ({
  ticker,
  time:   Date.now() - (220 - i) * 86_400_000,
  open:   close - 1,
  high:   close + 2,
  low:    close - 2,
  close,
  volume: 1_000_000,
});

// ─── getQuote ─────────────────────────────────────────────────

describe("getQuote — routing US (Finnhub first)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appelle Finnhub pour un ticker US", async () => {
    (Finnhub.fetchQuote as any).mockResolvedValueOnce(makeMockQuote("AAPL"));
    const q = await Orchestrator.getQuote("AAPL");
    expect(Finnhub.fetchQuote).toHaveBeenCalledWith("AAPL");
    expect(q).not.toBeNull();
    expect(q?.ticker).toBe("AAPL");
  });

  it("fallback Polygon si Finnhub retourne null", async () => {
    (Finnhub.fetchQuote as any).mockResolvedValueOnce(null);
    (Polygon.fetchSnapshots as any).mockResolvedValueOnce([makeMockQuote("MSFT")]);
    const q = await Orchestrator.getQuote("MSFT");
    expect(Polygon.fetchSnapshots).toHaveBeenCalledWith(["MSFT"]);
    expect(q?.ticker).toBe("MSFT");
  });

  it("fallback AlphaVantage si Finnhub ET Polygon retournent null", async () => {
    (Finnhub.fetchQuote as any).mockResolvedValueOnce(null);
    (Polygon.fetchSnapshots as any).mockResolvedValueOnce([]);
    (AlphaVantage.fetchAVQuote as any).mockResolvedValueOnce({
      price: 150, open: 148, high: 152, low: 147,
      prevClose: 148, volume: 800_000, change: 2, changePercent: 1.35,
    });
    const q = await Orchestrator.getQuote("TSLA");
    expect(AlphaVantage.fetchAVQuote).toHaveBeenCalledWith("TSLA");
    expect(q).not.toBeNull();
    expect(q?.source).toBe("alphavantage");
  });

  it("retourne null si toutes les APIs échouent", async () => {
    (Finnhub.fetchQuote as any).mockResolvedValueOnce(null);
    (Polygon.fetchSnapshots as any).mockResolvedValueOnce([]);
    (AlphaVantage.fetchAVQuote as any).mockResolvedValueOnce(null);
    const q = await Orchestrator.getQuote("UNKNOWN_TICKER");
    expect(q).toBeNull();
  });
});

describe("getQuote — routing EU (Yahoo direct, pas Finnhub)", () => {
  beforeEach(() => vi.clearAllMocks());

  const EU_TICKERS = ["BNP.PA", "AIR.PA", "MC.PA", "SAP.DE", "BARC.L"];

  for (const ticker of EU_TICKERS) {
    it(`n'appelle PAS Finnhub pour ${ticker}`, async () => {
      (Yahoo.fetchQuote as any).mockResolvedValueOnce(makeMockQuote(ticker));
      await Orchestrator.getQuote(ticker);
      expect(Finnhub.fetchQuote).not.toHaveBeenCalled();
    });

    it(`appelle Yahoo pour ${ticker}`, async () => {
      (Yahoo.fetchQuote as any).mockResolvedValueOnce(makeMockQuote(ticker));
      await Orchestrator.getQuote(ticker);
      expect(Yahoo.fetchQuote).toHaveBeenCalledWith(ticker);
    });
  }
});

// ─── getBatchQuotes ───────────────────────────────────────────

describe("getBatchQuotes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne une Map avec les quotes disponibles", async () => {
    (Finnhub.fetchQuote as any)
      .mockResolvedValueOnce(makeMockQuote("AAPL"))
      .mockResolvedValueOnce(makeMockQuote("GOOGL"))
      .mockResolvedValueOnce(null);

    const result = await Orchestrator.getBatchQuotes(["AAPL", "GOOGL", "FAIL"]);
    expect(result.size).toBe(2);
    expect(result.has("AAPL")).toBe(true);
    expect(result.has("GOOGL")).toBe(true);
    expect(result.has("FAIL")).toBe(false);
  });

  it("ne plante pas si toutes les quotes échouent", async () => {
    (Finnhub.fetchQuote as any).mockResolvedValue(null);
    (Polygon.fetchSnapshots as any).mockResolvedValue([]);
    (AlphaVantage.fetchAVQuote as any).mockResolvedValue(null);
    const result = await Orchestrator.getBatchQuotes(["X", "Y", "Z"]);
    expect(result.size).toBe(0);
  });
});

// ─── getCandles ───────────────────────────────────────────────

describe("getCandles — routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appelle Polygon pour un ticker US", async () => {
    const candles = Array.from({ length: 60 }, (_, i) =>
      makeMockCandle("AAPL", 150 + i * 0.1, i),
    );
    (Polygon.fetchDailyCandles as any).mockResolvedValueOnce(candles);
    const result = await Orchestrator.getCandles("AAPL", 60);
    expect(Polygon.fetchDailyCandles).toHaveBeenCalledWith("AAPL", 60);
    expect(result.length).toBe(60);
  });

  it("fallback Finnhub si Polygon retourne vide", async () => {
    (Polygon.fetchDailyCandles as any).mockResolvedValueOnce([]);
    const candles = Array.from({ length: 30 }, (_, i) =>
      makeMockCandle("MSFT", 300 + i, i),
    );
    (Finnhub.fetchCandles as any).mockResolvedValueOnce(candles);
    const result = await Orchestrator.getCandles("MSFT", 30);
    expect(Finnhub.fetchCandles).toHaveBeenCalled();
    expect(result.length).toBe(30);
  });

  it("appelle Yahoo pour un ticker EU (.PA)", async () => {
    const candles = Array.from({ length: 30 }, (_, i) =>
      makeMockCandle("BNP.PA", 60 + i * 0.1, i),
    );
    (Yahoo.fetchCandles as any).mockResolvedValueOnce(candles);
    await Orchestrator.getCandles("BNP.PA", 30);
    expect(Yahoo.fetchCandles).toHaveBeenCalledWith("BNP.PA", 30);
    expect(Polygon.fetchDailyCandles).not.toHaveBeenCalled();
  });
});

// ─── getIndicators ────────────────────────────────────────────

describe("getIndicators", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne des indicateurs calculés depuis les candles", async () => {
    // Fournir 220 candles pour que RSI/SMA200 soient calculables
    const candles = Array.from({ length: 220 }, (_, i) =>
      makeMockCandle("AAPL", 150 + Math.sin(i / 10) * 10, i),
    );
    (Polygon.fetchDailyCandles as any).mockResolvedValueOnce(candles);

    const ind = await Orchestrator.getIndicators("AAPL");
    expect(ind.ticker).toBe("AAPL");
    expect(ind.rsi14).not.toBeNull();
    expect(ind.sma50).not.toBeNull();
    expect(ind.sma200).not.toBeNull();
    // RSI doit être dans [0, 100]
    expect(ind.rsi14!).toBeGreaterThanOrEqual(0);
    expect(ind.rsi14!).toBeLessThanOrEqual(100);
  });

  it("retourne des null si candles vides", async () => {
    (Polygon.fetchDailyCandles as any).mockResolvedValueOnce([]);
    (Finnhub.fetchCandles as any).mockResolvedValueOnce([]);
    const ind = await Orchestrator.getIndicators("EMPTY");
    expect(ind.rsi14).toBeNull();
    expect(ind.sma50).toBeNull();
  });
});

// ─── getMarketOverview ────────────────────────────────────────

describe("getMarketOverview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne toujours universe.length résultats (mock fallback)", async () => {
    // Toutes les APIs retournent vide → mock fallback
    (Finnhub.fetchQuote as any).mockResolvedValue(null);
    (Polygon.fetchSnapshots as any).mockResolvedValue([]);
    (AlphaVantage.fetchAVQuote as any).mockResolvedValue(null);
    (Yahoo.fetchQuote as any).mockResolvedValue(null);

    const quotes = await Orchestrator.getMarketOverview("US");
    expect(quotes.length).toBe(Orchestrator.MARKET_UNIVERSE.length);
  });

  it("retourne les quotes CAC40 pour region=FR", async () => {
    (Yahoo.fetchQuote as any).mockResolvedValue(null);
    const quotes = await Orchestrator.getMarketOverview("FR");
    expect(quotes.length).toBe(Orchestrator.CAC40_UNIVERSE.length);
  });
});

// ─── runScreener ─────────────────────────────────────────────

describe("runScreener", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appelle onProgress avec le bon total", async () => {
    const tickers = ["AAPL", "MSFT", "GOOGL"];
    const progressCalls: number[] = [];

    // Toutes les APIs échouent → mock fallback génère des signaux
    (Finnhub.fetchQuote as any).mockResolvedValue(null);
    (Polygon.fetchDailyCandles as any).mockResolvedValue([]);
    (Finnhub.fetchCandles as any).mockResolvedValue([]);

    await Orchestrator.runScreener(tickers, (completed, total) => {
      progressCalls.push(completed);
      expect(total).toBe(tickers.length);
    });

    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("retourne des signaux triés par force (strong → weak)", async () => {
    (Finnhub.fetchQuote as any).mockResolvedValue(null);
    (Polygon.fetchDailyCandles as any).mockResolvedValue([]);
    (Finnhub.fetchCandles as any).mockResolvedValue([]);

    const signals = await Orchestrator.runScreener(["AAPL", "MSFT"]);
    const order = { strong: 0, moderate: 1, weak: 2 };
    for (let i = 1; i < signals.length; i++) {
      expect(order[signals[i].strength]).toBeGreaterThanOrEqual(
        order[signals[i - 1].strength],
      );
    }
  });

  it("ne plante pas avec une liste vide", async () => {
    const signals = await Orchestrator.runScreener([]);
    expect(signals).toEqual([]);
  });
});

// ─── getTickerMeta ────────────────────────────────────────────

describe("getTickerMeta", () => {
  it("retourne des métadonnées pour un ticker connu", () => {
    const meta = Orchestrator.getTickerMeta("AAPL");
    expect(meta.ticker).toBe("AAPL");
    expect(meta.name).toBeTruthy();
  });

  it("fallback gracieux pour un ticker inconnu", () => {
    const meta = Orchestrator.getTickerMeta("ZZZZUNKNOWN");
    expect(meta.ticker).toBe("ZZZZUNKNOWN");
    expect(meta.name).toBe("ZZZZUNKNOWN");
    expect(meta.exchange).toBe("NYSE");
  });
});

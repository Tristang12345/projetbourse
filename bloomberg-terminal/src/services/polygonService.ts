/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POLYGON.IO SERVICE
 * Spécialisé : Volume en capital, données de marché agrégées, screener.
 * Docs: https://polygon.io/docs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { throttler } from './apiThrottler';
import type { PivotQuote, PivotCandle, MarketActivityItem, MarketSector } from './types';

const BASE_URL = 'https://api.polygon.io';

interface PolygonPrevClose {
  T:  string;  // ticker
  c:  number;  // close
  h:  number;  // high
  l:  number;  // low
  o:  number;  // open
  v:  number;  // volume
  vw: number;  // volume weighted avg price
}

interface PolygonSnapshot {
  ticker:          string;
  day:             { c: number; h: number; l: number; o: number; v: number; vw: number };
  lastQuote:       { P: number; S: number; p: number; s: number };
  lastTrade:       { c: number[]; p: number; s: number; t: number; x: number };
  min:             { av: number; c: number; h: number; l: number; o: number; v: number; vw: number };
  prevDay:         { c: number; h: number; l: number; o: number; v: number; vw: number };
  todaysChange:    number;
  todaysChangePerc: number;
  updated:         number;
}

interface PolygonSnapshotsResponse {
  status:  string;
  tickers: PolygonSnapshot[];
}

interface PolygonAggregateBar {
  c:  number;  // close
  h:  number;  // high
  l:  number;  // low
  o:  number;  // open
  t:  number;  // timestamp (ms)
  v:  number;  // volume
  vw: number;  // volume weighted avg price
  n:  number;  // number of transactions
}

interface PolygonAggregatesResponse {
  results:     PolygonAggregateBar[];
  resultsCount: number;
  status:      string;
}

interface PolygonTickerDetails {
  results: {
    name:            string;
    ticker:          string;
    market_cap:      number;
    sic_description: string;
    primary_exchange: string;
    list_date:       string;
    description:     string;
  };
}

export class PolygonService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async get<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    return throttler.enqueue('polygon', async () => {
      const res = await axios.get<T>(`${BASE_URL}${endpoint}`, {
        params: { ...params, apiKey: this.apiKey },
        timeout: 10000,
      });
      return res.data;
    }, 1);
  }

  /**
   * Snapshots multi-tickers — requête la plus efficace de Polygon
   * Retourne les données du jour en un seul appel.
   */
  async getSnapshots(tickers: string[]): Promise<Map<string, Partial<PivotQuote>>> {
    if (!tickers.length) return new Map();

    const tickerStr = tickers.join(',');
    const raw = await this.get<PolygonSnapshotsResponse>(
      '/v2/snapshot/locale/us/markets/stocks/tickers',
      { tickers: tickerStr }
    );

    const map = new Map<string, Partial<PivotQuote>>();
    for (const snap of raw.tickers ?? []) {
      map.set(snap.ticker, {
        ticker:        snap.ticker,
        price:         snap.day?.c ?? snap.lastTrade?.p ?? 0,
        previousClose: snap.prevDay?.c ?? 0,
        open:          snap.day?.o ?? 0,
        high:          snap.day?.h ?? 0,
        low:           snap.day?.l ?? 0,
        change:        snap.todaysChange ?? 0,
        changePercent: snap.todaysChangePerc ?? 0,
        volume:        snap.day?.v ?? 0,
        timestamp:     snap.updated ?? Date.now(),
        source:        'polygon',
      });
    }
    return map;
  }

  /**
   * Bougies OHLCV agrégées
   * @param ticker     - symbole
   * @param multiplier - unité de temps (1, 5, 15, etc.)
   * @param timespan   - 'minute' | 'hour' | 'day' | 'week'
   * @param from       - date ISO "YYYY-MM-DD"
   * @param to         - date ISO "YYYY-MM-DD"
   */
  async getAggregates(
    ticker: string,
    multiplier: number,
    timespan: string,
    from: string,
    to: string
  ): Promise<PivotCandle[]> {
    const raw = await this.get<PolygonAggregatesResponse>(
      `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`,
      { adjusted: 'true', sort: 'asc', limit: '500' }
    );

    return (raw.results ?? []).map(bar => ({
      timestamp: bar.t,
      open:      bar.o,
      high:      bar.h,
      low:       bar.l,
      close:     bar.c,
      volume:    bar.v,
    }));
  }

  /**
   * Calcule le volume moyen sur 30 jours pour un ticker
   */
  async getAvgVolume30d(ticker: string): Promise<number> {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 45); // 45j pour avoir 30j de trading

    try {
      const candles = await this.getAggregates(
        ticker, 1, 'day',
        from.toISOString().split('T')[0],
        to.toISOString().split('T')[0]
      );
      if (!candles.length) return 0;
      const volumes = candles.slice(-30).map(c => c.volume);
      return volumes.reduce((a, b) => a + b, 0) / volumes.length;
    } catch { return 0; }
  }

  /**
   * Données de Market Activity pour un ensemble de tickers
   */
  async getMarketActivity(tickers: string[]): Promise<MarketActivityItem[]> {
    const snapshots = await this.getSnapshots(tickers);
    const items: MarketActivityItem[] = [];

    for (const [ticker, snap] of snapshots) {
      if (!snap.price) continue;
      const volumeCapital = (snap.volume ?? 0) * (snap.price ?? 0);

      items.push({
        ticker,
        name:           ticker,          // À enrichir avec le profil
        sector:         'Unknown',       // À enrichir
        price:          snap.price ?? 0,
        changePercent:  snap.changePercent ?? 0,
        volume:         snap.volume ?? 0,
        volumeCapital,
        relativeVolume: 0,               // Calculé après avec avgVolume30d
        marketCap:      undefined,
      });
    }

    return items.sort((a, b) => b.volumeCapital - a.volumeCapital);
  }

  /**
   * Détails d'un ticker pour le nom et la market cap
   */
  async getTickerDetails(ticker: string): Promise<{ name: string; marketCap: number; sector: MarketSector }> {
    try {
      const raw = await this.get<PolygonTickerDetails>(`/v3/reference/tickers/${ticker}`);
      return {
        name:      raw.results?.name ?? ticker,
        marketCap: raw.results?.market_cap ?? 0,
        sector:    'Unknown',
      };
    } catch {
      return { name: ticker, marketCap: 0, sector: 'Unknown' };
    }
  }

  /**
   * Données clôture précédente (jour J-1)
   */
  async getPreviousClose(ticker: string): Promise<PolygonPrevClose | null> {
    try {
      interface PrevCloseResp { results: PolygonPrevClose[] }
      const raw = await this.get<PrevCloseResp>(`/v2/aggs/ticker/${ticker}/prev`);
      return raw.results?.[0] ?? null;
    } catch { return null; }
  }
}

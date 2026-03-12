/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FINNHUB SERVICE
 * Consomme l'API Finnhub et convertit vers le format Pivot interne.
 * Docs: https://finnhub.io/docs/api
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { throttler } from './apiThrottler';
import type { PivotQuote, PivotNewsItem, PivotCandle, MacroIndicator, MarketSector } from './types';

const BASE_URL = 'https://finnhub.io/api/v1';

// Mapping secteur Finnhub → MarketSector interne
const SECTOR_MAP: Record<string, MarketSector> = {
  'Technology':              'Technology',
  'Health Technology':       'Healthcare',
  'Health Services':         'Healthcare',
  'Finance':                 'Finance',
  'Commercial Services':     'Industrials',
  'Consumer Non-Durables':   'Consumer',
  'Consumer Durables':       'Consumer',
  'Consumer Services':       'Consumer',
  'Energy Minerals':         'Energy',
  'Electronic Technology':   'Technology',
  'Industrial Services':     'Industrials',
  'Producer Manufacturing':  'Industrials',
  'Utilities':               'Utilities',
  'Communications':          'Communication',
  'Non-Energy Minerals':     'Materials',
  'Process Industries':      'Materials',
  'Retail Trade':            'Consumer',
  'Transportation':          'Industrials',
  'Miscellaneous':           'Unknown',
};

function mapSector(finnhubSector?: string): MarketSector {
  if (!finnhubSector) return 'Unknown';
  return SECTOR_MAP[finnhubSector] ?? 'Unknown';
}

// ─── Raw Finnhub types ────────────────────────────────────────────────────────

interface FinnhubQuoteRaw {
  c:  number;   // current price
  d:  number;   // change
  dp: number;   // change percent
  h:  number;   // high
  l:  number;   // low
  o:  number;   // open
  pc: number;   // previous close
  t:  number;   // timestamp
}

interface FinnhubProfileRaw {
  name:        string;
  ticker:      string;
  finnhubIndustry: string;
  marketCapitalization: number;
  shareOutstanding: number;
  logo: string;
  weburl: string;
}

interface FinnhubCandleRaw {
  c: number[];  // close
  h: number[];  // high
  l: number[];  // low
  o: number[];  // open
  t: number[];  // timestamp
  v: number[];  // volume
  s: string;    // status
}

interface FinnhubNewsRaw {
  category:    string;
  datetime:    number;
  headline:    string;
  id:          number;
  image:       string;
  related:     string;
  source:      string;
  summary:     string;
  url:         string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FinnhubService {
  private apiKey: string;
  private nameCache: Map<string, string>     = new Map();
  private sectorCache: Map<string, string>   = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async get<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    return throttler.enqueue('finnhub', async () => {
      const res = await axios.get<T>(`${BASE_URL}${endpoint}`, {
        params: { ...params, token: this.apiKey },
        timeout: 8000,
      });
      return res.data;
    });
  }

  /** Récupère un quote et le convertit en PivotQuote */
  async getQuote(ticker: string, avgVolume30d?: number): Promise<PivotQuote> {
    const [raw, profile] = await Promise.all([
      this.get<FinnhubQuoteRaw>('/quote', { symbol: ticker }),
      this.getProfile(ticker),
    ]);

    return {
      ticker,
      name:          profile?.name ?? ticker,
      price:         raw.c,
      previousClose: raw.pc,
      open:          raw.o,
      high:          raw.h,
      low:           raw.l,
      change:        raw.d,
      changePercent: raw.dp,
      volume:        0,                         // Finnhub quote n'inclut pas le volume
      avgVolume30d:  avgVolume30d ?? 0,
      marketCap:     (profile?.marketCapitalization ?? 0) * 1_000_000,
      timestamp:     raw.t * 1000,
      source:        'finnhub',
    };
  }

  /** Récupère le profil d'une société (mise en cache) */
  async getProfile(ticker: string): Promise<FinnhubProfileRaw | null> {
    if (this.nameCache.has(ticker)) {
      return {
        name:                 this.nameCache.get(ticker)!,
        ticker,
        finnhubIndustry:      this.sectorCache.get(ticker) ?? '',
        marketCapitalization: 0,
        shareOutstanding:     0,
        logo:                 '',
        weburl:               '',
      };
    }
    try {
      const profile = await this.get<FinnhubProfileRaw>('/stock/profile2', { symbol: ticker });
      if (profile.name) {
        this.nameCache.set(ticker, profile.name);
        this.sectorCache.set(ticker, profile.finnhubIndustry ?? '');
      }
      return profile;
    } catch {
      return null;
    }
  }

  /** Récupère les bougies historiques */
  async getCandles(ticker: string, from: number, to: number, resolution = 'D'): Promise<PivotCandle[]> {
    const raw = await this.get<FinnhubCandleRaw>('/stock/candle', {
      symbol:     ticker,
      resolution,
      from:       Math.floor(from / 1000),
      to:         Math.floor(to / 1000),
    });

    if (raw.s !== 'ok' || !raw.t) return [];

    return raw.t.map((ts, i) => ({
      timestamp: ts * 1000,
      open:      raw.o[i],
      high:      raw.h[i],
      low:       raw.l[i],
      close:     raw.c[i],
      volume:    raw.v[i],
    }));
  }

  /** Récupère les données intraday (pour sparklines) */
  async getIntraday(ticker: string): Promise<number[]> {
    const now  = Math.floor(Date.now() / 1000);
    const from = now - 86400; // 24h
    const candles = await this.getCandles(ticker, from * 1000, Date.now(), '15');
    return candles.map(c => c.close);
  }

  /** Récupère les news d'un ticker */
  async getCompanyNews(ticker: string, fromDate: string, toDate: string): Promise<PivotNewsItem[]> {
    const raw = await this.get<FinnhubNewsRaw[]>('/company-news', {
      symbol: ticker,
      from:   fromDate,
      to:     toDate,
    });

    return raw.slice(0, 50).map(item => ({
      id:              String(item.id),
      title:           item.headline,
      summary:         item.summary ?? '',
      url:             item.url,
      source:          item.source,
      publishedAt:     item.datetime * 1000,
      relatedTickers:  item.related ? item.related.split(',').map(s => s.trim()) : [ticker],
      sector:          'Unknown' as MarketSector,
      sentiment:       this.inferSentiment(item.headline),
      importance:      'medium',
      imageUrl:        item.image ?? undefined,
    }));
  }

  /** Récupère les news générales du marché */
  async getMarketNews(category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'): Promise<PivotNewsItem[]> {
    const raw = await this.get<FinnhubNewsRaw[]>('/news', { category });

    return raw.slice(0, 30).map(item => ({
      id:              String(item.id),
      title:           item.headline,
      summary:         item.summary ?? '',
      url:             item.url,
      source:          item.source,
      publishedAt:     item.datetime * 1000,
      relatedTickers:  [],
      sector:          'Unknown' as MarketSector,
      sentiment:       this.inferSentiment(item.headline),
      importance:      'low',
      imageUrl:        item.image ?? undefined,
    }));
  }

  /** Récupère le VIX via les indicateurs économiques */
  async getVIX(): Promise<MacroIndicator | null> {
    try {
      const raw = await this.get<FinnhubQuoteRaw>('/quote', { symbol: 'VIX' });
      return {
        symbol:        'VIX',
        name:          'CBOE Volatility Index',
        value:         raw.c,
        change:        raw.d,
        changePercent: raw.dp,
        timestamp:     raw.t * 1000,
        unit:          'points',
      };
    } catch { return null; }
  }

  /** Récupère le DXY (Dollar Index) */
  async getDXY(): Promise<MacroIndicator | null> {
    try {
      const raw = await this.get<FinnhubQuoteRaw>('/quote', { symbol: 'DX-Y.NYB' });
      return {
        symbol:        'DXY',
        name:          'US Dollar Index',
        value:         raw.c,
        change:        raw.d,
        changePercent: raw.dp,
        timestamp:     raw.t * 1000,
        unit:          'points',
      };
    } catch { return null; }
  }

  /** Inférence de sentiment basique basée sur des mots-clés */
  private inferSentiment(headline: string): 'positive' | 'negative' | 'neutral' {
    const h = headline.toLowerCase();
    const positiveWords = ['surge', 'gain', 'rise', 'rally', 'beat', 'record', 'growth', 'upgrade', 'strong', 'buy', 'profit', 'exceed', 'boost'];
    const negativeWords = ['fall', 'drop', 'decline', 'loss', 'miss', 'cut', 'warn', 'concern', 'risk', 'sell', 'downgrade', 'plunge', 'crash', 'crisis'];

    const posScore = positiveWords.filter(w => h.includes(w)).length;
    const negScore = negativeWords.filter(w => h.includes(w)).length;

    if (posScore > negScore) return 'positive';
    if (negScore > posScore) return 'negative';
    return 'neutral';
  }

  /** Métadonnées du secteur pour un ticker */
  getSector(ticker: string): MarketSector {
    return mapSector(this.sectorCache.get(ticker));
  }
}

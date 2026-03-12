/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ALPHA VANTAGE SERVICE
 * Spécialisé : Indicateurs techniques (RSI, MA), données macro, calendrier.
 * Docs: https://www.alphavantage.co/documentation/
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { throttler } from './apiThrottler';
import type { EconomicEvent, EventImportance, MacroIndicator, ScreenerResult, MACrossSignal } from './types';

const BASE_URL = 'https://www.alphavantage.co/query';

interface AVRSIRaw {
  'Technical Analysis: RSI': Record<string, { RSI: string }>;
}

interface AVMAraw {
  'Technical Analysis: SMA': Record<string, { SMA: string }>;
}

interface AVQuoteRaw {
  'Global Quote': {
    '01. symbol':             string;
    '02. open':               string;
    '03. high':               string;
    '04. low':                string;
    '05. price':              string;
    '06. volume':             string;
    '07. latest trading day': string;
    '08. previous close':     string;
    '09. change':             string;
    '10. change percent':     string;
  };
}

interface AVDailyRaw {
  'Time Series (Daily)': Record<string, {
    '1. open':   string;
    '2. high':   string;
    '3. low':    string;
    '4. close':  string;
    '5. volume': string;
  }>;
}

export class AlphaVantageService {
  private apiKey: string;
  // Cache local pour éviter les appels répétés (TTL 5 min)
  private cache: Map<string, { data: unknown; ts: number }> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async get<T>(params: Record<string, string>): Promise<T> {
    const cacheKey = JSON.stringify(params);
    const cached   = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.data as T;
    }

    const data = await throttler.enqueue('alphavantage', async () => {
      const res = await axios.get<T>(BASE_URL, {
        params: { ...params, apikey: this.apiKey },
        timeout: 12000,
      });
      return res.data;
    }, 2); // Priorité basse (background)

    this.cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  /**
   * Calcule le RSI (14 périodes par défaut) pour un ticker
   */
  async getRSI(ticker: string, period = 14): Promise<number | null> {
    try {
      const raw = await this.get<AVRSIRaw>({
        function:   'RSI',
        symbol:     ticker,
        interval:   'daily',
        time_period: String(period),
        series_type: 'close',
      });

      const entries = Object.entries(raw['Technical Analysis: RSI'] ?? {});
      if (!entries.length) return null;

      // La première entrée est la plus récente
      return parseFloat(entries[0][1].RSI);
    } catch { return null; }
  }

  /**
   * Calcule une SMA (Simple Moving Average) pour un ticker
   */
  async getSMA(ticker: string, period: number): Promise<number | null> {
    try {
      const raw = await this.get<AVMAraw>({
        function:    'SMA',
        symbol:      ticker,
        interval:    'daily',
        time_period: String(period),
        series_type: 'close',
      });

      const entries = Object.entries(raw['Technical Analysis: SMA'] ?? {});
      if (!entries.length) return null;
      return parseFloat(entries[0][1].SMA);
    } catch { return null; }
  }

  /**
   * Récupère les 2 dernières SMA pour détecter un croisement
   */
  async getSMAHistory(ticker: string, period: number, count = 5): Promise<number[]> {
    try {
      const raw = await this.get<AVMAraw>({
        function:    'SMA',
        symbol:      ticker,
        interval:    'daily',
        time_period: String(period),
        series_type: 'close',
      });

      const entries = Object.entries(raw['Technical Analysis: SMA'] ?? {});
      return entries.slice(0, count).map(([, v]) => parseFloat(v.SMA));
    } catch { return []; }
  }

  /**
   * Détecte le signal de croisement MA50/MA200
   * Golden Cross : MA50 passe au-dessus de MA200 (haussier)
   * Death Cross  : MA50 passe en-dessous de MA200 (baissier)
   */
  async getMASignal(ticker: string): Promise<{ signal: MACrossSignal; ma50: number; ma200: number }> {
    const [ma50Hist, ma200Hist] = await Promise.all([
      this.getSMAHistory(ticker, 50, 3),
      this.getSMAHistory(ticker, 200, 3),
    ]);

    const ma50  = ma50Hist[0]  ?? 0;
    const ma200 = ma200Hist[0] ?? 0;

    let signal: MACrossSignal = 'neutral';

    if (ma50 && ma200) {
      // Croisement récent (dans les 3 dernières bougies)
      const prevMa50  = ma50Hist[2]  ?? ma50;
      const prevMa200 = ma200Hist[2] ?? ma200;

      const crossedUp   = prevMa50 <= prevMa200 && ma50 > ma200;
      const crossedDown = prevMa50 >= prevMa200 && ma50 < ma200;

      if (crossedUp)         signal = 'golden_cross';
      else if (crossedDown)  signal = 'death_cross';
      else if (ma50 > ma200) signal = 'bullish';
      else                   signal = 'bearish';
    }

    return { signal, ma50, ma200 };
  }

  /**
   * Quote simple via Alpha Vantage
   */
  async getQuote(ticker: string): Promise<{ price: number; change: number; changePercent: number; volume: number } | null> {
    try {
      const raw = await this.get<AVQuoteRaw>({
        function: 'GLOBAL_QUOTE',
        symbol:   ticker,
      });

      const q = raw['Global Quote'];
      if (!q || !q['05. price']) return null;

      return {
        price:         parseFloat(q['05. price']),
        change:        parseFloat(q['09. change']),
        changePercent: parseFloat(q['10. change percent'].replace('%', '')),
        volume:        parseInt(q['06. volume'], 10),
      };
    } catch { return null; }
  }

  /**
   * Données journalières (pour calcul de volume moyen)
   */
  async getDailyData(ticker: string, outputSize: 'compact' | 'full' = 'compact'): Promise<Array<{ date: string; close: number; volume: number }>> {
    try {
      const raw = await this.get<AVDailyRaw>({
        function:    'TIME_SERIES_DAILY',
        symbol:      ticker,
        outputsize:  outputSize,
      });

      return Object.entries(raw['Time Series (Daily)'] ?? {})
        .slice(0, 60)
        .map(([date, v]) => ({
          date,
          close:  parseFloat(v['4. close']),
          volume: parseInt(v['5. volume'], 10),
        }));
    } catch { return []; }
  }

  /**
   * Analyse complète pour le Screener
   * Retourne tous les indicateurs techniques en une opération
   */
  async getScreenerData(ticker: string): Promise<{
    rsi:      number | null;
    ma50:     number;
    ma200:    number;
    maSignal: MACrossSignal;
  }> {
    const [rsi, maData] = await Promise.all([
      this.getRSI(ticker),
      this.getMASignal(ticker),
    ]);

    return {
      rsi,
      ma50:     maData.ma50,
      ma200:    maData.ma200,
      maSignal: maData.signal,
    };
  }

  /**
   * Calendrier économique (simulé depuis les données AV disponibles).
   * Note: AV gratuit n'inclut pas de calendrier économique complet.
   * En production, connecter à une API dédiée (Trading Economics, etc.)
   */
  getMockEconomicCalendar(): EconomicEvent[] {
    const now    = new Date();
    const events: EconomicEvent[] = [
      { id: '1', date: now.toISOString().split('T')[0], time: '14:30', country: 'US', flag: '🇺🇸', name: 'Non-Farm Payrolls', importance: 'high', forecast: '200K', previous: '187K' },
      { id: '2', date: now.toISOString().split('T')[0], time: '08:30', country: 'US', flag: '🇺🇸', name: 'CPI m/m', importance: 'high', forecast: '0.3%', previous: '0.4%' },
      { id: '3', date: now.toISOString().split('T')[0], time: '10:00', country: 'US', flag: '🇺🇸', name: 'ISM Manufacturing PMI', importance: 'medium', forecast: '48.5', previous: '47.2' },
      { id: '4', date: now.toISOString().split('T')[0], time: '14:00', country: 'US', flag: '🇺🇸', name: 'Fed Interest Rate Decision', importance: 'high', forecast: '5.50%', previous: '5.50%' },
      { id: '5', date: now.toISOString().split('T')[0], time: '09:00', country: 'EU', flag: '🇪🇺', name: 'ECB Rate Decision', importance: 'high', forecast: '4.50%', previous: '4.50%' },
      { id: '6', date: now.toISOString().split('T')[0], time: '07:00', country: 'GB', flag: '🇬🇧', name: 'UK Inflation Rate', importance: 'medium', forecast: '3.9%', previous: '4.0%' },
      { id: '7', date: now.toISOString().split('T')[0], time: '01:30', country: 'CN', flag: '🇨🇳', name: 'China GDP q/q', importance: 'high', forecast: '1.2%', previous: '1.3%' },
    ];

    // Assigner une date ±3 jours autour d'aujourd'hui
    return events.map((e, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + (i % 5) - 2);
      return { ...e, date: d.toISOString().split('T')[0] };
    });
  }

  /**
   * Indices macro clés (simulés pour les sources non disponibles en gratuit)
   */
  async getMacroIndicators(): Promise<MacroIndicator[]> {
    const indicators: MacroIndicator[] = [
      // Ces valeurs seraient normalement fetchées depuis plusieurs endpoints
      { symbol: 'US10Y',   name: 'US 10Y Treasury',  value: 4.35,  change: -0.03, changePercent: -0.68, timestamp: Date.now(), unit: '%' },
      { symbol: 'US2Y',    name: 'US 2Y Treasury',   value: 4.89,  change:  0.02, changePercent:  0.41, timestamp: Date.now(), unit: '%' },
      { symbol: 'CRUDE',   name: 'Crude Oil WTI',    value: 78.42, change: -0.88, changePercent: -1.11, timestamp: Date.now(), unit: 'USD' },
      { symbol: 'GOLD',    name: 'Gold Spot',        value: 2024.5,change: 12.30, changePercent:  0.61, timestamp: Date.now(), unit: 'USD' },
      { symbol: 'EURUSD',  name: 'EUR/USD',          value: 1.0842,change: 0.0023,changePercent:  0.21, timestamp: Date.now(), unit: '' },
      { symbol: 'BTCUSD',  name: 'Bitcoin',          value: 43250, change: -1240, changePercent: -2.79, timestamp: Date.now(), unit: 'USD' },
      { symbol: 'SPY',     name: 'S&P 500 ETF',      value: 479.82,change:  2.14, changePercent:  0.45, timestamp: Date.now(), unit: 'USD' },
    ];
    return indicators;
  }
}

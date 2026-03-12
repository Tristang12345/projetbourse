/**
 * ============================================================
 * API THROTTLE & RATE LIMITER
 * Manages call quotas for free-tier APIs.
 * Strategy: token-bucket per service per minute.
 * ============================================================
 */

export interface ThrottleConfig {
  requestsPerMinute: number;
  requestsPerDay:    number;
}

// Free-tier quotas (conservative estimates)
export const API_QUOTAS: Record<string, ThrottleConfig> = {
  finnhub:      { requestsPerMinute: 60, requestsPerDay: 1440 },
  polygon:      { requestsPerMinute: 5,  requestsPerDay: 500  },
  alphavantage: { requestsPerMinute: 5,  requestsPerDay: 500  },
};

/**
 * Refresh intervals for different data categories.
 * Values in milliseconds.
 */
export const REFRESH_INTERVALS = {
  /** P&L / real-time prices — fast refresh */
  REALTIME:  15_000,    // 15s
  /** News feed — medium */
  NEWS:      60_000,    // 1min
  /** Market overview (heatmap, volume) — medium */
  MARKET:    30_000,    // 30s
  /** Macro data (VIX, DXY) — slow */
  MACRO:     300_000,   // 5min
  /** Technical indicators (screener) — slow */
  TECHNICAL: 600_000,   // 10min
  /** Economic calendar — very slow */
  CALENDAR:  3_600_000, // 1hr
} as const;

interface BucketState {
  tokens: number;
  lastRefill: number;
  dailyCount: number;
  dayStart: number;
}

/** Token-bucket throttler for a named service */
export class ApiThrottler {
  private buckets: Map<string, BucketState> = new Map();

  /** Returns true if the request is allowed, false if throttled */
  canRequest(service: string): boolean {
    const config = API_QUOTAS[service];
    if (!config) return true;

    const now = Date.now();
    let bucket = this.buckets.get(service);

    if (!bucket) {
      bucket = {
        tokens:     config.requestsPerMinute,
        lastRefill: now,
        dailyCount: 0,
        dayStart:   now,
      };
      this.buckets.set(service, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed  = (now - bucket.lastRefill) / 60_000; // in minutes
    const newTokens = elapsed * config.requestsPerMinute;
    if (newTokens >= 1) {
      bucket.tokens    = Math.min(
        bucket.tokens + Math.floor(newTokens),
        config.requestsPerMinute,
      );
      bucket.lastRefill = now;
    }

    // Reset daily counter
    if (now - bucket.dayStart > 86_400_000) {
      bucket.dailyCount = 0;
      bucket.dayStart   = now;
    }

    // Check limits
    if (bucket.tokens <= 0 || bucket.dailyCount >= config.requestsPerDay) {
      console.warn(`[Throttle] ${service} rate limited`);
      return false;
    }

    bucket.tokens--;
    bucket.dailyCount++;
    return true;
  }

  /** Get remaining tokens for a service */
  getStatus(service: string): { tokens: number; daily: number } {
    const config = API_QUOTAS[service];
    const bucket = this.buckets.get(service);
    if (!bucket || !config) return { tokens: 0, daily: 0 };
    return {
      tokens: bucket.tokens,
      daily:  config.requestsPerDay - bucket.dailyCount,
    };
  }
}

/** Singleton throttler instance */
export const throttler = new ApiThrottler();

/** Sleep helper for backoff */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Retry with exponential backoff */
export async function withRetry<T>(
  fn:       () => Promise<T>,
  retries = 3,
  baseMs  = 1000,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw new Error("Retry exhausted");
}

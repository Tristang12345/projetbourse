/**
 * API Throttler — Rate-limit guard for free-tier APIs.
 * Each provider has a bucket with max calls per minute.
 * Calls are queued and executed when capacity allows.
 */

interface ThrottleConfig {
  maxPerMinute: number;
  provider:     string;
}

interface QueueItem {
  fn:      () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject:  (e: unknown) => void;
}

const CONFIGS: Record<string, ThrottleConfig> = {
  finnhub:      { maxPerMinute: 55,  provider: "finnhub"      },
  polygon:      { maxPerMinute: 4,   provider: "polygon"       },
  alphavantage: { maxPerMinute: 4,   provider: "alphavantage"  },
};

class ProviderThrottler {
  private queue:     QueueItem[] = [];
  private callTimes: number[]    = [];
  private config:    ThrottleConfig;
  private timer:     ReturnType<typeof setTimeout> | null = null;

  constructor(config: ThrottleConfig) {
    this.config = config;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn: fn as () => Promise<unknown>, resolve, reject });
      this.process();
    });
  }

  private process() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 0);
  }

  private flush() {
    const now = Date.now();
    const windowStart = now - 60_000;
    this.callTimes = this.callTimes.filter(t => t > windowStart);

    while (this.queue.length > 0 && this.callTimes.length < this.config.maxPerMinute) {
      const item = this.queue.shift()!;
      this.callTimes.push(Date.now());
      item.fn()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          if (this.queue.length > 0) {
            const wait = Math.max(0, 60_000 / this.config.maxPerMinute);
            setTimeout(() => this.flush(), wait);
          }
        });
    }

    if (this.queue.length > 0) {
      const oldest = this.callTimes[0];
      const wait   = 60_000 - (Date.now() - oldest) + 100;
      setTimeout(() => this.flush(), wait);
    }
  }
}

// Singleton throttlers per provider
const throttlers = new Map<string, ProviderThrottler>();

export function getThrottler(provider: string): ProviderThrottler {
  if (!throttlers.has(provider)) {
    const cfg = CONFIGS[provider] ?? { maxPerMinute: 10, provider };
    throttlers.set(provider, new ProviderThrottler(cfg));
  }
  return throttlers.get(provider)!;
}

export async function throttledFetch<T>(
  provider: string,
  fn: () => Promise<T>
): Promise<T> {
  return getThrottler(provider).enqueue(fn) as Promise<T>;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * API THROTTLER
 * Gestion intelligente des quotas gratuits des APIs.
 * Implémente une queue par priorité avec rate-limiting par source.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type ThrottleConfig = {
  requestsPerMinute: number;
  requestsPerDay:    number;
};

type QueuedRequest = {
  fn:       () => Promise<unknown>;
  resolve:  (v: unknown) => void;
  reject:   (e: unknown) => void;
  priority: number;           // Plus bas = plus prioritaire
};

/** Quotas gratuits des APIs (sécurisés en dessous des limites réelles) */
const API_CONFIGS: Record<string, ThrottleConfig> = {
  finnhub:      { requestsPerMinute: 55,  requestsPerDay: 55000  },
  polygon:      { requestsPerMinute: 4,   requestsPerDay: 1000   },  // Tier gratuit
  alphavantage: { requestsPerMinute: 4,   requestsPerDay: 490    },
};

class ApiThrottler {
  private queues:           Map<string, QueuedRequest[]> = new Map();
  private countersMinute:   Map<string, number>          = new Map();
  private countersDay:      Map<string, number>          = new Map();
  private lastResetMinute:  Map<string, number>          = new Map();
  private lastResetDay:     Map<string, number>          = new Map();
  private processing:       Map<string, boolean>         = new Map();

  constructor() {
    for (const source of Object.keys(API_CONFIGS)) {
      this.queues.set(source, []);
      this.countersMinute.set(source, 0);
      this.countersDay.set(source, 0);
      this.lastResetMinute.set(source, Date.now());
      this.lastResetDay.set(source, Date.now());
      this.processing.set(source, false);
    }
  }

  /**
   * Enfile une requête API avec une priorité donnée.
   * @param source   - identifiant de la source ('finnhub', 'polygon', etc.)
   * @param fn       - fonction asynchrone à exécuter
   * @param priority - 0=urgent (P&L), 1=normal, 2=background (macro)
   */
  enqueue<T>(source: string, fn: () => Promise<T>, priority = 1): Promise<T> {
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(source) ?? [];
      queue.push({ fn, resolve: resolve as (v: unknown) => void, reject, priority });
      // Tri par priorité
      queue.sort((a, b) => a.priority - b.priority);
      this.queues.set(source, queue);
      this.processQueue(source);
    });
  }

  private async processQueue(source: string): Promise<void> {
    if (this.processing.get(source)) return;
    this.processing.set(source, true);

    const config = API_CONFIGS[source];
    if (!config) { this.processing.set(source, false); return; }

    while ((this.queues.get(source)?.length ?? 0) > 0) {
      this.resetCountersIfNeeded(source);

      const minuteCount = this.countersMinute.get(source) ?? 0;
      const dayCount    = this.countersDay.get(source) ?? 0;

      if (minuteCount >= config.requestsPerMinute) {
        // Attendre la prochaine fenêtre d'une minute
        const elapsed   = Date.now() - (this.lastResetMinute.get(source) ?? 0);
        const waitTime  = Math.max(0, 60000 - elapsed) + 100; // +100ms marge
        console.debug(`[Throttler] ${source}: limite minute atteinte, attente ${waitTime}ms`);
        await this.sleep(waitTime);
        this.resetCountersIfNeeded(source);
        continue;
      }

      if (dayCount >= config.requestsPerDay) {
        console.warn(`[Throttler] ${source}: quota journalier atteint`);
        this.queues.get(source)?.forEach(r => r.reject(new Error(`Quota journalier ${source} atteint`)));
        this.queues.set(source, []);
        break;
      }

      const request = this.queues.get(source)?.shift();
      if (!request) break;

      this.countersMinute.set(source, minuteCount + 1);
      this.countersDay.set(source, dayCount + 1);

      try {
        const result = await request.fn();
        request.resolve(result);
      } catch (err) {
        request.reject(err);
      }

      // Espacement minimum entre requêtes (évite les burst)
      const minInterval = Math.ceil(60000 / config.requestsPerMinute);
      await this.sleep(minInterval);
    }

    this.processing.set(source, false);
  }

  private resetCountersIfNeeded(source: string): void {
    const now           = Date.now();
    const lastMinute    = this.lastResetMinute.get(source) ?? 0;
    const lastDay       = this.lastResetDay.get(source) ?? 0;

    if (now - lastMinute >= 60000) {
      this.countersMinute.set(source, 0);
      this.lastResetMinute.set(source, now);
    }
    if (now - lastDay >= 86400000) {
      this.countersDay.set(source, 0);
      this.lastResetDay.set(source, now);
    }
  }

  /** Stats pour le StatusBar */
  getStats(): Record<string, { minute: number; day: number; config: ThrottleConfig; queue: number }> {
    const stats: Record<string, { minute: number; day: number; config: ThrottleConfig; queue: number }> = {};
    for (const source of Object.keys(API_CONFIGS)) {
      stats[source] = {
        minute: this.countersMinute.get(source) ?? 0,
        day:    this.countersDay.get(source) ?? 0,
        config: API_CONFIGS[source],
        queue:  this.queues.get(source)?.length ?? 0,
      };
    }
    return stats;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton partagé
export const throttler = new ApiThrottler();

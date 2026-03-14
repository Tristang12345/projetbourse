/**
 * ============================================================
 * ALERT STORE — Prix target et stop-loss avec notifications
 * ============================================================
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AlertDirection = "above" | "below";
export type AlertStatus    = "active" | "triggered" | "dismissed";

export interface PriceAlert {
  id:         string;
  ticker:     string;
  targetPrice: number;
  direction:  AlertDirection;   // "above" = déclenche si prix ≥ target
  note?:      string;
  status:     AlertStatus;
  createdAt:  number;
  triggeredAt?: number;
}

interface AlertState {
  alerts:      PriceAlert[];
  addAlert:    (a: Omit<PriceAlert, "id" | "createdAt" | "status">) => void;
  dismissAlert: (id: string) => void;
  deleteAlert:  (id: string) => void;
  /** Check all active alerts against current prices; returns newly triggered ones */
  checkAlerts: (prices: Record<string, number>) => PriceAlert[];
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set, get) => ({
      alerts: [],

      addAlert: (a) =>
        set((s) => ({
          alerts: [
            ...s.alerts,
            { ...a, id: crypto.randomUUID(), createdAt: Date.now(), status: "active" },
          ],
        })),

      dismissAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) =>
            a.id === id ? { ...a, status: "dismissed" } : a,
          ),
        })),

      deleteAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

      checkAlerts: (prices) => {
        const triggered: PriceAlert[] = [];
        set((s) => ({
          alerts: s.alerts.map((alert) => {
            if (alert.status !== "active") return alert;
            const price = prices[alert.ticker];
            if (price === undefined) return alert;

            const fired =
              (alert.direction === "above" && price >= alert.targetPrice) ||
              (alert.direction === "below" && price <= alert.targetPrice);

            if (fired) {
              const updated = { ...alert, status: "triggered" as AlertStatus, triggeredAt: Date.now() };
              triggered.push(updated);
              return updated;
            }
            return alert;
          }),
        }));
        return triggered;
      },
    }),
    {
      name:    "bloomberg-alerts",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

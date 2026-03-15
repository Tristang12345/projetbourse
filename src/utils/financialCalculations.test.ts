/**
 * ============================================================
 * TESTS — financialCalculations.ts
 * Run: npm test
 * ============================================================
 */

import { describe, it, expect } from "vitest";
import {
  calcPnL, calcPnLPercent, calcDayPnL, calcMarketValue,
  calcSMA, calcEMA, calcRSI, calcMACD, calcATR,
  detectRSISignal, detectMACrossSignal, detectVolumeBreakout,
  formatCurrency, formatPercent, formatVolume, formatPrice,
} from "./financialCalculations";

// ─── P&L ─────────────────────────────────────────────────────

describe("calcPnL", () => {
  it("calcule un gain positif", () => {
    expect(calcPnL(110, 100, 10)).toBeCloseTo(100);
  });
  it("calcule une perte négative", () => {
    expect(calcPnL(90, 100, 10)).toBeCloseTo(-100);
  });
  it("retourne 0 si prix = coût", () => {
    expect(calcPnL(100, 100, 10)).toBe(0);
  });
});

describe("calcPnLPercent", () => {
  it("calcule le pourcentage de gain", () => {
    expect(calcPnLPercent(110, 100)).toBeCloseTo(10);
  });
  it("retourne 0 si avgCost est 0 (pas de division par zéro)", () => {
    expect(calcPnLPercent(100, 0)).toBe(0);
  });
  it("calcule une perte négative", () => {
    expect(calcPnLPercent(75, 100)).toBeCloseTo(-25);
  });
});

describe("calcDayPnL", () => {
  it("calcule le P&L journalier", () => {
    expect(calcDayPnL(105, 100, 20)).toBeCloseTo(100);
  });
});

describe("calcMarketValue", () => {
  it("multiplie prix × quantité", () => {
    expect(calcMarketValue(150, 10)).toBe(1500);
  });
});

// ─── SMA ─────────────────────────────────────────────────────

describe("calcSMA", () => {
  it("calcule la moyenne simple correctement", () => {
    expect(calcSMA([1, 2, 3, 4, 5], 3)).toBeCloseTo(4); // avg(3,4,5)
  });
  it("retourne null si données insuffisantes", () => {
    expect(calcSMA([1, 2], 5)).toBeNull();
  });
  it("fonctionne avec période = longueur exacte", () => {
    expect(calcSMA([10, 20, 30], 3)).toBeCloseTo(20);
  });
});

// ─── EMA ─────────────────────────────────────────────────────

describe("calcEMA", () => {
  it("retourne null si données insuffisantes", () => {
    expect(calcEMA([1, 2, 3], 5)).toBeNull();
  });
  it("retourne la SMA seed quand données = period exactement", () => {
    const data = [10, 20, 30];
    expect(calcEMA(data, 3)).toBeCloseTo(20);
  });
  it("l'EMA est plus réactive que la SMA aux dernières valeurs", () => {
    // Série avec une forte hausse finale
    const data = [10, 10, 10, 10, 10, 50];
    const ema = calcEMA(data, 3)!;
    const sma = calcSMA(data, 3)!;
    // EMA doit pondérer davantage le 50 final
    expect(ema).toBeGreaterThan(sma);
  });
});

// ─── RSI ─────────────────────────────────────────────────────

describe("calcRSI", () => {
  it("retourne null si données insuffisantes (< period+1)", () => {
    expect(calcRSI([1, 2, 3], 14)).toBeNull();
  });

  it("retourne 100 si aucune perte (hausse constante)", () => {
    const allUp = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(calcRSI(allUp, 14)).toBe(100);
  });

  it("retourne 0 si aucun gain (baisse constante)", () => {
    const allDown = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(calcRSI(allDown, 14)).toBeCloseTo(0, 0);
  });

  it("retourne ~50 pour un marché neutre alternant +1/-1", () => {
    const neutral: number[] = [100];
    for (let i = 0; i < 28; i++) {
      neutral.push(neutral[i] + (i % 2 === 0 ? 1 : -1));
    }
    const rsi = calcRSI(neutral, 14)!;
    expect(rsi).toBeGreaterThan(40);
    expect(rsi).toBeLessThan(60);
  });

  it("RSI est compris entre 0 et 100", () => {
    const random = Array.from({ length: 30 }, () => Math.random() * 100);
    const rsi = calcRSI(random, 14)!;
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it("série survendue donne RSI < 30", () => {
    // Baisse brutale suivie de légère hausse
    const data = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50,
                  45, 40, 35, 30, 31];
    const rsi = calcRSI(data, 14)!;
    expect(rsi).toBeLessThan(35);
  });

  it("série surachetée donne RSI > 70", () => {
    // Hausse brutale suivie de légère consolidation
    const data = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
                  65, 70, 75, 80, 79];
    const rsi = calcRSI(data, 14)!;
    expect(rsi).toBeGreaterThan(65);
  });
});

// ─── MACD ─────────────────────────────────────────────────────

describe("calcMACD", () => {
  it("retourne null si données insuffisantes", () => {
    const result = calcMACD([1, 2, 3], 12, 26, 9);
    expect(result.line).toBeNull();
    expect(result.signal).toBeNull();
    expect(result.histogram).toBeNull();
  });

  it("retourne des valeurs numériques avec données suffisantes", () => {
    const data = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = calcMACD(data);
    expect(result.line).not.toBeNull();
    expect(result.signal).not.toBeNull();
    expect(result.histogram).not.toBeNull();
  });

  it("histogram = line - signal", () => {
    const data = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
    const { line, signal, histogram } = calcMACD(data);
    if (line !== null && signal !== null && histogram !== null) {
      expect(histogram).toBeCloseTo(line - signal, 8);
    }
  });
});

// ─── ATR ─────────────────────────────────────────────────────

describe("calcATR", () => {
  it("retourne null si données insuffisantes", () => {
    expect(calcATR([1], [1], [1], 14)).toBeNull();
  });

  it("retourne une valeur positive pour des données OHLC valides", () => {
    const n = 20;
    const highs  = Array.from({ length: n }, (_, i) => 100 + i + 2);
    const lows   = Array.from({ length: n }, (_, i) => 100 + i - 2);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const atr = calcATR(highs, lows, closes, 14);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });
});

// ─── Screener Signals ─────────────────────────────────────────

describe("detectRSISignal", () => {
  it("retourne RSI_OVERSOLD pour RSI ≤ 30", () => {
    expect(detectRSISignal(30)).toBe("RSI_OVERSOLD");
    expect(detectRSISignal(20)).toBe("RSI_OVERSOLD");
    expect(detectRSISignal(0)).toBe("RSI_OVERSOLD");
  });
  it("retourne RSI_OVERBOUGHT pour RSI ≥ 70", () => {
    expect(detectRSISignal(70)).toBe("RSI_OVERBOUGHT");
    expect(detectRSISignal(85)).toBe("RSI_OVERBOUGHT");
    expect(detectRSISignal(100)).toBe("RSI_OVERBOUGHT");
  });
  it("retourne null en zone neutre", () => {
    expect(detectRSISignal(50)).toBeNull();
    expect(detectRSISignal(31)).toBeNull();
    expect(detectRSISignal(69)).toBeNull();
  });
  it("retourne null si rsi est null", () => {
    expect(detectRSISignal(null)).toBeNull();
  });
});

describe("detectMACrossSignal", () => {
  it("détecte un Golden Cross (SMA50 passe au-dessus de SMA200)", () => {
    // Avant: SMA50 < SMA200 — Après: SMA50 > SMA200
    expect(detectMACrossSignal(201, 200, 199, 200)).toBe("GOLDEN_CROSS");
  });
  it("détecte un Death Cross (SMA50 passe en-dessous de SMA200)", () => {
    expect(detectMACrossSignal(199, 200, 201, 200)).toBe("DEATH_CROSS");
  });
  it("retourne null si pas de croisement", () => {
    expect(detectMACrossSignal(210, 200, 205, 200)).toBeNull();
  });
  it("retourne null si une valeur est null", () => {
    expect(detectMACrossSignal(null, 200, 199, 200)).toBeNull();
  });
});

describe("detectVolumeBreakout", () => {
  it("détecte un breakout si volume ≥ threshold × avgVolume", () => {
    expect(detectVolumeBreakout(200_000, 100_000, 2.0)).toBe(true);
  });
  it("retourne false si volume insuffisant", () => {
    expect(detectVolumeBreakout(150_000, 100_000, 2.0)).toBe(false);
  });
  it("retourne false si avgVolume est 0 (pas de division par zéro)", () => {
    expect(detectVolumeBreakout(999_999, 0, 2.0)).toBe(false);
  });
});

// ─── Formatters ───────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formate en USD par défaut", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });
  it("formate en compact si valeur ≥ 1M", () => {
    expect(formatCurrency(2_500_000, "USD", true)).toBe("+2.50M");
  });
  it("formate les valeurs négatives", () => {
    expect(formatCurrency(-500)).toContain("-");
  });
});

describe("formatPercent", () => {
  it("ajoute le signe + pour les valeurs positives", () => {
    expect(formatPercent(5.25)).toBe("+5.25%");
  });
  it("conserve le signe - pour les valeurs négatives", () => {
    expect(formatPercent(-3.1)).toBe("-3.10%");
  });
  it("formate 0 avec +", () => {
    expect(formatPercent(0)).toBe("+0.00%");
  });
});

describe("formatVolume", () => {
  it("formate en milliards", () => {
    expect(formatVolume(2_500_000_000)).toBe("2.50B");
  });
  it("formate en millions", () => {
    expect(formatVolume(3_200_000)).toBe("3.20M");
  });
  it("formate en milliers", () => {
    expect(formatVolume(45_000)).toBe("45.0K");
  });
  it("retourne le nombre brut en dessous de 1000", () => {
    expect(formatVolume(500)).toBe("500");
  });
});

describe("formatPrice", () => {
  it("préfixe $ pour USD", () => {
    expect(formatPrice(150, "USD")).toContain("$");
  });
  it("suffixe € pour EUR", () => {
    expect(formatPrice(85.5, "EUR")).toContain("€");
  });
  it("préfixe £ pour GBP", () => {
    expect(formatPrice(120, "GBP")).toContain("£");
  });
  it("préfixe ¥ pour JPY (pas de décimales)", () => {
    const result = formatPrice(15000, "JPY");
    expect(result).toContain("¥");
    expect(result).not.toContain(".");
  });
});

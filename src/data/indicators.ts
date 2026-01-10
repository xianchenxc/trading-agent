/**
 * Technical indicators calculation
 * EMA and ATR implementations
 */

import { Kline, IndicatorData } from "../types";

export class Indicators {
  /**
   * Calculate EMA (Exponential Moving Average)
   * @param prices Array of prices (typically close prices)
   * @param period EMA period
   * @returns Array of EMA values
   */
  static calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) {
      return [];
    }

    const ema: number[] = [];
    const multiplier = 2 / (period + 1);

    // First EMA value is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    ema[period - 1] = sum / period;

    // Calculate subsequent EMA values
    for (let i = period; i < prices.length; i++) {
      ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    }

    return ema;
  }

  /**
   * Calculate ATR (Average True Range)
   * @param klines Array of klines
   * @param period ATR period (default 14)
   * @returns Array of ATR values
   */
  static calculateATR(klines: Kline[], period: number = 14): number[] {
    if (klines.length < period + 1) {
      return [];
    }

    const trueRanges: number[] = [];

    // Calculate True Range for each bar
    for (let i = 1; i < klines.length; i++) {
      const current = klines[i];
      const previous = klines[i - 1];

      const tr1 = current.high - current.low;
      const tr2 = Math.abs(current.high - previous.close);
      const tr3 = Math.abs(current.low - previous.close);

      trueRanges.push(Math.max(tr1, tr2, tr3));
    }

    // Calculate ATR using EMA of True Range
    const atr = this.calculateEMA(trueRanges, period);

    // Pad with undefined for first period bars
    const padded: (number | undefined)[] = new Array(period).fill(undefined);
    return [...padded, ...atr] as number[];
  }

  /**
   * Calculate all indicators for a series of klines
   * @param klines Array of klines
   * @param emaShort Short EMA period (e.g., 20)
   * @param emaMedium Medium EMA period (e.g., 50)
   * @param emaLong Long EMA period (e.g., 200)
   * @param atrPeriod ATR period (default 14)
   * @returns Array of IndicatorData
   */
  static calculateAllIndicators(
    klines: Kline[],
    emaShort: number,
    emaMedium: number,
    emaLong: number,
    atrPeriod: number = 14
  ): IndicatorData[] {
    const closes = klines.map((k) => k.close);

    const ema20 = this.calculateEMA(closes, emaShort);
    const ema50 = this.calculateEMA(closes, emaMedium);
    const ema200 = this.calculateEMA(closes, emaLong);
    const atr = this.calculateATR(klines, atrPeriod);

    const maxLength = klines.length;
    const indicators: IndicatorData[] = [];

    for (let i = 0; i < maxLength; i++) {
      indicators.push({
        ema20: ema20[i] ?? undefined,
        ema50: ema50[i] ?? undefined,
        ema200: ema200[i] ?? undefined,
        atr: atr[i] ?? undefined,
      });
    }

    return indicators;
  }

  /**
   * Get the highest high in the last N bars
   */
  static getHighestHigh(klines: Kline[], lookback: number, currentIndex: number): number {
    const start = Math.max(0, currentIndex - lookback + 1);
    const end = currentIndex + 1;
    return Math.max(...klines.slice(start, end).map((k) => k.high));
  }

  /**
   * Get the lowest low in the last N bars
   */
  static getLowestLow(klines: Kline[], lookback: number, currentIndex: number): number {
    const start = Math.max(0, currentIndex - lookback + 1);
    const end = currentIndex + 1;
    return Math.min(...klines.slice(start, end).map((k) => k.low));
  }
}

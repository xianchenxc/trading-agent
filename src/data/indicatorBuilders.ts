import { Config } from "../config/config";
import { Kline, IndicatorData, HTFIndicatorData, LTFIndicatorData } from "../types";
import { ema, atr, adx } from "./indicators";

/**
 * Build legacy IndicatorData structure from K-lines and config.
 * This is a project-specific adapter on top of the generic indicator series.
 */
export function buildIndicators(klines: Kline[], config: Config["indicators"]): IndicatorData[] {
  const closes = klines.map((k) => k.close);

  const emaShortSeries = ema(closes, config.ema.short);
  const emaMediumSeries = ema(closes, config.ema.medium);
  const emaLongSeries = ema(closes, config.ema.long);

  const atrSeries = atr(klines, config.atr.period);
  const { adx: adxSeries, plusDI, minusDI } = adx(klines, config.adx.period);

  return klines.map((k, i) => ({
    emaShort: Number.isNaN(emaShortSeries[i]) ? undefined : emaShortSeries[i],
    emaMedium: Number.isNaN(emaMediumSeries[i]) ? undefined : emaMediumSeries[i],
    emaLong: Number.isNaN(emaLongSeries[i]) ? undefined : emaLongSeries[i],

    atr: Number.isNaN(atrSeries[i]) ? undefined : atrSeries[i],

    adx: Number.isNaN(adxSeries[i]) ? undefined : adxSeries[i],
    plusDI: Number.isNaN(plusDI[i]) ? undefined : plusDI[i],
    minusDI: Number.isNaN(minusDI[i]) ? undefined : minusDI[i],
  }));
}

/**
 * Build Higher Timeframe (HTF) indicators (e.g. 4h).
 * Returns EMA(medium), EMA(long), ADX(period from config).
 */
export function buildHTFIndicators(
  klines: Kline[],
  config: Config["indicators"]
): HTFIndicatorData[] {
  const closes = klines.map((k) => k.close);

  const emaMediumSeries = ema(closes, config.ema.medium);
  const emaLongSeries = ema(closes, config.ema.long);
  const { adx: adxSeries } = adx(klines, config.adx.period);

  return klines.map((k, i) => ({
    ema50: Number.isNaN(emaMediumSeries[i]) ? undefined : emaMediumSeries[i],
    ema200: Number.isNaN(emaLongSeries[i]) ? undefined : emaLongSeries[i],
    adx: Number.isNaN(adxSeries[i]) ? undefined : adxSeries[i],
  }));
}

/**
 * Build Lower Timeframe (LTF) indicators (e.g. 1h).
 * Returns EMA(short), EMA(medium), ADX, ATR, Donchian High and ADX history series.
 */
export function buildLTFIndicators(
  klines: Kline[],
  config: Config["indicators"],
  donchianLookback: number = 20
): LTFIndicatorData[] {
  const closes = klines.map((k) => k.close);

  const emaShortSeries = ema(closes, config.ema.short);
  const emaMediumSeries = ema(closes, config.ema.medium);
  const atrSeries = atr(klines, config.atr.period);
  const { adx: adxSeries } = adx(klines, config.adx.period);

  const donchianHighs = klines.map((_, i) => getDonchianHigh(klines, donchianLookback, i));

  return klines.map((k, i) => {
    const adxHistory: number[] = [];
    if (i > 0) {
      for (let j = Math.max(0, i - 10); j < i; j++) {
        if (!Number.isNaN(adxSeries[j])) {
          adxHistory.push(adxSeries[j]);
        }
      }
    }

    return {
      ema20: Number.isNaN(emaShortSeries[i]) ? undefined : emaShortSeries[i],
      ema50: Number.isNaN(emaMediumSeries[i]) ? undefined : emaMediumSeries[i],
      adx: Number.isNaN(adxSeries[i]) ? undefined : adxSeries[i],
      adx_1h_series: adxHistory.length > 0 ? adxHistory : undefined,
      atr: Number.isNaN(atrSeries[i]) ? undefined : atrSeries[i],
      donchianHigh: donchianHighs[i],
    };
  });
}

/**
 * Get the highest high in the last N bars.
 */
export function getHighestHigh(
  klines: Kline[],
  lookback: number,
  currentIndex: number
): number {
  const start = Math.max(0, currentIndex - lookback + 1);
  const end = currentIndex + 1;
  return Math.max(...klines.slice(start, end).map((k) => k.high));
}

/**
 * Get the lowest low in the last N bars.
 */
export function getLowestLow(
  klines: Kline[],
  lookback: number,
  currentIndex: number
): number {
  const start = Math.max(0, currentIndex - lookback + 1);
  const end = currentIndex + 1;
  return Math.min(...klines.slice(start, end).map((k) => k.low));
}

/**
 * Get Donchian High (highest high of completed bars only).
 * Excludes the current bar to avoid lookahead bias.
 * @returns Highest high of the last N completed bars, or undefined if insufficient data.
 */
export function getDonchianHigh(
  klines: Kline[],
  lookback: number,
  currentIndex: number
): number | undefined {
  const start = Math.max(0, currentIndex - lookback);
  const end = currentIndex;

  if (start >= end || end === 0) {
    return undefined;
  }

  const historicalBars = klines.slice(start, end);
  if (historicalBars.length === 0) {
    return undefined;
  }

  return Math.max(...historicalBars.map((k) => k.high));
}


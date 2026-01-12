/**
 * Technical indicators calculation
 * EMA, ATR, and ADX implementations
 */

import { Config } from "../config";
import { Kline, IndicatorData, HTFIndicatorData, LTFIndicatorData } from "../types";

/**
* Exponential Moving Average
*/
function calculateEMA(values: number[], period: number): Array<number | undefined> {
  const k = 2 / (period + 1);
  const ema: Array<number | undefined> = [];
  
  let prevEma: number | undefined;
  
  for (let i = 0; i < values.length; i++) {
    const price = values[i];
    
    if (i < period - 1) {
      ema.push(undefined);
      continue;
    }
    
    if (prevEma === undefined) {
      const slice = values.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      prevEma = sma;
    } else {
      prevEma = price * k + prevEma * (1 - k);
    }
  
    ema.push(prevEma);
  }
  
  return ema;
}

/**
* Average True Range (Wilder's smoothing)
*/
function calculateATR(klines: Kline[], period: number): Array<number | undefined> {
  const trList: number[] = [];
  const atr: Array<number | undefined> = [];
  
  for (let i = 0; i < klines.length; i++) {
    if (i === 0) {
      trList.push(klines[i].high - klines[i].low);
      atr.push(undefined);
      continue;
    }
    
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trList.push(tr);
    
    if (i < period) {
      atr.push(undefined);
      continue;
    }
    
    
    if (i === period) {
      const firstAtr = trList.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      atr.push(firstAtr);
    } else {
      const prevAtr = atr[i - 1]!;
      const currentAtr = (prevAtr * (period - 1) + tr) / period;
      atr.push(currentAtr);
    }
  }
  
  return atr;
}

// NOTE:
// ADX first valid value at index = period * 2 - 1 (strict Wilder definition)
// Do NOT align with TradingView UI offset

/**
 * ADX + DI (Wilder's smoothing)
 * - Strict Wilder definition
 * - Deterministic & backtest-safe
 * - No future data usage
 */
export function calculateADX(
  klines: Kline[],
  period: number
): {
  adx: Array<number | undefined>;
  plusDI: Array<number | undefined>;
  minusDI: Array<number | undefined>;
} {
  const len = klines.length;

  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);
  const trList: number[] = new Array(len).fill(0);

  // 1️⃣ Calculate TR, +DM, -DM
  for (let i = 1; i < len; i++) {
    const curr = klines[i];
    const prev = klines[i - 1];

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    trList[i] = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
  }

  // 2️⃣ Wilder smoothing for TR and DM
  const smoothedTR: Array<number | undefined> = new Array(len).fill(undefined);
  const smoothedPlusDM: Array<number | undefined> = new Array(len).fill(undefined);
  const smoothedMinusDM: Array<number | undefined> = new Array(len).fill(undefined);

  let trSum = 0;
  let plusDMSum = 0;
  let minusDMSum = 0;

  for (let i = 1; i <= period; i++) {
    trSum += trList[i];
    plusDMSum += plusDM[i];
    minusDMSum += minusDM[i];
  }

  smoothedTR[period] = trSum;
  smoothedPlusDM[period] = plusDMSum;
  smoothedMinusDM[period] = minusDMSum;

  for (let i = period + 1; i < len; i++) {
    smoothedTR[i] = smoothedTR[i - 1]! - smoothedTR[i - 1]! / period + trList[i];
    smoothedPlusDM[i] =
      smoothedPlusDM[i - 1]! - smoothedPlusDM[i - 1]! / period + plusDM[i];
    smoothedMinusDM[i] =
      smoothedMinusDM[i - 1]! - smoothedMinusDM[i - 1]! / period + minusDM[i];
  }

  // 3️⃣ +DI, -DI, DX
  const plusDI: Array<number | undefined> = new Array(len).fill(undefined);
  const minusDI: Array<number | undefined> = new Array(len).fill(undefined);
  const dx: Array<number | undefined> = new Array(len).fill(undefined);

  for (let i = period; i < len; i++) {
    const tr = smoothedTR[i]!;
    if (tr === 0) {
      plusDI[i] = 0;
      minusDI[i] = 0;
      dx[i] = 0;
      continue;
    }

    const pdi = (100 * smoothedPlusDM[i]!) / tr;
    const mdi = (100 * smoothedMinusDM[i]!) / tr;

    plusDI[i] = pdi;
    minusDI[i] = mdi;

    const sum = pdi + mdi;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
  }

  // 4️⃣ ADX
  const adx: Array<number | undefined> = new Array(len).fill(undefined);
  const firstAdxIndex = period * 2 - 1;

  if (len > firstAdxIndex) {
    let dxSum = 0;
    for (let i = period; i <= firstAdxIndex; i++) {
      dxSum += dx[i]!;
    }
    adx[firstAdxIndex] = dxSum / period;

    for (let i = firstAdxIndex + 1; i < len; i++) {
      adx[i] = (adx[i - 1]! * (period - 1) + dx[i]!) / period;
    }
  }

  return { adx, plusDI, minusDI };
}


/**
 * Main indicator builder (backward compatibility)
 */
export function buildIndicators(klines: Kline[], config: Config['indicators']): IndicatorData[] {
  const closes = klines.map(k => k.close);

  const ema20 = calculateEMA(closes, config.ema.short);
  const ema50 = calculateEMA(closes, config.ema.medium);
  const ema200 = calculateEMA(closes, config.ema.long);

  const atr = calculateATR(klines, config.atr.period);
  const { adx, plusDI, minusDI } = calculateADX(klines, config.adx.period);

  return klines.map((k, i) => ({
    emaShort: ema20[i],
    emaMedium: ema50[i],
    emaLong: ema200[i],

    atr: atr[i],

    adx: adx[i],
    plusDI: plusDI[i],
    minusDI: minusDI[i],
  }));
}

/**
 * Build Higher Timeframe (HTF) indicators (4h)
 * Returns: EMA50, EMA200, ADX(14)
 */
export function buildHTFIndicators(klines: Kline[], config: Config['indicators']): HTFIndicatorData[] {
  const closes = klines.map(k => k.close);

  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const { adx } = calculateADX(klines, config.adx.period);

  return klines.map((k, i) => ({
    ema50: ema50[i],
    ema200: ema200[i],
    adx: adx[i],
  }));
}

/**
 * Build Lower Timeframe (LTF) indicators (1h)
 * Returns: EMA20, EMA50, ADX(14), ATR(14)
 */
export function buildLTFIndicators(klines: Kline[], config: Config['indicators']): LTFIndicatorData[] {
  const closes = klines.map(k => k.close);

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const atr = calculateATR(klines, config.atr.period);
  const { adx } = calculateADX(klines, config.adx.period);

  return klines.map((k, i) => ({
    ema20: ema20[i],
    ema50: ema50[i],
    adx: adx[i],
    atr: atr[i],
  }));
}

/**
 * Indicators class for backward compatibility
 */
export class Indicators {
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

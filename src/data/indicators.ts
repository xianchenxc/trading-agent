/**
 * Technical indicators calculation
 *
 * This module serves as a small, reusable indicator library:
 * - Low-level numeric APIs (`ema`, `atr`, `adx`) return full-length series with NaN for warm-up periods.
 * - It is intentionally decoupled from Config and project-specific data structures.
 */

import { Kline } from "../types";

/**
 * Average True Range (Wilder's smoothing, internal implementation).
 */

// NOTE:
// ADX first valid value at index = period * 2 - 1 (strict Wilder definition)
// Do NOT align with TradingView UI offset

/**
 * Exponential Moving Average (EMA) series.
 * Uses NaN for warm-up period where the EMA is not yet defined.
 * @param values Input price or value series
 * @param period Lookback period
 * @returns EMA series as number[] with NaN for undefined entries
 */
export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaSeries: number[] = [];

  let prevEma: number | undefined;

  for (let i = 0; i < values.length; i++) {
    const price = values[i];

    if (i < period - 1) {
      emaSeries.push(Number.NaN);
      continue;
    }

    if (prevEma === undefined) {
      const slice = values.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      prevEma = sma;
    } else {
      prevEma = price * k + prevEma * (1 - k);
    }

    emaSeries.push(prevEma);
  }

  return emaSeries;
}

/**
 * Average True Range (ATR) series using Wilder's smoothing.
 * Uses NaN for warm-up period where ATR is not yet defined.
 * @param klines OHLCV series
 * @param period Lookback period
 * @returns ATR series as number[] with NaN for undefined entries
 */
export function atr(klines: Kline[], period: number): number[] {
  const trList: number[] = [];
  const atrSeries: number[] = [];

  for (let i = 0; i < klines.length; i++) {
    if (i === 0) {
      trList.push(klines[i].high - klines[i].low);
      atrSeries.push(Number.NaN);
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
      atrSeries.push(Number.NaN);
      continue;
    }

    if (i === period) {
      const firstAtr = trList.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      atrSeries.push(firstAtr);
    } else {
      const prevAtr = atrSeries[i - 1]!;
      const currentAtr = (prevAtr * (period - 1) + tr) / period;
      atrSeries.push(currentAtr);
    }
  }

  return atrSeries;
}

/**
 * ADX and DI series (Wilder's definition) as generic numeric series.
 * Uses NaN for warm-up region (before DI/ADX are statistically defined).
 * @param klines OHLCV series
 * @param period Lookback period
 * @returns ADX, +DI, -DI numeric series with NaN for undefined entries
 */
export function adx(
  klines: Kline[],
  period: number
): {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
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
  const smoothedTR: number[] = new Array(len).fill(Number.NaN);
  const smoothedPlusDM: number[] = new Array(len).fill(Number.NaN);
  const smoothedMinusDM: number[] = new Array(len).fill(Number.NaN);

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
  const plusDI: number[] = new Array(len).fill(Number.NaN);
  const minusDI: number[] = new Array(len).fill(Number.NaN);
  const dx: number[] = new Array(len).fill(Number.NaN);

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
  const adxSeries: number[] = new Array(len).fill(Number.NaN);
  const firstAdxIndex = period * 2 - 1;

  if (len > firstAdxIndex) {
    let dxSum = 0;
    for (let i = period; i <= firstAdxIndex; i++) {
      dxSum += dx[i]!;
    }
    adxSeries[firstAdxIndex] = dxSum / period;

    for (let i = firstAdxIndex + 1; i < len; i++) {
      adxSeries[i] = (adxSeries[i - 1]! * (period - 1) + dx[i]!) / period;
    }
  }

  return { adx: adxSeries, plusDI, minusDI };
}

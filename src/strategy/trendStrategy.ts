/**
 * Trend following strategy implementation
 * Implements the trading rules as specified
 */

import {
  Kline,
  IndicatorData,
  TrendSignal,
  EntrySignal,
  PositionSide,
  Position,
} from "../types";
import { Indicators } from "../data/indicators";
import { Config } from "../config";

export class TrendStrategy {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Determine trend direction from 4h timeframe
   * EMA50 > EMA200 → long trend
   * EMA50 < EMA200 → short trend
   * Otherwise → no trend
   */
  detectTrend(indicators: IndicatorData[]): TrendSignal {
    const latest = indicators[indicators.length - 1];

    if (!latest.ema50 || !latest.ema200) {
      return { trend: "none", timestamp: Date.now() };
    }

    let trend: PositionSide = "none";
    if (latest.ema50 > latest.ema200) {
      trend = "long";
    } else if (latest.ema50 < latest.ema200) {
      trend = "short";
    }

    return { trend, timestamp: Date.now() };
  }

  /**
   * Check entry conditions for long position
   */
  private checkLongEntry(
    klines: Kline[],
    indicators: IndicatorData[],
    trend: PositionSide,
    currentIndex: number
  ): EntrySignal | null {
    const cfg = this.config.strategy;

    // Condition 1: 4h must be in long trend
    if (trend !== "long") {
      return null;
    }

    const current = indicators[currentIndex];
    const currentKline = klines[currentIndex];

    // Condition 2: 1h EMA20 > EMA50
    if (!current.ema20 || !current.ema50 || current.ema20 <= current.ema50) {
      return null;
    }

    // Condition 3: Price breaks above highest high of last N bars
    const highestHigh = Indicators.getHighestHigh(klines, cfg.lookbackPeriod, currentIndex - 1);
    if (currentKline.close <= highestHigh) {
      return null;
    }

    // All conditions met - generate entry signal
    const atr = current.atr || 0;
    const stopLoss = currentKline.close - cfg.stopLossMultiplier * atr;

    return {
      side: "long",
      price: currentKline.close,
      timestamp: currentKline.closeTime,
      reason: `Long entry: 4h trend=long, 1h EMA20>EMA50, price broke above ${highestHigh.toFixed(2)}`,
      stopLoss,
      atr,
    };
  }

  /**
   * Check entry conditions for short position
   */
  private checkShortEntry(
    klines: Kline[],
    indicators: IndicatorData[],
    trend: PositionSide,
    currentIndex: number
  ): EntrySignal | null {
    const cfg = this.config.strategy;

    // Condition 1: 4h must be in short trend
    if (trend !== "short") {
      return null;
    }

    const current = indicators[currentIndex];
    const currentKline = klines[currentIndex];

    // Condition 2: 1h EMA20 < EMA50
    if (!current.ema20 || !current.ema50 || current.ema20 >= current.ema50) {
      return null;
    }

    // Condition 3: Price breaks below lowest low of last N bars
    const lowestLow = Indicators.getLowestLow(klines, cfg.lookbackPeriod, currentIndex - 1);
    if (currentKline.close >= lowestLow) {
      return null;
    }

    // All conditions met - generate entry signal
    const atr = current.atr || 0;
    const stopLoss = currentKline.close + cfg.stopLossMultiplier * atr;

    return {
      side: "short",
      price: currentKline.close,
      timestamp: currentKline.closeTime,
      reason: `Short entry: 4h trend=short, 1h EMA20<EMA50, price broke below ${lowestLow.toFixed(2)}`,
      stopLoss,
      atr,
    };
  }

  /**
   * Check for entry signals
   */
  checkEntry(
    trendKlines: Kline[],
    trendIndicators: IndicatorData[],
    signalKlines: Kline[],
    signalIndicators: IndicatorData[],
    currentIndex: number
  ): EntrySignal | null {
    // First, detect trend from 4h timeframe
    const trend = this.detectTrend(trendIndicators);

    // Check long entry
    const longSignal = this.checkLongEntry(signalKlines, signalIndicators, trend.trend, currentIndex);
    if (longSignal) {
      return longSignal;
    }

    // Check short entry
    const shortSignal = this.checkShortEntry(signalKlines, signalIndicators, trend.trend, currentIndex);
    if (shortSignal) {
      return shortSignal;
    }

    return null;
  }

  /**
   * Check if position should be exited
   * Returns exit reason or null if should hold
   */
  checkExit(
    position: Position,
    currentPrice: number,
    currentKline: Kline,
    trendKlines: Kline[],
    trendIndicators: IndicatorData[],
    signalIndicators: IndicatorData[],
    currentIndex: number
  ): { shouldExit: boolean; reason: string } {
    const cfg = this.config.strategy;
    const currentSignal = signalIndicators[currentIndex];

    // Check stop loss
    if (position.side === "long" && currentPrice <= position.stopLoss) {
      return {
        shouldExit: true,
        reason: `Stop loss hit at ${position.stopLoss.toFixed(2)}`,
      };
    }
    if (position.side === "short" && currentPrice >= position.stopLoss) {
      return {
        shouldExit: true,
        reason: `Stop loss hit at ${position.stopLoss.toFixed(2)}`,
      };
    }

    // Check trailing stop (ATR-based take profit)
    if (position.side === "long") {
      const highestPrice = Math.max(position.highestPrice, currentPrice);
      const atr = currentSignal.atr || position.entryAtr;
      const trailingStop = highestPrice - cfg.takeProfitMultiplier * atr;
      
      if (currentPrice <= trailingStop) {
        return {
          shouldExit: true,
          reason: `Trailing stop hit: price ${currentPrice.toFixed(2)} <= trailing stop ${trailingStop.toFixed(2)}`,
        };
      }
    } else if (position.side === "short") {
      const lowestPrice = Math.min(position.lowestPrice, currentPrice);
      const atr = currentSignal.atr || position.entryAtr;
      const trailingStop = lowestPrice + cfg.takeProfitMultiplier * atr;
      
      if (currentPrice >= trailingStop) {
        return {
          shouldExit: true,
          reason: `Trailing stop hit: price ${currentPrice.toFixed(2)} >= trailing stop ${trailingStop.toFixed(2)}`,
        };
      }
    }

    // Check trend reversal (4h)
    const trend = this.detectTrend(trendIndicators);
    if (
      (position.side === "long" && trend.trend === "short") ||
      (position.side === "short" && trend.trend === "long")
    ) {
      return {
        shouldExit: true,
        reason: `4h trend reversed to ${trend.trend}`,
      };
    }

    // Check max hold time (50 bars)
    if (position.barsHeld >= cfg.maxHoldBars) {
      return {
        shouldExit: true,
        reason: `Max hold time reached (${cfg.maxHoldBars} bars)`,
      };
    }

    return { shouldExit: false, reason: "" };
  }

  /**
   * Update position tracking (highest/lowest price, bars held)
   */
  updatePosition(position: Position, currentPrice: number): Position {
    return {
      ...position,
      highestPrice: position.side === "long" 
        ? Math.max(position.highestPrice, currentPrice)
        : position.highestPrice,
      lowestPrice: position.side === "short"
        ? Math.min(position.lowestPrice, currentPrice)
        : position.lowestPrice,
      barsHeld: position.barsHeld + 1,
    };
  }
}

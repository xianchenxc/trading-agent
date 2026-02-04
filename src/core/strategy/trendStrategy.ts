/**
 * Multi-Timeframe Trend Strategy
 * 
 * Architecture:
 * - HTF (4h): Trend context filtering only
 * - LTF (1h): Entry execution logic only
 * 
 * Responsibilities:
 * - Only decide WHEN to enter based on indicators
 * - NO exit signals (all exits handled by RiskManager via stop loss / trailing stop)
 * - No position sizing (handled by RiskManager)
 * - No account equity access
 * - Deterministic & backtest-safe
 */

import { 
  Kline, 
  StrategySignal, 
  PositionState, 
  TradeReason,
  HTFIndicatorData,
  LTFIndicatorData,
  HTFTrendState,
  HTFContext
} from "../../types";

/**
 * Determine HTF trend state (4h)
 * BULL: EMA50 > EMA200 AND ADX > 20
 * Otherwise: RANGE / non-bullish environment
 */
export function getHTFTrendState(htfIndicator: HTFIndicatorData): HTFTrendState {
  const { ema50, ema200, adx } = htfIndicator;

  // Safety check
  if (ema50 === undefined || ema200 === undefined || adx === undefined) {
    return "RANGE";
  }

  // BULL condition: EMA50 > EMA200 AND ADX > 20
  if (ema50 > ema200 && adx > 20) {
    return "BULL";
  }

  // Otherwise: RANGE / non-bullish
  return "RANGE";
}

/**
 * Get HTF context for strategy decision
 */
export function getHTFContext(htfIndicator: HTFIndicatorData): HTFContext {
  return {
    trendState: getHTFTrendState(htfIndicator),
    indicators: htfIndicator,
  };
}

/**
 * Multi-Timeframe Trend Strategy (4h + 1h)
 * 
 * ENTRY Rules (1h, with 4h filter):
 * 1. PositionState === FLAT
 * 2. 4h trend state === BULL (EMA50_4h > EMA200_4h AND ADX_4h > 20)
 * 3. ADX_1h > 25
 * 4. EMA20_1h > EMA50_1h
 * 5. Close price breaks above Donchian High (lookback = 20)
 * 
 * EXIT Rules:
 * - NO active exit signals from strategy
 * - Only RiskManager handles exits
 */
export function trendStrategy(
  context: {
    bar: Kline;
    htfIndicator: HTFIndicatorData;
    ltfIndicator: LTFIndicatorData;
    positionState: PositionState;
  }
): StrategySignal {
  const { 
    bar, 
    htfIndicator, 
    ltfIndicator, 
    positionState
  } = context;

  // Safety check: ensure indicators are available
  if (!htfIndicator || !ltfIndicator) {
    return { type: "HOLD" };
  }

  // Ensure required LTF indicators are available
  if (
    ltfIndicator.ema20 === undefined ||
    ltfIndicator.ema50 === undefined ||
    ltfIndicator.adx === undefined
  ) {
    return { type: "HOLD" };
  }

  // Ensure required HTF indicators are available
  if (
    htfIndicator.ema50 === undefined ||
    htfIndicator.ema200 === undefined ||
    htfIndicator.adx === undefined
  ) {
    return { type: "HOLD" };
  }

  /* =========================
   * EXIT Rules
   * ========================= */
  // Strategy does NOT generate EXIT signals
  // All exits are handled by RiskManager (stop loss / trailing stop)
  if (positionState === "OPEN") {
    return { type: "HOLD" };
  }



  // Extract indicators for use (after validation)
  const { ema20, ema50, adx: adx1h, donchianHigh } = ltfIndicator;

  /* =========================
   * ENTRY Rules (only when FLAT)
   * ========================= */
  if (positionState === "FLAT") {
    // Get HTF trend state
    const htfContext = getHTFContext(htfIndicator);

    // Ensure donchianHigh is available
    if (donchianHigh === undefined) {
      return { type: "HOLD" };
    }
    
    // ENTRY conditions (all must be true):
    // 1. 4h trend state === BULL
    // 2. ADX_1h > 25
    // 3. EMA20_1h > EMA50_1h
    // 4. Close price breaks above Donchian High (trend startup confirmation)
    if (
      htfContext.trendState === "BULL" &&
      adx1h > 25 &&
      ema20 > ema50 &&
      bar.close > donchianHigh
    ) {
      return {
        type: "ENTRY",
        side: "LONG",
        reason: "HTF_BULL_BREAKOUT_CONFIRMED" as TradeReason,
      };
    }
  }

  // Default: HOLD
  return { type: "HOLD" };
}

import { 
  Kline, 
  StrategySignal, 
  PositionState, 
  TradeReason,
  HTFIndicatorData,
  LTFIndicatorData,
  HTFTrendState,
  HTFContext
} from "../types";

/**
 * Multi-Timeframe Trend Strategy (v1)
 * 
 * Architecture:
 * - HTF (4h): Trend context filtering only
 * - LTF (1h): Entry/Exit execution logic
 * 
 * Responsibilities:
 * - Only decide WHEN to enter/exit based on indicators
 * - No position sizing (handled by RiskManager)
 * - No account equity access
 * - Deterministic & backtest-safe
 */

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
 * 2. 4h trend state === BULL
 * 3. ADX_1h > 25
 * 4. EMA20_1h > EMA50_1h
 * 
 * EXIT Rules (1h only):
 * - PositionState === OPEN
 * - EMA20_1h < EMA50_1h
 * 
 * Note: 4h trend is NOT used for EXIT decisions
 */
export function trendStrategy(
  context: {
    bar: Kline;
    htfIndicator: HTFIndicatorData;
    ltfIndicator: LTFIndicatorData;
    positionState: PositionState;
  }
): StrategySignal {
  const { htfIndicator, ltfIndicator, positionState } = context;

  // Safety check: ensure indicators are available
  if (!htfIndicator || !ltfIndicator) {
    return { type: "HOLD" };
  }

  const { ema20, ema50, adx: adx1h } = ltfIndicator;
  const { ema50: ema50_4h, ema200, adx: adx4h } = htfIndicator;

  // Ensure required LTF indicators are available
  if (
    ema20 === undefined ||
    ema50 === undefined ||
    adx1h === undefined
  ) {
    return { type: "HOLD" };
  }

  // Ensure required HTF indicators are available (for ENTRY only)
  if (
    ema50_4h === undefined ||
    ema200 === undefined ||
    adx4h === undefined
  ) {
    // If HTF indicators are missing, we can still check EXIT
    // but cannot make ENTRY decisions
    if (positionState === "OPEN") {
      // EXIT check (doesn't require HTF)
      if (ema20 < ema50) {
        return {
          type: "EXIT",
          reason: "EMA_REVERSAL_1H" as TradeReason,
        };
      }
    }
    return { type: "HOLD" };
  }

  /* =========================
   * EXIT Rules (check first when position exists)
   * ========================= */
  if (positionState === "OPEN") {
    // EXIT: EMA20_1h < EMA50_1h
    // Note: 4h trend is NOT used for EXIT
    if (ema20 < ema50) {
      return {
        type: "EXIT",
        reason: "EMA_REVERSAL_1H" as TradeReason,
      };
    }
    // Otherwise hold
    return { type: "HOLD" };
  }

  /* =========================
   * ENTRY Rules (only when FLAT)
   * ========================= */
  if (positionState === "FLAT") {
    // Get HTF trend state
    const htfContext = getHTFContext(htfIndicator);
    
    // ENTRY conditions (all must be true):
    // 1. 4h trend state === BULL
    // 2. ADX_1h > 25
    // 3. EMA20_1h > EMA50_1h
    if (
      htfContext.trendState === "BULL" &&
      adx1h > 25 &&
      ema20 > ema50
    ) {
      return {
        type: "ENTRY",
        side: "LONG",
        reason: "HTF_BULL_TREND_CONFIRMED" as TradeReason,
      };
    }
  }

  // Default: HOLD
  return { type: "HOLD" };
}

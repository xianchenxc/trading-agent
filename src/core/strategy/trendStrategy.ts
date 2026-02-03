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
 * Multi-Timeframe Trend Strategy (v3)
 * 
 * Architecture:
 * - HTF (4h): Trend context filtering only
 * - LTF (1h): Entry execution logic only
 * 
 * Responsibilities:
 * - Only decide WHEN to enter based on indicators
 * - NO exit signals (v3: all exits handled by RiskManager via stop loss / trailing stop)
 * - No position sizing (handled by RiskManager)
 * - No account equity access
 * - Deterministic & backtest-safe
 * 
 * v2 Changes:
 * - Added Donchian High breakout confirmation for ENTRY
 * - Reduces false entries before trend startup
 * 
 * v3 Changes:
 * - Removed all EXIT signals (EMA_REVERSAL_1H, etc.)
 * - Strategy only generates ENTRY signals
 * - All exits are handled by RiskManager (stop loss / trailing stop)
 * - Allows profits to run via Trailing Stop mechanism
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
 * Multi-Timeframe Trend Strategy (4h + 1h) - MVP v3
 * 
 * ENTRY Rules (1h, with 4h filter) - UNCHANGED from v2:
 * 1. PositionState === FLAT
 * 2. 4h trend state === BULL (EMA50_4h > EMA200_4h AND ADX_4h > 20)
 * 3. ADX_1h > 25
 * 4. EMA20_1h > EMA50_1h
 * 5. Close price breaks above Donchian High (lookback = 20)
 * 
 * EXIT Rules (v3):
 * - NO active exit signals from strategy
 * - Only RiskManager handles exits via:
 *   - Initial stop loss (1% fixed)
 *   - Trailing stop (activated at +1R, based on EMA20_1H)
 * 
 * v3 Philosophy:
 * - Let profits run by removing premature exit signals
 * - Trailing stop follows trend via EMA20_1H
 * - Only stop loss can trigger exit (initial or trailing)
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

  const { ema20, ema50, adx: adx1h, donchianHigh } = ltfIndicator;
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
    // If HTF indicators are missing, cannot make ENTRY decisions
    // v3: No active exit signals from strategy
    return { type: "HOLD" };
  }

  /* =========================
   * EXIT Rules (v3: removed)
   * ========================= */
  // v3: Strategy does NOT generate EXIT signals
  // All exits are handled by RiskManager (stop loss / trailing stop)
  if (positionState === "OPEN") {
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
    // 4. Close price breaks above Donchian High (trend startup confirmation)
    
    // Check Donchian High breakout
    // v2: Donchian High breakout is mandatory for ENTRY
    if (donchianHigh === undefined) {
      // If donchianHigh is undefined (insufficient data), cannot make ENTRY decision
      return { type: "HOLD" };
    }
    
    const donchianHighBreakout = bar.close > donchianHigh;
    
    if (
      htfContext.trendState === "BULL" &&
      adx1h > 25 &&
      ema20 > ema50 &&
      donchianHighBreakout
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

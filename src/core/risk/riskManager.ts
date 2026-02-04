import { Position, TradeReason, RiskDecision, LTFIndicatorData } from '../../types';
import { Config } from '../../config/config';
import { logDebug } from '../../utils/logger';

/**
 * Position stage type
 * - Stage 1: unrealizedR < 1R, using initial stop loss
 * - Stage 2: 1R ≤ unrealizedR < 2R, moved to break-even
 * - Stage 3: unrealizedR ≥ 2R, trailing stop active
 */
export type PositionStage = 1 | 2 | 3;

/**
 * Risk Manager
 *
 * Responsibilities:
 * - Calculate position size based on risk per trade (1% of equity)
 * - Calculate stop loss (entryPrice * (1 - 1%)) - fixed 1% stop
 * - Manage Delayed Trailing Stop mechanism:
 *   - Stage 1 (unrealizedR < 1R): Only use initialStopLoss
 *   - Stage 2 (1R ≤ unrealizedR < 2R): Move stop to break-even (entryPrice), no trailing
 *   - Stage 3 (unrealizedR ≥ 2R): Activate trailing stop based on EMA20_1H or EMA50_1H (only upward)
 * - Trend exhaustion filter - only allow EXIT in stage 3 when trend is exhausted
 * - Profit lock mode - switch to EMA50 trailing when unrealizedR ≥ profitLockR
 * - Check if stop loss is triggered and force EXIT
 * - Can override Strategy's HOLD signal
 */

export interface PositionSizeResult {
  size: number;
  stopLoss: number;
}

/**
 * Stop loss update result
 * Contains updates for stop loss across all stages (Stage 1/2/3)
 */
export interface StopLossUpdate {
  stopLoss?: number; // Updated stopLoss (current active stop - Stage 1: initialStopLoss, Stage 2: entryPrice, Stage 3: trailingStop)
  trailingStop?: number; // Updated trailingStop (only used in stage 3, based on EMA20_1H or EMA50_1H)
  isTrailingActive?: boolean; // Whether trailing stop is activated (stage 3 only)
  maxUnrealizedR?: number; // Track maximum unrealized profit in R units
  trailingMode?: "EMA20" | "EMA50"; // Trailing stop mode (only used in stage 3)
}

/**
 * Calculate position size and stop loss for entry
 * @param entryPrice Entry price
 * @param equity Current account equity
 * @param riskPerTrade Risk per trade (default 0.01 = 1%)
 * @param stopLossPercent Stop loss percentage (default 0.01 = 1%)
 * @returns Position size and stop loss price
 */
export function calculatePositionSize(
  entryPrice: number,
  equity: number,
  riskPerTrade: number = 0.01,
  stopLossPercent: number = 0.01
): PositionSizeResult {
  // Stop loss = entryPrice * (1 - stopLossPercent) (for LONG)
  const stopLoss = entryPrice * (1 - stopLossPercent);

  // Risk amount = equity * riskPerTrade
  const riskAmount = equity * riskPerTrade;

  // Position size = riskAmount / (entryPrice - stopLoss)
  const riskPerUnit = entryPrice - stopLoss;
  const size = riskAmount / riskPerUnit;

  return {
    size,
    stopLoss,
  };
}

/**
 * Determine current position stage based on position state
 * 
 * Stage determination logic:
 * - Stage 3: isTrailingActive === true (trailing stop is active)
 * - Stage 2: stopLoss >= entryPrice (moved to break-even, but trailing not yet active)
 * - Stage 1: stopLoss < entryPrice (still using initial stop loss)
 * 
 * @param position Current position
 * @returns Current stage: 1, 2, or 3
 */
export function getPositionStage(position: Position): PositionStage {
  if (position.isTrailingActive) {
    return 3; // Stage 3: Trailing stop active
  }
  
  if (position.stopLoss >= position.entryPrice) {
    return 2; // Stage 2: Break-even
  }
  
  return 1; // Stage 1: Initial stop loss
}

/**
 * Calculate unrealized PnL in R units
 * 
 * R units = (Current PnL) / (Initial Risk)
 * - Initial Risk is calculated from initialStopLoss and never changes
 * - For LONG: Risk = (entryPrice - initialStopLoss) * size
 * - For SHORT: Risk = (initialStopLoss - entryPrice) * size
 * 
 * Note: Currently only LONG positions are supported in the trading system.
 * SHORT support is prepared but not yet implemented in strategy layer.
 * 
 * @param position Current position
 * @param currentPrice Current market price
 * @returns Unrealized PnL in R units (positive = profit, negative = loss)
 */
export function calculateUnrealizedR(position: Position, currentPrice: number): number {
  if (position.side === 'LONG') {
    const unrealizedPnL = (currentPrice - position.entryPrice) * position.size;
    // Use initialStopLoss to calculate R units (initial risk never changes)
    // For LONG: initialStopLoss < entryPrice, so risk = (entryPrice - initialStopLoss) * size
    const initialRisk = (position.entryPrice - position.initialStopLoss) * position.size;
    if (initialRisk > 0) {
      return unrealizedPnL / initialRisk;
    }
  } else if (position.side === 'SHORT') {
    // SHORT position: profit when price goes down
    const unrealizedPnL = (position.entryPrice - currentPrice) * position.size;
    // For SHORT: initialStopLoss > entryPrice, so risk = (initialStopLoss - entryPrice) * size
    const initialRisk = (position.initialStopLoss - position.entryPrice) * position.size;
    if (initialRisk > 0) {
      return unrealizedPnL / initialRisk;
    }
  }
  return 0;
}

/**
 * Check if trend is exhausted based on ADX series
 * Trend exhaustion = ADX < threshold AND consecutive declining bars
 * @param adxSeries ADX historical series (excluding current bar)
 * @param threshold ADX threshold (default 20)
 * @param bars Number of consecutive declining bars required (default 3)
 * @returns true if trend is exhausted
 */
export function isTrendExhausted(
  adxSeries: number[],
  threshold: number,
  bars: number
): boolean {
  if (adxSeries.length < bars + 1) return false;

  const recent = adxSeries.slice(-bars - 1);

  // Current ADX must be below threshold
  if (recent[recent.length - 1] >= threshold) return false;

  // Check for consecutive declining ADX values
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] >= recent[i - 1]) {
      return false; // Not consecutive declining
    }
  }

  return true;
}

/**
 * Update trailing stop based on EMA20_1H or EMA50_1H
 * @param position Current position
 * @param ema20_1h EMA20 value from 1H timeframe
 * @param ema50_1h EMA50 value from 1H timeframe
 * @param currentPrice Current market price
 * @returns Stop loss update result (only updates trailingStop in Stage 3)
 */
export function updateTrailingStop(
  position: Position,
  ema20_1h: number | undefined,
  ema50_1h: number | undefined,
  currentPrice: number
): StopLossUpdate | null {
  if (!position.isTrailingActive) {
    return null;
  }

  // Determine which EMA to use based on trailingMode
  const trailingMode = position.trailingMode || "EMA20";
  const trailingBase = trailingMode === "EMA50" ? ema50_1h : ema20_1h;

  if (trailingBase === undefined) {
    return null;
  }

  // Trailing stop can only move up, never down
  // Use trailingStop if set, otherwise use entryPrice (break-even) as baseline
  const currentTrailingStop = position.trailingStop || position.entryPrice;

  if (trailingBase > currentTrailingStop) {
    return {
      trailingStop: trailingBase,
    };
  }

  return null;
}

/**
 * Check and manage stop loss progression (Delayed Trailing Stop + Profit Lock)
 * 
 * Responsibilities:
 * - Determine current stage based on unrealizedR
 * - Stage 1: Track maxR only (unrealizedR < 1R, below break-even threshold)
 * - Stage 2: Move stopLoss to break-even (1R ≤ unrealizedR < 2R)
 * - Stage 3: Activate trailing stop (unrealizedR ≥ 2R, set isTrailingActive flag only, trailingStop is handled by updateTrailingStopIfActive)
 * - Stage 3 (active): Check for profit lock mode switch
 * 
 * Note: This function does NOT set trailingStop value - that is handled by updateTrailingStopIfActive
 * 
 * @param position Current position
 * @param currentPrice Current market price
 * @param breakEvenR Break-even threshold in R units (default 1.0)
 * @param trailingActivationR Trailing stop activation threshold in R units (default 2.0)
 * @param profitLockR Profit lock threshold in R units (optional, default undefined)
 * @returns Stop loss progression update result
 */
export function checkStopLossProgression(
  position: Position,
  currentPrice: number,
  breakEvenR: number = 1.0,
  trailingActivationR: number = 2.0,
  profitLockR?: number
): StopLossUpdate | null {
  const unrealizedR = calculateUnrealizedR(position, currentPrice);
  const maxR = Math.max(position.maxUnrealizedR || 0, unrealizedR);

  const currentStage = getPositionStage(position);
  // Stage 3: Trailing stop is already active
  if (currentStage === 3) {
    // Check for profit lock mode switch (EMA20 -> EMA50)
    let trailingMode = position.trailingMode || "EMA20";
    if (profitLockR && maxR >= profitLockR) {
      trailingMode = "EMA50";
    }

    const shouldUpdate =
      maxR > (position.maxUnrealizedR || 0) ||
      trailingMode !== (position.trailingMode || "EMA20");

    if (!shouldUpdate) {
      return null;
    }

    return {
      maxUnrealizedR: maxR,
      trailingMode,
      // Note: trailingStop is NOT set here - it's handled by updateTrailingStopIfActive
    };
  }

  // Stage 3: Activate trailing stop (unrealizedR ≥ trailingActivationR)
  if (unrealizedR >= trailingActivationR) {
    return {
      stopLoss: position.entryPrice, // Ensure break-even first
      isTrailingActive: true, // Activate trailing stop flag
      trailingMode: "EMA20", // Default to EMA20 mode
      maxUnrealizedR: maxR,
      // Note: trailingStop is NOT set here - it will be initialized by updateTrailingStopIfActive
    };
  }

  // Stage 2: Move to break-even (1R ≤ unrealizedR < 2R)
  if (unrealizedR >= breakEvenR && unrealizedR < trailingActivationR) {
    // Check if we're still in Stage 1 (need to move to break-even)
    if (currentStage === 1) {
      return {
        stopLoss: position.entryPrice, // Move to break-even
        isTrailingActive: false, // Not yet activating trailing
        maxUnrealizedR: maxR,
      };
    }
    // Already at break-even (currentStage === 2), just update maxR
    if (maxR > (position.maxUnrealizedR || 0)) {
      return {
        maxUnrealizedR: maxR,
      };
    }

    return null;
  }

  // unrealizedR < breakEvenR: Below break-even threshold
  // Note: currentStage may be 1 or 2 (if already moved to break-even, keep it there)
  // Just track max unrealized R (may be profit or loss, but < 1R)
  // Stop loss remains unchanged (either initialStopLoss or entryPrice if already moved)
  if (maxR > (position.maxUnrealizedR || 0)) {
    return {
      maxUnrealizedR: maxR,
    };
  }

  return null;
}

/**
 * Create an exit decision with the given reason
 * @param reason Trade reason for exit
 * @returns Risk decision with EXIT action
 */
function createExitDecision(reason: TradeReason): RiskDecision {
  return {
    action: 'EXIT',
    reason,
  };
}

/**
 * Check if trailing stop is hit and if trend exhaustion filter allows exit
 * @param position Current position
 * @param barLow Bar low price
 * @param unrealizedR Current unrealized profit in R units
 * @param ltfIndicator LTF indicator data
 * @param config Config object
 * @returns Exit decision if trailing stop hit and trend exhausted, null otherwise
 */
function checkTrailingStopWithTrendExhaustion(
  position: Position,
  barLow: number,
  unrealizedR: number,
  ltfIndicator: LTFIndicatorData,
  config: Config
): RiskDecision | null {
  if (!position.isTrailingActive || !position.trailingStop || barLow > position.trailingStop) {
    return null;
  }

  // Stage 3: Trailing stop was hit, but only allow EXIT if trend is exhausted
  if (config.risk.trendExhaustADX && config.risk.trendExhaustBars && ltfIndicator.adx_1h_series) {
    const trendExhausted = isTrendExhausted(
      ltfIndicator.adx_1h_series,
      config.risk.trendExhaustADX,
      config.risk.trendExhaustBars
    );

    // Log trailing stop check for debugging
    logDebug('Trailing stop check', {
      unrealizedR: unrealizedR.toFixed(2),
      stopLoss: position.stopLoss.toFixed(2),
      adx: ltfIndicator.adx?.toFixed(2),
      trendExhausted,
      trailingMode: position.trailingMode || 'EMA20',
    });

    if (trendExhausted) {
      // Trend exhausted, allow exit
      return createExitDecision('TRAILING_STOP_HIT');
    }
    // Trend still strong, do not exit - continue with trailing stop update logic
    // This allows the trailing stop to continue updating even if price touched it
    return null;
  }

  // No trend exhaustion filter configured, allow exit
  return createExitDecision('TRAILING_STOP_HIT');
}

/**
 * Check if stop loss is triggered and return exit decision
 * 
 * Note: This function only checks initial stop loss and break-even stop.
 * Trailing stop is handled separately by checkTrailingStopWithTrendExhaustion
 * (which is called before this function in riskManager).
 * 
 * Important: In Stage 3, position.stopLoss equals position.trailingStop.
 * If trailing stop is hit but trend is not exhausted, checkTrailingStopWithTrendExhaustion
 * returns null, and we should NOT trigger exit here (trailing stop should continue updating).
 * 
 * @param position Current position
 * @param barLow Bar low price
 * @param activeStop Current active stop loss level
 * @returns Exit decision if stop loss triggered, null otherwise
 */
function checkStopLossTrigger(
  position: Position,
  barLow: number,
  activeStop: number
): RiskDecision | null {
  // Only support LONG positions currently
  if (position.side !== 'LONG' || barLow > activeStop) {
    return null;
  }

  // Determine current stage
  const stage = getPositionStage(position);
  
  // In Stage 3, trailing stop is active and stopLoss equals trailingStop
  // If we reach here, it means trailing stop was NOT hit (or hit but trend not exhausted)
  // So we should NOT check stopLoss in Stage 3 - it's handled by trailing stop logic
  if (stage === 3) {
    return null;
  }

  // Trailing stop is already checked by checkTrailingStopWithTrendExhaustion
  // So we only need to check initial stop loss and break-even stop here
  
  if (stage === 2 && barLow <= position.stopLoss) {
    // Stage 2: Break-even stop was hit
    return createExitDecision('STOP_LOSS_BREAK_EVEN');
  } else if (stage === 1 && barLow <= position.stopLoss) {
    // Stage 1: Initial stop loss was hit
    return createExitDecision('STOP_LOSS_INITIAL');
  }
  
  return null;
}

/**
 * Update trailing stop (Stage 3 only)
 * 
 * Responsibilities:
 * - Initialize or update trailing stop based on EMA
 *   - If just activated: Initialize trailingStop at entryPrice (break-even)
 *   - If already active: Update trailingStop based on EMA20_1H or EMA50_1H (only upward)
 * 
 * Note: This function only handles Stage 3 (trailing stop active).
 * Stage 1/2 logic is handled by riskManager main function.
 * 
 * @param position Current position
 * @param progressionUpdate Stop loss progression update result from checkStopLossProgression
 * @param ltfIndicator LTF indicator data
 * @param currentPrice Current market price
 * @returns Stop loss update result (Stage 3: includes trailingStop, Stage 1/2: includes stopLoss)
 */
function updateTrailingStopIfActive(
  position: Position,
  progressionUpdate: StopLossUpdate | null,
  ltfIndicator: LTFIndicatorData,
  currentPrice: number
): StopLossUpdate | null {
  // Determine initial trailing stop value
  // - If just activated: start at entryPrice (break-even)
  // - If already active: use current trailingStop or fallback to entryPrice
  const isJustActivated =
    !!(progressionUpdate && progressionUpdate.isTrailingActive) &&
    !position.isTrailingActive;
  const initialTrailingStop = isJustActivated
    ? position.entryPrice // Just activated: initialize at break-even
    : position.trailingStop || position.entryPrice; // Already active: use current or fallback

  const trailingMode =
    (progressionUpdate && progressionUpdate.trailingMode) ||
    position.trailingMode ||
    'EMA20';

  // Update trailing stop based on EMA (only upward movement)
  const emaUpdate = updateTrailingStop(
    {
      ...position,
      isTrailingActive: true,
      trailingStop: initialTrailingStop,
      trailingMode,
    },
    ltfIndicator.ema20,
    ltfIndicator.ema50,
    currentPrice
  );

  // Merge progression and EMA updates
  // EMA update takes precedence for trailingStop value
  const finalTrailingStop =
    (emaUpdate && emaUpdate.trailingStop) || initialTrailingStop;

  // If there is no progression update and trailing stop did not move, no update is needed
  if (!progressionUpdate && !emaUpdate && !isJustActivated) {
    return null;
  }

  // Stage 3: stopLoss follows trailingStop
  return {
    stopLoss: finalTrailingStop, // stopLoss follows trailingStop in stage 3
    trailingStop: finalTrailingStop,
    isTrailingActive: true,
    trailingMode,
    maxUnrealizedR:
      (progressionUpdate && progressionUpdate.maxUnrealizedR) ||
      position.maxUnrealizedR,
  };
}

/**
 * Risk Manager - Main entry point
 * 
 * Orchestrates risk management logic:
 * 1. Check if stop loss is triggered (initial, break-even, or trailing stop)
 * 2. Apply trend exhaustion filter for trailing stop exits
 * 3. Update stop loss progression (three stages + profit lock)
 * 4. Update stop loss based on stage (Stage 1/2: stopLoss, Stage 3: trailing stop)
 * 
 * @param position Current position
 * @param bar Current bar (with high/low/close)
 * @param ltfIndicator LTF indicator data (1H) for trailing stop
 * @param config Config object
 * @returns Risk decision and stop loss update (includes stopLoss, trailingStop, maxUnrealizedR, etc.)
 */
export function riskManager(
  position: Position,
  bar: {
    close: number;
    high: number;
    low: number;
  },
  ltfIndicator: LTFIndicatorData,
  config: Config
): {
  decision: RiskDecision;
  stopLossUpdate: StopLossUpdate | null;
} {
  // Calculate active stop: stopLoss is the current active stop
  // Stage 1: stopLoss = initialStopLoss
  // Stage 2: stopLoss = entryPrice (break-even)
  // Stage 3: stopLoss = trailingStop (updated based on EMA20_1H or EMA50_1H)
  const activeStop = position.stopLoss;
  const unrealizedR = calculateUnrealizedR(position, bar.close);

  // 1. Check if trailing stop is hit (with trend exhaustion filter)
  const trailingStopDecision = checkTrailingStopWithTrendExhaustion(
    position,
    bar.low,
    unrealizedR,
    ltfIndicator,
    config
  );
  if (trailingStopDecision) {
    return {
      decision: trailingStopDecision,
      stopLossUpdate: null,
    };
  }

  // 2. Check if other stop loss levels are triggered
  const stopLossDecision = checkStopLossTrigger(position, bar.low, activeStop);
  if (stopLossDecision) {
    return {
      decision: stopLossDecision,
      stopLossUpdate: null,
    };
  }

  // 3. Check stop loss progression (three stages + profit lock)
  const progressionUpdate = checkStopLossProgression(
    position,
    bar.close,
    config.risk.breakEvenR,
    config.risk.trailingActivationR,
    config.risk.profitLockR
  );

  // 4. Update stop loss based on stage
  const currentStage = getPositionStage(position);
  const isTrailingActive =
    currentStage === 3 || (progressionUpdate && progressionUpdate.isTrailingActive) || false;
  
  let stopLossUpdate: StopLossUpdate | null = null;
  if (isTrailingActive) {
    // Stage 3: Update trailing stop based on EMA
    stopLossUpdate = updateTrailingStopIfActive(
      position,
      progressionUpdate,
      ltfIndicator,
      bar.close
    );
  } else if (progressionUpdate) {
    // Stage 1 or 2: Pass through progression update (no trailing stop logic)
    stopLossUpdate = {
      stopLoss: progressionUpdate.stopLoss,
      isTrailingActive: progressionUpdate.isTrailingActive ?? false,
      maxUnrealizedR:
        progressionUpdate.maxUnrealizedR ?? position.maxUnrealizedR,
      trailingMode:
        progressionUpdate.trailingMode ?? position.trailingMode,
    };
  }

  return {
    decision: { action: 'NONE' },
    stopLossUpdate,
  };
}

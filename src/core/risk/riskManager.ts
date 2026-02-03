import { Position, TradeReason, RiskDecision, LTFIndicatorData } from '../../types';
import { Config } from '../../config/config';

/**
 * Risk Manager (MVP v5: Trend Exhaustion Filter + Profit Lock)
 *
 * Responsibilities:
 * - Calculate position size based on risk per trade (1% of equity)
 * - Calculate stop loss (entryPrice * (1 - 1%)) - fixed 1% stop
 * - Manage Delayed Trailing Stop mechanism (v4/v5):
 *   - Stage 1 (unrealizedR < 1R): Only use initialStopLoss
 *   - Stage 2 (1R ≤ unrealizedR < 2R): Move stop to break-even (entryPrice), no trailing
 *   - Stage 3 (unrealizedR ≥ 2R): Activate trailing stop based on EMA20_1H or EMA50_1H (only upward)
 * - v5: Trend exhaustion filter - only allow EXIT in stage 3 when trend is exhausted
 * - v5: Profit lock mode - switch to EMA50 trailing when unrealizedR ≥ profitLockR
 * - Check if stop loss is triggered and force EXIT
 * - Can override Strategy's HOLD signal
 */

export interface PositionSizeResult {
  size: number;
  stopLoss: number;
}

export interface TrailingStopUpdate {
  shouldUpdate: boolean;
  stopLoss?: number; // Updated stopLoss (current active stop)
  trailingStop?: number; // Updated trailingStop (only used in stage 3, based on EMA20_1H or EMA50_1H)
  isTrailingActive?: boolean; // Whether trailing stop is activated (stage 3 only)
  maxUnrealizedR?: number; // Track maximum unrealized profit in R units
  trailingMode?: "EMA20" | "EMA50"; // v5: Trailing stop mode
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
 * Calculate unrealized PnL in R units
 * @param position Current position
 * @param currentPrice Current market price
 * @returns Unrealized PnL in R units
 */
function calculateUnrealizedR(position: Position, currentPrice: number): number {
  if (position.side === 'LONG') {
    const unrealizedPnL = (currentPrice - position.entryPrice) * position.size;
    // Use initialStopLoss to calculate R units (initial risk never changes)
    const initialRisk = (position.entryPrice - position.initialStopLoss) * position.size;
    if (initialRisk > 0) {
      return unrealizedPnL / initialRisk;
    }
  }
  return 0;
}

/**
 * v5: Check if trend is exhausted based on ADX series
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
 * v5: Update trailing stop based on EMA20_1H or EMA50_1H
 * @param position Current position
 * @param ema20_1h EMA20 value from 1H timeframe
 * @param ema50_1h EMA50 value from 1H timeframe
 * @param currentPrice Current market price
 * @returns Trailing stop update result
 */
export function updateTrailingStop(
  position: Position,
  ema20_1h: number | undefined,
  ema50_1h: number | undefined,
  currentPrice: number
): TrailingStopUpdate {
  if (!position.isTrailingActive) {
    return { shouldUpdate: false };
  }

  // Determine which EMA to use based on trailingMode
  const trailingMode = position.trailingMode || "EMA20";
  const trailingBase = trailingMode === "EMA50" ? ema50_1h : ema20_1h;

  if (trailingBase === undefined) {
    return { shouldUpdate: false };
  }

  // Trailing stop can only move up, never down
  // Use trailingStop if set, otherwise use entryPrice (break-even) as baseline
  const currentTrailingStop = position.trailingStop || position.entryPrice;

  if (trailingBase > currentTrailingStop) {
    return {
      shouldUpdate: true,
      trailingStop: trailingBase,
    };
  }

  return { shouldUpdate: false };
}

/**
 * v5: Check and manage stop loss progression (Delayed Trailing Stop + Profit Lock)
 * @param position Current position
 * @param currentPrice Current market price
 * @param breakEvenR Break-even threshold in R units (default 1.0)
 * @param trailingActivationR Trailing stop activation threshold in R units (default 2.0)
 * @param profitLockR Profit lock threshold in R units (optional, default undefined)
 * @returns Stop loss update result
 */
export function checkStopLossProgression(
  position: Position,
  currentPrice: number,
  breakEvenR: number = 1.0,
  trailingActivationR: number = 2.0,
  profitLockR?: number
): TrailingStopUpdate {
  const unrealizedR = calculateUnrealizedR(position, currentPrice);
  const maxR = Math.max(position.maxUnrealizedR || 0, unrealizedR);

  // Stage 3: Trailing stop is active (unrealizedR ≥ trailingActivationR)
  if (position.isTrailingActive) {
    // v5: Check for profit lock mode switch
    let trailingMode = position.trailingMode || "EMA20";
    if (profitLockR && maxR >= profitLockR) {
      trailingMode = "EMA50";
    }

    return {
      shouldUpdate: maxR > (position.maxUnrealizedR || 0) || trailingMode !== (position.trailingMode || "EMA20"),
      maxUnrealizedR: maxR,
      trailingMode,
    };
  }

  // Stage 2: Move to break-even (1R ≤ unrealizedR < 2R)
  if (unrealizedR >= breakEvenR && unrealizedR < trailingActivationR) {
    // Check if stopLoss is already at break-even
    if (position.stopLoss < position.entryPrice) {
      return {
        shouldUpdate: true,
        stopLoss: position.entryPrice, // Move to break-even
        isTrailingActive: false, // Not yet activating trailing
        maxUnrealizedR: maxR,
      };
    }
    // Already at break-even, just update maxR
    return {
      shouldUpdate: maxR > (position.maxUnrealizedR || 0),
      maxUnrealizedR: maxR,
    };
  }

  // Stage 3: Activate trailing stop (unrealizedR ≥ trailingActivationR)
  if (unrealizedR >= trailingActivationR) {
    return {
      shouldUpdate: true,
      stopLoss: position.entryPrice, // Ensure break-even first
      trailingStop: position.entryPrice, // Initialize trailing stop at break-even
      isTrailingActive: true, // Activate trailing stop
      trailingMode: "EMA20", // v5: Default to EMA20 mode
      maxUnrealizedR: maxR,
    };
  }

  // Stage 1: Not yet profitable (unrealizedR < 1R)
  // Just track max unrealized R
  return {
    shouldUpdate: maxR > (position.maxUnrealizedR || 0),
    maxUnrealizedR: maxR,
  };
}

/**
 * v5: Check if stop loss is triggered and return exit decision
 * Also handles trailing stop updates (Delayed Trailing Stop + Trend Exhaustion Filter + Profit Lock)
 * @param position Current position
 * @param bar Current bar (with high/low/close)
 * @param ltfIndicator LTF indicator data (1H) for trailing stop
 * @param config Config object
 * @returns Risk decision and trailing stop update
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
  trailingUpdate: TrailingStopUpdate;
} {
  // Calculate active stop: stopLoss is the current active stop
  // Stage 1: stopLoss = initialStopLoss
  // Stage 2: stopLoss = entryPrice (break-even)
  // Stage 3: stopLoss = trailingStop (updated based on EMA20_1H or EMA50_1H)
  const activeStop = position.stopLoss;
  const unrealizedR = calculateUnrealizedR(position, bar.close);

  // Check if stop loss is triggered for LONG position
  if (position.side === 'LONG') {
    if (bar.low <= activeStop) {
      // Determine which stop was hit
      let reason: TradeReason;
      
      if (position.isTrailingActive && position.trailingStop && bar.low <= position.trailingStop) {
        // v5: Stage 3 - Trailing stop was hit, but only allow EXIT if trend is exhausted
        if (config.risk.trendExhaustADX && config.risk.trendExhaustBars && ltfIndicator.adx_1h_series) {
          const trendExhausted = isTrendExhausted(
            ltfIndicator.adx_1h_series,
            config.risk.trendExhaustADX,
            config.risk.trendExhaustBars
          );

          // v5: Log trailing stop check
          if (process.env.DEBUG) {
            console.log("V5_TRAILING_CHECK", {
              unrealizedR: unrealizedR.toFixed(2),
              stopLoss: position.stopLoss.toFixed(2),
              adx: ltfIndicator.adx?.toFixed(2),
              trendExhausted,
              trailingMode: position.trailingMode || "EMA20",
            });
          }

          if (trendExhausted) {
            // Trend exhausted, allow exit
            reason = 'TRAILING_STOP_HIT';
            return {
              decision: {
                action: 'EXIT',
                reason,
              },
              trailingUpdate: { shouldUpdate: false },
            };
          }
          // v5: Trend still strong, do not exit - continue with trailing stop update logic below
          // This allows the trailing stop to continue updating even if price touched it
        } else {
          // v4 fallback: no trend exhaustion filter, allow exit
          reason = 'TRAILING_STOP_HIT';
          return {
            decision: {
              action: 'EXIT',
              reason,
            },
            trailingUpdate: { shouldUpdate: false },
          };
        }
      } else if (position.stopLoss >= position.entryPrice && bar.low <= position.stopLoss) {
        // Break-even stop was hit (stage 2)
        reason = 'STOP_LOSS_BREAK_EVEN';
        return {
          decision: {
            action: 'EXIT',
            reason,
          },
          trailingUpdate: { shouldUpdate: false },
        };
      } else {
        // Initial stop loss was hit (stage 1)
        reason = 'STOP_LOSS_INITIAL';
        return {
          decision: {
            action: 'EXIT',
            reason,
          },
          trailingUpdate: { shouldUpdate: false },
        };
      }
    }
  }

  // Check stop loss progression (v5: three stages + profit lock)
  const progressionUpdate = checkStopLossProgression(
    position,
    bar.close,
    config.risk.breakEvenR,
    config.risk.trailingActivationR,
    config.risk.profitLockR
  );

  // Update trailing stop if active (Stage 3)
  let trailingUpdate: TrailingStopUpdate = { shouldUpdate: false };
  
  // Determine if trailing stop should be active
  const isTrailingActive = position.isTrailingActive || progressionUpdate.isTrailingActive || false;
  
  if (isTrailingActive) {
    // Stage 3: Trailing stop is active, update based on EMA20_1H or EMA50_1H
    // Create a temporary position with updated trailing stop for EMA update
    const initialTrailingStop = progressionUpdate.isTrailingActive 
      ? (progressionUpdate.trailingStop || position.entryPrice)  // Just activated: use from progressionUpdate
      : (position.trailingStop || position.entryPrice);  // Already active: use current or entryPrice
    
    const trailingMode = progressionUpdate.trailingMode || position.trailingMode || "EMA20";
    
    const tempPosition: Position = {
      ...position,
      isTrailingActive: true,
      trailingStop: initialTrailingStop,
      trailingMode,
    };
    
    // v5: Update trailing stop based on EMA20_1H or EMA50_1H (only upward)
    const emaUpdate = updateTrailingStop(
      tempPosition,
      ltfIndicator.ema20,
      ltfIndicator.ema50,
      bar.close
    );
    
    // Merge progression and EMA updates
    const finalTrailingStop = emaUpdate.trailingStop || initialTrailingStop;
    
    // Stage 3: Update stopLoss to follow trailingStop
    trailingUpdate = {
      shouldUpdate: progressionUpdate.shouldUpdate || emaUpdate.shouldUpdate,
      stopLoss: finalTrailingStop, // stopLoss follows trailingStop in stage 3
      trailingStop: finalTrailingStop,
      isTrailingActive: true,
      trailingMode,
      maxUnrealizedR: progressionUpdate.maxUnrealizedR || position.maxUnrealizedR,
    };
  } else if (progressionUpdate.shouldUpdate) {
    // Stage 2: Just moving to break-even (or tracking maxR in Stage 1)
    trailingUpdate = {
      shouldUpdate: true,
      stopLoss: progressionUpdate.stopLoss, // Update stopLoss to break-even if needed
      isTrailingActive: false,
      maxUnrealizedR: progressionUpdate.maxUnrealizedR || position.maxUnrealizedR,
    };
  }

  return {
    decision: { action: "NONE" },
    trailingUpdate,
  };
}

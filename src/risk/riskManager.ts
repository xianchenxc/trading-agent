import { Position, TradeReason, RiskDecision, LTFIndicatorData } from '../types';
import { Config } from '../config';

/**
 * Risk Manager (MVP v4: Delayed Trailing Stop)
 *
 * Responsibilities:
 * - Calculate position size based on risk per trade (1% of equity)
 * - Calculate stop loss (entryPrice * (1 - 1%)) - fixed 1% stop
 * - Manage Delayed Trailing Stop mechanism (v4):
 *   - Stage 1 (unrealizedR < 1R): Only use initialStopLoss
 *   - Stage 2 (1R ≤ unrealizedR < 2R): Move stop to break-even (entryPrice), no trailing
 *   - Stage 3 (unrealizedR ≥ 2R): Activate trailing stop based on EMA20_1H (only upward)
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
  trailingStop?: number; // Updated trailingStop (only used in stage 3, based on EMA20_1H)
  isTrailingActive?: boolean; // Whether trailing stop is activated (stage 3 only)
  maxUnrealizedR?: number; // Track maximum unrealized profit in R units
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
 * Update trailing stop based on EMA20_1H
 * @param position Current position
 * @param ema20_1h EMA20 value from 1H timeframe
 * @param currentPrice Current market price
 * @returns Trailing stop update result
 */
export function updateTrailingStop(
  position: Position,
  ema20_1h: number | undefined,
  currentPrice: number
): TrailingStopUpdate {
  if (!position.isTrailingActive || ema20_1h === undefined) {
    return { shouldUpdate: false };
  }

  // Trailing stop can only move up, never down
  // Use trailingStop if set, otherwise use entryPrice (break-even) as baseline
  const currentTrailingStop = position.trailingStop || position.entryPrice;
  const newTrailingStop = ema20_1h;

  if (newTrailingStop > currentTrailingStop) {
    return {
      shouldUpdate: true,
      trailingStop: newTrailingStop,
    };
  }

  return { shouldUpdate: false };
}

/**
 * Check and manage stop loss progression (v4: Delayed Trailing Stop)
 * @param position Current position
 * @param currentPrice Current market price
 * @param breakEvenR Break-even threshold in R units (default 1.0)
 * @param trailingActivationR Trailing stop activation threshold in R units (default 2.0)
 * @returns Stop loss update result
 */
export function checkStopLossProgression(
  position: Position,
  currentPrice: number,
  breakEvenR: number = 1.0,
  trailingActivationR: number = 2.0
): TrailingStopUpdate {
  const unrealizedR = calculateUnrealizedR(position, currentPrice);
  const maxR = Math.max(position.maxUnrealizedR || 0, unrealizedR);

  // Stage 3: Trailing stop is active (unrealizedR ≥ trailingActivationR)
  if (position.isTrailingActive) {
    return {
      shouldUpdate: maxR > (position.maxUnrealizedR || 0),
      maxUnrealizedR: maxR,
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
 * Check if stop loss is triggered and return exit decision
 * Also handles trailing stop updates (v4: Delayed Trailing Stop)
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
  // Stage 3: stopLoss = trailingStop (updated based on EMA20_1H)
  const activeStop = position.stopLoss;

  // Check if stop loss is triggered for LONG position
  if (position.side === 'LONG') {
    if (bar.low <= activeStop) {
      // Determine which stop was hit
      let reason: TradeReason;
      
      if (position.isTrailingActive && position.trailingStop && bar.low <= position.trailingStop) {
        // Trailing stop was hit (stage 3)
        reason = 'TRAILING_STOP_HIT';
      } else if (position.stopLoss >= position.entryPrice && bar.low <= position.stopLoss) {
        // Break-even stop was hit (stage 2)
        reason = 'STOP_LOSS_BREAK_EVEN';
      } else {
        // Initial stop loss was hit (stage 1)
        reason = 'STOP_LOSS_INITIAL';
      }

      return {
        decision: {
          action: 'EXIT',
          reason,
        },
        trailingUpdate: { shouldUpdate: false },
      };
    }
  }

  // Check stop loss progression (v4: three stages)
  const progressionUpdate = checkStopLossProgression(
    position,
    bar.close,
    config.risk.breakEvenR,
    config.risk.trailingActivationR
  );

  // Update trailing stop if active (Stage 3)
  let trailingUpdate: TrailingStopUpdate = { shouldUpdate: false };
  
  // Determine if trailing stop should be active
  const isTrailingActive = position.isTrailingActive || progressionUpdate.isTrailingActive || false;
  
  if (isTrailingActive) {
    // Stage 3: Trailing stop is active, update based on EMA20_1H
    // Create a temporary position with updated trailing stop for EMA update
    const initialTrailingStop = progressionUpdate.isTrailingActive 
      ? (progressionUpdate.trailingStop || position.entryPrice)  // Just activated: use from progressionUpdate
      : (position.trailingStop || position.entryPrice);  // Already active: use current or entryPrice
    
    const tempPosition: Position = {
      ...position,
      isTrailingActive: true,
      trailingStop: initialTrailingStop,
    };
    
    // Update trailing stop based on EMA20_1H (only upward)
    const emaUpdate = updateTrailingStop(
      tempPosition,
      ltfIndicator.ema20,
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

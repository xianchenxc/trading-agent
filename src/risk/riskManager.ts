import { Position, TradeReason, RiskDecision, LTFIndicatorData } from '../types';
import { Config } from '../config';

/**
 * Risk Manager (MVP v3)
 *
 * Responsibilities:
 * - Calculate position size based on risk per trade (1% of equity)
 * - Calculate stop loss (entryPrice * (1 - 1%)) - fixed 1% stop
 * - Manage Trailing Stop mechanism:
 *   - Activate at +1R (move stop to break-even)
 *   - Update trailing stop based on EMA20_1H (only upward)
 * - Check if stop loss is triggered and force EXIT
 * - Can override Strategy's HOLD signal
 */

export interface PositionSizeResult {
  size: number;
  stopLoss: number;
}

export interface TrailingStopUpdate {
  shouldUpdate: boolean;
  trailingStop?: number;
  isTrailingActive?: boolean;
  maxUnrealizedR?: number;
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
    const initialRisk = (position.entryPrice - position.stopLoss) * position.size;
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
 * Check and activate trailing stop if unrealized PnL reaches +1R
 * @param position Current position
 * @param currentPrice Current market price
 * @param activationR Activation threshold in R units (default 1.0)
 * @returns Trailing stop activation result
 */
export function checkTrailingStopActivation(
  position: Position,
  currentPrice: number,
  activationR: number = 1.0
): TrailingStopUpdate {
  if (position.isTrailingActive) {
    // Already activated, just update maxUnrealizedR
    const currentR = calculateUnrealizedR(position, currentPrice);
    const maxR = Math.max(position.maxUnrealizedR || 0, currentR);
    return {
      shouldUpdate: maxR > position.maxUnrealizedR,
      maxUnrealizedR: maxR,
    };
  }

  // Check if we should activate trailing stop
  const unrealizedR = calculateUnrealizedR(position, currentPrice);
  
  if (unrealizedR >= activationR) {
    // Move stop to break-even (entryPrice)
    return {
      shouldUpdate: true,
      trailingStop: position.entryPrice,
      isTrailingActive: true,
      maxUnrealizedR: unrealizedR,
    };
  }

  // Not yet activated, just track max unrealized R
  const maxR = Math.max(position.maxUnrealizedR || 0, unrealizedR);
  return {
    shouldUpdate: maxR > (position.maxUnrealizedR || 0),
    maxUnrealizedR: maxR,
  };
}

/**
 * Check if stop loss is triggered and return exit decision
 * Also handles trailing stop updates
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
  // Calculate active stop (max of initial stop and trailing stop)
  const activeStop = Math.max(
    position.stopLoss,
    position.trailingStop || position.stopLoss
  );

  // Check if stop loss is triggered for LONG position
  if (position.side === 'LONG') {
    if (bar.low <= activeStop) {
      // Determine which stop was hit
      const reason: TradeReason = 
        position.trailingStop && bar.low <= position.trailingStop
          ? 'TRAILING_STOP_HIT'
          : 'STOP_LOSS_INITIAL';

      return {
        decision: {
          action: 'EXIT',
          reason,
        },
        trailingUpdate: { shouldUpdate: false },
      };
    }
  }

  // Check trailing stop activation (if not yet activated)
  const activationUpdate = checkTrailingStopActivation(
    position,
    bar.close,
    config.strategy.trailingStop.activationR
  );

  // Update trailing stop if active
  let trailingUpdate: TrailingStopUpdate = { shouldUpdate: false };
  
  // Determine if trailing stop should be active (either already active or just activated)
  const isTrailingActive = position.isTrailingActive || activationUpdate.isTrailingActive || false;
  
  if (isTrailingActive) {
    // Create a temporary position with updated trailing stop for EMA update
    // If just activated, use entryPrice as initial trailing stop
    // If already active, use current trailingStop or entryPrice as baseline
    const initialTrailingStop = activationUpdate.isTrailingActive 
      ? position.entryPrice  // Just activated: start at break-even
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
    
    // Merge activation and EMA updates
    // Priority: EMA update > activation update (if EMA20 > entryPrice, use EMA20)
    // If EMA20 is available and > current trailing stop, use EMA20
    const finalTrailingStop = emaUpdate.trailingStop || initialTrailingStop;
    
    // Check if we just activated (isTrailingActive was set in activationUpdate)
    const justActivated = activationUpdate.isTrailingActive === true;
    const shouldUpdateTrailing = justActivated && finalTrailingStop !== (position.trailingStop || position.entryPrice);
    
    trailingUpdate = {
      shouldUpdate: activationUpdate.shouldUpdate || emaUpdate.shouldUpdate || shouldUpdateTrailing,
      trailingStop: finalTrailingStop,
      isTrailingActive: true,
      maxUnrealizedR: activationUpdate.maxUnrealizedR || position.maxUnrealizedR,
    };
  } else if (activationUpdate.shouldUpdate) {
    // Just tracking max unrealized R (not yet activated)
    trailingUpdate = activationUpdate;
  }

  return {
    decision: { action: "NONE" },
    trailingUpdate,
  };
}

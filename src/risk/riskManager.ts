import { IndicatorData, Position, TradeReason, RiskDecision } from '../types';
import { Config } from '../config';

/**
 * Risk Manager (MVP)
 *
 * Responsibilities:
 * - Calculate position size based on risk per trade (1% of equity)
 * - Calculate stop loss (entryPrice - 1.5 * ATR)
 * - Check if stop loss is triggered and force EXIT
 * - Can override Strategy's HOLD signal
 */

export interface PositionSizeResult {
  size: number;
  stopLoss: number;
}

/**
 * Calculate position size and stop loss for entry
 * @param entryPrice Entry price
 * @param atr ATR value
 * @param equity Current account equity
 * @param riskPerTrade Risk per trade (default 0.01 = 1%)
 * @returns Position size and stop loss price
 */
export function calculatePositionSize(
  entryPrice: number,
  atr: number,
  equity: number,
  riskPerTrade: number = 0.01
): PositionSizeResult {
  // Stop loss = entryPrice - 1.5 * ATR (for LONG)
  const stopLoss = entryPrice - 1.5 * atr;

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
 * Check if stop loss is triggered and return exit decision
 * @param position Current position
 * @param bar Current bar (with high/low)
 * @param indicator Current indicator data
 * @returns Risk decision
 */
export function riskManager(
  position: Position,
  bar: {
    close: number;
    high: number;
    low: number;
    indicator: IndicatorData;
  },
  config: Config
): RiskDecision {
  // Check stop loss for LONG position
  if (position.side === 'LONG') {
    if (bar.low <= position.stopLoss) {
      return {
        action: 'EXIT',
        reason: 'STOP_LOSS',
      };
    }
  }

  // No exit needed
  return { action: "NONE" };
}

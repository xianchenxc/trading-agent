/**
 * Slippage calculation utilities
 * Provides dynamic slippage calculation based on ATR and market volatility
 */

import { Kline } from '../types';

/**
 * Calculate dynamic slippage rate based on ATR and base slippage rate
 * @param bar Current bar with price data
 * @param atr Average True Range (volatility measure)
 * @param baseSlippageRate Base slippage rate (e.g., 0.0005 for 0.05%)
 * @param atrMultiplier Multiplier for ATR adjustment (default 0.5)
 * @returns Dynamic slippage rate
 */
export function calculateDynamicSlippageRate(
  bar: Kline,
  atr: number | undefined,
  baseSlippageRate: number,
  atrMultiplier: number = 0.5
): number {
  if (!atr || atr <= 0) {
    // Fallback to base slippage if ATR is not available
    return baseSlippageRate;
  }

  // Calculate volatility adjustment: ATR as percentage of price
  const volatilityAdjustment = (atr / bar.close) * atrMultiplier;

  // Dynamic slippage = base slippage + volatility adjustment
  const dynamicSlippageRate = baseSlippageRate + volatilityAdjustment;

  // Cap slippage at reasonable maximum (e.g., 1% = 0.01)
  const maxSlippageRate = 0.01;
  return Math.min(dynamicSlippageRate, maxSlippageRate);
}

/**
 * Apply slippage to execution price
 * @param price Original execution price
 * @param slippageRate Slippage rate (e.g., 0.0005 for 0.05%)
 * @param side Position side ("LONG" or "SHORT")
 * @returns Price with slippage applied
 */
export function applySlippage(
  price: number,
  slippageRate: number,
  side: "LONG" | "SHORT"
): number {
  if (side === "LONG") {
    // For LONG: slippage reduces entry price, increases exit price
    // Entry: buy at higher price (price * (1 + slippageRate))
    // Exit: sell at lower price (price * (1 - slippageRate))
    return price * (1 - slippageRate); // For exit, we reduce price
  } else {
    // For SHORT: slippage increases entry price, reduces exit price
    return price * (1 + slippageRate);
  }
}

/**
 * Calculate slippage amount in currency
 * @param price Original execution price
 * @param priceWithSlippage Price with slippage applied
 * @param size Position size
 * @returns Slippage amount
 */
export function calculateSlippageAmount(
  price: number,
  priceWithSlippage: number,
  size: number
): number {
  return Math.abs(priceWithSlippage - price) * size;
}

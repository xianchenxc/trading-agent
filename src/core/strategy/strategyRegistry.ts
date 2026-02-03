/**
 * Strategy Registry
 * Centralized registry for all strategy functions
 * Allows dynamic strategy selection based on configuration
 */

import { StrategySignal, Kline, HTFIndicatorData, LTFIndicatorData, PositionState } from '../../types';
import { trendStrategy } from './trendStrategy';

/**
 * Strategy function signature
 */
export type StrategyFunction = (context: {
  bar: Kline;
  htfIndicator: HTFIndicatorData;
  ltfIndicator: LTFIndicatorData;
  positionState: PositionState;
}) => StrategySignal;

/**
 * Strategy registry mapping strategy names to functions
 */
export const strategyRegistry: Record<string, StrategyFunction> = {
  trendStrategy: trendStrategy,
  // Add more strategies here as they are implemented
  // meanReversionStrategy: meanReversionStrategy,
  // breakoutStrategy: breakoutStrategy,
};

/**
 * Get strategy function by name
 * @param strategyName Strategy name from config
 * @returns Strategy function
 * @throws Error if strategy not found
 */
export function getStrategy(strategyName: string): StrategyFunction {
  const strategy = strategyRegistry[strategyName];
  if (!strategy) {
    throw new Error(`Strategy "${strategyName}" not found in registry. Available strategies: ${Object.keys(strategyRegistry).join(', ')}`);
  }
  return strategy;
}

/**
 * Register a new strategy
 * @param name Strategy name
 * @param strategyFn Strategy function
 */
export function registerStrategy(name: string, strategyFn: StrategyFunction): void {
  if (strategyRegistry[name]) {
    console.warn(`Strategy "${name}" already exists. Overwriting...`);
  }
  strategyRegistry[name] = strategyFn;
}

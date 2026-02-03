import { StrategyInstance } from '../instance/strategyInstance';
import { StrategySignal, LTFIndicatorData, Kline, TradeReason } from '../types';

export interface IEngine {
  /**
   * Execute entry order
   */
  executeEntry(
    instance: StrategyInstance,
    bar: Kline,
    signal: StrategySignal,
    ltfIndicator: LTFIndicatorData
  ): Promise<void>;
  
  /**
   * Execute exit order
   */
  executeExit(
    instance: StrategyInstance,
    bar: Kline,
    reason: TradeReason | string,
    ltfIndicator?: LTFIndicatorData
  ): Promise<void>;
}

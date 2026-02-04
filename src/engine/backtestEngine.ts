import { IEngine } from './IEngine';
import { StrategyInstance } from '../instance/strategyInstance';
import { StrategySignal, LTFIndicatorData, Kline, TradeReason } from '../types';
import { calculatePositionSize } from '../core/risk/riskManager';
import { calculateDynamicSlippageRate, applySlippage, calculateSlippageAmount } from '../utils/slippageUtils';

export class BacktestEngine implements IEngine {
  async executeEntry(
    instance: StrategyInstance,
    bar: Kline,
    signal: StrategySignal,
    ltfIndicator: LTFIndicatorData
  ): Promise<void> {
    if (!signal.side || signal.side !== "LONG") {
      return;
    }
    
    const positionStore = instance.getPositionStore();
    const logger = instance.getLogger();
    const config = instance.config;
    
    // Calculate dynamic slippage for entry
    const entrySlippageRate = calculateDynamicSlippageRate(
      bar,
      ltfIndicator.atr,
      config.execution.slippageRate
    );
    
    // Apply slippage to entry price (for LONG: buy at higher price)
    const entryPrice = signal.side === "LONG" 
      ? bar.close * (1 + entrySlippageRate)
      : bar.close * (1 - entrySlippageRate);
    
    const equity = logger.getCurrentEquity();
    const { size, stopLoss } = calculatePositionSize(
      entryPrice,
      equity,
      config.risk.maxRiskPerTrade,
      config.risk.initialStopPct
    );
    
    positionStore.dispatch({
      type: 'OPEN_POSITION',
      payload: {
        side: signal.side,
        entryPrice,
        stopLoss,
        size,
        entryTime: bar.closeTime,
      },
      reason: (signal.reason as TradeReason) || 'HTF_BULL_TREND_CONFIRMED',
    });
    
    logger.logEntry(bar, {
      action: 'ENTER',
      side: signal.side,
      atr: ltfIndicator.atr || 0,
      reason: (signal.reason as TradeReason) || 'HTF_BULL_TREND_CONFIRMED',
    });
  }
  
  async executeExit(
    instance: StrategyInstance,
    bar: Kline,
    reason: TradeReason | string,
    ltfIndicator?: LTFIndicatorData
  ): Promise<void> {
    const positionStore = instance.getPositionStore();
    const logger = instance.getLogger();
    const config = instance.config;
    const position = positionStore.get();
    
    if (!position) return;
    
    // Calculate commission
    const entryValue = position.entryPrice * position.size;
    const exitValue = bar.close * position.size;
    const commission = (entryValue + exitValue) * config.execution.commissionRate;
    
    // Calculate dynamic slippage for exit based on ATR
    const exitSlippageRate = calculateDynamicSlippageRate(
      bar,
      ltfIndicator?.atr,
      config.execution.slippageRate
    );
    
    // Apply slippage to exit price
    const exitPriceWithSlippage = applySlippage(bar.close, exitSlippageRate, position.side);
    const slippage = calculateSlippageAmount(bar.close, exitPriceWithSlippage, position.size);
    
    positionStore.dispatch({ type: 'START_CLOSING' });
    positionStore.dispatch({
      type: 'CLOSE_POSITION',
      payload: {
        exitPrice: exitPriceWithSlippage, // Use price with slippage
        exitTime: bar.closeTime,
      },
      reason: (reason as TradeReason) || 'MANUAL_EXIT',
    });
    
    // Create a temporary position with exit price for logging
    const positionForLogging = { ...position };
    logger.logExit(bar, positionForLogging, (reason as TradeReason) || 'MANUAL_EXIT', {
      commission,
      slippage,
      exitPrice: exitPriceWithSlippage,
    });
  }
}

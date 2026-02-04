import { StrategyInstance } from './strategyInstance';
import { IEngine } from '../engine/IEngine';
import { getStrategy } from '../core/strategy/strategyRegistry';
import { riskManager } from '../core/risk/riskManager';
import { Kline, HTFIndicatorData, LTFIndicatorData, TradeReason } from '../types';

export class StrategyInstanceRunner {
  private instance: StrategyInstance;
  private engine: IEngine;
  
  constructor(instance: StrategyInstance, engine: IEngine) {
    this.instance = instance;
    this.engine = engine;
  }
  
  /**
   * Execute onBar logic for this instance
   * Execution order: RiskManager → Strategy → Engine
   */
  async onBar(
    bar: Kline,
    htfIndicator: HTFIndicatorData,
    ltfIndicator: LTFIndicatorData
  ): Promise<void> {
    const positionStore = this.instance.getPositionStore();
    const logger = this.instance.getLogger();
    const config = this.instance.config;
    const position = positionStore.get();
    const positionState = positionStore.getState();
    
    /* =========================
     * 1️⃣ Risk Management（优先检查止损）
     * ========================= */
    if (position && positionState === "OPEN") {
      const riskResult = riskManager(
        position,
        { close: bar.close, high: bar.high, low: bar.low },
        ltfIndicator,
        config
      );
      
      // Update stop loss (all stages)
      if (riskResult.stopLossUpdate) {
        positionStore.dispatch({
          type: 'UPDATE_STOP',
          payload: {
            stopLoss: riskResult.stopLossUpdate.stopLoss,
            trailingStop: riskResult.stopLossUpdate.trailingStop,
            isTrailingActive: riskResult.stopLossUpdate.isTrailingActive,
            maxUnrealizedR: riskResult.stopLossUpdate.maxUnrealizedR,
            trailingMode: riskResult.stopLossUpdate.trailingMode,
          },
          reason: 'TRAILING_STOP' as TradeReason,
        });
      }
      
      // Check stop loss trigger
      if (riskResult.decision.action === 'EXIT') {
        await this.engine.executeExit(
          this.instance,
          bar,
          riskResult.decision.reason || 'STOP_LOSS',
          ltfIndicator
        );
        return;
      }
    }
    
    /* =========================
     * 2️⃣ Strategy Decision
     * ========================= */
    // Get strategy function from registry based on instance configuration
    const strategyFn = getStrategy(this.instance.strategyName);
    const signal = strategyFn({
      bar,
      htfIndicator,
      ltfIndicator,
      positionState,
    });
    
    // Handle Strategy EXIT signal
    if (signal.type === "EXIT" && position && positionState === "OPEN") {
      await this.engine.executeExit(
        this.instance,
        bar,
        signal.reason as TradeReason || 'TREND_INVALIDATED',
        ltfIndicator
      );
      return;
    }
    
    // Handle Strategy ENTRY signal
    if (signal.type === "ENTRY" && positionState === "FLAT") {
      await this.engine.executeEntry(
        this.instance,
        bar,
        signal,
        ltfIndicator
      );
      return;
    }
    
    // HOLD: do nothing
  }
}

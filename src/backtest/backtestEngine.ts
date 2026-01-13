import { Config } from '../config';
import { Kline, StrategySignal, TradeReason, BacktestResult, HTFIndicatorData, LTFIndicatorData } from '../types';
import { trendStrategy } from '../strategy/trendStrategy';
import { riskManager, calculatePositionSize } from '../risk/riskManager';
import { PositionStore } from '../state/positionStore';
import { TradeLogger } from '../logger/tradeLogger';

interface BacktestContext {
  bar: Kline;
  htfIndicator: HTFIndicatorData;
  ltfIndicator: LTFIndicatorData;
  index: number;
}

export class BacktestEngine {
  private positionStore: PositionStore;
  private logger: TradeLogger;
  private config: Config;
  private klines: Kline[] = [];

  constructor(config: Config) {
    this.config = config;
    this.positionStore = new PositionStore();
    this.logger = new TradeLogger();
    this.logger.setInitialCapital(config.backtest.initialCapital);
  }

  run(
    signalKlines: Kline[],
    htfIndicators: HTFIndicatorData[],
    ltfIndicators: LTFIndicatorData[]
  ): BacktestResult {
    this.klines = signalKlines;
    
    for (let i = 0; i < signalKlines.length; i++) {
      const context: BacktestContext = {
        bar: signalKlines[i],
        htfIndicator: htfIndicators[i],
        ltfIndicator: ltfIndicators[i],
        index: i,
      };

      this.onBar(context);
    }

    return this.logger.getResults();
  }

  private onBar({ bar, htfIndicator, ltfIndicator, index }: BacktestContext) {
    const position = this.positionStore.get();
    const positionState = this.positionStore.getState();

    /* =========================
     * 1️⃣ Risk Management（优先检查止损 + Trailing Stop）
     * ========================= */
    if (position && positionState === "OPEN") {
      // Use LTFIndicatorData directly for RiskManager (v3)
      const riskResult = riskManager(
        position,
        {
          close: bar.close,
          high: bar.high,
          low: bar.low,
        },
        ltfIndicator,
        this.config
      );

      // Handle trailing stop updates (v4: includes break-even stopLoss updates)
      if (riskResult.trailingUpdate.shouldUpdate) {
        this.positionStore.dispatch({
          type: 'UPDATE_STOP',
          payload: {
            stopLoss: riskResult.trailingUpdate.stopLoss,
            trailingStop: riskResult.trailingUpdate.trailingStop,
            isTrailingActive: riskResult.trailingUpdate.isTrailingActive,
            maxUnrealizedR: riskResult.trailingUpdate.maxUnrealizedR,
          },
          reason: 'TRAILING_STOP' as TradeReason,
        });
      }

      // Check if stop loss is triggered
      if (riskResult.decision.action === 'EXIT') {
        this.executeExit(bar, riskResult.decision.reason || 'STOP_LOSS');
        return;
      }
    }

    /* =========================
     * 2️⃣ Strategy Decision
     * ========================= */
    const signal = trendStrategy({
      bar,
      htfIndicator,
      ltfIndicator,
      positionState,
    });

    // Handle Strategy EXIT signal
    if (signal.type === "EXIT" && position && positionState === "OPEN") {
      this.executeExit(bar, signal.reason as TradeReason || 'TREND_INVALIDATED');
      return;
    }

    // Handle Strategy ENTRY signal
    if (signal.type === "ENTRY" && positionState === "FLAT") {
      this.executeEntry(bar, signal, ltfIndicator);
      return;
    }

    // HOLD: do nothing
  }

  /* =========================
   * 3️⃣ Execution
   * ========================= */

  private executeEntry(bar: Kline, signal: StrategySignal, ltfIndicator: LTFIndicatorData) {
    if (!signal.side || signal.side !== "LONG") {
      return; // MVP: only LONG
    }
    

    const entryPrice = bar.close;
    const equity = this.logger.getCurrentEquity();
    const riskPerTrade = this.config.risk.maxRiskPerTrade;
    const stopLossPercent = this.config.risk.initialStopPct;

    // Calculate position size and stop loss using RiskManager (v4: initial stop loss)
    const { size, stopLoss } = calculatePositionSize(
      entryPrice,
      equity,
      riskPerTrade,
      stopLossPercent
    );

    this.positionStore.dispatch({
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

    // Log entry
    const tradeAction = {
      action: 'ENTER' as const,
      side: signal.side,
      atr: ltfIndicator.atr || 0, // ATR for logging only
      reason: (signal.reason as TradeReason) || 'HTF_BULL_TREND_CONFIRMED',
    };
    this.logger.logEntry(bar, tradeAction);
  }

  private executeExit(bar: Kline, reason: TradeReason | string) {
    const position = this.positionStore.get();
    if (!position) return;

    // Start closing process
    this.positionStore.dispatch({
      type: 'START_CLOSING',
    });

    // Close position
    this.positionStore.dispatch({
      type: 'CLOSE_POSITION',
      payload: {
        exitPrice: bar.close,
        exitTime: bar.closeTime,
      },
      reason: (reason as TradeReason) || 'MANUAL_EXIT',
    });

    this.logger.logExit(bar, position, (reason as TradeReason) || 'MANUAL_EXIT');
  }
}

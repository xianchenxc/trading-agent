/**
 * Legacy BacktestEngine for robustness check
 *
 * NOTE: This is the OLD single-instance BacktestEngine, kept for robustness check tool.
 * The NEW architecture uses engine/backtestEngine.ts which implements IEngine interface.
 *
 * Do NOT use this in new code. Use engine/backtestEngine.ts instead.
 */

import { Config } from "../../config/config";
import { Kline, StrategySignal, TradeReason, BacktestResult, HTFIndicatorData, LTFIndicatorData } from "../../types";
import { trendStrategy } from "../../core/strategy/trendStrategy";
import { riskManager, calculatePositionSize } from "../../core/risk/riskManager";
import { PositionStore } from "../../core/state/positionStore";
import { TradeLogger } from "../../core/logger/tradeLogger";

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

  constructor(config: Config, silent: boolean = false) {
    this.config = config;
    this.positionStore = new PositionStore();
    this.logger = new TradeLogger();
    this.logger.setInitialCapital(config.account.initialCapital);
    this.logger.setSilent(silent);
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

      if (riskResult.stopLossUpdate) {
        this.positionStore.dispatch({
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

    if (signal.type === "EXIT" && position && positionState === "OPEN") {
      this.executeExit(bar, signal.reason as TradeReason || 'TREND_INVALIDATED');
      return;
    }

    if (signal.type === "ENTRY" && positionState === "FLAT") {
      this.executeEntry(bar, signal, ltfIndicator);
      return;
    }
  }

  private executeEntry(bar: Kline, signal: StrategySignal, ltfIndicator: LTFIndicatorData) {
    if (!signal.side || signal.side !== "LONG") {
      return;
    }

    const entryPrice = bar.close;
    const equity = this.logger.getCurrentEquity();
    const riskPerTrade = this.config.risk.maxRiskPerTrade;
    const stopLossPercent = this.config.risk.initialStopPct;

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

    const tradeAction = {
      action: 'ENTER' as const,
      side: signal.side,
      atr: ltfIndicator.atr || 0,
      reason: (signal.reason as TradeReason) || 'HTF_BULL_TREND_CONFIRMED',
    };
    this.logger.logEntry(bar, tradeAction);
  }

  private executeExit(bar: Kline, reason: TradeReason | string) {
    const position = this.positionStore.get();
    if (!position) return;

    const entryValue = position.entryPrice * position.size;
    const exitValue = bar.close * position.size;
    const commission = (entryValue + exitValue) * this.config.execution.commissionRate;
    
    const slippageMultiplier = position.side === "LONG"
      ? 1 - this.config.execution.slippageRate
      : 1 + this.config.execution.slippageRate;
    const exitPriceWithSlippage = bar.close * slippageMultiplier;
    const slippage = Math.abs(exitPriceWithSlippage - bar.close) * position.size;

    this.positionStore.dispatch({
      type: 'START_CLOSING',
    });

    this.positionStore.dispatch({
      type: 'CLOSE_POSITION',
      payload: {
        exitPrice: exitPriceWithSlippage,
        exitTime: bar.closeTime,
      },
      reason: (reason as TradeReason) || 'MANUAL_EXIT',
    });

    const positionForLogging = { ...position };
    this.logger.logExit(bar, positionForLogging, (reason as TradeReason) || 'MANUAL_EXIT', {
      commission,
      slippage,
      exitPrice: exitPriceWithSlippage,
    });
  }
}

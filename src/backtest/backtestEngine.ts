/**
 * Backtest engine
 * Simulates trading on historical data with strict time ordering
 */

import {
  Kline,
  BacktestResult,
  Trade,
  Position,
  EntrySignal,
} from "../types";
import { Config, defaultConfig } from "../config";
import { TrendStrategy } from "../strategy/trendStrategy";
import { RiskManager } from "../risk/riskManager";
import { PositionStore } from "../state/positionStore";
import { SimulatedExchange } from "../execution/exchange";
import { Indicators } from "../data/indicators";
import { TradeLogger } from "../logger/tradeLogger";

export class BacktestEngine {
  private config: Config;
  private strategy: TrendStrategy;
  private riskManager: RiskManager;
  private positionStore: PositionStore;
  private exchange: SimulatedExchange;
  private logger: TradeLogger;

  constructor(config: Config = defaultConfig) {
    this.config = config;
    this.strategy = new TrendStrategy(config);
    this.riskManager = new RiskManager(config);
    this.positionStore = new PositionStore(config.backtest.initialCapital);
    this.exchange = new SimulatedExchange(config, 0);
    this.logger = new TradeLogger(true);
  }

  /**
   * Run backtest on historical data
   * @param trendKlines 4h klines for trend detection
   * @param signalKlines 1h klines for entry signals
   */
  async run(
    trendKlines: Kline[],
    signalKlines: Kline[]
  ): Promise<BacktestResult> {
    // Reset state
    this.positionStore.reset(this.config.backtest.initialCapital);
    this.logger.clear();

    this.logger.info("Starting backtest", {
      initialCapital: this.config.backtest.initialCapital,
      symbol: this.config.exchange.symbol,
      period: {
        start: new Date(signalKlines[0].openTime).toISOString(),
        end: new Date(signalKlines[signalKlines.length - 1].closeTime).toISOString(),
      },
    });

    // Calculate indicators for both timeframes
    const trendIndicators = Indicators.calculateAllIndicators(
      trendKlines,
      this.config.strategy.emaShort,
      this.config.strategy.emaMedium,
      this.config.strategy.emaLong,
      this.config.strategy.atrPeriod
    );

    const signalIndicators = Indicators.calculateAllIndicators(
      signalKlines,
      this.config.strategy.emaShort,
      this.config.strategy.emaMedium,
      this.config.strategy.emaLong,
      this.config.strategy.atrPeriod
    );

    // Map 1h klines to corresponding 4h trend indicators
    // For each 1h kline, find the most recent 4h kline that contains it
    const trendIndicatorMap = this.mapTimeframes(signalKlines, trendKlines, trendIndicators);

    // Process each 1h bar in chronological order
    for (let i = 0; i < signalKlines.length; i++) {
      const signalKline = signalKlines[i];
      const currentPrice = signalKline.close;
      const currentTime = signalKline.closeTime;

      // Update exchange price
      this.exchange.updatePrice(currentPrice, currentTime);

      // Get corresponding trend indicators
      const currentTrendIndicators = trendIndicatorMap[i];

      // Skip if we don't have enough data
      if (
        !currentTrendIndicators ||
        !signalIndicators[i] ||
        i < this.config.strategy.lookbackPeriod
      ) {
        continue;
      }

      // Update existing positions
      await this.updatePositions(
        signalKline,
        signalIndicators,
        currentTrendIndicators,
        i
      );

      // Check for new entry signals (only if no active position)
      const activePositions = this.positionStore.getActivePositions();
      if (activePositions.length === 0) {
        const entrySignal = this.strategy.checkEntry(
          trendKlines,
          currentTrendIndicators,
          signalKlines,
          signalIndicators,
          i
        );

        if (entrySignal) {
          await this.processEntrySignal(entrySignal, signalKline);
        }
      }
    }

    // Close any remaining positions at the end
    const finalPositions = this.positionStore.getActivePositions();
    for (const position of finalPositions) {
      const finalPrice = signalKlines[signalKlines.length - 1].close;
      this.exchange.updatePrice(finalPrice, signalKlines[signalKlines.length - 1].closeTime);
      await this.closePosition(position, "Backtest ended");
    }

    // Calculate and return results
    return this.calculateResults();
  }

  /**
   * Map 1h klines to their corresponding 4h trend indicators
   */
  private mapTimeframes(
    signalKlines: Kline[],
    trendKlines: Kline[],
    trendIndicators: any[]
  ): any[][] {
    const map: any[][] = [];

    for (const signalKline of signalKlines) {
      // Find the most recent 4h kline that contains this 1h kline
      let correspondingIndicators: any[] = [];
      
      for (let i = trendKlines.length - 1; i >= 0; i--) {
        if (
          trendKlines[i].openTime <= signalKline.openTime &&
          trendKlines[i].closeTime >= signalKline.openTime
        ) {
          // Use indicators from this 4h bar and all previous bars
          correspondingIndicators = trendIndicators.slice(0, i + 1);
          break;
        }
      }

      map.push(correspondingIndicators);
    }

    return map;
  }

  /**
   * Update existing positions and check for exits
   */
  private async updatePositions(
    signalKline: Kline,
    signalIndicators: any[],
    trendIndicators: any[],
    currentIndex: number
  ): Promise<void> {
    const activePositions = this.positionStore.getActivePositions();

    for (let i = 0; i < activePositions.length; i++) {
      const position = activePositions[i];
      const positionIndex = this.positionStore.getPositions().indexOf(position);

      // Update position tracking
      const updatedPosition = this.strategy.updatePosition(position, signalKline.close);
      this.positionStore.updatePosition(positionIndex, updatedPosition);

      // Check exit conditions
      const exitCheck = this.strategy.checkExit(
        updatedPosition,
        signalKline.close,
        signalKline,
        [], // Not needed for exit check
        trendIndicators,
        signalIndicators,
        currentIndex
      );

      if (exitCheck.shouldExit) {
        await this.closePosition(updatedPosition, exitCheck.reason);
      }
    }
  }

  /**
   * Process entry signal
   */
  private async processEntrySignal(
    signal: EntrySignal,
    signalKline: Kline
  ): Promise<void> {
    const accountState = this.positionStore.getAccountState();

    // Check risk management
    const canOpen = this.riskManager.canOpenPosition(accountState);
    if (!canOpen.allowed) {
      this.logger.logRiskEvent(canOpen.reason);
      return;
    }

    // Calculate position size
    const quantity = this.riskManager.calculatePositionSize(signal, accountState.equity);

    // Validate position size
    const validation = this.riskManager.validatePositionSize(
      quantity,
      signal.price,
      accountState.availableBalance
    );

    if (!validation.valid) {
      this.logger.logRiskEvent(validation.reason);
      if (validation.adjustedQuantity && validation.adjustedQuantity > 0) {
        // Use adjusted quantity
        const adjustedSignal = { ...signal };
        const position = await this.exchange.openPosition(adjustedSignal, validation.adjustedQuantity);
        this.positionStore.openPosition(position);
        this.logger.logEntrySignal(signal, validation.adjustedQuantity);
        this.logger.logPositionOpened(position);
      }
      return;
    }

    if (quantity <= 0) {
      this.logger.logRiskEvent("Calculated position size is zero or negative");
      return;
    }

    // Open position
    const position = await this.exchange.openPosition(signal, quantity);
    this.positionStore.openPosition(position);
    this.logger.logEntrySignal(signal, quantity);
    this.logger.logPositionOpened(position);
  }

  /**
   * Close a position
   */
  private async closePosition(
    position: Position,
    reason: string
  ): Promise<void> {
    const positionIndex = this.positionStore.getPositions().indexOf(position);
    if (positionIndex < 0) {
      return;
    }

    const trade = await this.exchange.closePosition(position, reason);
    const accountState = this.positionStore.getAccountState();

    // Update account state
    const updatedState = this.riskManager.updateAccountAfterTrade(
      accountState,
      trade.pnl,
      trade.exitTime
    );
    this.positionStore.updateEquity(updatedState.equity);

    // Close position in store
    this.positionStore.closePosition(
      positionIndex,
      trade.exitPrice,
      trade.exitTime,
      reason,
      trade.commission
    );

    this.logger.logPositionClosed(trade);
  }

  /**
   * Calculate backtest results
   */
  private calculateResults(): BacktestResult {
    const trades = this.positionStore.getTrades();
    const accountState = this.positionStore.getAccountState();

    if (trades.length === 0) {
      return {
        totalReturn: 0,
        totalReturnPercent: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        winRate: 0,
        profitFactor: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        avgWin: 0,
        avgLoss: 0,
        trades: [],
      };
    }

    // Calculate returns
    const initialCapital = this.config.backtest.initialCapital;
    const finalEquity = accountState.equity;
    const totalReturn = finalEquity - initialCapital;
    const totalReturnPercent = (totalReturn / initialCapital) * 100;

    // Calculate max drawdown
    let peak = initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let runningEquity = initialCapital;

    for (const trade of trades) {
      runningEquity += trade.pnl;
      if (runningEquity > peak) {
        peak = runningEquity;
      }
      const drawdown = peak - runningEquity;
      const drawdownPercent = (drawdown / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    // Calculate win rate and profit factor
    const winningTrades = trades.filter((t) => t.pnl > 0);
    const losingTrades = trades.filter((t) => t.pnl < 0);
    const winRate = (winningTrades.length / trades.length) * 100;

    const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    const avgWin = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;

    return {
      totalReturn,
      totalReturnPercent,
      maxDrawdown,
      maxDrawdownPercent,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWin,
      avgLoss,
      trades,
    };
  }

  /**
   * Get logger instance
   */
  getLogger(): TradeLogger {
    return this.logger;
  }
}

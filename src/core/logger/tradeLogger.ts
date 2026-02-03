import { Kline, Position, TradeAction, TradeReason, BacktestResult, TradeRecord } from '../../types';

export class TradeLogger {
  private trades: TradeRecord[] = [];
  private initialCapital: number = 0;
  private currentEquity: number = 0;
  private silent: boolean = false;

  setInitialCapital(capital: number) {
    this.initialCapital = capital;
    this.currentEquity = capital;
  }

  setSilent(silent: boolean) {
    this.silent = silent;
  }

  getCurrentEquity(): number {
    return this.currentEquity;
  }

  logEntry(bar: Kline, action: TradeAction) {
    if (!this.silent) {
      console.log(
        `[ENTRY] ${action.side} @ ${bar.close} | reason=${action.reason}`
      );
    }
  }

  logExit(
    bar: Kline, 
    position: Position, 
    reason: TradeReason,
    options?: {
      commission?: number;
      slippage?: number;
      exitPrice?: number; // Actual exit price (with slippage)
    }
  ) {
    const entryValue = position.entryPrice * position.size;
    const actualExitPrice = options?.exitPrice || bar.close;
    const exitValue = actualExitPrice * position.size;
    
    // Calculate PnL
    const pnl =
      position.side === 'LONG'
        ? exitValue - entryValue
        : entryValue - exitValue;
    
    // Apply commission and slippage if provided
    const commission = options?.commission || 0;
    const slippage = options?.slippage || 0;
    const finalPnL = pnl - commission - slippage;

    // Update equity
    this.currentEquity += finalPnL;

    const trade: TradeRecord = {
      side: position.side,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice: actualExitPrice,
      exitTime: bar.closeTime,
      size: position.size,
      pnl: finalPnL,
      commission,
      slippage,
      equityAfterTrade: this.currentEquity,
      reason: reason,
    };

    this.trades.push(trade);

    if (!this.silent) {
      console.log(
        `[EXIT] ${position.side} @ ${actualExitPrice.toFixed(2)} | PnL=${finalPnL.toFixed(
          2
        )} | reason=${reason}`
      );
    }
  }

  getResults(): BacktestResult {
    const totalTrades = this.trades.length;
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl < 0);
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    
    const totalWin = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : 0;
    
    const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
    const expectancy = totalTrades > 0 ? (totalWin + totalLoss) / totalTrades : 0;
    
    // Calculate max win (largest single winning trade)
    const maxWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    
    // Calculate total return (percentage)
    const totalReturn = this.initialCapital > 0 
      ? ((this.currentEquity - this.initialCapital) / this.initialCapital) * 100 
      : 0;

    // Calculate max drawdown
    let maxEquity = this.initialCapital;
    let maxDrawdown = 0;
    for (const trade of this.trades) {
      if (trade.equityAfterTrade > maxEquity) {
        maxEquity = trade.equityAfterTrade;
      }
      const drawdown = maxEquity - trade.equityAfterTrade;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return {
      initialCapital: this.initialCapital,
      finalEquity: this.currentEquity,
      trades: this.trades,
      stats: {
        totalTrades,
        winRate,
        expectancy,
        maxDrawdown,
        profitFactor,
        averageWin: avgWin,
        averageLoss: avgLoss,
        maxWin,
        totalReturn,
      },
    };
  }

  printSummary() {
    const results = this.getResults();
    console.log('====================');
    console.log('Backtest Summary');
    console.log('====================');
    console.log(`Trades: ${results.stats.totalTrades}`);
    console.log(`Win rate: ${results.stats.winRate.toFixed(2)}%`);
    console.log(`Final Equity: ${results.finalEquity.toFixed(2)}`);
    console.log(`Max Drawdown: ${results.stats.maxDrawdown.toFixed(2)}`);
  }
}

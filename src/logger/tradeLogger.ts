import { Kline, Position, TradeAction, TradeReason, BacktestResult, TradeRecord } from '../types';

export class TradeLogger {
  private trades: TradeRecord[] = [];
  private initialCapital: number = 0;
  private currentEquity: number = 0;

  setInitialCapital(capital: number) {
    this.initialCapital = capital;
    this.currentEquity = capital;
  }

  getCurrentEquity(): number {
    return this.currentEquity;
  }

  logEntry(bar: Kline, action: TradeAction) {
    console.log(
      `[ENTRY] ${action.side} @ ${bar.close} | reason=${action.reason}`
    );
  }

  logExit(bar: Kline, position: Position, reason: TradeReason) {
    const entryValue = position.entryPrice * position.size;
    const exitValue = bar.close * position.size;
    const pnl =
      position.side === 'LONG'
        ? exitValue - entryValue
        : entryValue - exitValue;

    // Update equity
    this.currentEquity += pnl;

    const trade: TradeRecord = {
      side: position.side,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice: bar.close,
      exitTime: bar.closeTime,
      size: position.size,
      pnl,
      commission: 0, // TODO: Calculate commission
      slippage: 0, // TODO: Calculate slippage
      equityAfterTrade: this.currentEquity,
      reason: reason,
    };

    this.trades.push(trade);

    console.log(
      `[EXIT] ${position.side} @ ${bar.close} | PnL=${pnl.toFixed(
        2
      )} | reason=${reason}`
    );
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

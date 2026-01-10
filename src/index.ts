/**
 * Main entry point for Trading Agent
 * Supports both backtest and live trading modes
 */

import { DataFetcher } from "./data/fetcher";
import { BacktestEngine } from "./backtest/backtestEngine";
import { defaultConfig, Config } from "./config";

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--mode=backtest") ? "backtest" : "backtest"; // Default to backtest for MVP

  const config = defaultConfig;

  if (mode === "backtest") {
    await runBacktest(config);
  } else {
    console.log("Live trading mode not implemented yet");
    process.exit(1);
  }
}

async function runBacktest(config: Config) {
  console.log("=".repeat(60));
  console.log("Trading Agent - Backtest Mode");
  console.log("=".repeat(60));
  console.log(`Symbol: ${config.exchange.symbol}`);
  console.log(`Initial Capital: $${config.backtest.initialCapital}`);
  console.log(`Commission: ${(config.backtest.commissionRate * 100).toFixed(2)}%`);
  console.log(`Slippage: ${(config.backtest.slippageRate * 100).toFixed(2)}%`);
  console.log("=".repeat(60));
  console.log();

  const fetcher = new DataFetcher(config.exchange.baseUrl);
  const engine = new BacktestEngine(config);

  try {
    // Fetch historical data
    console.log("Fetching historical data...");
    
    // For backtest, we need data from the past
    // Let's use a reasonable time range (e.g., last 3 months)
    const endTime = Date.now();
    const startTime = endTime - 90 * 24 * 60 * 60 * 1000; // 90 days ago

    // Fetch 4h klines for trend detection
    console.log("Fetching 4h klines...");
    const trendKlines = await fetcher.fetchKlinesForBacktest(
      config.exchange.symbol,
      config.strategy.trendTimeframe,
      startTime,
      endTime
    );
    console.log(`Fetched ${trendKlines.length} 4h klines`);

    // Fetch 1h klines for entry signals
    console.log("Fetching 1h klines...");
    const signalKlines = await fetcher.fetchKlinesForBacktest(
      config.exchange.symbol,
      config.strategy.signalTimeframe,
      startTime,
      endTime
    );
    console.log(`Fetched ${signalKlines.length} 1h klines`);
    console.log();

    if (trendKlines.length === 0 || signalKlines.length === 0) {
      console.error("Error: No historical data fetched");
      process.exit(1);
    }

    // Run backtest
    console.log("Running backtest...");
    console.log();
    const results = await engine.run(trendKlines, signalKlines);

    // Display results
    console.log();
    console.log("=".repeat(60));
    console.log("Backtest Results");
    console.log("=".repeat(60));
    console.log(`Total Return: $${results.totalReturn.toFixed(2)} (${results.totalReturnPercent.toFixed(2)}%)`);
    console.log(`Max Drawdown: $${results.maxDrawdown.toFixed(2)} (${results.maxDrawdownPercent.toFixed(2)}%)`);
    console.log(`Total Trades: ${results.totalTrades}`);
    console.log(`Winning Trades: ${results.winningTrades}`);
    console.log(`Losing Trades: ${results.losingTrades}`);
    console.log(`Win Rate: ${results.winRate.toFixed(2)}%`);
    console.log(`Profit Factor: ${results.profitFactor.toFixed(2)}`);
    console.log(`Average Win: $${results.avgWin.toFixed(2)}`);
    console.log(`Average Loss: $${results.avgLoss.toFixed(2)}`);
    console.log("=".repeat(60));
    console.log();

    // Display recent trades
    if (results.trades.length > 0) {
      console.log("Recent Trades (last 10):");
      console.log("-".repeat(60));
      const recentTrades = results.trades.slice(-10).reverse();
      for (const trade of recentTrades) {
        const pnlSign = trade.pnl >= 0 ? "+" : "";
        console.log(
          `${trade.side.toUpperCase().padEnd(5)} | ` +
          `Entry: $${trade.entryPrice.toFixed(2)} | ` +
          `Exit: $${trade.exitPrice.toFixed(2)} | ` +
          `PnL: ${pnlSign}$${trade.pnl.toFixed(2)} (${pnlSign}${trade.pnlPercent.toFixed(2)}%) | ` +
          `Reason: ${trade.exitReason}`
        );
      }
      console.log("-".repeat(60));
    }

    // Export logs
    const logger = engine.getLogger();
    const logOutput = logger.exportLogs();
    
    // Optionally save logs to file
    // fs.writeFileSync('backtest.log', logOutput);
    
  } catch (error: any) {
    console.error("Backtest failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

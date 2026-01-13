/**
 * Main entry point for Trading Agent
 * Supports both backtest and live trading modes
 */

import { DataFetcher } from "./data/fetcher";
import { BacktestEngine } from "./backtest/backtestEngine";
import { defaultConfig, Config } from "./config";
import { HTFIndicatorData } from "./types";

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
  console.log(`Cache: ${config.cache.enabled ? "Enabled" : "Disabled"}`);
  console.log("=".repeat(60));
  console.log();

  const fetcher = new DataFetcher(
    config.exchange.baseUrl,
    config.cache.enabled,
    config.cache.directory
  );
  const engine = new BacktestEngine(config);

  try {
    // Fetch historical data
    console.log("Fetching historical data...");
    
    // For backtest, we need data from the past
    // Use today 0:00:00 as endTime to match the closeTime of the last complete K-line
    // For 1h K-lines, the last complete bar is 23:00-00:00, which closes at 00:00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endTime = today.getTime();
    const startTime = endTime - 360 * 24 * 60 * 60 * 1000; // 360 days ago

    // Fetch both HTF (4h) and LTF (1h) klines
    console.log(`Fetching ${config.timeframe.trend} klines (HTF)...`);
    const htfKlines = await fetcher.fetchKlinesForBacktest(
      config.exchange.symbol,
      config.timeframe.trend,
      startTime,
      endTime
    );
    console.log(`Fetched ${htfKlines.length} ${config.timeframe.trend} klines`);

    console.log(`Fetching ${config.timeframe.signal} klines (LTF)...`);
    const ltfKlines = await fetcher.fetchKlinesForBacktest(
      config.exchange.symbol,
      config.timeframe.signal,
      startTime,
      endTime
    );
    console.log(`Fetched ${ltfKlines.length} ${config.timeframe.signal} klines`);
    console.log();

    if (htfKlines.length === 0 || ltfKlines.length === 0) {
      console.error("Error: No historical data fetched");
      process.exit(1);
    }

    // Calculate indicators for both timeframes
    const { buildHTFIndicators, buildLTFIndicators } = await import("./indicators/indicators");
    console.log("Calculating indicators...");
    const htfIndicators = buildHTFIndicators(htfKlines, config.indicators);
    const ltfIndicators = buildLTFIndicators(ltfKlines, config.indicators, config.strategy.lookbackPeriod);

    // Map HTF indicators to LTF bars (time alignment)
    // For each 1h bar, find the corresponding 4h bar that has closed
    // A 4h bar is considered "closed" if its closeTime < 1h bar's openTime
    // This ensures we only use fully closed 4h bars (no lookahead bias)
    const mappedHTFIndicators: HTFIndicatorData[] = [];
    
    for (const ltfBar of ltfKlines) {
      // Find the most recent 4h bar that has closed before this 1h bar starts
      // Use strict < to avoid using the current 4h bar that might still be forming
      let matchedHTFIndicator: HTFIndicatorData | null = null;
      
      for (let i = htfKlines.length - 1; i >= 0; i--) {
        const htfBar = htfKlines[i];
        // 4h bar is closed if its closeTime < 1h bar's openTime
        // This ensures we only use fully closed 4h bars
        if (htfBar.closeTime < ltfBar.openTime) {
          matchedHTFIndicator = htfIndicators[i];
          break;
        }
      }
      
      // If no matching 4h bar found, use undefined (will result in HOLD signal)
      mappedHTFIndicators.push(matchedHTFIndicator || {
        ema50: undefined,
        ema200: undefined,
        adx: undefined,
      });
    }

    // Run backtest with multi-timeframe data
    console.log("Running backtest...");
    console.log();
    const results = engine.run(
      ltfKlines,
      mappedHTFIndicators,
      ltfIndicators
    );

    // Display results
    console.log();
    console.log("=".repeat(60));
    console.log("Backtest Results");
    console.log("=".repeat(60));
    const totalReturn = results.finalEquity - results.stats.totalTrades * 0; // Simplified
    const totalReturnPercent = ((results.finalEquity - config.backtest.initialCapital) / config.backtest.initialCapital) * 100;
    const winningTrades = results.trades.filter(t => t.pnl > 0).length;
    const losingTrades = results.trades.filter(t => t.pnl < 0).length;
    const avgWin = winningTrades > 0 ? results.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? Math.abs(results.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades) : 0;

    console.log(`Total Return: $${totalReturn.toFixed(2)} (${totalReturnPercent.toFixed(2)}%)`);
    const maxDrawdownPercent = (results.stats.maxDrawdown / config.backtest.initialCapital) * 100;
    console.log(`Max Drawdown: $${results.stats.maxDrawdown.toFixed(2)} (${maxDrawdownPercent.toFixed(2)}%)`);
    console.log(`Total Trades: ${results.stats.totalTrades}`);
    console.log(`Winning Trades: ${winningTrades}`);
    console.log(`Losing Trades: ${losingTrades}`);
    console.log(`Win Rate: ${results.stats.winRate.toFixed(2)}%`);
    console.log(`Profit Factor: ${results.stats.profitFactor.toFixed(2)}`);
    console.log(`Average Win: $${avgWin.toFixed(2)}`);
    console.log(`Average Loss: $${avgLoss.toFixed(2)}`);
    console.log("=".repeat(60));
    console.log();

    // Display recent trades
    if (results.trades.length > 0) {
      console.log("Recent Trades (last 10):");
      console.log("-".repeat(60));
      const recentTrades = results.trades.slice(-10).reverse();
      for (const trade of recentTrades) {
        const pnlSign = trade.pnl >= 0 ? "+" : "";
        const pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'LONG' ? 1 : -1);
        console.log(
          `${trade.side.padEnd(5)} | ` +
          `Entry: $${trade.entryPrice.toFixed(2)} | ` +
          `Exit: $${trade.exitPrice.toFixed(2)} | ` +
          `PnL: ${pnlSign}$${trade.pnl.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(2)}%) | ` +
          `Reason: ${trade.reason}`
        );
      }
      console.log("-".repeat(60));
    }

    // Print summary
    results.stats && console.log();
    
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

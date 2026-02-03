/**
 * Main entry point for Trading Agent
 * Supports multi-instance backtest and paper trading modes
 */

import { BacktestEngine } from "./engine/backtestEngine";
import { PaperEngine } from "./engine/paperEngine";
import { InstanceOrchestrator } from "./instance/instanceOrchestrator";
import { StrategyInstance } from "./instance/strategyInstance";
import { instanceConfigs } from "./config/instanceConfig";
import { prepareBacktestData, preparePaperTradingData } from "./services/dataService";
import { alignHTFIndicatorsToLTF, findHTFIndicatorForLTFBar } from "./services/timeAlignmentService";
import { validateBacktest } from "./services/backtestValidationService";
import { generateDetailedReport, formatReportAsText, exportReportToJSON, exportReportToCSV } from "./services/backtestReportService";
import { DataFetcher } from "./data/fetcher";
import { Kline, HTFIndicatorData } from "./types";
import { logInfo, logWarn, logError, LogLevel, logger } from "./utils/logger";

async function main() {
  const args = process.argv.slice(2);
  let mode = "backtest"; // Default to backtest
  
  if (args.includes("--mode=backtest")) {
    mode = "backtest";
  } else if (args.includes("--mode=paper")) {
    mode = "paper";
  }

  if (mode === "backtest") {
    await runBacktest();
  } else if (mode === "paper") {
    await runPaperTrading();
  } else {
    console.log("Unknown mode. Use --mode=backtest or --mode=paper");
    process.exit(1);
  }
}

async function runBacktest() {
  console.log("=".repeat(60));
  console.log("Trading Agent - Multi-Instance Backtest Mode");
  console.log("=".repeat(60));
  console.log(`Instances: ${Object.keys(instanceConfigs).length}`);
  console.log("=".repeat(60));
  console.log();

  // Create engine and orchestrator
  const engine = new BacktestEngine();
  const orchestrator = new InstanceOrchestrator(engine);

  // Create instances from config
  const instances: StrategyInstance[] = [];
  for (const instanceConfig of Object.values(instanceConfigs)) {
    const instance = new StrategyInstance(instanceConfig);
    instances.push(instance);
    orchestrator.registerInstance(instance);
    console.log(`Registered instance: ${instance.instanceId} (${instance.symbol})`);
  }
  console.log();

  try {
    // Prepare data for each instance
    const instanceData = new Map<string, {
      ltfKlines: Kline[];
      htfIndicators: HTFIndicatorData[];
      ltfIndicators: any[];
    }>();
    const instanceRawData = new Map<string, {
      ltfKlines: Kline[];
      htfKlines: Kline[];
      htfIndicators: HTFIndicatorData[];
      ltfIndicators: any[];
    }>();

    // Fetch data and calculate indicators for each instance (parallel)
    console.log(`Fetching data for ${instances.length} instances in parallel...`);
    const dataPromises = instances.map(async (instance) => {
      console.log(`[${instance.instanceId}] Fetching data...`);
      
      // Use data service to prepare backtest data
      const data = await prepareBacktestData(instance);
      
      console.log(`[${instance.instanceId}] Fetched ${data.htfKlines.length} ${instance.config.timeframe.trend} klines`);
      console.log(`[${instance.instanceId}] Fetched ${data.ltfKlines.length} ${instance.config.timeframe.signal} klines`);

      // Align HTF indicators to LTF bars using time alignment service
      const mappedHTFIndicators = alignHTFIndicatorsToLTF(data.ltfKlines, data.htfKlines, data.htfIndicators);

      return {
        instanceId: instance.instanceId,
        instance,
        data: {
          ltfKlines: data.ltfKlines,
          htfIndicators: mappedHTFIndicators,
          ltfIndicators: data.ltfIndicators,
        },
        rawData: {
          ltfKlines: data.ltfKlines,
          htfKlines: data.htfKlines,
          htfIndicators: data.htfIndicators,
          ltfIndicators: data.ltfIndicators,
        },
      };
    });

    // Wait for all data to be fetched in parallel
    const dataResults = await Promise.all(dataPromises);
    
    // Populate maps
    for (const result of dataResults) {
      instanceData.set(result.instanceId, result.data);
      instanceRawData.set(result.instanceId, result.rawData);
    }

    // Validate backtest data before running
    console.log();
    console.log("Validating backtest data...");
    let hasValidationErrors = false;
    for (const instance of instances) {
      const rawData = instanceRawData.get(instance.instanceId);
      const data = instanceData.get(instance.instanceId);
      if (!rawData || !data) continue;

      const validation = validateBacktest(
        instance.instanceId,
        data.ltfKlines,
        rawData.htfKlines,
        rawData.htfIndicators,
        data.htfIndicators,
        data.ltfIndicators
      );

      if (!validation.isValid) {
        hasValidationErrors = true;
        logError(`Validation FAILED`, { errors: validation.errors }, instance.instanceId);
      }

      if (validation.warnings.length > 0) {
        logWarn(`Validation warnings`, { warnings: validation.warnings }, instance.instanceId);
      }

      if (validation.isValid && validation.warnings.length === 0) {
        logInfo(`Validation passed`, undefined, instance.instanceId);
      }
    }

    if (hasValidationErrors) {
      logError("Backtest validation failed. Please fix data quality issues before running backtest.");
      process.exit(1);
    }

    console.log();
    console.log("Running backtest for all instances...");
    console.log();

    // Run backtest for all instances
    await orchestrator.runBacktest(instanceData);

    // Display results for each instance
    console.log();
    console.log("=".repeat(60));
    console.log("Backtest Results Summary");
    console.log("=".repeat(60));
    console.log();

    const allResults = orchestrator.getAllResults();
    for (const [instanceId, results] of allResults) {
      const instance = instances.find(i => i.instanceId === instanceId);
      const config = instance?.config;
      if (!config) continue;

      const totalReturnPercent = ((results.finalEquity - config.backtest.initialCapital) / config.backtest.initialCapital) * 100;
      const winningTrades = results.trades.filter(t => t.pnl > 0).length;
      const losingTrades = results.trades.filter(t => t.pnl < 0).length;
      const avgWin = winningTrades > 0 ? results.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades : 0;
      const avgLoss = losingTrades > 0 ? Math.abs(results.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades) : 0;
      const maxDrawdownPercent = (results.stats.maxDrawdown / config.backtest.initialCapital) * 100;

      console.log(`[${instanceId}]`);
      console.log(`  Symbol: ${instance?.symbol}`);
      console.log(`  Total Return: $${(results.finalEquity - config.backtest.initialCapital).toFixed(2)} (${totalReturnPercent.toFixed(2)}%)`);
      console.log(`  Final Equity: $${results.finalEquity.toFixed(2)}`);
      console.log(`  Max Drawdown: $${results.stats.maxDrawdown.toFixed(2)} (${maxDrawdownPercent.toFixed(2)}%)`);
      console.log(`  Total Trades: ${results.stats.totalTrades}`);
      console.log(`  Win Rate: ${results.stats.winRate.toFixed(2)}%`);
      console.log(`  Profit Factor: ${results.stats.profitFactor.toFixed(2)}`);
      console.log(`  Average Win: $${avgWin.toFixed(2)}`);
      console.log(`  Average Loss: $${avgLoss.toFixed(2)}`);
      console.log();

      // Generate detailed report
      const detailedReport = generateDetailedReport(instanceId, results);
      
      // Display detailed report
      console.log(formatReportAsText(detailedReport));
      
      // Export reports to files
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportsDir = `reports/${instanceId}`;
      exportReportToJSON(detailedReport, `${reportsDir}/${timestamp}.json`);
      exportReportToCSV(detailedReport, `${reportsDir}/${timestamp}.csv`);
      logInfo(`Detailed reports exported to ${reportsDir}/`, undefined, instanceId);
    }

    console.log("=".repeat(60));
    
  } catch (error: any) {
    console.error("Backtest failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Run paper trading mode - simulated live trading with real-time data
 */
async function runPaperTrading() {
  console.log("=".repeat(60));
  console.log("Trading Agent - Paper Trading Mode");
  console.log("=".repeat(60));
  console.log(`Instances: ${Object.keys(instanceConfigs).length}`);
  console.log("=".repeat(60));
  console.log();

  // Create engine and orchestrator
  const engine = new PaperEngine();
  const orchestrator = new InstanceOrchestrator(engine);

  // Create instances from config
  const instances: StrategyInstance[] = [];
  for (const instanceConfig of Object.values(instanceConfigs)) {
    const instance = new StrategyInstance(instanceConfig);
    instances.push(instance);
    orchestrator.registerInstance(instance);
    console.log(`Registered instance: ${instance.instanceId} (${instance.symbol})`);
  }
  console.log();

  try {
    // Initialize historical data for each instance (needed for indicator calculation)
    const instanceState = new Map<string, {
      fetcher: DataFetcher;
      htfKlines: Kline[];
      ltfKlines: Kline[];
      lastLtfBarTime: number;
      lastHtfBarTime: number;
    }>();

    // Fetch initial historical data for each instance using data service
    for (const instance of instances) {
      console.log(`[${instance.instanceId}] Initializing historical data...`);

      const config = instance.config;
      const fetcher = new DataFetcher(
        config.exchange.baseUrl,
        config.cache.enabled,
        config.cache.directory
      );

      // Use data service to prepare paper trading data
      const { htfKlines, ltfKlines } = await preparePaperTradingData(instance);
      
      console.log(`[${instance.instanceId}] Fetched ${htfKlines.length} ${config.timeframe.trend} klines`);
      console.log(`[${instance.instanceId}] Fetched ${ltfKlines.length} ${config.timeframe.signal} klines`);

      // Get the last bar times
      const lastLtfBar = ltfKlines[ltfKlines.length - 1];
      const lastHtfBar = htfKlines[htfKlines.length - 1];

      instanceState.set(instance.instanceId, {
        fetcher,
        htfKlines,
        ltfKlines,
        lastLtfBarTime: lastLtfBar.openTime,
        lastHtfBarTime: lastHtfBar.openTime,
      });
    }

    console.log();
    console.log("Paper trading started. Monitoring for new bars...");
    console.log("Press Ctrl+C to stop.");
    console.log();

    // Main loop: check for new bars periodically
    const checkIntervalMs = 60000; // Check every minute
    let iteration = 0;

    while (true) {
      iteration++;
      
      // Check each instance for new bars
      for (const instance of instances) {
        const state = instanceState.get(instance.instanceId);
        if (!state) continue;

        const config = instance.config;
        
        try {
          // Fetch latest LTF klines (only need last few bars)
          const latestLtfKlines = await state.fetcher.fetchKlines(
            config.exchange.symbol,
            config.timeframe.signal,
            5 // Only need last 5 bars to check for new one
          );

          if (latestLtfKlines.length === 0) continue;

          const latestLtfBar = latestLtfKlines[latestLtfKlines.length - 1];

          // Check if we have a new LTF bar
          if (latestLtfBar.openTime > state.lastLtfBarTime) {
            console.log(`[${instance.instanceId}] New ${config.timeframe.signal} bar detected at ${new Date(latestLtfBar.openTime).toISOString()}`);

            // Update LTF klines
            state.ltfKlines.push(latestLtfBar);
            // Keep only last 200 bars
            if (state.ltfKlines.length > 200) {
              state.ltfKlines.shift();
            }
            state.lastLtfBarTime = latestLtfBar.openTime;

            // Fetch latest HTF klines
            const latestHtfKlines = await state.fetcher.fetchKlines(
              config.exchange.symbol,
              config.timeframe.trend,
              5
            );

            if (latestHtfKlines.length > 0) {
              const latestHtfBar = latestHtfKlines[latestHtfKlines.length - 1];
              
              // Update HTF klines if new bar exists
              if (latestHtfBar.openTime > state.lastHtfBarTime) {
                state.htfKlines.push(latestHtfBar);
                if (state.htfKlines.length > 200) {
                  state.htfKlines.shift();
                }
                state.lastHtfBarTime = latestHtfBar.openTime;
              }
            }

            // Calculate indicators
            const { buildHTFIndicators, buildLTFIndicators } = await import("./indicators/indicators");
            const htfIndicators = buildHTFIndicators(state.htfKlines, config.indicators);
            const ltfIndicators = buildLTFIndicators(state.ltfKlines, config.indicators, config.strategy.lookbackPeriod);

            // Map HTF indicator to current LTF bar using time alignment service
            const htfIndicator = findHTFIndicatorForLTFBar(
              latestLtfBar,
              state.htfKlines,
              htfIndicators
            );

            const ltfIndicator = ltfIndicators[ltfIndicators.length - 1];

            // Execute strategy for this instance
            await orchestrator.executeInstance(
              instance.instanceId,
              latestLtfBar,
              htfIndicator,
              ltfIndicator
            );
          }
        } catch (error: any) {
          console.error(`[${instance.instanceId}] Error checking for new bars:`, error.message);
          // Continue with other instances
        }
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
  } catch (error: any) {
    console.error("Paper trading failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}


// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

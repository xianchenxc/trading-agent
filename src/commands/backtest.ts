/**
 * Backtest command: multi-instance backtest with data validation and report export
 */

import { BacktestEngine } from "../engine/backtestEngine";
import { InstanceOrchestrator } from "../instance/instanceOrchestrator";
import { StrategyInstance } from "../instance/strategyInstance";
import { instanceConfigs } from "../config/instanceConfig";
import { prepareBacktestData } from "../services/dataService";
import { alignHTFIndicatorsToLTF } from "../services/timeAlignmentService";
import { validateBacktest } from "../services/backtestValidationService";
import {
  generateDetailedReport,
  formatReportAsText,
  exportReportToJSON,
  exportReportToCSV,
} from "../services/backtestReportService";
import { Kline, HTFIndicatorData } from "../types";
import { logInfo, logWarn, logError } from "../utils/logger";

/**
 * Run multi-instance backtest: fetch data, validate, run backtest loop, display and export results
 */
export async function runBacktest(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Trading Agent - Multi-Instance Backtest Mode");
  console.log("=".repeat(60));
  console.log(`Instances: ${Object.keys(instanceConfigs).length}`);
  console.log("=".repeat(60));
  console.log();

  const engine = new BacktestEngine();
  const orchestrator = new InstanceOrchestrator(engine);

  const instances: StrategyInstance[] = [];
  for (const instanceConfig of Object.values(instanceConfigs)) {
    const instance = new StrategyInstance(instanceConfig);
    instances.push(instance);
    orchestrator.registerInstance(instance);
    console.log(`Registered instance: ${instance.instanceId} (${instance.symbol})`);
  }
  console.log();

  try {
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

    console.log(`Fetching data for ${instances.length} instances in parallel...`);
    const dataPromises = instances.map(async (instance) => {
      console.log(`[${instance.instanceId}] Fetching data...`);

      const data = await prepareBacktestData(instance.instanceId, instance.symbol, instance.config);

      console.log(`[${instance.instanceId}] Fetched ${data.htfKlines.length} ${instance.config.timeframe.trend} klines`);
      console.log(`[${instance.instanceId}] Fetched ${data.ltfKlines.length} ${instance.config.timeframe.signal} klines`);

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

    const dataResults = await Promise.all(dataPromises);

    for (const result of dataResults) {
      instanceData.set(result.instanceId, result.data);
      instanceRawData.set(result.instanceId, result.rawData);
    }

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

    await orchestrator.runBacktest(instanceData);

    console.log();
    console.log("=".repeat(60));
    console.log("Backtest Results Summary");
    console.log("=".repeat(60));
    console.log();

    const allResults = orchestrator.getAllResults();
    for (const [instanceId, results] of allResults) {
      const instance = instances.find((i) => i.instanceId === instanceId);
      const config = instance?.config;
      if (!config) continue;

      const totalReturnPercent =
        ((results.finalEquity - config.account.initialCapital) / config.account.initialCapital) * 100;
      const winningTrades = results.trades.filter((t) => t.pnl > 0).length;
      const losingTrades = results.trades.filter((t) => t.pnl < 0).length;
      const avgWin =
        winningTrades > 0
          ? results.trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades
          : 0;
      const avgLoss =
        losingTrades > 0
          ? Math.abs(results.trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades)
          : 0;
      const maxDrawdownPercent = (results.stats.maxDrawdown / config.account.initialCapital) * 100;

      console.log(`[${instanceId}]`);
      console.log(`  Symbol: ${instance?.symbol}`);
      console.log(
        `  Total Return: $${(results.finalEquity - config.account.initialCapital).toFixed(2)} (${totalReturnPercent.toFixed(2)}%)`
      );
      console.log(`  Final Equity: $${results.finalEquity.toFixed(2)}`);
      console.log(`  Max Drawdown: $${results.stats.maxDrawdown.toFixed(2)} (${maxDrawdownPercent.toFixed(2)}%)`);
      console.log(`  Total Trades: ${results.stats.totalTrades}`);
      console.log(`  Win Rate: ${results.stats.winRate.toFixed(2)}%`);
      console.log(`  Profit Factor: ${results.stats.profitFactor.toFixed(2)}`);
      console.log(`  Average Win: $${avgWin.toFixed(2)}`);
      console.log(`  Average Loss: $${avgLoss.toFixed(2)}`);
      console.log();

      const detailedReport = generateDetailedReport(instanceId, results);
      console.log(formatReportAsText(detailedReport));

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
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

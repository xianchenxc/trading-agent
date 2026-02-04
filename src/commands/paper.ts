/**
 * Paper trading command: simulated live trading with real-time data, no real orders
 */

import { PaperEngine } from "../engine/paperEngine";
import { InstanceOrchestrator } from "../instance/instanceOrchestrator";
import { StrategyInstance } from "../instance/strategyInstance";
import { instanceConfigs } from "../config/instanceConfig";
import {
  preparePaperTradingData,
  checkNewBarAndPrepareBarData,
  PaperTradingInstanceState,
} from "../services/dataService";
import { DataFetcher } from "../data/fetcher";
import { globalConfig } from "../config/globalConfig";

/**
 * Run paper trading: init historical data per instance, then poll for new bars and execute strategy
 */
export async function runPaperTrading(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Trading Agent - Paper Trading Mode");
  console.log("=".repeat(60));
  console.log(`Instances: ${Object.keys(instanceConfigs).length}`);
  console.log("=".repeat(60));
  console.log();

  const engine = new PaperEngine();
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
    const instanceState = new Map<string, PaperTradingInstanceState>();

    for (const instance of instances) {
      console.log(`[${instance.instanceId}] Initializing historical data...`);

      const fetcher = new DataFetcher(
        globalConfig.exchange.baseUrl,
        globalConfig.cache.enabled,
        globalConfig.cache.directory
      );

      const { htfKlines, ltfKlines } = await preparePaperTradingData(instance.instanceId, instance.symbol, instance.config);
      const config = instance.config;
      console.log(`[${instance.instanceId}] Fetched ${htfKlines.length} ${config.timeframe.trend} klines`);
      console.log(`[${instance.instanceId}] Fetched ${ltfKlines.length} ${config.timeframe.signal} klines`);

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

    const checkIntervalMs = 60000;

    while (true) {
      for (const instance of instances) {
        const state = instanceState.get(instance.instanceId);
        if (!state) continue;

        try {
          const barData = await checkNewBarAndPrepareBarData(instance.instanceId, instance.symbol, instance.config, state);
          if (barData) {
            console.log(
              `[${instance.instanceId}] New ${instance.config.timeframe.signal} bar at ${new Date(barData.bar.openTime).toISOString()}`
            );
            await orchestrator.executeInstance(
              instance.instanceId,
              barData.bar,
              barData.htfIndicator,
              barData.ltfIndicator
            );
          }
        } catch (error: any) {
          console.error(`[${instance.instanceId}] Error checking for new bars:`, error.message);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  } catch (error: any) {
    console.error("Paper trading failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

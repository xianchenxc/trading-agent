import { StrategyInstance } from './strategyInstance';
import { StrategyInstanceRunner } from './strategyInstanceRunner';
import { IEngine } from '../engine/IEngine';
import { Kline, HTFIndicatorData, LTFIndicatorData, BacktestResult } from '../types';
import { logError } from '../utils/logger';

export interface InstanceBarData {
  instanceId: string;
  bar: Kline;
  htfIndicator: HTFIndicatorData;
  ltfIndicator: LTFIndicatorData;
}

export class InstanceOrchestrator {
  private instances: Map<string, StrategyInstance> = new Map();
  private runners: Map<string, StrategyInstanceRunner> = new Map();
  private engine: IEngine;
  
  constructor(engine: IEngine) {
    this.engine = engine;
  }
  
  /**
   * Register a strategy instance
   */
  registerInstance(instance: StrategyInstance): void {
    this.instances.set(instance.instanceId, instance);
    this.runners.set(
      instance.instanceId,
      new StrategyInstanceRunner(instance, this.engine)
    );
  }
  
  /**
   * Execute onBar for a specific instance
   */
  async executeInstance(
    instanceId: string,
    bar: Kline,
    htfIndicator: HTFIndicatorData,
    ltfIndicator: LTFIndicatorData
  ): Promise<void> {
    const runner = this.runners.get(instanceId);
    if (!runner) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    await runner.onBar(bar, htfIndicator, ltfIndicator);
  }
  
  /**
   * Execute onBar for all instances (parallel)
   * Each instance's errors are handled independently to prevent one instance's failure
   * from affecting others.
   */
  async executeAllInstances(barData: InstanceBarData[]): Promise<void> {
    const promises = barData.map(async (data) => {
      try {
        await this.executeInstance(data.instanceId, data.bar, data.htfIndicator, data.ltfIndicator);
      } catch (error: any) {
        logError(
          `Error executing onBar: ${error.message}`,
          { stack: error.stack },
          data.instanceId
        );
        // Continue execution for other instances - don't throw
      }
    });
    await Promise.allSettled(promises);
  }
  
  /**
   * Get instance results
   */
  getInstanceResults(instanceId: string): BacktestResult | null {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;
    return instance.getLogger().getResults();
  }
  
  /**
   * Get all instance results
   */
  getAllResults(): Map<string, BacktestResult> {
    const results = new Map<string, BacktestResult>();
    for (const [instanceId, instance] of this.instances) {
      results.set(instanceId, instance.getLogger().getResults());
    }
    return results;
  }
  
  /**
   * Run backtest for all registered instances
   * This method coordinates the backtest loop across all instances
   */
  async runBacktest(
    instanceData: Map<string, {
      ltfKlines: Kline[];
      htfIndicators: HTFIndicatorData[];
      ltfIndicators: LTFIndicatorData[];
    }>
  ): Promise<void> {
    // Build unified time axis from all instances' LTF bars
    const allTimes = new Set<number>();
    for (const { ltfKlines } of instanceData.values()) {
      for (const bar of ltfKlines) {
        allTimes.add(bar.openTime);
      }
    }
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
    
    // For each time point, execute all instances that have data
    for (const time of sortedTimes) {
      const barData: InstanceBarData[] = [];
      
      for (const [instanceId, { ltfKlines, htfIndicators, ltfIndicators }] of instanceData) {
        // Find the bar at this time point
        const barIndex = ltfKlines.findIndex(b => b.openTime === time);
        if (barIndex === -1) continue; // This instance doesn't have data at this time
        
        barData.push({
          instanceId,
          bar: ltfKlines[barIndex],
          htfIndicator: htfIndicators[barIndex],
          ltfIndicator: ltfIndicators[barIndex],
        });
      }
      
      // Execute all instances in parallel for this time point
      if (barData.length > 0) {
        await this.executeAllInstances(barData);
      }
    }
  }
}

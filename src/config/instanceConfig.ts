import { Config } from './config';
import { StrategyInstanceConfig } from '../instance/strategyInstance';
import { globalConfig } from './globalConfig';

/**
 * Config Registry: 集中管理所有实例配置
 * 新增策略实例 = 新增一份配置
 */
export interface InstanceConfigRegistry {
  [instanceId: string]: StrategyInstanceConfig;
}

/**
 * 示例：定义多个策略实例配置
 */
export const instanceConfigs: InstanceConfigRegistry = {
  "BTCUSDT_TREND_V1": {
    instanceId: "BTCUSDT_TREND_V1",
    strategyName: "trendStrategy",
    symbol: "BTCUSDT",
      config: {
      timeframe: { trend: "4h", signal: "1h" },
      indicators: { 
        ema: { short: 20, medium: 50, long: 200 }, 
        atr: { period: 14 }, 
        adx: { period: 14 } 
      },
      strategy: { lookbackPeriod: 20 },
      risk: { 
        maxRiskPerTrade: 0.01, 
        initialStopPct: 0.01, 
        breakEvenR: 1.0, 
        trailingActivationR: 2.0,
        trendExhaustADX: 20,
        trendExhaustBars: 3,
        profitLockR: 4.0,
      },
      account: { initialCapital: 10000 },
      execution: { commissionRate: 0.001, slippageRate: 0.0005 },
      backtest: { 
        startDate: "2025-01-01", 
        endDate: "2026-02-08" 
      },
    },
  },
  // "ETHUSDT_TREND_V1": {
  //   instanceId: "ETHUSDT_TREND_V1",
  //   strategyName: "trendStrategy",
  //   symbol: "ETHUSDT",
  //   config: {
  //     exchange: { baseUrl: "https://api.binance.com", symbol: "ETHUSDT" },
  //     timeframe: { trend: "4h", signal: "1h" },
  //     indicators: { 
  //       ema: { short: 20, medium: 50, long: 200 }, 
  //       atr: { period: 14 }, 
  //       adx: { period: 14 } 
  //     },
  //     strategy: { lookbackPeriod: 20 },
  //     risk: { 
  //       maxRiskPerTrade: 0.01, 
  //       initialStopPct: 0.01, 
  //       breakEvenR: 1.0, 
  //       trailingActivationR: 2.0,
  //       trendExhaustADX: 20,
  //       trendExhaustBars: 3,
  //       profitLockR: 4.0,
  //     },
  //     backtest: { 
  //       initialCapital: 10000, 
  //       commissionRate: 0.001, 
  //       slippageRate: 0.0005, 
  //       startDate: "2025-01-01", 
  //       endDate: "2026-01-01" 
  //     },
  //     cache: { enabled: true, directory: "data/cache" },
  //   },
  // },
};

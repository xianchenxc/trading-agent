/**
 * Configuration file for trading agent
 * All key parameters are centralized here
 */

export interface Config {
  // Exchange settings
  exchange: {
    name: string;
    baseUrl: string;
    symbol: string; // e.g., "BTCUSDT"
  };

  // Strategy parameters
  strategy: {
    trendTimeframe: string; // "4h" for trend detection
    signalTimeframe: string; // "1h" for entry signals
    lookbackPeriod: number; // N=20 for breakout detection
    emaShort: number; // EMA20 for 1h
    emaMedium: number; // EMA50 for both timeframes
    emaLong: number; // EMA200 for 4h trend
    atrPeriod: number; // ATR period (default 14)
    stopLossMultiplier: number; // 1.5 × ATR
    takeProfitMultiplier: number; // 2.5 × ATR for trailing stop
    maxHoldBars: number; // 50 bars for forced exit
  };

  // Risk management
  risk: {
    maxRiskPerTrade: number; // 1% of account equity
    maxPositionCount: number; // 1 position at a time
    maxConsecutiveLosses: number; // 3 losses
    cooldownHours: number; // 24 hours after max losses
  };

  // Backtest settings
  backtest: {
    initialCapital: number;
    commissionRate: number; // e.g., 0.001 (0.1%)
    slippageRate: number; // e.g., 0.0005 (0.05%)
  };
}

export const defaultConfig: Config = {
  exchange: {
    name: "Binance",
    baseUrl: "https://api.binance.com",
    symbol: "BTCUSDT",
  },
  strategy: {
    trendTimeframe: "4h",
    signalTimeframe: "1h",
    lookbackPeriod: 20,
    emaShort: 20,
    emaMedium: 50,
    emaLong: 200,
    atrPeriod: 14,
    stopLossMultiplier: 1.5,
    takeProfitMultiplier: 2.5,
    maxHoldBars: 50,
  },
  risk: {
    maxRiskPerTrade: 0.01, // 1%
    maxPositionCount: 1,
    maxConsecutiveLosses: 3,
    cooldownHours: 24,
  },
  backtest: {
    initialCapital: 10000,
    commissionRate: 0.001, // 0.1%
    slippageRate: 0.0005, // 0.05%
  },
};

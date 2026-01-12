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

  // Timeframe definition
  timeframe: {
    trend: string;  // e.g. "4h"  -> market regime / trend
    signal: string; // e.g. "1h"  -> entry & exit
  };

  // Indicator parameters (PURE math, no strategy meaning)
  indicators: {
    ema: {
      short: number;   // e.g. 20
      medium: number;  // e.g. 50
      long: number;    // e.g. 200
    };
    atr: {
      period: number;  // e.g. 14
    };
    adx: {
      period: number;  // e.g. 14 (strict Wilder)
    };
  };

  // Strategy logic parameters (decision thresholds)
  strategy: {
    lookbackPeriod: number; // N bars for breakout / structure

    trend: {
      minAdx: number;              // e.g. 20
      minEmaDistanceRatio: number; // e.g. 0.005 (0.5%)
    };

    stopLoss: {
      atrMultiplier: number; // e.g. 1.5 × ATR
    };

    trailingStop: {
      activationR: number; // e.g. 1.5R
      atrMultiplier: number; // e.g. 2.5 × ATR
    };
  };

  // Risk management
  risk: {
    maxRiskPerTrade: number;      // e.g. 0.01 (1%)
    maxPositionCount: number;     // e.g. 1
    maxConsecutiveLosses: number; // e.g. 3
    cooldownHours: number;        // e.g. 24
  };

  // Backtest settings
  backtest: {
    initialCapital: number;
    commissionRate: number; // e.g. 0.001 (0.1%)
    slippageRate: number;   // e.g. 0.0005 (0.05%)
  };

  // Data cache settings
  cache: {
    enabled: boolean;        // Enable/disable cache
    directory: string;       // Cache directory path
  };
}

export const defaultConfig: Config = {
  exchange: {
    name: "Binance",
    baseUrl: "https://api.binance.com",
    symbol: "BTCUSDT",
  },

  timeframe: {
    trend: "4h",
    signal: "1h",
  },

  
  indicators: {
    ema: {
      short: 20,
      medium: 50,
      long: 200,
    },
    atr: {
      period: 14,
    },
    adx: {
      period: 14,
    },
  },

  strategy: {
    lookbackPeriod: 20,

    trend: {
      minAdx: 20,                  // 趋势启动阈值
      minEmaDistanceRatio: 0.005,  // 0.5% EMA 拉开距离
    },

    stopLoss: {
      atrMultiplier: 1.5,
    },

    trailingStop: {
      activationR: 1.5,
      atrMultiplier: 2.5,
    },
  },

  risk: {
    maxRiskPerTrade: 0.01, // 1%
    maxPositionCount: 1,
    maxConsecutiveLosses: 3,
    cooldownHours: 24,
  },

  backtest: {
    initialCapital: 10_000,
    commissionRate: 0.001, // 0.1%
    slippageRate: 0.0005,  // 0.05%
  },

  cache: {
    enabled: true,
    directory: "data/cache",
  },
};

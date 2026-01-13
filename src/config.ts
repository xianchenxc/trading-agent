/**
 * Configuration file for trading agent
 * All key parameters are centralized here
 */

export interface Config {
  // Exchange settings
  exchange: {
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

    stopLoss: {
      fixedPercent: number; // e.g. 0.01 (1% fixed stop loss)
    };

    trailingStop: {
      activationR: number; // e.g. 1.0 (activate at +1R)
    };
  };

  // Risk management
  risk: {
    maxRiskPerTrade: number;      // e.g. 0.01 (1%)
  };

  // Backtest settings
  backtest: {
    initialCapital: number;
    commissionRate: number; // e.g. 0.001 (0.1%)
    slippageRate: number;   // e.g. 0.0005 (0.05%)
    startDate: string;      // Start date for backtest (ISO date string, e.g. "2024-01-01")
    endDate: string;        // End date for backtest (ISO date string, e.g. "2024-12-31")
  };

  // Data cache settings
  cache: {
    enabled: boolean;        // Enable/disable cache
    directory: string;       // Cache directory path
  };
}

export const defaultConfig: Config = {
  exchange: {
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

    stopLoss: {
      fixedPercent: 0.01, // 1% fixed stop loss
    },

    trailingStop: {
      activationR: 1.0, // Activate trailing stop at +1R
    },
  },

  risk: {
    maxRiskPerTrade: 0.01, // 1%
  },

  backtest: {
    initialCapital: 10_000,
    commissionRate: 0.001, // 0.1%
    slippageRate: 0.0005,  // 0.05%
    startDate: "2025-01-01", // Start date (ISO date string)
    endDate: "2026-01-01",   // End date (ISO date string)
  },

  cache: {
    enabled: true,
    directory: "data/cache",
  },
};

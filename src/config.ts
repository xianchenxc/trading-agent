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
  };

  // Risk management
  risk: {
    maxRiskPerTrade: number;      // e.g. 0.01 (1%)
    initialStopPct: number;       // e.g. 0.01 (1%)
    breakEvenR: number;           // e.g. 1.0 (move to break-even at +1R)
    trailingActivationR: number;   // e.g. 2.0 (activate trailing stop at +2R)
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
    symbol: "ETHUSDT",
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
  },

  risk: {
    maxRiskPerTrade: 0.01, // 1%
    initialStopPct: 0.01, // 1% initial stop loss
    breakEvenR: 1.0, // Move to break-even at +1R
    trailingActivationR: 2.0, // Activate trailing stop at +2R (v4: Delayed Trailing Stop)
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

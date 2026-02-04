/**
 * Configuration file for trading agent
 * Instance-specific configuration (strategy + runtime)
 * Global infrastructure config is in globalConfig.ts
 */

/**
 * Strategy configuration (per-instance)
 * Parameters that define trading strategy behavior
 */
export interface StrategyConfig {
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
    // v5: Trend exhaustion filter
    trendExhaustADX?: number;     // e.g. 20 (ADX threshold for trend exhaustion)
    trendExhaustBars?: number;    // e.g. 3 (number of consecutive declining bars)
    profitLockR?: number;         // e.g. 4.0 (switch to EMA50 trailing at +4R, optional)
  };
}

/**
 * Runtime configuration (per-instance)
 * Parameters for execution and account management
 */
export interface RuntimeConfig {
  // Account configuration (all modes)
  account: {
    initialCapital: number;  // Initial capital for backtest/paper/live (used for relative return calculation)
  };

  // Execution configuration (backtest/paper/live)
  execution: {
    commissionRate: number;  // Commission rate (fixed for all modes, e.g. 0.001 = 0.1%)
    slippageRate: number;   // Slippage rate (only used in backtest/paper, live uses real execution price)
  };

  // Backtest-specific settings (optional, only needed for backtest mode)
  backtest?: {
    startDate: string;      // Start date for backtest (ISO date string, e.g. "2024-01-01")
    endDate: string;        // End date for backtest (ISO date string, e.g. "2024-12-31")
  };
}

/**
 * Complete instance configuration
 * Combines strategy and runtime configuration
 */
export interface Config extends StrategyConfig, RuntimeConfig {}

export const defaultConfig: Config = {
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
    // v5: Trend exhaustion filter
    trendExhaustADX: 20, // ADX threshold for trend exhaustion
    trendExhaustBars: 3, // Number of consecutive declining ADX bars
    profitLockR: 4.0, // Switch to EMA50 trailing at +4R (optional, can be undefined to disable)
  },

  account: {
    initialCapital: 10_000, // Initial capital for all modes
  },

  execution: {
    commissionRate: 0.001, // 0.1% (fixed for all modes)
    slippageRate: 0.0005,  // 0.05% (only used in backtest/paper, live uses real execution price)
  },

  backtest: {
    startDate: "2025-01-01", // Start date (ISO date string)
    endDate: "2026-01-01",   // End date (ISO date string)
  },
};

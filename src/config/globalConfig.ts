/**
 * Global configuration shared across all instances
 * Infrastructure settings that don't vary per instance
 */

export interface GlobalConfig {
  // Exchange infrastructure (shared across all instances)
  exchange: {
    baseUrl: string; // e.g., "https://api.binance.com"
  };

  // Cache infrastructure (shared across all instances)
  cache: {
    enabled: boolean;        // Enable/disable cache
    directory: string;       // Cache directory path
  };
}

export const globalConfig: GlobalConfig = {
  exchange: {
    baseUrl: "https://api.binance.com",
  },
  cache: {
    enabled: true,
    directory: "data/cache",
  },
};

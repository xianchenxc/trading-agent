/**
 * Data Service
 * Handles data fetching and indicator calculation for instances
 */

import { DataFetcher } from '../data/fetcher';
import { StrategyInstance } from '../instance/strategyInstance';
import { Kline, HTFIndicatorData, LTFIndicatorData } from '../types';
import { getIntervalMs } from '../utils/timeUtils';

export interface InstanceData {
  ltfKlines: Kline[];
  htfKlines: Kline[];
  htfIndicators: HTFIndicatorData[];
  ltfIndicators: LTFIndicatorData[];
}

export interface InstanceHistoricalData {
  ltfKlines: Kline[];
  htfKlines: Kline[];
  htfIndicators: HTFIndicatorData[];
  ltfIndicators: LTFIndicatorData[];
}

/**
 * Fetch and prepare data for backtest mode
 */
export async function prepareBacktestData(
  instance: StrategyInstance
): Promise<InstanceHistoricalData> {
  const config = instance.config;
  const fetcher = new DataFetcher(
    config.exchange.baseUrl,
    config.cache.enabled,
    config.cache.directory
  );

  // Parse dates
  const startDate = new Date(config.backtest.startDate);
  const endDate = new Date(config.backtest.endDate);
  
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid startDate: ${config.backtest.startDate}`);
  }
  if (isNaN(endDate.getTime())) {
    throw new Error(`Invalid endDate: ${config.backtest.endDate}`);
  }
  
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  
  if (startTime >= endTime) {
    throw new Error(`startDate (${config.backtest.startDate}) must be before endDate (${config.backtest.endDate})`);
  }

  // Fetch HTF klines with one extra period before startTime so the first LTF bars
  // have a closed HTF bar (e.g. 1h bars at 16:00–19:00 need 4h bar that closed at 16:00)
  const htfPeriodMs = getIntervalMs(config.timeframe.trend);
  const htfStartTime = Math.max(0, startTime - htfPeriodMs);

  const htfKlines = await fetcher.fetchKlinesForBacktest(
    config.exchange.symbol,
    config.timeframe.trend,
    htfStartTime,
    endTime
  );

  const ltfKlines = await fetcher.fetchKlinesForBacktest(
    config.exchange.symbol,
    config.timeframe.signal,
    startTime,
    endTime
  );

  if (htfKlines.length === 0 || ltfKlines.length === 0) {
    throw new Error(`[${instance.instanceId}] No historical data fetched`);
  }

  // Calculate indicators
  const { buildHTFIndicators, buildLTFIndicators } = await import('../indicators/indicators');
  const htfIndicators = buildHTFIndicators(htfKlines, config.indicators);
  const ltfIndicators = buildLTFIndicators(ltfKlines, config.indicators, config.strategy.lookbackPeriod);

  return {
    ltfKlines,
    htfKlines,
    htfIndicators,
    ltfIndicators,
  };
}

/**
 * Fetch initial historical data for paper trading mode
 */
export async function preparePaperTradingData(
  instance: StrategyInstance
): Promise<InstanceData> {
  const config = instance.config;
  const fetcher = new DataFetcher(
    config.exchange.baseUrl,
    config.cache.enabled,
    config.cache.directory
  );

  // Fetch HTF klines (need enough history for indicators, e.g., 200 bars)
  const htfKlines = await fetcher.fetchKlines(
    config.exchange.symbol,
    config.timeframe.trend,
    200
  );

  // Fetch LTF klines
  const ltfKlines = await fetcher.fetchKlines(
    config.exchange.symbol,
    config.timeframe.signal,
    200
  );

  if (htfKlines.length === 0 || ltfKlines.length === 0) {
    throw new Error(`[${instance.instanceId}] No historical data fetched`);
  }

  // Calculate indicators
  const { buildHTFIndicators, buildLTFIndicators } = await import('../indicators/indicators');
  const htfIndicators = buildHTFIndicators(htfKlines, config.indicators);
  const ltfIndicators = buildLTFIndicators(ltfKlines, config.indicators, config.strategy.lookbackPeriod);

  return {
    ltfKlines,
    htfKlines,
    htfIndicators,
    ltfIndicators,
  };
}

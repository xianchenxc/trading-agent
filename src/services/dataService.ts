/**
 * Data Service
 * Handles data fetching and indicator calculation for instances
 */

import { DataFetcher } from '../data/fetcher';
import { Config } from '../config/config';
import { Kline, HTFIndicatorData, LTFIndicatorData } from '../types';
import { getIntervalMs } from '../utils/timeUtils';
import { findHTFIndicatorForLTFBar } from './timeAlignmentService';
import { globalConfig } from '../config/globalConfig';

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
  instanceId: string,
  symbol: string,
  config: Config
): Promise<InstanceHistoricalData> {
  if (!config.backtest) {
    throw new Error(`[${instanceId}] backtest config is required for backtest mode`);
  }

  const fetcher = new DataFetcher(
    globalConfig.exchange.baseUrl,
    globalConfig.cache.enabled,
    globalConfig.cache.directory
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
    symbol,
    config.timeframe.trend,
    htfStartTime,
    endTime
  );

  const ltfKlines = await fetcher.fetchKlinesForBacktest(
    symbol,
    config.timeframe.signal,
    startTime,
    endTime
  );

  if (htfKlines.length === 0 || ltfKlines.length === 0) {
    throw new Error(`[${instanceId}] No historical data fetched`);
  }

  // Calculate indicators
  const { buildHTFIndicators, buildLTFIndicators } = await import('../data/indicators');
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
  instanceId: string,
  symbol: string,
  config: Config
): Promise<InstanceData> {
  const fetcher = new DataFetcher(
    globalConfig.exchange.baseUrl,
    globalConfig.cache.enabled,
    globalConfig.cache.directory
  );

  // Fetch HTF klines (need enough history for indicators, e.g., 200 bars)
  const htfKlines = await fetcher.fetchKlines(
    symbol,
    config.timeframe.trend,
    200
  );

  // Fetch LTF klines
  const ltfKlines = await fetcher.fetchKlines(
    symbol,
    config.timeframe.signal,
    200
  );

  if (htfKlines.length === 0 || ltfKlines.length === 0) {
    throw new Error(`[${instanceId}] No historical data fetched`);
  }

  // Calculate indicators
  const { buildHTFIndicators, buildLTFIndicators } = await import('../data/indicators');
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
 * Mutable state for paper trading: kline buffers and last bar times per instance.
 * Updated in place by checkNewBarAndPrepareBarData when a new bar is found.
 */
export interface PaperTradingInstanceState {
  fetcher: DataFetcher;
  htfKlines: Kline[];
  ltfKlines: Kline[];
  lastLtfBarTime: number;
  lastHtfBarTime: number;
}

const PAPER_MAX_KLINES = 200;
const PAPER_FETCH_TAIL = 5;

/**
 * Check for a new LTF bar; if found, update state and return bar + indicators for execution.
 * Performs data fetch, indicator calculation, and HTF alignment in one place so index stays orchestration-only.
 * @returns Bar data for onBar, or null if no new bar
 */
export async function checkNewBarAndPrepareBarData(
  instanceId: string,
  symbol: string,
  config: Config,
  state: PaperTradingInstanceState
): Promise<{ bar: Kline; htfIndicator: HTFIndicatorData; ltfIndicator: LTFIndicatorData } | null> {
  const latestLtfKlines = await state.fetcher.fetchKlines(
    symbol,
    config.timeframe.signal,
    PAPER_FETCH_TAIL
  );
  if (latestLtfKlines.length === 0) return null;

  const latestLtfBar = latestLtfKlines[latestLtfKlines.length - 1];
  if (latestLtfBar.openTime <= state.lastLtfBarTime) return null;

  // Update LTF state
  state.ltfKlines.push(latestLtfBar);
  if (state.ltfKlines.length > PAPER_MAX_KLINES) state.ltfKlines.shift();
  state.lastLtfBarTime = latestLtfBar.openTime;

  // Fetch and update HTF if new bar exists
  const latestHtfKlines = await state.fetcher.fetchKlines(
    symbol,
    config.timeframe.trend,
    PAPER_FETCH_TAIL
  );
  if (latestHtfKlines.length > 0) {
    const latestHtfBar = latestHtfKlines[latestHtfKlines.length - 1];
    if (latestHtfBar.openTime > state.lastHtfBarTime) {
      state.htfKlines.push(latestHtfBar);
      if (state.htfKlines.length > PAPER_MAX_KLINES) state.htfKlines.shift();
      state.lastHtfBarTime = latestHtfBar.openTime;
    }
  }

  const { buildHTFIndicators, buildLTFIndicators } = await import('../data/indicators');
  const htfIndicators = buildHTFIndicators(state.htfKlines, config.indicators);
  const ltfIndicators = buildLTFIndicators(state.ltfKlines, config.indicators, config.strategy.lookbackPeriod);

  const htfIndicator = findHTFIndicatorForLTFBar(latestLtfBar, state.htfKlines, htfIndicators);
  const ltfIndicator = ltfIndicators[ltfIndicators.length - 1];

  return { bar: latestLtfBar, htfIndicator, ltfIndicator };
}

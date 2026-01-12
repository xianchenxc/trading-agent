/**
 * K-line data fetcher
 * Supports both real-time and historical data from Binance
 * Includes local cache to reduce API requests
 */

import axios from "axios";
import { Kline } from "../types";
import { DataCache } from "./cache";

export class DataFetcher {
  private baseUrl: string;
  private cache: DataCache;
  private useCache: boolean;

  constructor(
    baseUrl: string = "https://api.binance.com",
    useCache: boolean = true,
    cacheDir?: string
  ) {
    this.baseUrl = baseUrl;
    this.useCache = useCache;
    this.cache = new DataCache(cacheDir);
  }

  /**
   * Fetch historical klines from Binance
   * @param symbol Trading pair (e.g., "BTCUSDT")
   * @param interval Timeframe (e.g., "1h", "4h")
   * @param limit Number of candles to fetch (max 1000)
   * @param endTime Optional end timestamp in ms
   */
  async fetchKlines(
    symbol: string,
    interval: string,
    limit: number = 500,
    endTime?: number
  ): Promise<Kline[]> {
    try {
      const params: any = {
        symbol,
        interval,
        limit,
      };

      if (endTime) {
        params.endTime = endTime;
      }

      const response = await axios.get(`${this.baseUrl}/api/v3/klines`, {
        params,
      });

      return response.data.map((k: any[]) => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        quoteVolume: parseFloat(k[7]),
        trades: k[8],
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch klines: ${error.message}`);
    }
  }

  /**
   * Fetch klines for backtesting
   * Uses cache to reduce API requests - only fetches missing data
   */
  async fetchKlinesForBacktest(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<Kline[]> {
    // Try to load from cache first
    if (this.useCache) {
      const cachedKlines = this.cache.getCachedKlines(
        symbol,
        interval,
        startTime,
        endTime
      );

      // Check if we have complete coverage
      const gaps = this.cache.findGaps(symbol, interval, startTime, endTime);

      if (gaps.length === 0 && cachedKlines.length > 0) {
        // Cache hit - return cached data
        console.log(
          `Cache hit: ${cachedKlines.length} ${interval} klines for ${symbol}`
        );
        return cachedKlines;
      }

      // Partial cache hit - fetch missing gaps
      if (cachedKlines.length > 0) {
        console.log(
          `Partial cache: ${cachedKlines.length} cached, fetching ${gaps.length} gap(s)`
        );
      } else {
        console.log(`Cache miss: fetching data for ${symbol} ${interval}`);
      }

      // Fetch missing data for each gap
      const fetchedKlines: Kline[] = [];
      for (const [gapStart, gapEnd] of gaps) {
        const gapData = await this.fetchKlinesFromAPI(
          symbol,
          interval,
          gapStart,
          gapEnd
        );
        fetchedKlines.push(...gapData);

        // Save fetched data to cache
        if (gapData.length > 0) {
          this.cache.mergeCache(symbol, interval, gapData);
        }
      }

      // Merge cached and fetched data
      const allKlines = [...cachedKlines, ...fetchedKlines];
      const uniqueKlines = this.deduplicateKlines(allKlines);
      return uniqueKlines.sort((a, b) => a.openTime - b.openTime);
    }

    // Cache disabled - fetch directly from API
    return this.fetchKlinesFromAPI(symbol, interval, startTime, endTime);
  }

  /**
   * Fetch klines from API (internal method)
   * Fetches multiple batches if needed
   */
  private async fetchKlinesFromAPI(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<Kline[]> {
    const allKlines: Kline[] = [];
    let currentEndTime = endTime;
    const limit = 1000; // Binance max limit

    while (true) {
      const klines = await this.fetchKlines(symbol, interval, limit, currentEndTime);

      if (klines.length === 0) break;

      // Filter klines within time range
      const filtered = klines.filter(
        (k) => k.openTime >= startTime && k.openTime <= endTime
      );

      allKlines.unshift(...filtered.reverse()); // Reverse to get chronological order

      // Check if we need to fetch more
      if (klines[0].openTime <= startTime || klines.length < limit) {
        break;
      }

      currentEndTime = klines[0].openTime - 1;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return allKlines.sort((a, b) => a.openTime - b.openTime);
  }

  /**
   * Remove duplicate klines (same openTime)
   */
  private deduplicateKlines(klines: Kline[]): Kline[] {
    const map = new Map<number, Kline>();
    for (const kline of klines) {
      map.set(kline.openTime, kline);
    }
    return Array.from(map.values());
  }

  /**
   * Get current price
   */
  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v3/ticker/price`, {
        params: { symbol },
      });
      return parseFloat(response.data.price);
    } catch (error: any) {
      throw new Error(`Failed to get current price: ${error.message}`);
    }
  }
}

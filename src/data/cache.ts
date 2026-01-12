/**
 * Historical data cache manager
 * Persists kline data to local files to reduce API requests
 */

import * as fs from "fs";
import * as path from "path";
import { Kline } from "../types";

/**
 * Convert interval string to milliseconds
 * Supports: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
 */
function intervalToMs(interval: string): number {
  const unit = interval.slice(-1);
  const value = parseInt(interval.slice(0, -1));

  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "w":
      return value * 7 * 24 * 60 * 60 * 1000;
    case "M":
      return value * 30 * 24 * 60 * 60 * 1000; // Approximate
    default:
      throw new Error(`Unsupported interval: ${interval}`);
  }
}

export interface CacheMetadata {
  symbol: string;
  interval: string;
  firstTimestamp: number;
  lastTimestamp: number;
  count: number;
  updatedAt: number;
}

export interface CachedData {
  metadata: CacheMetadata;
  klines: Kline[];
}

export class DataCache {
  private cacheDir: string;

  constructor(cacheDir: string = "data/cache") {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get cache file path for symbol and interval
   */
  private getCacheFilePath(symbol: string, interval: string): string {
    const filename = `${symbol}_${interval}.json`;
    return path.join(this.cacheDir, filename);
  }

  /**
   * Load cached data from file
   */
  loadCache(symbol: string, interval: string): CachedData | null {
    const filePath = this.getCacheFilePath(symbol, interval);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data: CachedData = JSON.parse(content);

      // Validate data structure
      if (!data.metadata || !data.klines || !Array.isArray(data.klines)) {
        return null;
      }

      return data;
    } catch (error) {
      console.warn(`Failed to load cache from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Save data to cache file
   */
  saveCache(symbol: string, interval: string, klines: Kline[]): void {
    if (klines.length === 0) {
      return;
    }

    // Sort klines by timestamp
    const sorted = [...klines].sort((a, b) => a.openTime - b.openTime);

    const metadata: CacheMetadata = {
      symbol,
      interval,
      firstTimestamp: sorted[0].openTime,
      lastTimestamp: sorted[sorted.length - 1].openTime,
      count: sorted.length,
      updatedAt: Date.now(),
    };

    const data: CachedData = {
      metadata,
      klines: sorted,
    };

    const filePath = this.getCacheFilePath(symbol, interval);

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.warn(`Failed to save cache to ${filePath}:`, error);
    }
  }

  /**
   * Merge new klines with existing cache
   * Removes duplicates and sorts by timestamp
   */
  mergeCache(
    symbol: string,
    interval: string,
    newKlines: Kline[]
  ): CachedData | null {
    const existing = this.loadCache(symbol, interval);

    if (!existing) {
      // No existing cache, save new data
      this.saveCache(symbol, interval, newKlines);
      return this.loadCache(symbol, interval);
    }

    // Merge and deduplicate
    const klineMap = new Map<number, Kline>();

    // Add existing klines
    for (const kline of existing.klines) {
      klineMap.set(kline.openTime, kline);
    }

    // Add/update with new klines
    for (const kline of newKlines) {
      klineMap.set(kline.openTime, kline);
    }

    // Convert back to array and sort
    const merged = Array.from(klineMap.values()).sort(
      (a, b) => a.openTime - b.openTime
    );

    this.saveCache(symbol, interval, merged);

    return this.loadCache(symbol, interval);
  }

  /**
   * Get cached klines within time range
   */
  getCachedKlines(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Kline[] {
    const cached = this.loadCache(symbol, interval);

    if (!cached) {
      return [];
    }

    return cached.klines.filter(
      (k) => k.openTime >= startTime && k.openTime <= endTime
    );
  }

  /**
   * Find gaps in cached data for a given time range
   * Returns array of [startTime, endTime] tuples for missing periods
   */
  findGaps(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Array<[number, number]> {
    const cached = this.loadCache(symbol, interval);

    if (!cached) {
      // No cache at all, entire range is a gap
      return [[startTime, endTime]];
    }

    const gaps: Array<[number, number]> = [];

    // Get the actual last kline's closeTime (not just openTime)
    const lastKline = cached.klines[cached.klines.length - 1];
    const lastCloseTime = lastKline?.closeTime || cached.metadata.lastTimestamp;

    // Get the first kline's openTime
    const firstKline = cached.klines[0];
    const firstOpenTime = firstKline?.openTime || cached.metadata.firstTimestamp;

    // Convert interval to milliseconds for gap tolerance
    const intervalMs = intervalToMs(interval);

    // Check if we need data before cached range
    // Only consider it a gap if the difference is >= one interval period
    if (startTime < firstOpenTime) {
      const gapSize = firstOpenTime - startTime;
      // Only add gap if it's significant (>= one interval period)
      if (gapSize >= intervalMs) {
        gaps.push([startTime, firstOpenTime - 1]);
      }
      // If gap is smaller than one interval, the first kline already covers it
    }

    // Check if we need data after cached range
    // Use closeTime instead of openTime to determine if we need more data
    if (endTime > lastCloseTime) {
      const gapSize = endTime - lastCloseTime;
      // Only add gap if it's significant (>= one interval period)
      if (gapSize >= intervalMs) {
        gaps.push([lastCloseTime + 1, endTime]);
      }
      // If gap is smaller than one interval, we don't need more data
    }

    // If entire range is covered, return empty array
    if (
      startTime >= cached.metadata.firstTimestamp &&
      endTime <= lastCloseTime
    ) {
      return [];
    }

    return gaps;
  }

  /**
   * Clear cache for a specific symbol and interval
   */
  clearCache(symbol: string, interval: string): void {
    const filePath = this.getCacheFilePath(symbol, interval);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn(`Failed to clear cache ${filePath}:`, error);
      }
    }
  }

  /**
   * Get cache metadata without loading full data
   */
  getCacheInfo(symbol: string, interval: string): CacheMetadata | null {
    const cached = this.loadCache(symbol, interval);
    return cached ? cached.metadata : null;
  }
}

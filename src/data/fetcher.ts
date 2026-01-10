/**
 * K-line data fetcher
 * Supports both real-time and historical data from Binance
 */

import axios from "axios";
import { Kline } from "../types";

export class DataFetcher {
  private baseUrl: string;

  constructor(baseUrl: string = "https://api.binance.com") {
    this.baseUrl = baseUrl;
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
   * Fetches multiple batches if needed
   */
  async fetchKlinesForBacktest(
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

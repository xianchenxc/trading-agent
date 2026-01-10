/**
 * Exchange interface for order execution
 * Supports both simulated and real exchange (extensible)
 */

import { EntrySignal, Position, Trade } from "../types";
import { Config } from "../config";

export interface Exchange {
  /**
   * Place a market order to open a position
   */
  openPosition(signal: EntrySignal, quantity: number): Promise<Position>;

  /**
   * Close a position at market price
   */
  closePosition(position: Position, reason: string): Promise<Trade>;

  /**
   * Get current price
   */
  getCurrentPrice(): Promise<number>;
}

/**
 * Simulated exchange for backtesting
 */
export class SimulatedExchange implements Exchange {
  private config: Config;
  private currentPrice: number;
  private priceHistory: Array<{ time: number; price: number }> = [];

  constructor(config: Config, initialPrice: number) {
    this.config = config;
    this.currentPrice = initialPrice;
  }

  /**
   * Update current price (used in backtesting)
   */
  updatePrice(price: number, time: number): void {
    this.currentPrice = price;
    this.priceHistory.push({ time, price });
  }

  async getCurrentPrice(): Promise<number> {
    return this.currentPrice;
  }

  async openPosition(signal: EntrySignal, quantity: number): Promise<Position> {
    // Apply slippage
    const slippageMultiplier = 1 + (signal.side === "long" ? 1 : -1) * this.config.backtest.slippageRate;
    const executionPrice = signal.price * slippageMultiplier;

    const position: Position = {
      side: signal.side,
      entryPrice: executionPrice,
      entryTime: signal.timestamp,
      quantity,
      stopLoss: signal.stopLoss,
      highestPrice: executionPrice,
      lowestPrice: executionPrice,
      entryAtr: signal.atr,
      barsHeld: 0,
    };

    return position;
  }

  async closePosition(position: Position, reason: string): Promise<Trade> {
    // Apply slippage
    const slippageMultiplier = 1 + (position.side === "long" ? -1 : 1) * this.config.backtest.slippageRate;
    const executionPrice = this.currentPrice * slippageMultiplier;

    // Calculate commission
    const entryValue = position.entryPrice * position.quantity;
    const exitValue = executionPrice * position.quantity;
    const commission = (entryValue + exitValue) * this.config.backtest.commissionRate;

    // Calculate PnL
    let pnl: number;
    if (position.side === "long") {
      pnl = (executionPrice - position.entryPrice) * position.quantity - commission;
    } else {
      pnl = (position.entryPrice - executionPrice) * position.quantity - commission;
    }

    const pnlPercent = (pnl / entryValue) * 100;

    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: executionPrice,
      entryTime: position.entryTime,
      exitTime: Date.now(),
      quantity: position.quantity,
      pnl,
      pnlPercent,
      entryReason: "Strategy signal",
      exitReason: reason,
      commission,
    };

    return trade;
  }
}

/**
 * Real Binance exchange (placeholder for future implementation)
 */
export class BinanceExchange implements Exchange {
  private config: Config;
  private apiKey?: string;
  private apiSecret?: string;

  constructor(config: Config, apiKey?: string, apiSecret?: string) {
    this.config = config;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async getCurrentPrice(): Promise<number> {
    // TODO: Implement real API call
    throw new Error("Real exchange not implemented yet");
  }

  async openPosition(signal: EntrySignal, quantity: number): Promise<Position> {
    // TODO: Implement real order placement
    throw new Error("Real exchange not implemented yet");
  }

  async closePosition(position: Position, reason: string): Promise<Trade> {
    // TODO: Implement real order placement
    throw new Error("Real exchange not implemented yet");
  }
}

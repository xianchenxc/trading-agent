/**
 * Core type definitions for trading system
 */

export type PositionSide = "long" | "short" | "none";

export interface Kline {
  openTime: number; // timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface IndicatorData {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  atr?: number;
}

export interface TrendSignal {
  trend: PositionSide; // "long" | "short" | "none"
  timestamp: number;
}

export interface EntrySignal {
  side: PositionSide;
  price: number;
  timestamp: number;
  reason: string;
  stopLoss: number;
  atr: number;
}

export interface Position {
  side: PositionSide;
  entryPrice: number;
  entryTime: number;
  quantity: number;
  stopLoss: number;
  highestPrice: number; // for long positions
  lowestPrice: number; // for short positions
  entryAtr: number;
  barsHeld: number;
}

export interface Trade {
  id: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  entryReason: string;
  exitReason: string;
  commission: number;
}

export interface BacktestResult {
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  trades: Trade[];
}

export interface AccountState {
  equity: number;
  availableBalance: number;
  positions: Position[];
  trades: Trade[];
  consecutiveLosses: number;
  lastTradeTime?: number;
  isInCooldown: boolean;
  cooldownUntil?: number;
}

/* =========================================================
 * Market data
 * ========================================================= */

export interface Kline {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* =========================================================
 * Indicator output
 * ========================================================= */
export interface IndicatorData {
  // Trend EMAs
  emaShort?: number;
  emaMedium?: number;
  emaLong?: number;

  // Volatility
  atr?: number;

  // Trend strength
  adx?: number;
  plusDI?: number;
  minusDI?: number;
}

/* =========================================================
 * Multi-timeframe indicator output
 * ========================================================= */

/**
 * Higher Timeframe (HTF) indicator data (4h)
 * Used for trend context filtering
 */
export interface HTFIndicatorData {
  // 4h EMAs
  ema50?: number;
  ema200?: number;
  
  // 4h ADX
  adx?: number;
}

/**
 * Lower Timeframe (LTF) indicator data (1h)
 * Used for entry/exit execution
 */
export interface LTFIndicatorData {
  // 1h EMAs
  ema20?: number;
  ema50?: number;
  
  // 1h ADX
  adx?: number;
  
  // ATR (used by RiskManager only)
  atr?: number;
}

/**
 * Multi-timeframe indicator context
 * Combines HTF and LTF indicators for strategy decision
 */
export interface MultiTimeframeIndicatorData {
  htf: HTFIndicatorData;
  ltf: LTFIndicatorData;
}

/* =========================
 * Indicator builder output
 * ========================= */

export interface IndicatorBar extends IndicatorData {
  timestamp: number;
  close: number;
  high: number;
  low: number;
}

/* =========================
 * Trading primitives
 * ========================= */

export type PositionSide = "LONG" | "SHORT";

export type TradeReason =
  | 'TREND_CONFIRMED'
  | 'TREND_INVALIDATED'
  | 'STOP_LOSS'
  | 'TRAILING_STOP'
  | 'MANUAL_EXIT'
  | 'HTF_BULL_TREND_CONFIRMED'
  | 'EMA_REVERSAL_1H';

export interface TradeAction {
  action: 'ENTER';
  side: PositionSide;
  atr: number;
  reason: TradeReason;
}

/* =========================
 * Position State Machine
 * ========================= */

export type PositionState = "FLAT" | "OPEN" | "CLOSING";

/* =========================
 * Position (state machine)
 * ========================= */

export interface Position {
  side: PositionSide;

  entryPrice: number;
  stopLoss: number;
  trailingStop?: number;

  size: number;

  entryTime: number;

  // optional: 用于分析
  reason?: TradeReason;
}

/* =========================================================
 * Strategy layer
 * ========================================================= */

export type SignalType = "ENTRY" | "EXIT" | "HOLD";

export interface StrategySignal {
  type: SignalType;
  side?: PositionSide;
  reason?: TradeReason | string;
}

/**
 * Higher timeframe trend state
 * Used for context filtering
 */
export type HTFTrendState = "BULL" | "RANGE" | "BEAR";

/**
 * HTF context for strategy decision
 */
export interface HTFContext {
  trendState: HTFTrendState;
  indicators: HTFIndicatorData;
}

/**
 * ========= Trade / Execution =========
 */
/* =========================================================
 * Risk management layer
 * ========================================================= */

export interface RiskDecision {
  action: "EXIT" | "NONE";
  reason?: TradeReason;
}

/* =========================================================
 * Trade logging & analytics
 * ========================================================= */

export interface TradeRecord {
  side: PositionSide;

  entryPrice: number;
  entryTime: number;

  exitPrice: number;
  exitTime: number;

  size: number;

  pnl: number;
  commission: number;
  slippage: number;

  equityAfterTrade: number;

  reason: string;
}

/* =========================================================
 * Backtest results
 * ========================================================= */

export interface BacktestResult {
  initialCapital: number;
  finalEquity: number;
  trades: TradeRecord[];

  stats: {
    totalTrades: number;
    winRate: number;
    expectancy: number;
    maxDrawdown: number;
    profitFactor: number;
  };
}

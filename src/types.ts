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
  
  // v5: ADX historical series for trend exhaustion detection
  // Contains recent ADX values (excluding current bar to avoid lookahead bias)
  adx_1h_series?: number[];
  
  // ATR (used by RiskManager only)
  atr?: number;
  
  // Donchian High (used for breakout confirmation)
  donchianHigh?: number;
}


/* =========================
 * Trading primitives
 * ========================= */

export type PositionSide = "LONG" | "SHORT";

export type TradeReason =
  | 'TREND_INVALIDATED'
  | 'STOP_LOSS_INITIAL'
  | 'STOP_LOSS_BREAK_EVEN'
  | 'TRAILING_STOP'
  | 'TRAILING_STOP_HIT'
  | 'MANUAL_EXIT'
  | 'HTF_BULL_TREND_CONFIRMED'
  | 'HTF_BULL_BREAKOUT_CONFIRMED';

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
  initialStopLoss: number; // Initial stop loss (hard stop, never changes)
  stopLoss: number; // Current active stop loss (stage 1: initialStopLoss, stage 2: entryPrice, stage 3: trailingStop)
  trailingStop?: number; // Trailing stop level (only used in stage 3, based on EMA20_1H or EMA50_1H)

  size: number;

  entryTime: number;

  // Trailing stop state
  isTrailingActive: boolean; // Whether trailing stop is activated (stage 3 only)
  maxUnrealizedR: number; // Maximum unrealized profit in R units
  trailingMode?: "EMA20" | "EMA50"; // v5: Trailing stop mode (EMA20 default, EMA50 for profit lock)

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
    averageWin: number;
    averageLoss: number;
    maxWin: number;
    totalReturn: number; // Percentage return
  };
}

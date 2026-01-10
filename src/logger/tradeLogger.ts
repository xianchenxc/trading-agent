/**
 * Trade logging module
 * Logs all trading activities with detailed information
 */

import { Trade, EntrySignal, Position } from "../types";

export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

export class TradeLogger {
  private logs: LogEntry[] = [];
  private consoleOutput: boolean;

  constructor(consoleOutput: boolean = true) {
    this.consoleOutput = consoleOutput;
  }

  private log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    if (this.consoleOutput) {
      const timestamp = new Date(entry.timestamp).toISOString();
      const prefix = `[${timestamp}] [${level}]`;
      
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log entry signal
   */
  logEntrySignal(signal: EntrySignal, quantity: number): void {
    this.info("Entry signal generated", {
      side: signal.side,
      price: signal.price,
      stopLoss: signal.stopLoss,
      atr: signal.atr,
      quantity,
      reason: signal.reason,
    });
  }

  /**
   * Log position opened
   */
  logPositionOpened(position: Position): void {
    this.info("Position opened", {
      side: position.side,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      stopLoss: position.stopLoss,
      entryTime: new Date(position.entryTime).toISOString(),
    });
  }

  /**
   * Log position closed
   */
  logPositionClosed(trade: Trade): void {
    const pnlSign = trade.pnl >= 0 ? "+" : "";
    this.info(`Position closed - PnL: ${pnlSign}${trade.pnl.toFixed(2)} (${pnlSign}${trade.pnlPercent.toFixed(2)}%)`, {
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      quantity: trade.quantity,
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent,
      entryReason: trade.entryReason,
      exitReason: trade.exitReason,
      commission: trade.commission,
      duration: `${((trade.exitTime - trade.entryTime) / (1000 * 60 * 60)).toFixed(2)} hours`,
    });
  }

  /**
   * Log risk management event
   */
  logRiskEvent(message: string, data?: any): void {
    this.warn(`Risk Management: ${message}`, data);
  }

  /**
   * Log strategy event
   */
  logStrategyEvent(message: string, data?: any): void {
    this.debug(`Strategy: ${message}`, data);
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Clear logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Export logs to string
   */
  exportLogs(): string {
    return this.logs
      .map((log) => {
        const timestamp = new Date(log.timestamp).toISOString();
        const dataStr = log.data ? ` ${JSON.stringify(log.data)}` : "";
        return `[${timestamp}] [${log.level}] ${log.message}${dataStr}`;
      })
      .join("\n");
  }
}

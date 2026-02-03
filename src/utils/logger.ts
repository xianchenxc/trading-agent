/**
 * Logger utility
 * Provides structured logging with levels
 * Can be easily replaced with a professional logging library (winston, pino, etc.)
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  instanceId?: string;
}

class Logger {
  private minLevel: LogLevel = LogLevel.INFO;
  private logEntries: LogEntry[] = [];
  private maxEntries: number = 1000; // Keep last 1000 entries in memory

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, any>, instanceId?: string): void {
    this.log(LogLevel.DEBUG, message, context, instanceId);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, any>, instanceId?: string): void {
    this.log(LogLevel.INFO, message, context, instanceId);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, any>, instanceId?: string): void {
    this.log(LogLevel.WARN, message, context, instanceId);
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, any>, instanceId?: string): void {
    this.log(LogLevel.ERROR, message, context, instanceId);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    instanceId?: string
  ): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      instanceId,
    };

    this.logEntries.push(entry);
    if (this.logEntries.length > this.maxEntries) {
      this.logEntries.shift();
    }

    // Format and output to console
    const prefix = instanceId ? `[${instanceId}]` : '';
    const levelStr = LogLevel[level];
    const timestamp = entry.timestamp.toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';

    const logMessage = `${timestamp} ${levelStr} ${prefix} ${message}${contextStr}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.log(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
    }
  }

  /**
   * Get recent log entries
   */
  getRecentEntries(count: number = 100): LogEntry[] {
    return this.logEntries.slice(-count);
  }

  /**
   * Clear log entries
   */
  clear(): void {
    this.logEntries = [];
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logDebug = (message: string, context?: Record<string, any>, instanceId?: string) =>
  logger.debug(message, context, instanceId);
export const logInfo = (message: string, context?: Record<string, any>, instanceId?: string) =>
  logger.info(message, context, instanceId);
export const logWarn = (message: string, context?: Record<string, any>, instanceId?: string) =>
  logger.warn(message, context, instanceId);
export const logError = (message: string, context?: Record<string, any>, instanceId?: string) =>
  logger.error(message, context, instanceId);

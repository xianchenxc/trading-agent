/**
 * Position state management
 * Tracks current positions and account state
 */

import { Position, AccountState, Trade, PositionSide } from "../types";

export class PositionStore {
  private accountState: AccountState;

  constructor(initialEquity: number) {
    this.accountState = {
      equity: initialEquity,
      availableBalance: initialEquity,
      positions: [],
      trades: [],
      consecutiveLosses: 0,
      isInCooldown: false,
    };
  }

  /**
   * Get current account state
   */
  getAccountState(): AccountState {
    return { ...this.accountState };
  }

  /**
   * Get current positions
   */
  getPositions(): Position[] {
    return [...this.accountState.positions];
  }

  /**
   * Get active positions (non-none)
   */
  getActivePositions(): Position[] {
    return this.accountState.positions.filter((p) => p.side !== "none");
  }

  /**
   * Open a new position
   */
  openPosition(position: Position): void {
    this.accountState.positions.push(position);
    this.accountState.availableBalance -= position.quantity * position.entryPrice;
  }

  /**
   * Close a position
   */
  closePosition(
    positionIndex: number,
    exitPrice: number,
    exitTime: number,
    exitReason: string,
    commission: number
  ): Trade | null {
    if (positionIndex < 0 || positionIndex >= this.accountState.positions.length) {
      return null;
    }

    const position = this.accountState.positions[positionIndex];
    if (position.side === "none") {
      return null;
    }

    // Calculate PnL
    let pnl: number;
    if (position.side === "long") {
      pnl = (exitPrice - position.entryPrice) * position.quantity - commission * 2;
    } else {
      pnl = (position.entryPrice - exitPrice) * position.quantity - commission * 2;
    }

    const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;

    // Create trade record
    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: exitPrice,
      entryTime: position.entryTime,
      exitTime: exitTime,
      quantity: position.quantity,
      pnl,
      pnlPercent,
      entryReason: "Strategy signal", // Could be enhanced
      exitReason,
      commission: commission * 2, // Entry + exit
    };

    // Update account
    this.accountState.trades.push(trade);
    this.accountState.equity += pnl;
    this.accountState.availableBalance += position.quantity * exitPrice - commission;

    // Remove position
    this.accountState.positions.splice(positionIndex, 1);

    return trade;
  }

  /**
   * Update position (for tracking highest/lowest price, bars held)
   */
  updatePosition(positionIndex: number, updatedPosition: Position): void {
    if (positionIndex >= 0 && positionIndex < this.accountState.positions.length) {
      this.accountState.positions[positionIndex] = updatedPosition;
    }
  }

  /**
   * Update account equity (for external updates)
   */
  updateEquity(equity: number): void {
    this.accountState.equity = equity;
    this.accountState.availableBalance = equity;
  }

  /**
   * Get all trades
   */
  getTrades(): Trade[] {
    return [...this.accountState.trades];
  }

  /**
   * Reset account state (for backtesting)
   */
  reset(initialEquity: number): void {
    this.accountState = {
      equity: initialEquity,
      availableBalance: initialEquity,
      positions: [],
      trades: [],
      consecutiveLosses: 0,
      isInCooldown: false,
    };
  }
}

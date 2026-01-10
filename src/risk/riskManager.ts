/**
 * Risk management module
 * Handles position sizing, risk limits, and cooldown logic
 */

import { AccountState, Position, EntrySignal } from "../types";
import { Config, defaultConfig } from "../config";

export class RiskManager {
  private config: Config;

  constructor(config: Config = defaultConfig) {
    this.config = config;
  }

  /**
   * Calculate position size based on risk
   * Risk = (Entry Price - Stop Loss) × Quantity
   * Quantity = (Account Equity × Max Risk %) / (Entry Price - Stop Loss)
   */
  calculatePositionSize(
    signal: EntrySignal,
    accountEquity: number
  ): number {
    const maxRiskAmount = accountEquity * this.config.risk.maxRiskPerTrade;
    const priceRisk = Math.abs(signal.price - signal.stopLoss);

    if (priceRisk <= 0) {
      return 0;
    }

    const quantity = maxRiskAmount / priceRisk;
    return Math.max(0, quantity);
  }

  /**
   * Check if we can open a new position
   */
  canOpenPosition(accountState: AccountState): { allowed: boolean; reason: string } {
    // Check if already at max positions
    const activePositions = accountState.positions.filter(
      (p) => p.side !== "none"
    );
    
    if (activePositions.length >= this.config.risk.maxPositionCount) {
      return {
        allowed: false,
        reason: `Already have ${activePositions.length} position(s), max is ${this.config.risk.maxPositionCount}`,
      };
    }

    // Check cooldown period
    if (accountState.isInCooldown) {
      const cooldownUntil = accountState.cooldownUntil || 0;
      if (Date.now() < cooldownUntil) {
        const hoursLeft = (cooldownUntil - Date.now()) / (1000 * 60 * 60);
        return {
          allowed: false,
          reason: `In cooldown period, ${hoursLeft.toFixed(1)} hours remaining`,
        };
      } else {
        // Cooldown expired, reset it
        accountState.isInCooldown = false;
        accountState.cooldownUntil = undefined;
      }
    }

    return { allowed: true, reason: "" };
  }

  /**
   * Update account state after a trade
   */
  updateAccountAfterTrade(
    accountState: AccountState,
    pnl: number,
    exitTime: number
  ): AccountState {
    const newEquity = accountState.equity + pnl;
    const newTrades = [...accountState.trades];

    // Update consecutive losses
    let newConsecutiveLosses = accountState.consecutiveLosses;
    if (pnl < 0) {
      newConsecutiveLosses += 1;
    } else {
      newConsecutiveLosses = 0; // Reset on win
    }

    // Check if we need to enter cooldown
    let isInCooldown = accountState.isInCooldown;
    let cooldownUntil = accountState.cooldownUntil;

    if (newConsecutiveLosses >= this.config.risk.maxConsecutiveLosses) {
      isInCooldown = true;
      cooldownUntil = exitTime + this.config.risk.cooldownHours * 60 * 60 * 1000;
      newConsecutiveLosses = 0; // Reset after entering cooldown
    }

    return {
      ...accountState,
      equity: newEquity,
      availableBalance: newEquity, // Simplified: assume all equity is available
      consecutiveLosses: newConsecutiveLosses,
      lastTradeTime: exitTime,
      isInCooldown,
      cooldownUntil,
    };
  }

  /**
   * Validate position size doesn't exceed available balance
   */
  validatePositionSize(
    quantity: number,
    price: number,
    availableBalance: number
  ): { valid: boolean; reason: string; adjustedQuantity?: number } {
    const requiredMargin = quantity * price;

    if (requiredMargin > availableBalance) {
      // Adjust quantity to fit available balance
      const adjustedQuantity = (availableBalance * 0.95) / price; // 95% to leave some buffer
      return {
        valid: false,
        reason: `Insufficient balance. Required: ${requiredMargin.toFixed(2)}, Available: ${availableBalance.toFixed(2)}`,
        adjustedQuantity: Math.max(0, adjustedQuantity),
      };
    }

    return { valid: true, reason: "" };
  }
}

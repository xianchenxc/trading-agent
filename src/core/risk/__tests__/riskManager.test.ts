/**
 * Unit tests for riskManager
 */

import {
  calculatePositionSize,
  riskManager,
  checkStopLossProgression,
  updateTrailingStop,
} from '../riskManager';
import { Position, Config } from '../../../types';
import { defaultConfig } from '../../../config/config';

describe('riskManager', () => {
  describe('calculatePositionSize', () => {
    it('should calculate position size correctly', () => {
      const entryPrice = 100;
      const equity = 10000;
      const riskPerTrade = 0.01; // 1%
      const stopLossPercent = 0.01; // 1%

      const result = calculatePositionSize(entryPrice, equity, riskPerTrade, stopLossPercent);

      expect(result.stopLoss).toBe(99); // 100 * (1 - 0.01)
      expect(result.size).toBeGreaterThan(0);
      // Risk amount = 10000 * 0.01 = 100
      // Risk per unit = 100 - 99 = 1
      // Size = 100 / 1 = 100
      expect(result.size).toBeCloseTo(100, 2);
    });

    it('should handle different risk percentages', () => {
      const entryPrice = 100;
      const equity = 10000;
      const riskPerTrade = 0.02; // 2%
      const stopLossPercent = 0.01; // 1%

      const result = calculatePositionSize(entryPrice, equity, riskPerTrade, stopLossPercent);

      // Risk amount = 10000 * 0.02 = 200
      // Risk per unit = 100 - 99 = 1
      // Size = 200 / 1 = 200
      expect(result.size).toBeCloseTo(200, 2);
    });
  });

  describe('checkStopLossProgression', () => {
    const createPosition = (unrealizedR: number): Position => {
      const entryPrice = 100;
      const initialStopLoss = 99; // 1% stop
      const currentPrice = entryPrice + (unrealizedR * (entryPrice - initialStopLoss));

      return {
        side: 'LONG',
        entryPrice,
        initialStopLoss,
        stopLoss: initialStopLoss,
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 0,
      };
    };

    it('should move to break-even at +1R', () => {
      const position = createPosition(1.0);
      const currentPrice = 101; // +1R

      const result = checkStopLossProgression(position, currentPrice, 1.0, 2.0);

      expect(result.shouldUpdate).toBe(true);
      expect(result.stopLoss).toBe(100); // entryPrice (break-even)
      expect(result.isTrailingActive).toBe(false);
    });

    it('should activate trailing stop at +2R', () => {
      const position = createPosition(2.0);
      const currentPrice = 102; // +2R

      const result = checkStopLossProgression(position, currentPrice, 1.0, 2.0);

      expect(result.shouldUpdate).toBe(true);
      expect(result.isTrailingActive).toBe(true);
      expect(result.trailingStop).toBe(100); // entryPrice (break-even)
    });

    it('should not update before +1R', () => {
      const position = createPosition(0.5);
      const currentPrice = 100.5; // +0.5R

      const result = checkStopLossProgression(position, currentPrice, 1.0, 2.0);

      expect(result.shouldUpdate).toBe(false);
      expect(result.isTrailingActive).toBe(false);
    });
  });

  describe('updateTrailingStop', () => {
    it('should update trailing stop when EMA20 increases', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 100,
        trailingStop: 100,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true,
        maxUnrealizedR: 2.0,
        trailingMode: 'EMA20',
      };

      const ema20 = 101; // Higher than current trailing stop
      const currentPrice = 102;

      const result = updateTrailingStop(position, ema20, undefined, currentPrice);

      expect(result.shouldUpdate).toBe(true);
      expect(result.trailingStop).toBe(101);
    });

    it('should not update trailing stop when EMA20 decreases', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 100,
        trailingStop: 101,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true,
        maxUnrealizedR: 2.0,
        trailingMode: 'EMA20',
      };

      const ema20 = 100; // Lower than current trailing stop
      const currentPrice = 102;

      const result = updateTrailingStop(position, ema20, undefined, currentPrice);

      expect(result.shouldUpdate).toBe(false);
    });

    it('should use EMA50 when trailingMode is EMA50', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 100,
        trailingStop: 100,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true,
        maxUnrealizedR: 4.0,
        trailingMode: 'EMA50',
      };

      const ema20 = 101;
      const ema50 = 102; // Should use this
      const currentPrice = 103;

      const result = updateTrailingStop(position, ema20, ema50, currentPrice);

      expect(result.shouldUpdate).toBe(true);
      expect(result.trailingStop).toBe(102); // EMA50 value
    });
  });

  describe('riskManager - stop loss trigger', () => {
    it('should trigger EXIT when stop loss is hit', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 99,
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 0,
      };

      const bar = {
        close: 98.5,
        high: 99.5,
        low: 98, // Hits stop loss
      };

      const ltfIndicator = {
        ema20: 100,
        ema50: 99,
        adx: 20,
      };

      const result = riskManager(position, bar, ltfIndicator, defaultConfig);

      expect(result.decision.action).toBe('EXIT');
      expect(result.decision.reason).toBe('STOP_LOSS_INITIAL');
    });

    it('should trigger EXIT when break-even stop is hit', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 100, // Break-even stop
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 1.5,
      };

      const bar = {
        close: 99.5,
        high: 100.5,
        low: 99, // Hits break-even stop
      };

      const ltfIndicator = {
        ema20: 101,
        ema50: 100,
        adx: 20,
      };

      const result = riskManager(position, bar, ltfIndicator, defaultConfig);

      expect(result.decision.action).toBe('EXIT');
      expect(result.decision.reason).toBe('STOP_LOSS_BREAK_EVEN');
    });
  });
});

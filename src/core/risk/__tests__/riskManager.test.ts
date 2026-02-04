/**
 * Unit tests for riskManager
 */

import {
  calculatePositionSize,
  riskManager,
  checkStopLossProgression,
  updateTrailingStop,
  calculateUnrealizedR,
  getPositionStage,
} from '../riskManager';
import { Position } from '../../../types';
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

      expect(result).not.toBeNull();
      expect(result!.stopLoss).toBe(100); // entryPrice (break-even)
      expect(result!.isTrailingActive).toBe(false);
    });

    it('should activate trailing stop at +2R', () => {
      const position = createPosition(2.0);
      const currentPrice = 102; // +2R

      const result = checkStopLossProgression(position, currentPrice, 1.0, 2.0);

      expect(result).not.toBeNull();
      expect(result!.isTrailingActive).toBe(true);
      expect(result!.stopLoss).toBe(100); // entryPrice (break-even)
      expect(result!.trailingMode).toBe('EMA20'); // Default mode
      // Note: trailingStop is NOT set here - it's initialized by updateTrailingStopIfActive
      expect(result!.trailingStop).toBeUndefined();
    });

    it('should track maxR but not update stopLoss before +1R', () => {
      const position = createPosition(0.5);
      const currentPrice = 100.5; // +0.5R

      const result = checkStopLossProgression(position, currentPrice, 1.0, 2.0);

      // In Stage 1, we should update maxUnrealizedR even though stopLoss doesn't change
      expect(result).not.toBeNull(); // maxR increased from 0 to 0.5
      expect(result!.maxUnrealizedR).toBe(0.5);
      expect(result!.stopLoss).toBeUndefined(); // stopLoss should not be updated
      expect(result!.isTrailingActive).toBeUndefined(); // isTrailingActive not set in Stage 1
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

      expect(result).not.toBeNull();
      expect(result!.trailingStop).toBe(101);
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

      expect(result).toBeNull();
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

      expect(result).not.toBeNull();
      expect(result!.trailingStop).toBe(102); // EMA50 value
    });
  });

  describe('getPositionStage', () => {
    it('should return Stage 1 when using initial stop loss', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 99, // Initial stop loss
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 0,
      };

      expect(getPositionStage(position)).toBe(1);
    });

    it('should return Stage 2 when moved to break-even', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 100, // Break-even
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 1.5,
      };

      expect(getPositionStage(position)).toBe(2);
    });

    it('should return Stage 3 when trailing stop is active', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 105, // Trailing stop
        trailingStop: 105,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true,
        maxUnrealizedR: 2.5,
        trailingMode: 'EMA20',
      };

      expect(getPositionStage(position)).toBe(3);
    });

    it('should prioritize Stage 3 over Stage 2 when both conditions are true', () => {
      // Edge case: stopLoss >= entryPrice AND isTrailingActive
      // Stage 3 should take precedence
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 105, // >= entryPrice
        trailingStop: 105,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true, // This makes it Stage 3
        maxUnrealizedR: 2.5,
        trailingMode: 'EMA20',
      };

      expect(getPositionStage(position)).toBe(3);
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

    it('should not trigger break-even exit in Stage 3 when trailing stop is active', () => {
      // Stage 3: Trailing stop is active, stopLoss equals trailingStop
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 105, // In Stage 3, stopLoss equals trailingStop
        trailingStop: 105,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true,
        maxUnrealizedR: 2.5,
        trailingMode: 'EMA20',
      };

      const bar = {
        close: 104,
        high: 106,
        low: 104, // Price touches trailing stop but doesn't break it
      };

      const ltfIndicator = {
        ema20: 105,
        ema50: 103,
        adx: 25, // Strong trend (not exhausted)
        adx_1h_series: [30, 28, 26, 25], // Not exhausted (not consecutive declining)
      };

      const result = riskManager(position, bar, ltfIndicator, defaultConfig);

      // Should NOT exit because:
      // 1. Trailing stop was touched but trend is not exhausted
      // 2. Should NOT be misidentified as break-even stop
      expect(result.decision.action).toBe('NONE');
    });

    it('should trigger trailing stop exit in Stage 3 when trend is exhausted', () => {
      // Stage 3: Trailing stop is active, trend is exhausted
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99,
        stopLoss: 105, // In Stage 3, stopLoss equals trailingStop
        trailingStop: 105,
        size: 100,
        entryTime: 1000,
        isTrailingActive: true,
        maxUnrealizedR: 2.5,
        trailingMode: 'EMA20',
      };

      const bar = {
        close: 103,
        high: 106,
        low: 104, // Price breaks trailing stop
      };

      const ltfIndicator = {
        ema20: 105,
        ema50: 103,
        adx: 18, // Weak trend (below threshold)
        adx_1h_series: [22, 20, 19, 18], // Exhausted (consecutive declining)
      };

      const result = riskManager(position, bar, ltfIndicator, defaultConfig);

      // Should exit because trailing stop was hit AND trend is exhausted
      expect(result.decision.action).toBe('EXIT');
      expect(result.decision.reason).toBe('TRAILING_STOP_HIT');
    });
  });

  describe('calculateUnrealizedR', () => {
    it('should calculate unrealized R for LONG position correctly', () => {
      const position: Position = {
        side: 'LONG',
        entryPrice: 100,
        initialStopLoss: 99, // 1% stop
        stopLoss: 99,
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 0,
      };

      // At entry price: 0R
      expect(calculateUnrealizedR(position, 100)).toBe(0);

      // At +1R: price = 101 (1% profit)
      // PnL = (101 - 100) * 100 = 100
      // Risk = (100 - 99) * 100 = 100
      // R = 100 / 100 = 1.0
      expect(calculateUnrealizedR(position, 101)).toBeCloseTo(1.0, 2);

      // At +2R: price = 102
      expect(calculateUnrealizedR(position, 102)).toBeCloseTo(2.0, 2);

      // At -0.5R: price = 99.5
      expect(calculateUnrealizedR(position, 99.5)).toBeCloseTo(-0.5, 2);
    });

    it('should calculate unrealized R for SHORT position correctly', () => {
      const position: Position = {
        side: 'SHORT',
        entryPrice: 100,
        initialStopLoss: 101, // 1% stop (above entry for SHORT)
        stopLoss: 101,
        size: 100,
        entryTime: 1000,
        isTrailingActive: false,
        maxUnrealizedR: 0,
      };

      // At entry price: 0R
      expect(calculateUnrealizedR(position, 100)).toBe(0);

      // At +1R: price = 99 (1% profit for SHORT)
      // PnL = (100 - 99) * 100 = 100
      // Risk = (101 - 100) * 100 = 100
      // R = 100 / 100 = 1.0
      expect(calculateUnrealizedR(position, 99)).toBeCloseTo(1.0, 2);

      // At +2R: price = 98
      expect(calculateUnrealizedR(position, 98)).toBeCloseTo(2.0, 2);

      // At -0.5R: price = 100.5
      expect(calculateUnrealizedR(position, 100.5)).toBeCloseTo(-0.5, 2);
    });
  });
});

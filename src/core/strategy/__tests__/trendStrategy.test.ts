/**
 * Unit tests for trendStrategy
 */

import { trendStrategy } from '../trendStrategy';
import { Kline, HTFIndicatorData, LTFIndicatorData, PositionState } from '../../../types';

describe('trendStrategy', () => {
  // Helper function to create a simple Kline
  function createKline(
    openTime: number,
    open: number,
    high: number,
    low: number,
    close: number
  ): Kline {
    return {
      openTime,
      open,
      high,
      low,
      close,
      volume: 1000,
      closeTime: openTime + 3600000,
    };
  }

  describe('ENTRY signals', () => {
    it('should generate ENTRY signal when all conditions are met', () => {
      const bar = createKline(1000, 100, 105, 95, 102);
      const htfIndicator: HTFIndicatorData = {
        ema50: 100,
        ema200: 95,
        adx: 25, // > 20
      };
      const ltfIndicator: LTFIndicatorData = {
        ema20: 101,
        ema50: 100,
        adx: 26, // > 25
        donchianHigh: 100, // bar.close (102) > donchianHigh (100)
      };
      const positionState: PositionState = 'FLAT';

      const signal = trendStrategy({
        bar,
        htfIndicator,
        ltfIndicator,
        positionState,
      });

      expect(signal.type).toBe('ENTRY');
      expect(signal.side).toBe('LONG');
    });

    it('should not generate ENTRY when HTF trend is not BULL', () => {
      const bar = createKline(1000, 100, 105, 95, 102);
      const htfIndicator: HTFIndicatorData = {
        ema50: 95, // < ema200
        ema200: 100,
        adx: 25,
      };
      const ltfIndicator: LTFIndicatorData = {
        ema20: 101,
        ema50: 100,
        adx: 26,
        donchianHigh: 100,
      };
      const positionState: PositionState = 'FLAT';

      const signal = trendStrategy({
        bar,
        htfIndicator,
        ltfIndicator,
        positionState,
      });

      expect(signal.type).toBe('HOLD');
    });

    it('should not generate ENTRY when ADX_1h is too low', () => {
      const bar = createKline(1000, 100, 105, 95, 102);
      const htfIndicator: HTFIndicatorData = {
        ema50: 100,
        ema200: 95,
        adx: 25,
      };
      const ltfIndicator: LTFIndicatorData = {
        ema20: 101,
        ema50: 100,
        adx: 20, // < 25
        donchianHigh: 100,
      };
      const positionState: PositionState = 'FLAT';

      const signal = trendStrategy({
        bar,
        htfIndicator,
        ltfIndicator,
        positionState,
      });

      expect(signal.type).toBe('HOLD');
    });

    it('should not generate ENTRY when Donchian High breakout is not confirmed', () => {
      const bar = createKline(1000, 100, 105, 95, 98); // close < donchianHigh
      const htfIndicator: HTFIndicatorData = {
        ema50: 100,
        ema200: 95,
        adx: 25,
      };
      const ltfIndicator: LTFIndicatorData = {
        ema20: 101,
        ema50: 100,
        adx: 26,
        donchianHigh: 100,
      };
      const positionState: PositionState = 'FLAT';

      const signal = trendStrategy({
        bar,
        htfIndicator,
        ltfIndicator,
        positionState,
      });

      expect(signal.type).toBe('HOLD');
    });
  });

  describe('EXIT signals (v3: removed)', () => {
    it('should return HOLD when position is OPEN (v3: no exit signals)', () => {
      const bar = createKline(1000, 100, 105, 95, 98);
      const htfIndicator: HTFIndicatorData = {
        ema50: 100,
        ema200: 95,
        adx: 25,
      };
      const ltfIndicator: LTFIndicatorData = {
        ema20: 101,
        ema50: 100,
        adx: 26,
      };
      const positionState: PositionState = 'OPEN';

      const signal = trendStrategy({
        bar,
        htfIndicator,
        ltfIndicator,
        positionState,
      });

      // v3: Strategy does not generate EXIT signals
      expect(signal.type).toBe('HOLD');
    });
  });

  describe('Safety checks', () => {
    it('should return HOLD when indicators are missing', () => {
      const bar = createKline(1000, 100, 105, 95, 102);
      const htfIndicator: HTFIndicatorData = {
        ema50: undefined,
        ema200: undefined,
        adx: undefined,
      };
      const ltfIndicator: LTFIndicatorData = {
        ema20: undefined,
        ema50: undefined,
        adx: undefined,
      };
      const positionState: PositionState = 'FLAT';

      const signal = trendStrategy({
        bar,
        htfIndicator,
        ltfIndicator,
        positionState,
      });

      expect(signal.type).toBe('HOLD');
    });
  });
});

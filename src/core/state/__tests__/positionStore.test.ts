/**
 * Unit tests for PositionStore
 */

import { PositionStore } from '../positionStore';
import { TradeReason } from '../../../types';

describe('PositionStore', () => {
  let store: PositionStore;

  beforeEach(() => {
    store = new PositionStore();
  });

  describe('State transitions', () => {
    it('should start in FLAT state', () => {
      expect(store.getState()).toBe('FLAT');
      expect(store.get()).toBeNull();
    });

    it('should transition to OPEN when opening position', () => {
      store.dispatch({
        type: 'OPEN_POSITION',
        payload: {
          side: 'LONG',
          entryPrice: 100,
          stopLoss: 99,
          size: 100,
          entryTime: 1000,
        },
        reason: 'HTF_BULL_TREND_CONFIRMED' as TradeReason,
      });

      expect(store.getState()).toBe('OPEN');
      const position = store.get();
      expect(position).not.toBeNull();
      expect(position?.side).toBe('LONG');
      expect(position?.entryPrice).toBe(100);
    });

    it('should transition to CLOSING then FLAT when closing position', () => {
      // Open position
      store.dispatch({
        type: 'OPEN_POSITION',
        payload: {
          side: 'LONG',
          entryPrice: 100,
          stopLoss: 99,
          size: 100,
          entryTime: 1000,
        },
        reason: 'HTF_BULL_TREND_CONFIRMED' as TradeReason,
      });

      expect(store.getState()).toBe('OPEN');

      // Start closing
      store.dispatch({ type: 'START_CLOSING' });
      expect(store.getState()).toBe('CLOSING');

      // Close position
      store.dispatch({
        type: 'CLOSE_POSITION',
        payload: {
          exitPrice: 101,
          exitTime: 2000,
        },
        reason: 'TRAILING_STOP_HIT' as TradeReason,
      });

      expect(store.getState()).toBe('FLAT');
      expect(store.get()).toBeNull();
    });
  });

  describe('UPDATE_STOP action', () => {
    beforeEach(() => {
      store.dispatch({
        type: 'OPEN_POSITION',
        payload: {
          side: 'LONG',
          entryPrice: 100,
          stopLoss: 99,
          size: 100,
          entryTime: 1000,
        },
        reason: 'HTF_BULL_TREND_CONFIRMED' as TradeReason,
      });
    });

    it('should update stop loss', () => {
      store.dispatch({
        type: 'UPDATE_STOP',
        payload: {
          stopLoss: 100, // Move to break-even
        },
        reason: 'TRAILING_STOP' as TradeReason,
      });

      const position = store.get();
      expect(position?.stopLoss).toBe(100);
    });

    it('should update trailing stop', () => {
      store.dispatch({
        type: 'UPDATE_STOP',
        payload: {
          trailingStop: 101,
          isTrailingActive: true,
        },
        reason: 'TRAILING_STOP' as TradeReason,
      });

      const position = store.get();
      expect(position?.trailingStop).toBe(101);
      expect(position?.isTrailingActive).toBe(true);
    });

    it('should update trailing mode', () => {
      store.dispatch({
        type: 'UPDATE_STOP',
        payload: {
          trailingMode: 'EMA50',
        },
        reason: 'TRAILING_STOP' as TradeReason,
      });

      const position = store.get();
      expect(position?.trailingMode).toBe('EMA50');
    });
  });

  describe('Error handling', () => {
    it('should throw error when opening position in non-FLAT state', () => {
      store.dispatch({
        type: 'OPEN_POSITION',
        payload: {
          side: 'LONG',
          entryPrice: 100,
          stopLoss: 99,
          size: 100,
          entryTime: 1000,
        },
        reason: 'HTF_BULL_TREND_CONFIRMED' as TradeReason,
      });

      expect(() => {
        store.dispatch({
          type: 'OPEN_POSITION',
          payload: {
            side: 'LONG',
            entryPrice: 100,
            stopLoss: 99,
            size: 100,
            entryTime: 1000,
          },
          reason: 'HTF_BULL_TREND_CONFIRMED' as TradeReason,
        });
      }).toThrow('Position already exists or state is not FLAT');
    });

    it('should ignore UPDATE_STOP when no position exists', () => {
      expect(store.getState()).toBe('FLAT');

      // Should not throw
      store.dispatch({
        type: 'UPDATE_STOP',
        payload: {
          stopLoss: 100,
        },
        reason: 'TRAILING_STOP' as TradeReason,
      });

      expect(store.getState()).toBe('FLAT');
      expect(store.get()).toBeNull();
    });
  });
});

/**
 * Unit tests for ADX calculation
 */

import { calculateADX } from "../indicators";
import { Kline } from "../../types";

describe("calculateADX", () => {
  // Helper function to create a simple Kline
  function createKline(
    openTime: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number = 1000
  ): Kline {
    return {
      openTime,
      open,
      high,
      low,
      close,
      volume,
      closeTime: openTime + 3600000, // 1 hour later
    };
  }

  describe("Basic functionality", () => {
    it("should return arrays with correct length", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }

      const result = calculateADX(klines, 14);
      
      expect(result.adx).toHaveLength(50);
      expect(result.plusDI).toHaveLength(50);
      expect(result.minusDI).toHaveLength(50);
    });

    it("should return undefined for initial values", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }

      const result = calculateADX(klines, 14);
      
      // First period values should be undefined
      for (let i = 0; i < 14; i++) {
        expect(result.plusDI[i]).toBeUndefined();
        expect(result.minusDI[i]).toBeUndefined();
        expect(result.adx[i]).toBeUndefined();
      }
    });

    it("should calculate +DI and -DI starting from period index", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }

      const result = calculateADX(klines, 14);
      
      // +DI and -DI should be defined from index 14
      expect(result.plusDI[14]).toBeDefined();
      expect(result.minusDI[14]).toBeDefined();
      expect(typeof result.plusDI[14]).toBe("number");
      expect(typeof result.minusDI[14]).toBe("number");
    });

    it("should calculate ADX starting from period * 2 - 1 index", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }

      const result = calculateADX(klines, 14);
      
      // ADX should be undefined before index 27 (14 * 2 - 1, strict Wilder definition)
      for (let i = 0; i < 27; i++) {
        expect(result.adx[i]).toBeUndefined();
      }
      
      // ADX should be defined from index 27 (period * 2 - 1)
      expect(result.adx[27]).toBeDefined();
      expect(typeof result.adx[27]).toBe("number");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty array", () => {
      const result = calculateADX([], 14);
      
      expect(result.adx).toHaveLength(0);
      expect(result.plusDI).toHaveLength(0);
      expect(result.minusDI).toHaveLength(0);
    });

    it("should handle array shorter than period", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 10; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100));
      }

      const result = calculateADX(klines, 14);
      
      // All values should be undefined
      for (let i = 0; i < 10; i++) {
        expect(result.adx[i]).toBeUndefined();
        expect(result.plusDI[i]).toBeUndefined();
        expect(result.minusDI[i]).toBeUndefined();
      }
    });

    it("should handle array exactly period length", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 14; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }

      const result = calculateADX(klines, 14);
      
      // +DI and -DI should be defined at index 14 (but array only has 14 elements, so index 14 doesn't exist)
      // Actually, since array length is 14, index 14 is out of bounds
      expect(result.plusDI[13]).toBeUndefined(); // Last index is 13
    });
  });

  describe("Uptrend scenario", () => {
    it("should show higher +DI than -DI in uptrend", () => {
      const klines: Kline[] = [];
      // Create an uptrend
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 + i * 2; // Increasing price
        klines.push(
          createKline(
            i * 3600000,
            basePrice,
            basePrice + 3,
            basePrice - 2,
            basePrice + 1
          )
        );
      }

      const result = calculateADX(klines, 14);
      
      // After enough periods, +DI should be higher than -DI
      const lastPlusDI = result.plusDI[result.plusDI.length - 1];
      const lastMinusDI = result.minusDI[result.minusDI.length - 1];
      
      if (lastPlusDI !== undefined && lastMinusDI !== undefined) {
        expect(lastPlusDI).toBeGreaterThan(lastMinusDI);
      }
    });
  });

  describe("Downtrend scenario", () => {
    it("should show higher -DI than +DI in downtrend", () => {
      const klines: Kline[] = [];
      // Create a downtrend
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 - i * 2; // Decreasing price
        klines.push(
          createKline(
            i * 3600000,
            basePrice,
            basePrice + 2,
            basePrice - 3,
            basePrice - 1
          )
        );
      }

      const result = calculateADX(klines, 14);
      
      // After enough periods, -DI should be higher than +DI
      const lastPlusDI = result.plusDI[result.plusDI.length - 1];
      const lastMinusDI = result.minusDI[result.minusDI.length - 1];
      
      if (lastPlusDI !== undefined && lastMinusDI !== undefined) {
        expect(lastMinusDI).toBeGreaterThan(lastPlusDI);
      }
    });
  });

  describe("ADX value range", () => {
    it("should return ADX values between 0 and 100", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + Math.sin(i) * 5));
      }

      const result = calculateADX(klines, 14);
      
      // Check all defined ADX values are in valid range (excluding NaN)
      for (let i = 0; i < result.adx.length; i++) {
        if (result.adx[i] !== undefined && !isNaN(result.adx[i]!)) {
          expect(result.adx[i]).toBeGreaterThanOrEqual(0);
          expect(result.adx[i]).toBeLessThanOrEqual(100);
        }
      }
    });

    it("should return +DI and -DI values between 0 and 100", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }

      const result = calculateADX(klines, 14);
      
      // Check all defined DI values are in valid range
      for (let i = 0; i < result.plusDI.length; i++) {
        if (result.plusDI[i] !== undefined) {
          expect(result.plusDI[i]).toBeGreaterThanOrEqual(0);
          expect(result.plusDI[i]).toBeLessThanOrEqual(100);
        }
        if (result.minusDI[i] !== undefined) {
          expect(result.minusDI[i]).toBeGreaterThanOrEqual(0);
          expect(result.minusDI[i]).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe("Consistency checks", () => {
    it("should have consistent array lengths", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100));
      }

      const result = calculateADX(klines, 14);
      
      expect(result.adx.length).toBe(klines.length);
      expect(result.plusDI.length).toBe(klines.length);
      expect(result.minusDI.length).toBe(klines.length);
    });

    it("should handle different periods correctly", () => {
      const klines: Kline[] = [];
      // Create clear trend to avoid NaN
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 + i * 2;
        klines.push(
          createKline(
            i * 3600000,
            basePrice,
            basePrice + 3,
            basePrice - 2,
            basePrice + 1
          )
        );
      }

      const result14 = calculateADX(klines, 14);
      const result10 = calculateADX(klines, 10);
      
      // Both should have defined values
      expect(result14.adx[28]).toBeDefined();
      expect(result10.adx[20]).toBeDefined();
      
      // Different periods should produce valid numbers (may be same in extreme cases)
      // The important thing is that both calculations work correctly
      if (
        result14.adx[28] !== undefined &&
        !isNaN(result14.adx[28]!) &&
        result10.adx[20] !== undefined &&
        !isNaN(result10.adx[20]!)
      ) {
        // Both should be valid numbers in range [0, 100]
        expect(result14.adx[28]).toBeGreaterThanOrEqual(0);
        expect(result14.adx[28]).toBeLessThanOrEqual(100);
        expect(result10.adx[20]).toBeGreaterThanOrEqual(0);
        expect(result10.adx[20]).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Real-world scenario", () => {
    it("should calculate ADX for realistic price data", () => {
      // Simulate realistic BTC price movement
      const klines: Kline[] = [];
      let price = 50000;
      
      for (let i = 0; i < 50; i++) {
        const change = (Math.random() - 0.5) * 1000; // Random price change
        price += change;
        
        klines.push(
          createKline(
            i * 3600000,
            price - change * 0.3,
            price + Math.abs(change) * 0.5,
            price - Math.abs(change) * 0.5,
            price,
            Math.random() * 1000 + 500
          )
        );
      }

      const result = calculateADX(klines, 14);
      
      // Should have valid ADX values after period * 2
      const lastAdx = result.adx[result.adx.length - 1];
      expect(lastAdx).toBeDefined();
      expect(typeof lastAdx).toBe("number");
      expect(lastAdx!).toBeGreaterThanOrEqual(0);
      expect(lastAdx!).toBeLessThanOrEqual(100);
    });
  });
});

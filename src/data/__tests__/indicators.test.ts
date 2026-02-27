/**
 * Unit tests for ADX calculation
 */

import { adx } from "../indicators";
import { Kline } from "../../types";

describe("adx", () => {
  // ... rest identical, paths already correct (../indicators = data/indicators, ../../types = types)
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
      closeTime: openTime + 3600000,
    };
  }

  describe("Basic functionality", () => {
    it("should return arrays with correct length", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }
      const result = adx(klines, 14);
      expect(result.adx).toHaveLength(50);
      expect(result.plusDI).toHaveLength(50);
      expect(result.minusDI).toHaveLength(50);
    });

    it("should return undefined for initial values", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }
      const result = adx(klines, 14);
      for (let i = 0; i < 14; i++) {
        expect(Number.isNaN(result.plusDI[i])).toBe(true);
        expect(Number.isNaN(result.minusDI[i])).toBe(true);
        expect(Number.isNaN(result.adx[i])).toBe(true);
      }
    });

    it("should calculate +DI and -DI starting from period index", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 30; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }
      const result = adx(klines, 14);
      expect(Number.isNaN(result.plusDI[14])).toBe(false);
      expect(Number.isNaN(result.minusDI[14])).toBe(false);
    });

    it("should calculate ADX starting from period * 2 - 1 index", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }
      const result = adx(klines, 14);
      for (let i = 0; i < 27; i++) {
        expect(Number.isNaN(result.adx[i])).toBe(true);
      }
      expect(Number.isNaN(result.adx[27])).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty array", () => {
      const result = adx([], 14);
      expect(result.adx).toHaveLength(0);
      expect(result.plusDI).toHaveLength(0);
      expect(result.minusDI).toHaveLength(0);
    });

    it("should handle array shorter than period", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 10; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100));
      }
      const result = adx(klines, 14);
      for (let i = 0; i < 10; i++) {
        expect(Number.isNaN(result.adx[i])).toBe(true);
        expect(Number.isNaN(result.plusDI[i])).toBe(true);
        expect(Number.isNaN(result.minusDI[i])).toBe(true);
      }
    });

    it("should handle array exactly period length", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 14; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }
      const result = adx(klines, 14);
      expect(Number.isNaN(result.plusDI[13])).toBe(true);
    });
  });

  describe("Uptrend scenario", () => {
    it("should show higher +DI than -DI in uptrend", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 + i * 2;
        klines.push(
          createKline(i * 3600000, basePrice, basePrice + 3, basePrice - 2, basePrice + 1)
        );
      }
      const result = adx(klines, 14);
      const lastPlusDI = result.plusDI[result.plusDI.length - 1];
      const lastMinusDI = result.minusDI[result.minusDI.length - 1];
      if (!Number.isNaN(lastPlusDI) && !Number.isNaN(lastMinusDI)) {
        expect(lastPlusDI).toBeGreaterThan(lastMinusDI);
      }
    });
  });

  describe("Downtrend scenario", () => {
    it("should show higher -DI than +DI in downtrend", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 - i * 2;
        klines.push(
          createKline(i * 3600000, basePrice, basePrice + 2, basePrice - 3, basePrice - 1)
        );
      }
      const result = adx(klines, 14);
      const lastPlusDI = result.plusDI[result.plusDI.length - 1];
      const lastMinusDI = result.minusDI[result.minusDI.length - 1];
      if (!Number.isNaN(lastPlusDI) && !Number.isNaN(lastMinusDI)) {
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
      const result = adx(klines, 14);
      for (let i = 0; i < result.adx.length; i++) {
        if (!Number.isNaN(result.adx[i])) {
          expect(result.adx[i]).toBeGreaterThanOrEqual(0);
          expect(result.adx[i]).toBeLessThanOrEqual(100);
      }
    });

    it("should return +DI and -DI values between 0 and 100", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        klines.push(createKline(i * 3600000, 100, 105, 95, 100 + i));
      }
      const result = adx(klines, 14);
      for (let i = 0; i < result.plusDI.length; i++) {
        if (!Number.isNaN(result.plusDI[i])) {
          expect(result.plusDI[i]).toBeGreaterThanOrEqual(0);
          expect(result.plusDI[i]).toBeLessThanOrEqual(100);
        }
        if (!Number.isNaN(result.minusDI[i])) {
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
      const result = adx(klines, 14);
      expect(result.adx.length).toBe(klines.length);
      expect(result.plusDI.length).toBe(klines.length);
      expect(result.minusDI.length).toBe(klines.length);
    });

    it("should handle different periods correctly", () => {
      const klines: Kline[] = [];
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 + i * 2;
        klines.push(
          createKline(i * 3600000, basePrice, basePrice + 3, basePrice - 2, basePrice + 1)
        );
      }
      const result14 = adx(klines, 14);
      const result10 = adx(klines, 10);
      expect(Number.isNaN(result14.adx[28])).toBe(false);
      expect(Number.isNaN(result10.adx[20])).toBe(false);
      expect(result14.adx[28]).toBeGreaterThanOrEqual(0);
      expect(result14.adx[28]).toBeLessThanOrEqual(100);
      expect(result10.adx[20]).toBeGreaterThanOrEqual(0);
      expect(result10.adx[20]).toBeLessThanOrEqual(100);
    });
  });

  describe("Real-world scenario", () => {
    it("should calculate ADX for realistic price data", () => {
      const klines: Kline[] = [];
      let price = 50000;
      for (let i = 0; i < 50; i++) {
        const change = (Math.random() - 0.5) * 1000;
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
      const result = adx(klines, 14);
      const lastAdx = result.adx[result.adx.length - 1];
      expect(Number.isNaN(lastAdx)).toBe(false);
      expect(lastAdx).toBeGreaterThanOrEqual(0);
      expect(lastAdx).toBeLessThanOrEqual(100);
    });
  });
});

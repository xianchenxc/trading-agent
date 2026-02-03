/**
 * Backtest Validation Service
 * Validates backtest data quality and detects potential issues like lookahead bias
 */

import { Kline, HTFIndicatorData, LTFIndicatorData } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DataQualityCheck {
  missingBars: number;
  priceAnomalies: number;
  timeGaps: number;
  duplicateBars: number;
}

/**
 * Validate data quality for backtest
 */
export function validateDataQuality(klines: Kline[]): { isValid: boolean; check: DataQualityCheck; errors: string[] } {
  const errors: string[] = [];
  const check: DataQualityCheck = {
    missingBars: 0,
    priceAnomalies: 0,
    timeGaps: 0,
    duplicateBars: 0,
  };

  if (klines.length === 0) {
    errors.push('No klines data provided');
    return { isValid: false, check, errors };
  }

  // Check for duplicate bars (same openTime)
  const timeSet = new Set<number>();
  for (const bar of klines) {
    if (timeSet.has(bar.openTime)) {
      check.duplicateBars++;
      errors.push(`Duplicate bar found at time ${new Date(bar.openTime).toISOString()}`);
    }
    timeSet.add(bar.openTime);
  }

  // Tolerance for floating point and exchange rounding (e.g. 1e-10 or 0.01% of price)
  const eps = 1e-10;

  // Check for price anomalies
  for (const bar of klines) {
    // Check if high >= low
    if (bar.high < bar.low - eps) {
      check.priceAnomalies++;
      errors.push(`Invalid price: high (${bar.high}) < low (${bar.low}) at ${new Date(bar.openTime).toISOString()}`);
    }
    // Check if open/close are within high/low range (with small tolerance for rounding)
    if (bar.open < bar.low - eps || bar.open > bar.high + eps) {
      check.priceAnomalies++;
      errors.push(`Open price (${bar.open}) outside high/low range at ${new Date(bar.openTime).toISOString()}`);
    }
    if (bar.close < bar.low - eps || bar.close > bar.high + eps) {
      check.priceAnomalies++;
      errors.push(`Close price (${bar.close}) outside high/low range at ${new Date(bar.openTime).toISOString()}`);
    }
    // Check for zero or negative prices
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
      check.priceAnomalies++;
      errors.push(`Zero or negative price found at ${new Date(bar.openTime).toISOString()}`);
    }
  }

  // Check for time gaps (if we can determine expected interval)
  if (klines.length > 1) {
    const sortedKlines = [...klines].sort((a, b) => a.openTime - b.openTime);
    const intervals: number[] = [];
    for (let i = 1; i < sortedKlines.length; i++) {
      intervals.push(sortedKlines[i].openTime - sortedKlines[i - 1].openTime);
    }
    
    if (intervals.length > 0) {
      // Find most common interval (mode)
      const intervalCounts = new Map<number, number>();
      for (const interval of intervals) {
        intervalCounts.set(interval, (intervalCounts.get(interval) || 0) + 1);
      }
      const mostCommonInterval = Array.from(intervalCounts.entries())
        .sort((a, b) => b[1] - a[1])[0][0];
      
      // Check for gaps significantly larger than expected
      for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] > mostCommonInterval * 2) {
          check.timeGaps++;
          errors.push(`Large time gap detected: ${intervals[i]}ms (expected ~${mostCommonInterval}ms) at ${new Date(sortedKlines[i].openTime).toISOString()}`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    check,
    errors,
  };
}

/**
 * Validate HTF/LTF time alignment to detect lookahead bias.
 * rawHtfIndicators has length = htfKlines.length; mappedHtfIndicators has length = ltfKlines.length.
 */
export function validateTimeAlignment(
  ltfKlines: Kline[],
  htfKlines: Kline[],
  rawHtfIndicators: HTFIndicatorData[],
  mappedHtfIndicators: HTFIndicatorData[]
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (htfKlines.length !== rawHtfIndicators.length) {
    errors.push(
      `HTF klines length (${htfKlines.length}) doesn't match raw HTF indicators length (${rawHtfIndicators.length})`
    );
    return { isValid: false, errors, warnings };
  }

  if (ltfKlines.length !== mappedHtfIndicators.length) {
    errors.push(
      `LTF klines length (${ltfKlines.length}) doesn't match mapped HTF indicators length (${mappedHtfIndicators.length})`
    );
    return { isValid: false, errors, warnings };
  }

  // Earliest HTF close time (for warmup detection)
  const minHtfCloseTime = htfKlines.length > 0
    ? Math.min(...htfKlines.map((k) => k.closeTime))
    : 0;

  // Check each LTF bar's mapped HTF indicator; collapse consecutive "no match" into one warning
  let noMatchStart: number | null = null;

  for (let i = 0; i < ltfKlines.length; i++) {
    const ltfBar = ltfKlines[i];
    const mappedIndicator = mappedHtfIndicators[i];

    // Find the HTF bar that should be used (most recent that closed at or before LTF bar opened)
    let matchedHTFBar: { bar: Kline; indicator: HTFIndicatorData } | null = null;
    for (let j = htfKlines.length - 1; j >= 0; j--) {
      const htfBar = htfKlines[j];
      if (htfBar.closeTime <= ltfBar.openTime) {
        matchedHTFBar = { bar: htfBar, indicator: rawHtfIndicators[j] };
        break;
      }
    }

    if (matchedHTFBar) {
      // Emit one warning for the preceding "no match" streak (if any)
      if (noMatchStart !== null) {
        const firstLtfBar = ltfKlines[noMatchStart];
        const count = i - noMatchStart;
        const isWarmup = firstLtfBar.openTime < minHtfCloseTime;
        if (isWarmup) {
          warnings.push(
            `No matching HTF bar for ${count} LTF bar(s) at start of data (first: ${new Date(firstLtfBar.openTime).toISOString()}). ` +
              `Expected when LTF starts before first HTF close; strategy will HOLD until HTF data is available.`
          );
        } else {
          warnings.push(
            `No matching HTF bar for ${count} LTF bar(s) (first: ${new Date(firstLtfBar.openTime).toISOString()})`
          );
        }
        noMatchStart = null;
      }
      // Check for lookahead bias: HTF bar must have closed at or before LTF bar opened
      if (matchedHTFBar.bar.closeTime > ltfBar.openTime) {
        errors.push(
          `Lookahead bias detected: LTF bar at ${new Date(ltfBar.openTime).toISOString()} ` +
            `uses HTF bar that closed at ${new Date(matchedHTFBar.bar.closeTime).toISOString()}`
        );
      }

      // Optional: warn if mapped indicator doesn't match expected (e.g. undefined vs value)
      const expected = matchedHTFBar.indicator;
      if (
        expected.ema50 !== mappedIndicator.ema50 ||
        expected.ema200 !== mappedIndicator.ema200 ||
        expected.adx !== mappedIndicator.adx
      ) {
        warnings.push(
          `LTF bar at ${new Date(ltfBar.openTime).toISOString()} may be using incorrect HTF indicator`
        );
      }
    } else {
      // No match: expected when LTF bar is before first HTF close (warmup); report once per streak
      if (noMatchStart === null) noMatchStart = i;
    }
  }

  // One warning for remaining "no match" streak (at start or end of data)
  if (noMatchStart !== null) {
    const firstLtfBar = ltfKlines[noMatchStart];
    const count = ltfKlines.length - noMatchStart;
    const isWarmup = firstLtfBar.openTime < minHtfCloseTime;
    if (isWarmup) {
      warnings.push(
        `No matching HTF bar for ${count} LTF bar(s) at start of data (first: ${new Date(firstLtfBar.openTime).toISOString()}). ` +
          `Expected when LTF starts before first HTF close; strategy will HOLD until HTF data is available.`
      );
    } else {
      warnings.push(
        `No matching HTF bar for ${count} LTF bar(s) (first: ${new Date(firstLtfBar.openTime).toISOString()})`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Comprehensive backtest validation.
 * htfIndicatorsMapped = aligned to LTF (length = ltfKlines.length);
 * rawHtfIndicators = per HTF bar (length = htfKlines.length).
 */
export function validateBacktest(
  instanceId: string,
  ltfKlines: Kline[],
  htfKlines: Kline[],
  rawHtfIndicators: HTFIndicatorData[],
  htfIndicatorsMapped: HTFIndicatorData[],
  ltfIndicators: LTFIndicatorData[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate LTF data quality
  const ltfQuality = validateDataQuality(ltfKlines);
  if (!ltfQuality.isValid) {
    errors.push(`[${instanceId}] LTF data quality issues:`, ...ltfQuality.errors);
  }

  // Validate HTF data quality
  const htfQuality = validateDataQuality(htfKlines);
  if (!htfQuality.isValid) {
    errors.push(`[${instanceId}] HTF data quality issues:`, ...htfQuality.errors);
  }

  // Validate time alignment (pass raw HTF indicators and mapped HTF indicators)
  const alignmentCheck = validateTimeAlignment(
    ltfKlines,
    htfKlines,
    rawHtfIndicators,
    htfIndicatorsMapped
  );
  if (!alignmentCheck.isValid) {
    errors.push(`[${instanceId}] Time alignment issues:`, ...alignmentCheck.errors);
  }
  warnings.push(...alignmentCheck.warnings);

  // Check LTF klines and LTF indicators length match
  if (ltfKlines.length !== ltfIndicators.length) {
    errors.push(
      `[${instanceId}] LTF klines length (${ltfKlines.length}) doesn't match LTF indicators length (${ltfIndicators.length})`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Time Alignment Service
 * Handles HTF/LTF indicator alignment for multi-timeframe analysis
 */

import { Kline, HTFIndicatorData } from '../types';

/**
 * Map HTF indicators to LTF bars based on time alignment
 * For each LTF bar, find the most recent HTF bar that closed at or before the LTF bar opened
 * 
 * IMPORTANT: This ensures no lookahead bias - we only use HTF indicators from bars that
 * have completely closed before the LTF bar starts processing.
 */
export function alignHTFIndicatorsToLTF(
  ltfKlines: Kline[],
  htfKlines: Kline[],
  htfIndicators: HTFIndicatorData[]
): HTFIndicatorData[] {
  const mappedHTFIndicators: HTFIndicatorData[] = [];
  
  for (const ltfBar of ltfKlines) {
    let matchedHTFIndicator: HTFIndicatorData | null = null;
    
    // Find the most recent HTF bar that closed at or before this LTF bar opened
    // Using <= ensures we include HTF bars that closed exactly when LTF bar opened
    // This prevents lookahead bias by only using data from completed HTF bars
    for (let i = htfKlines.length - 1; i >= 0; i--) {
      const htfBar = htfKlines[i];
      if (htfBar.closeTime <= ltfBar.openTime) {
        matchedHTFIndicator = htfIndicators[i];
        break;
      }
    }
    
    // Use matched indicator or provide default
    mappedHTFIndicators.push(matchedHTFIndicator || {
      ema50: undefined,
      ema200: undefined,
      adx: undefined,
    });
  }
  
  return mappedHTFIndicators;
}

/**
 * Find HTF indicator for a specific LTF bar
 * 
 * IMPORTANT: This ensures no lookahead bias - we only use HTF indicators from bars that
 * have completely closed at or before the LTF bar starts processing.
 */
export function findHTFIndicatorForLTFBar(
  ltfBar: Kline,
  htfKlines: Kline[],
  htfIndicators: HTFIndicatorData[]
): HTFIndicatorData {
  // Find the most recent HTF bar that closed at or before this LTF bar opened
  // Using <= ensures we include HTF bars that closed exactly when LTF bar opened
  // This prevents lookahead bias by only using data from completed HTF bars
  for (let i = htfKlines.length - 1; i >= 0; i--) {
    const htfBar = htfKlines[i];
    if (htfBar.closeTime <= ltfBar.openTime) {
      return htfIndicators[i];
    }
  }
  
  // Return default if no match found
  return {
    ema50: undefined,
    ema200: undefined,
    adx: undefined,
  };
}

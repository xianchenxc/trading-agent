/**
 * Robustness Check for v5 Strategy
 * Tests 27 parameter combinations to verify stability
 *
 * Parameters tested:
 * - trendExhaustADX: [18, 20, 22]
 * - trendExhaustBars: [2, 3, 4]
 * - profitLockR: [off, 3.0, 4.0]
 *
 * Total combinations: 3 × 3 × 3 = 27
 */

import { DataFetcher } from "../../data/fetcher";
import { BacktestEngine } from "./backtestEngine";
import { defaultConfig, Config } from "../../config/config";
import { globalConfig } from "../../config/globalConfig";
import { HTFIndicatorData, BacktestResult } from "../../types";
import { buildHTFIndicators, buildLTFIndicators } from "../../data/indicatorBuilders";

export interface RobustnessResult {
  trendExhaustADX: number;
  trendExhaustBars: number;
  profitLockR: number | "off";

  totalReturnPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  totalTrades: number;
  winRatePct: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
}

export interface ProfitLockGroupStats {
  profitLockR: "off" | 3 | 4;
  avgProfitFactor: number;
  avgMaxDrawdown: number;
  avgTotalReturn: number;
  minProfitFactor: number;
  maxProfitFactor: number;
}

export interface RobustnessReport {
  results: RobustnessResult[];
  profitLockStats: ProfitLockGroupStats[];
  anomalies: RobustnessResult[];
  conclusion: string;
}

/**
 * Run robustness check with all parameter combinations
 */
export async function runRobustnessCheck(): Promise<RobustnessReport> {
  const baseConfig: Config = {
    ...defaultConfig,
    backtest: {
      startDate: "2025-01-01",
      endDate: "2026-01-01",
    },
  };
  const symbol = "ETHUSDT";

  const trendExhaustADXValues = [18, 20, 22];
  const trendExhaustBarsValues = [2, 3, 4];
  const profitLockRValues: (number | "off")[] = ["off", 3.0, 4.0];

  console.log("=".repeat(80));
  console.log("🧠 v5 Strategy Robustness Check");
  console.log("=".repeat(80));
  console.log(`Symbol: ${symbol}`);
  console.log(`Period: ${baseConfig.backtest!.startDate} ~ ${baseConfig.backtest!.endDate}`);
  console.log(`Total Combinations: ${trendExhaustADXValues.length * trendExhaustBarsValues.length * profitLockRValues.length}`);
  console.log("=".repeat(80));
  console.log();

  console.log("📊 Fetching historical data...");
  const fetcher = new DataFetcher(
    globalConfig.exchange.baseUrl,
    globalConfig.cache.enabled,
    globalConfig.cache.directory
  );

  const startDate = new Date(baseConfig.backtest!.startDate);
  const endDate = new Date(baseConfig.backtest!.endDate);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const htfKlines = await fetcher.fetchKlinesForBacktest(
    symbol,
    baseConfig.timeframe.trend,
    startTime,
    endTime
  );
  const ltfKlines = await fetcher.fetchKlinesForBacktest(
    symbol,
    baseConfig.timeframe.signal,
    startTime,
    endTime
  );

  console.log(`Fetched ${htfKlines.length} HTF klines, ${ltfKlines.length} LTF klines`);
  console.log();

  console.log("📈 Calculating indicators...");
  const htfIndicators = buildHTFIndicators(htfKlines, baseConfig.indicators);
  const ltfIndicators = buildLTFIndicators(
    ltfKlines,
    baseConfig.indicators,
    baseConfig.strategy.lookbackPeriod
  );

  const mappedHTFIndicators: HTFIndicatorData[] = [];
  for (const ltfBar of ltfKlines) {
    let matchedHTFIndicator: HTFIndicatorData | null = null;
    for (let i = htfKlines.length - 1; i >= 0; i--) {
      const htfBar = htfKlines[i];
      if (htfBar.closeTime < ltfBar.openTime) {
        matchedHTFIndicator = htfIndicators[i];
        break;
      }
    }
    mappedHTFIndicators.push(matchedHTFIndicator || {
      ema50: undefined,
      ema200: undefined,
      adx: undefined,
    });
  }
  console.log("Indicators calculated");
  console.log();

  const results: RobustnessResult[] = [];
  let combinationIndex = 0;
  const totalCombinations = trendExhaustADXValues.length * trendExhaustBarsValues.length * profitLockRValues.length;

  console.log("🧪 Running backtests...");
  console.log("-".repeat(80));

  for (const trendExhaustADX of trendExhaustADXValues) {
    for (const trendExhaustBars of trendExhaustBarsValues) {
      for (const profitLockR of profitLockRValues) {
        combinationIndex++;

        const config: Config = {
          ...baseConfig,
          risk: {
            ...baseConfig.risk,
            trendExhaustADX,
            trendExhaustBars,
            profitLockR: profitLockR === "off" ? undefined : profitLockR,
          },
        };

        const engine = new BacktestEngine(config, true);
        const backtestResult = engine.run(
          ltfKlines,
          mappedHTFIndicators,
          ltfIndicators
        );

        const totalReturnPct = ((backtestResult.finalEquity - config.account.initialCapital) / config.account.initialCapital) * 100;
        const maxDrawdownPct = (backtestResult.stats.maxDrawdown / config.account.initialCapital) * 100;

        const winningTrades = backtestResult.trades.filter(t => t.pnl > 0);
        const losingTrades = backtestResult.trades.filter(t => t.pnl < 0);
        const avgWin = winningTrades.length > 0
          ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
          : 0;
        const avgLoss = losingTrades.length > 0
          ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
          : 0;

        const result: RobustnessResult = {
          trendExhaustADX,
          trendExhaustBars,
          profitLockR,
          totalReturnPct,
          maxDrawdownPct,
          profitFactor: backtestResult.stats.profitFactor,
          totalTrades: backtestResult.stats.totalTrades,
          winRatePct: backtestResult.stats.winRate,
          avgWin,
          avgLoss,
          maxWin: backtestResult.stats.maxWin,
        };

        results.push(result);

        const progress = ((combinationIndex / totalCombinations) * 100).toFixed(1);
        console.log(
          `[${combinationIndex}/${totalCombinations}] (${progress}%) ` +
          `ADX=${trendExhaustADX}, Bars=${trendExhaustBars}, Lock=${profitLockR} | ` +
          `PF=${result.profitFactor.toFixed(2)}, DD=${result.maxDrawdownPct.toFixed(2)}%, ` +
          `Return=${result.totalReturnPct.toFixed(2)}%`
        );
      }
    }
  }

  console.log("-".repeat(80));
  console.log();

  const sortedResults = [...results].sort((a, b) => b.profitFactor - a.profitFactor);

  const profitLockStats: ProfitLockGroupStats[] = [];
  for (const profitLockR of profitLockRValues) {
    const groupResults = results.filter(r => r.profitLockR === profitLockR);
    if (groupResults.length === 0) continue;

    const profitFactors = groupResults.map(r => r.profitFactor);
    const drawdowns = groupResults.map(r => r.maxDrawdownPct);
    const returns = groupResults.map(r => r.totalReturnPct);

    profitLockStats.push({
      profitLockR: profitLockR === "off" ? "off" : (profitLockR as 3 | 4),
      avgProfitFactor: profitFactors.reduce((a, b) => a + b, 0) / profitFactors.length,
      avgMaxDrawdown: drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length,
      avgTotalReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
      minProfitFactor: Math.min(...profitFactors),
      maxProfitFactor: Math.max(...profitFactors),
    });
  }

  const anomalies: RobustnessResult[] = results.filter(r =>
    r.profitFactor < 1.5 ||
    r.maxDrawdownPct > 6 ||
    r.avgWin < r.avgLoss * 1.5
  );

  const avgPF = results.reduce((sum, r) => sum + r.profitFactor, 0) / results.length;
  const minPF = Math.min(...results.map(r => r.profitFactor));
  const maxPF = Math.max(...results.map(r => r.profitFactor));
  const avgDD = results.reduce((sum, r) => sum + r.maxDrawdownPct, 0) / results.length;
  const maxDD = Math.max(...results.map(r => r.maxDrawdownPct));

  let conclusion = `在 ${results.length} 组参数组合中，`;
  conclusion += `Profit Factor 平均值为 ${avgPF.toFixed(2)}，范围在 ${minPF.toFixed(2)} ~ ${maxPF.toFixed(2)}。`;
  conclusion += `最大回撤平均值为 ${avgDD.toFixed(2)}%，最大值为 ${maxDD.toFixed(2)}%。`;

  if (anomalies.length > 0) {
    conclusion += `检测到 ${anomalies.length} 组异常组合（PF < 1.5 或 DD > 6% 或 AvgWin < AvgLoss × 1.5）。`;
  } else {
    conclusion += `所有参数组合均表现稳定，未发现异常。`;
  }

  return {
    results: sortedResults,
    profitLockStats,
    anomalies,
    conclusion,
  };
}

/**
 * Format and display robustness report
 */
export function displayRobustnessReport(report: RobustnessReport) {
  console.log("=".repeat(80));
  console.log("📊 Robustness Check Results");
  console.log("=".repeat(80));
  console.log();

  console.log("1️⃣ Complete Results Table (Sorted by Profit Factor)");
  console.log("-".repeat(80));
  console.log(
    "Rank".padEnd(6) +
    "ADX".padEnd(6) +
    "Bars".padEnd(6) +
    "Lock".padEnd(8) +
    "PF".padEnd(8) +
    "DD%".padEnd(8) +
    "Return%".padEnd(10) +
    "Trades".padEnd(8) +
    "Win%".padEnd(8) +
    "AvgWin".padEnd(10) +
    "AvgLoss".padEnd(10) +
    "MaxWin".padEnd(10)
  );
  console.log("-".repeat(80));

  report.results.forEach((r, index) => {
    const lockStr = r.profitLockR === "off" ? "off" : r.profitLockR.toString();
    console.log(
      `${(index + 1).toString().padEnd(6)}` +
      `${r.trendExhaustADX.toString().padEnd(6)}` +
      `${r.trendExhaustBars.toString().padEnd(6)}` +
      `${lockStr.padEnd(8)}` +
      `${r.profitFactor.toFixed(2).padEnd(8)}` +
      `${r.maxDrawdownPct.toFixed(2).padEnd(8)}` +
      `${r.totalReturnPct.toFixed(2).padEnd(10)}` +
      `${r.totalTrades.toString().padEnd(8)}` +
      `${r.winRatePct.toFixed(2).padEnd(8)}` +
      `$${r.avgWin.toFixed(2).padEnd(9)}` +
      `$${r.avgLoss.toFixed(2).padEnd(9)}` +
      `$${r.maxWin.toFixed(2)}`
    );
  });

  console.log("-".repeat(80));
  console.log();

  console.log("2️⃣ Profit Lock Group Statistics");
  console.log("-".repeat(80));
  console.log(
    "Lock".padEnd(8) +
    "Avg PF".padEnd(10) +
    "Min PF".padEnd(10) +
    "Max PF".padEnd(10) +
    "Avg DD%".padEnd(10) +
    "Avg Return%".padEnd(12)
  );
  console.log("-".repeat(80));

  report.profitLockStats.forEach(stat => {
    const lockStr = stat.profitLockR === "off" ? "off" : stat.profitLockR.toString();
    console.log(
      `${lockStr.padEnd(8)}` +
      `${stat.avgProfitFactor.toFixed(2).padEnd(10)}` +
      `${stat.minProfitFactor.toFixed(2).padEnd(10)}` +
      `${stat.maxProfitFactor.toFixed(2).padEnd(10)}` +
      `${stat.avgMaxDrawdown.toFixed(2).padEnd(10)}` +
      `${stat.avgTotalReturn.toFixed(2)}`
    );
  });

  console.log("-".repeat(80));
  console.log();

  if (report.anomalies.length > 0) {
    console.log("3️⃣ ⚠️  Anomaly Detection");
    console.log("-".repeat(80));
    console.log(`Found ${report.anomalies.length} anomaly combinations:`);
    console.log();

    report.anomalies.forEach((r, index) => {
      const issues: string[] = [];
      if (r.profitFactor < 1.5) issues.push(`PF < 1.5 (${r.profitFactor.toFixed(2)})`);
      if (r.maxDrawdownPct > 6) issues.push(`DD > 6% (${r.maxDrawdownPct.toFixed(2)}%)`);
      if (r.avgWin < r.avgLoss * 1.5) issues.push(`AvgWin < AvgLoss × 1.5 (${r.avgWin.toFixed(2)} < ${(r.avgLoss * 1.5).toFixed(2)})`);

      const lockStr = r.profitLockR === "off" ? "off" : r.profitLockR.toString();
      console.log(
        `${index + 1}. ADX=${r.trendExhaustADX}, Bars=${r.trendExhaustBars}, Lock=${lockStr} | ` +
        `Issues: ${issues.join(", ")}`
      );
    });

    console.log("-".repeat(80));
    console.log();
  } else {
    console.log("3️⃣ ✅ No Anomalies Detected");
    console.log("-".repeat(80));
    console.log("All parameter combinations passed the robustness criteria.");
    console.log();
  }

  console.log("4️⃣ Conclusion");
  console.log("-".repeat(80));
  console.log(report.conclusion);
  console.log("-".repeat(80));
  console.log();
}

/**
 * Backtest Report Service
 * Generates detailed backtest reports with statistics and analysis
 */

import { BacktestResult, TradeRecord } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface MonthlyStats {
  year: number;
  month: number;
  trades: number;
  winRate: number;
  totalReturn: number;
  pnl: number;
}

export interface DetailedBacktestReport {
  instanceId: string;
  summary: BacktestResult['stats'];
  monthlyStats: MonthlyStats[];
  tradeDistribution: {
    winCount: number;
    lossCount: number;
    maxWin: number;
    maxLoss: number;
    avgWin: number;
    avgLoss: number;
  };
  drawdownAnalysis: {
    maxDrawdown: number;
    maxDrawdownPercent: number;
    avgDrawdown: number;
    drawdownPeriods: number;
  };
  equityCurve: Array<{ time: number; equity: number }>;
}

/**
 * Generate detailed backtest report
 */
export function generateDetailedReport(
  instanceId: string,
  result: BacktestResult
): DetailedBacktestReport {
  // Calculate monthly statistics
  const monthlyStats = calculateMonthlyStats(result.trades, result.initialCapital);

  // Calculate trade distribution
  const tradeDistribution = calculateTradeDistribution(result.trades);

  // Calculate drawdown analysis
  const drawdownAnalysis = calculateDrawdownAnalysis(result);

  // Generate equity curve
  const equityCurve = generateEquityCurve(result);

  return {
    instanceId,
    summary: result.stats,
    monthlyStats,
    tradeDistribution,
    drawdownAnalysis,
    equityCurve,
  };
}

/**
 * Calculate monthly statistics
 */
function calculateMonthlyStats(
  trades: TradeRecord[],
  initialCapital: number
): MonthlyStats[] {
  const monthlyMap = new Map<string, MonthlyStats>();

  let runningEquity = initialCapital;

  for (const trade of trades) {
    const date = new Date(trade.exitTime);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${month}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        year,
        month,
        trades: 0,
        winRate: 0,
        totalReturn: 0,
        pnl: 0,
      });
    }

    const stats = monthlyMap.get(key)!;
    stats.trades++;
    stats.pnl += trade.pnl;
    runningEquity += trade.pnl;
    stats.totalReturn = ((runningEquity - initialCapital) / initialCapital) * 100;
  }

  // Calculate win rates
  for (const [key, stats] of monthlyMap) {
    const monthTrades = trades.filter((t) => {
      const date = new Date(t.exitTime);
      return date.getFullYear() === stats.year && date.getMonth() + 1 === stats.month;
    });
    const wins = monthTrades.filter((t) => t.pnl > 0).length;
    stats.winRate = monthTrades.length > 0 ? (wins / monthTrades.length) * 100 : 0;
  }

  return Array.from(monthlyMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

/**
 * Calculate trade distribution statistics
 */
function calculateTradeDistribution(trades: TradeRecord[]): DetailedBacktestReport['tradeDistribution'] {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);

  return {
    winCount: wins.length,
    lossCount: losses.length,
    maxWin: wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0,
    maxLoss: losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0,
    avgWin: wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0,
    avgLoss: losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0,
  };
}

/**
 * Calculate drawdown analysis
 */
function calculateDrawdownAnalysis(result: BacktestResult): DetailedBacktestReport['drawdownAnalysis'] {
  let maxEquity = result.initialCapital;
  let maxDrawdown = 0;
  let totalDrawdown = 0;
  let drawdownPeriods = 0;
  let currentDrawdown = 0;

  for (const trade of result.trades) {
    if (trade.equityAfterTrade > maxEquity) {
      maxEquity = trade.equityAfterTrade;
      if (currentDrawdown > 0) {
        totalDrawdown += currentDrawdown;
        drawdownPeriods++;
        currentDrawdown = 0;
      }
    } else {
      const drawdown = maxEquity - trade.equityAfterTrade;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
      currentDrawdown = Math.max(currentDrawdown, drawdown);
    }
  }

  if (currentDrawdown > 0) {
    totalDrawdown += currentDrawdown;
    drawdownPeriods++;
  }

  const avgDrawdown = drawdownPeriods > 0 ? totalDrawdown / drawdownPeriods : 0;
  const maxDrawdownPercent = result.initialCapital > 0
    ? (maxDrawdown / result.initialCapital) * 100
    : 0;

  return {
    maxDrawdown,
    maxDrawdownPercent,
    avgDrawdown,
    drawdownPeriods,
  };
}

/**
 * Generate equity curve data points
 */
function generateEquityCurve(result: BacktestResult): Array<{ time: number; equity: number }> {
  const curve: Array<{ time: number; equity: number }> = [
    { time: result.trades[0]?.entryTime || 0, equity: result.initialCapital },
  ];

  let currentEquity = result.initialCapital;
  for (const trade of result.trades) {
    currentEquity = trade.equityAfterTrade;
    curve.push({
      time: trade.exitTime,
      equity: currentEquity,
    });
  }

  return curve;
}

/**
 * Format report as text
 */
export function formatReportAsText(report: DetailedBacktestReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push(`Backtest Report: ${report.instanceId}`);
  lines.push('='.repeat(80));
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push('-'.repeat(80));
  lines.push(`Total Trades: ${report.summary.totalTrades}`);
  lines.push(`Win Rate: ${report.summary.winRate.toFixed(2)}%`);
  lines.push(`Total Return: ${report.summary.totalReturn.toFixed(2)}%`);
  lines.push(`Profit Factor: ${report.summary.profitFactor.toFixed(2)}`);
  lines.push(`Max Drawdown: ${report.drawdownAnalysis.maxDrawdownPercent.toFixed(2)}%`);
  lines.push('');

  // Monthly Stats
  if (report.monthlyStats.length > 0) {
    lines.push('MONTHLY STATISTICS');
    lines.push('-'.repeat(80));
    lines.push('Month      | Trades | Win Rate | Return % | PnL');
    lines.push('-'.repeat(80));
    for (const month of report.monthlyStats) {
      lines.push(
        `${month.year}-${String(month.month).padStart(2, '0')} | ` +
        `${String(month.trades).padStart(6)} | ` +
        `${month.winRate.toFixed(2).padStart(7)}% | ` +
        `${month.totalReturn.toFixed(2).padStart(7)}% | ` +
        `$${month.pnl.toFixed(2)}`
      );
    }
    lines.push('');
  }

  // Trade Distribution
  lines.push('TRADE DISTRIBUTION');
  lines.push('-'.repeat(80));
  lines.push(`Winning Trades: ${report.tradeDistribution.winCount}`);
  lines.push(`Losing Trades: ${report.tradeDistribution.lossCount}`);
  lines.push(`Average Win: $${report.tradeDistribution.avgWin.toFixed(2)}`);
  lines.push(`Average Loss: $${report.tradeDistribution.avgLoss.toFixed(2)}`);
  lines.push(`Max Win: $${report.tradeDistribution.maxWin.toFixed(2)}`);
  lines.push(`Max Loss: $${report.tradeDistribution.maxLoss.toFixed(2)}`);
  lines.push('');

  // Drawdown Analysis
  lines.push('DRAWDOWN ANALYSIS');
  lines.push('-'.repeat(80));
  lines.push(`Max Drawdown: ${report.drawdownAnalysis.maxDrawdownPercent.toFixed(2)}%`);
  lines.push(`Average Drawdown: $${report.drawdownAnalysis.avgDrawdown.toFixed(2)}`);
  lines.push(`Drawdown Periods: ${report.drawdownAnalysis.drawdownPeriods}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Export report to JSON file
 */
export function exportReportToJSON(
  report: DetailedBacktestReport,
  outputPath: string
): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

/**
 * Export report to CSV
 */
export function exportReportToCSV(
  report: DetailedBacktestReport,
  outputPath: string
): void {
  const lines: string[] = [];

  // Summary CSV
  lines.push('Metric,Value');
  lines.push(`Total Trades,${report.summary.totalTrades}`);
  lines.push(`Win Rate,${report.summary.winRate.toFixed(2)}`);
  lines.push(`Total Return,${report.summary.totalReturn.toFixed(2)}`);
  lines.push(`Profit Factor,${report.summary.profitFactor.toFixed(2)}`);
  lines.push(`Max Drawdown,${report.drawdownAnalysis.maxDrawdownPercent.toFixed(2)}`);
  lines.push('');

  // Monthly stats CSV
  if (report.monthlyStats.length > 0) {
    lines.push('Year,Month,Trades,Win Rate,Total Return,PnL');
    for (const month of report.monthlyStats) {
      lines.push(
        `${month.year},${month.month},${month.trades},${month.winRate.toFixed(2)},${month.totalReturn.toFixed(2)},${month.pnl.toFixed(2)}`
      );
    }
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

/**
 * Entry point for robustness check
 */

import { runRobustnessCheck, displayRobustnessReport } from "./backtest/robustnessCheck";

async function main() {
  try {
    const report = await runRobustnessCheck();
    displayRobustnessReport(report);
  } catch (error: any) {
    console.error("Robustness check failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

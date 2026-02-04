/**
 * Main entry point for Trading Agent
 * Dispatches to backtest, paper, or live command based on --mode=
 */

import { runBacktest } from "./commands/backtest";
import { runPaperTrading } from "./commands/paper";
import { runLiveTrading } from "./commands/live";

async function main() {
  const args = process.argv.slice(2);
  let mode = "backtest";

  if (args.includes("--mode=backtest")) {
    mode = "backtest";
  } else if (args.includes("--mode=paper")) {
    mode = "paper";
  } else if (args.includes("--mode=live")) {
    mode = "live";
  }

  if (mode === "backtest") {
    await runBacktest();
  } else if (mode === "paper") {
    await runPaperTrading();
  } else if (mode === "live") {
    await runLiveTrading();
  } else {
    console.log("Unknown mode. Use --mode=backtest, --mode=paper, or --mode=live");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

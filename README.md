# Trading Agent

TypeScript-based cryptocurrency trend-following trading agent with a strict three-layer architecture and config-driven multi-instance management.  
Supports backtesting and paper trading; live trading entry points are defined but not wired to a real exchange yet.

## Core Ideas

- **Three-layer architecture**
  - **Instance Layer (`src/instance/`)**: Orchestrates strategy instances and enforces execution order (Risk → Strategy → Engine).
  - **Core Layer (`src/core/`)**: Pure business logic – strategy, risk management, state, and per-instance logging.
  - **Engine Layer (`src/engine/`)**: Execution backends for backtest / paper trading, isolated from strategy logic.

- **Config-driven instances**
  - Global infrastructure config in `src/config/globalConfig.ts`.
  - Strategy/runtime config types and defaults in `src/config/config.ts`.
  - All strategy instances registered in `src/config/instanceConfig.ts`.
  - **New instance = add config only**, no business code changes.

- **Risk management**
  - Single Risk Manager (`src/core/risk/riskManager.ts`) with:
    - Delayed Trailing Stop in three stages (initial stop → break-even → EMA-based trailing).
    - Profit lock and trend-exhaustion filter for trailing-stop exits.
  - Pure-function design with comprehensive unit tests.

## Project Structure (core folders)

```text
src/
  commands/        # CLI entry commands (backtest / paper / live)
  instance/        # Instance Layer
  core/            # Core Layer (strategy / risk / state / logger)
  engine/          # Engine Layer (backtest / paper)
  config/          # Global + per-instance config
  data/            # Data fetching, cache, indicators
  services/        # Data preparation & time alignment services
  tools/           # One-off tools (e.g. robustness checks)
  utils/           # Shared utilities (logger, time, slippage, etc.)
  types.ts         # Shared types
  index.ts         # Main entry (dispatch by --mode)
```

## Getting Started

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Run modes

```bash
# Backtest (main entry point)
npm run backtest       # ts-node src/index.ts --mode=backtest

# Paper trading (simulated live)
npm run paper          # ts-node src/index.ts --mode=paper

# Live trading (entry wired, exchange integration TBD)
npm run live           # ts-node src/index.ts --mode=live

# Dev mode (directly run index.ts)
npm run dev
```

### Tests

```bash
npm test
```

## License

MIT

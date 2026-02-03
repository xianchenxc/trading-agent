---
name: Strategy Platform v0.1 Architecture Design
overview: 将当前单实例交易系统演进为支持多实例并行运行的策略平台，通过实例隔离、配置驱动和引擎抽象实现架构升级
todos:
  - id: create-directory-structure
    content: 创建新目录结构：instance/, core/{strategy,risk,state,logger}/, engine/
    status: completed
  - id: migrate-core-layer
    content: 迁移 Core Layer 代码到 core/ 目录，更新 TradeLogger.logExit() 支持 commission/slippage
    status: completed
  - id: create-engine-layer
    content: 创建 IEngine 接口和 BacktestEngine 实现，包含 commission/slippage 计算
    status: completed
  - id: create-instance-layer
    content: 创建 StrategyInstance, StrategyInstanceRunner, InstanceOrchestrator（含 runBacktest 方法）
    status: completed
  - id: create-config-registry
    content: 创建 instanceConfig.ts 配置注册表，定义多个实例配置示例
    status: completed
  - id: refactor-index
    content: 重构 index.ts：支持多实例回测，使用 InstanceOrchestrator.runBacktest()
    status: completed
  - id: verify-single-instance
    content: 验证单实例回测结果与现有系统一致
    status: completed
  - id: verify-multi-instance
    content: 验证多实例并行回测，确保实例隔离和结果正确
    status: completed
isProject: false
---

# Strategy Platform v0.1 架构设计

## 第一步：整体架构设计

### 模块划分（三层架构）

```
┌─────────────────────────────────────────────────────────┐
│                    Instance Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Instance 1   │  │ Instance 2   │  │ Instance N   │ │
│  │ BTCUSDT      │  │ ETHUSDT      │  │ ...          │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│                    Core Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Strategy │  │   Risk   │  │ Position │  │ Logger │ │
│  │          │  │  Manager │  │  Store   │  │        │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│                    Engine Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Backtest     │  │ Paper        │  │ Live         │ │
│  │ Engine       │  │ Engine       │  │ Engine       │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 职责边界

#### Core Layer（不会频繁改）

- **Strategy**: 纯函数，接收 context 返回信号，无状态
- **RiskManager**: 纯函数，计算仓位和止损，无状态
- **PositionStore**: 状态机，管理单个实例的持仓状态
- **TradeLogger**: 记录单个实例的交易日志和权益

#### Instance Layer（可扩展）

- **StrategyInstance**: 一个配置驱动的实例，包含：
  - 唯一标识（instanceId）
  - 配置（Config）
  - 状态组件（PositionStore, TradeLogger）
  - 策略函数引用（不修改策略逻辑）
- **StrategyInstanceRunner**: 执行单个实例的 onBar 逻辑
  - 执行顺序：RiskManager → Strategy → Engine
  - 完全隔离，不共享状态

#### Engine Layer（回测/实盘差异）

- **IEngine**: 接口，定义数据获取和执行方式
- **BacktestEngine**: 历史数据回放，同步执行
- **PaperEngine**: 模拟实盘，实时数据流（未来）
- **LiveEngine**: 实盘交易，实时数据流（未来）

### 执行流程（单个实例）

```
onBar(bar, htfIndicator, ltfIndicator)
  ↓
1. RiskManager.checkStopLoss(position, bar, ltfIndicator, config)
   → 返回: { decision: EXIT/NONE, trailingUpdate }
  ↓
2. Strategy.trendStrategy({ bar, htfIndicator, ltfIndicator, positionState })
   → 返回: { type: ENTRY/EXIT/HOLD }
  ↓
3. Engine.execute(signal, riskResult)
   → 执行入场/出场，更新 PositionStore 和 TradeLogger
```

## 第二步：核心抽象（TypeScript接口/class）

### 1. StrategyInstance（数据容器）

```typescript
// src/instance/strategyInstance.ts

import { PositionStore } from '../core/state/positionStore';
import { TradeLogger } from '../core/logger/tradeLogger';
import { Config } from '../config/config';

export interface StrategyInstanceConfig {
  instanceId: string;              // 唯一标识，如 "BTCUSDT_TREND_V1"
  strategyName: string;             // 策略名称，如 "trendStrategy"
  symbol: string;                   // 交易对，如 "BTCUSDT"
  config: Config;                   // 完整配置（包含所有参数）
}

export class StrategyInstance {
  readonly instanceId: string;
  readonly strategyName: string;
  readonly symbol: string;
  readonly config: Config;
  
  private positionStore: PositionStore;
  private logger: TradeLogger;
  
  constructor(config: StrategyInstanceConfig) {
    this.instanceId = config.instanceId;
    this.strategyName = config.strategyName;
    this.symbol = config.symbol;
    this.config = config.config;
    
    // 每个实例拥有独立的状态组件
    this.positionStore = new PositionStore();
    this.logger = new TradeLogger();
    this.logger.setInitialCapital(config.config.backtest.initialCapital);
  }
  
  getPositionStore(): PositionStore {
    return this.positionStore;
  }
  
  getLogger(): TradeLogger {
    return this.logger;
  }
}
```

### 2. StrategyInstanceRunner（执行器）

```typescript
// src/instance/strategyInstanceRunner.ts

import { StrategyInstance } from './strategyInstance';
import { IEngine } from '../engine/IEngine';
import { trendStrategy } from '../core/strategy/trendStrategy';
import { riskManager } from '../core/risk/riskManager';
import { Kline, HTFIndicatorData, LTFIndicatorData, TradeReason } from '../types';

export class StrategyInstanceRunner {
  private instance: StrategyInstance;
  private engine: IEngine;
  
  constructor(instance: StrategyInstance, engine: IEngine) {
    this.instance = instance;
    this.engine = engine;
  }
  
  /**
   * Execute onBar logic for this instance
   * Execution order: RiskManager → Strategy → Engine
   */
  async onBar(
    bar: Kline,
    htfIndicator: HTFIndicatorData,
    ltfIndicator: LTFIndicatorData
  ): Promise<void> {
    const positionStore = this.instance.getPositionStore();
    const logger = this.instance.getLogger();
    const config = this.instance.config;
    const position = positionStore.get();
    const positionState = positionStore.getState();
    
    /* =========================
     * 1️⃣ Risk Management（优先检查止损）
     * ========================= */
    if (position && positionState === "OPEN") {
      const riskResult = riskManager(
        position,
        { close: bar.close, high: bar.high, low: bar.low },
        ltfIndicator,
        config
      );
      
      // Update trailing stop
      if (riskResult.trailingUpdate.shouldUpdate) {
        positionStore.dispatch({
          type: 'UPDATE_STOP',
          payload: {
            stopLoss: riskResult.trailingUpdate.stopLoss,
            trailingStop: riskResult.trailingUpdate.trailingStop,
            isTrailingActive: riskResult.trailingUpdate.isTrailingActive,
            maxUnrealizedR: riskResult.trailingUpdate.maxUnrealizedR,
            trailingMode: riskResult.trailingUpdate.trailingMode,
          },
          reason: 'TRAILING_STOP' as TradeReason,
        });
      }
      
      // Check stop loss trigger
      if (riskResult.decision.action === 'EXIT') {
        await this.engine.executeExit(
          this.instance,
          bar,
          riskResult.decision.reason || 'STOP_LOSS'
        );
        return;
      }
    }
    
    /* =========================
     * 2️⃣ Strategy Decision
     * ========================= */
    const signal = trendStrategy({
      bar,
      htfIndicator,
      ltfIndicator,
      positionState,
    });
    
    // Handle Strategy EXIT signal
    if (signal.type === "EXIT" && position && positionState === "OPEN") {
      await this.engine.executeExit(
        this.instance,
        bar,
        signal.reason as TradeReason || 'TREND_INVALIDATED'
      );
      return;
    }
    
    // Handle Strategy ENTRY signal
    if (signal.type === "ENTRY" && positionState === "FLAT") {
      await this.engine.executeEntry(
        this.instance,
        bar,
        signal,
        ltfIndicator
      );
      return;
    }
    
    // HOLD: do nothing
  }
}
```

### 3. InstanceOrchestrator（编排器）

```typescript
// src/instance/instanceOrchestrator.ts

import { StrategyInstance } from './strategyInstance';
import { StrategyInstanceRunner } from './strategyInstanceRunner';
import { IEngine } from '../engine/IEngine';
import { Kline, HTFIndicatorData, LTFIndicatorData, BacktestResult } from '../types';

export interface InstanceBarData {
  instanceId: string;
  bar: Kline;
  htfIndicator: HTFIndicatorData;
  ltfIndicator: LTFIndicatorData;
}

export class InstanceOrchestrator {
  private instances: Map<string, StrategyInstance> = new Map();
  private runners: Map<string, StrategyInstanceRunner> = new Map();
  private engine: IEngine;
  
  constructor(engine: IEngine) {
    this.engine = engine;
  }
  
  /**
   * Register a strategy instance
   */
  registerInstance(instance: StrategyInstance): void {
    this.instances.set(instance.instanceId, instance);
    this.runners.set(
      instance.instanceId,
      new StrategyInstanceRunner(instance, this.engine)
    );
  }
  
  /**
   * Execute onBar for a specific instance
   */
  async executeInstance(
    instanceId: string,
    bar: Kline,
    htfIndicator: HTFIndicatorData,
    ltfIndicator: LTFIndicatorData
  ): Promise<void> {
    const runner = this.runners.get(instanceId);
    if (!runner) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    await runner.onBar(bar, htfIndicator, ltfIndicator);
  }
  
  /**
   * Execute onBar for all instances (parallel)
   */
  async executeAllInstances(barData: InstanceBarData[]): Promise<void> {
    const promises = barData.map(data =>
      this.executeInstance(data.instanceId, data.bar, data.htfIndicator, data.ltfIndicator)
    );
    await Promise.all(promises);
  }
  
  /**
   * Get instance results
   */
  getInstanceResults(instanceId: string): BacktestResult | null {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;
    return instance.getLogger().getResults();
  }
  
  /**
   * Get all instance results
   */
  getAllResults(): Map<string, BacktestResult> {
    const results = new Map<string, BacktestResult>();
    for (const [instanceId, instance] of this.instances) {
      results.set(instanceId, instance.getLogger().getResults());
    }
    return results;
  }
  
  /**
   * Run backtest for all registered instances
   * This method coordinates the backtest loop across all instances
   */
  async runBacktest(
    instanceData: Map<string, {
      ltfKlines: Kline[];
      htfIndicators: HTFIndicatorData[];
      ltfIndicators: LTFIndicatorData[];
    }>
  ): Promise<void> {
    // Build unified time axis from all instances' LTF bars
    const allTimes = new Set<number>();
    for (const { ltfKlines } of instanceData.values()) {
      for (const bar of ltfKlines) {
        allTimes.add(bar.openTime);
      }
    }
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
    
    // For each time point, execute all instances that have data
    for (const time of sortedTimes) {
      const barData: InstanceBarData[] = [];
      
      for (const [instanceId, { ltfKlines, htfIndicators, ltfIndicators }] of instanceData) {
        // Find the bar at this time point
        const barIndex = ltfKlines.findIndex(b => b.openTime === time);
        if (barIndex === -1) continue; // This instance doesn't have data at this time
        
        barData.push({
          instanceId,
          bar: ltfKlines[barIndex],
          htfIndicator: htfIndicators[barIndex],
          ltfIndicator: ltfIndicators[barIndex],
        });
      }
      
      // Execute all instances in parallel for this time point
      if (barData.length > 0) {
        await this.executeAllInstances(barData);
      }
    }
  }
}
```

### 4. Engine 接口（Backtest / Paper / Live）

```typescript
// src/engine/IEngine.ts

import { StrategyInstance } from '../instance/strategyInstance';
import { StrategySignal, LTFIndicatorData, Kline, TradeReason } from '../types';

export interface IEngine {
  /**
   * Execute entry order
   */
  executeEntry(
    instance: StrategyInstance,
    bar: Kline,
    signal: StrategySignal,
    ltfIndicator: LTFIndicatorData
  ): Promise<void>;
  
  /**
   * Execute exit order
   */
  executeExit(
    instance: StrategyInstance,
    bar: Kline,
    reason: TradeReason | string
  ): Promise<void>;
}

// src/engine/backtestEngine.ts

import { IEngine } from './IEngine';
import { StrategyInstance } from '../instance/strategyInstance';
import { StrategySignal, LTFIndicatorData, Kline, TradeReason } from '../types';
import { calculatePositionSize } from '../core/risk/riskManager';

export class BacktestEngine implements IEngine {
  async executeEntry(
    instance: StrategyInstance,
    bar: Kline,
    signal: StrategySignal,
    ltfIndicator: LTFIndicatorData
  ): Promise<void> {
    if (!signal.side || signal.side !== "LONG") {
      return;
    }
    
    const positionStore = instance.getPositionStore();
    const logger = instance.getLogger();
    const config = instance.config;
    
    const entryPrice = bar.close;
    const equity = logger.getCurrentEquity();
    const { size, stopLoss } = calculatePositionSize(
      entryPrice,
      equity,
      config.risk.maxRiskPerTrade,
      config.risk.initialStopPct
    );
    
    positionStore.dispatch({
      type: 'OPEN_POSITION',
      payload: {
        side: signal.side,
        entryPrice,
        stopLoss,
        size,
        entryTime: bar.closeTime,
      },
      reason: (signal.reason as TradeReason) || 'HTF_BULL_TREND_CONFIRMED',
    });
    
    logger.logEntry(bar, {
      action: 'ENTER',
      side: signal.side,
      atr: ltfIndicator.atr || 0,
      reason: (signal.reason as TradeReason) || 'HTF_BULL_TREND_CONFIRMED',
    });
  }
  
  async executeExit(
    instance: StrategyInstance,
    bar: Kline,
    reason: TradeReason | string
  ): Promise<void> {
    const positionStore = instance.getPositionStore();
    const logger = instance.getLogger();
    const config = instance.config;
    const position = positionStore.get();
    
    if (!position) return;
    
    // Calculate commission and slippage
    const entryValue = position.entryPrice * position.size;
    const exitValue = bar.close * position.size;
    const commission = (entryValue + exitValue) * config.backtest.commissionRate;
    
    // Apply slippage (simplified: assume slippage on exit only)
    const slippageMultiplier = position.side === "LONG" 
      ? 1 - config.backtest.slippageRate 
      : 1 + config.backtest.slippageRate;
    const exitPriceWithSlippage = bar.close * slippageMultiplier;
    const slippage = Math.abs(exitPriceWithSlippage - bar.close) * position.size;
    
    positionStore.dispatch({ type: 'START_CLOSING' });
    positionStore.dispatch({
      type: 'CLOSE_POSITION',
      payload: {
        exitPrice: exitPriceWithSlippage, // Use price with slippage
        exitTime: bar.closeTime,
      },
      reason: (reason as TradeReason) || 'MANUAL_EXIT',
    });
    
    // Create a temporary position with exit price for logging
    const positionForLogging = { ...position };
    logger.logExit(bar, positionForLogging, (reason as TradeReason) || 'MANUAL_EXIT', {
      commission,
      slippage,
      exitPrice: exitPriceWithSlippage,
    });
  }
}
```

### 5. Config Registry（data only）

```typescript
// src/config/instanceConfig.ts

import { Config } from './config';
import { StrategyInstanceConfig } from '../instance/strategyInstance';

/**
 * Config Registry: 集中管理所有实例配置
 * 新增策略实例 = 新增一份配置
 */
export interface InstanceConfigRegistry {
  [instanceId: string]: StrategyInstanceConfig;
}

/**
 * 示例：定义多个策略实例配置
 */
export const instanceConfigs: InstanceConfigRegistry = {
  "BTCUSDT_TREND_V1": {
    instanceId: "BTCUSDT_TREND_V1",
    strategyName: "trendStrategy",
    symbol: "BTCUSDT",
    config: {
      exchange: { baseUrl: "https://api.binance.com", symbol: "BTCUSDT" },
      timeframe: { trend: "4h", signal: "1h" },
      indicators: { ema: { short: 20, medium: 50, long: 200 }, atr: { period: 14 }, adx: { period: 14 } },
      strategy: { lookbackPeriod: 20 },
      risk: { maxRiskPerTrade: 0.01, initialStopPct: 0.01, breakEvenR: 1.0, trailingActivationR: 2.0 },
      backtest: { initialCapital: 10000, commissionRate: 0.001, slippageRate: 0.0005, startDate: "2025-01-01", endDate: "2026-01-01" },
      cache: { enabled: true, directory: "data/cache" },
    },
  },
  "ETHUSDT_TREND_V1": {
    instanceId: "ETHUSDT_TREND_V1",
    strategyName: "trendStrategy",
    symbol: "ETHUSDT",
    config: {
      exchange: { baseUrl: "https://api.binance.com", symbol: "ETHUSDT" },
      timeframe: { trend: "4h", signal: "1h" },
      indicators: { ema: { short: 20, medium: 50, long: 200 }, atr: { period: 14 }, adx: { period: 14 } },
      strategy: { lookbackPeriod: 20 },
      risk: { maxRiskPerTrade: 0.01, initialStopPct: 0.01, breakEvenR: 1.0, trailingActivationR: 2.0 },
      backtest: { initialCapital: 10000, commissionRate: 0.001, slippageRate: 0.0005, startDate: "2025-01-01", endDate: "2026-01-01" },
      cache: { enabled: true, directory: "data/cache" },
    },
  },
};
```

## 第三步：推荐目录结构

```
src/
├── instance/                      # Instance Layer（可扩展）
│   ├── strategyInstance.ts        # StrategyInstance 类
│   ├── strategyInstanceRunner.ts # StrategyInstanceRunner 类
│   └── instanceOrchestrator.ts   # InstanceOrchestrator 类
│
├── core/                          # Core Layer（不会频繁改）
│   ├── strategy/
│   │   └── trendStrategy.ts      # 现有策略逻辑（保持不变）
│   ├── risk/
│   │   └── riskManager.ts        # 现有风控逻辑（保持不变）
│   ├── state/
│   │   └── positionStore.ts      # 现有状态机（保持不变）
│   └── logger/
│       └── tradeLogger.ts         # 现有日志逻辑（保持不变）
│
├── engine/                        # Engine Layer（回测/实盘差异）
│   ├── IEngine.ts                # Engine 接口
│   ├── backtestEngine.ts        # BacktestEngine 实现
│   └── paperEngine.ts           # PaperEngine 实现（未来）
│
├── backtest/                      # 保留原有回测相关代码（迁移后删除）
│   └── backtestEngine.ts         # 原有 BacktestEngine（迁移到 engine/ 后删除）
│
├── config/                        # 配置层
│   ├── config.ts                 # 基础 Config 类型（保持不变）
│   └── instanceConfig.ts         # 实例配置注册表（新增）
│
├── data/                          # 数据层（不修改）
│   ├── fetcher.ts
│   └── cache.ts
│
├── indicators/                    # 指标层（不修改）
│   └── indicators.ts
│
├── execution/                     # 执行层（保留，未来可能用到）
│   └── exchange.ts
│
└── index.ts                       # 入口文件（重构）
```

### 目录职责边界

**Instance Layer（实例层）**

- **instance/**: 实例管理相关代码
  - `strategyInstance.ts`: 策略实例数据容器
  - `strategyInstanceRunner.ts`: 单个实例执行器
  - `instanceOrchestrator.ts`: 多实例编排器

**Core Layer（核心业务逻辑层）**

- **core/strategy/**: 策略逻辑，纯函数，不修改
- **core/risk/**: 风控逻辑，纯函数，不修改
- **core/state/**: 状态管理，每个实例独立
- **core/logger/**: 日志记录，每个实例独立

**Engine Layer（执行引擎层）**

- **engine/**: 执行引擎抽象和实现
  - `IEngine.ts`: 引擎接口
  - `backtestEngine.ts`: 回测引擎实现
  - `paperEngine.ts`: 模拟盘引擎（未来）

**其他**

- **config/**: 配置管理，新增实例配置注册表
- **data/**: 数据获取，共享（但每个实例使用不同 symbol）
- **indicators/**: 指标计算，纯函数，共享

## 第四步：实施步骤

### 迁移顺序（避免破坏现有功能）

1. **创建新目录结构**
  - 创建 `src/instance/` 目录
  - 创建 `src/core/strategy/`, `src/core/risk/`, `src/core/state/`, `src/core/logger/` 目录
  - 创建 `src/engine/` 目录
2. **迁移 Core Layer 代码**
  - 将 `src/strategy/trendStrategy.ts` → `src/core/strategy/trendStrategy.ts`
  - 将 `src/risk/riskManager.ts` → `src/core/risk/riskManager.ts`
  - 将 `src/state/positionStore.ts` → `src/core/state/positionStore.ts`
  - 将 `src/logger/tradeLogger.ts` → `src/core/logger/tradeLogger.ts`
  - 更新 `TradeLogger.logExit()` 签名，支持可选的 commission/slippage 参数
  - 更新所有 import 路径
3. **创建 Engine Layer**
  - 创建 `src/engine/IEngine.ts` 接口
  - 创建 `src/engine/backtestEngine.ts`，从 `src/backtest/backtestEngine.ts` 提取执行逻辑
  - 实现 commission 和 slippage 计算
  - 更新 import 路径
4. **创建 Instance Layer**
  - 创建 `src/instance/strategyInstance.ts`
  - 创建 `src/instance/strategyInstanceRunner.ts`
  - 创建 `src/instance/instanceOrchestrator.ts`
  - 实现 `InstanceOrchestrator.runBacktest()` 方法，处理时间同步和并行执行
5. **创建配置注册表**
  - 创建 `src/config/instanceConfig.ts`
  - 定义多个实例配置示例
6. **重构入口文件**
  - 重构 `src/index.ts`，使用 `InstanceOrchestrator` 运行多个实例
  - 支持从配置注册表加载实例
7. **验证和清理**
  - 验证单实例回测结果与现有系统一致
  - 验证多实例并行回测
  - 删除旧的 `src/backtest/backtestEngine.ts`（保留作为参考）

## 第五步：v0.1 Done 标准

### 必须有（Must Have）

- **实例隔离**
  - 每个 StrategyInstance 拥有独立的 PositionStore 和 TradeLogger
  - 实例之间状态完全隔离，互不影响
- **配置驱动**
  - 新增策略实例 = 在 instanceConfig.ts 中添加配置
  - 不需要修改任何业务代码（Strategy / RiskManager）
- **并行执行**
  - InstanceOrchestrator 支持多个实例并行运行
  - 回测模式下，同一 bar 的所有实例可以并行处理
- **执行顺序保证**
  - Runner 内部执行顺序：RiskManager → Strategy → Engine
  - 与现有逻辑保持一致
- **引擎抽象**
  - IEngine 接口定义执行方式
  - BacktestEngine 实现回测执行逻辑
  - 为 PaperEngine / LiveEngine 预留接口
- **向后兼容**
  - 现有策略逻辑（trendStrategy）不修改
  - 现有风控逻辑（riskManager）不修改
  - 现有状态机（PositionStore）不修改

### 刻意不做（Won't Do）

- **组合层（Portfolio Manager）**
  - v0.1 不引入组合管理
  - 但预留接口：InstanceOrchestrator 可以扩展为组合层
- **事件总线（EventBus）**
  - 不使用发布订阅模式
  - 保持同步调用，简单直接
- **插件系统（Plugin System）**
  - 不设计通用量化框架
  - 专注于策略实例管理
- **动态策略加载**
  - v0.1 策略函数硬编码引用
  - 未来可以通过配置扩展
- **实盘/模拟盘实现**
  - v0.1 只实现 BacktestEngine
  - PaperEngine / LiveEngine 接口预留，不实现

### 成功标准（Success Criteria）

1. **架构验证**
  - 能够同时运行 2+ 个策略实例（不同 symbol）
  - 每个实例的持仓、权益、日志完全独立
  - 新增实例只需添加配置，不修改代码
2. **代码质量**
  - 核心抽象清晰，职责单一
  - 实例隔离机制可靠，无状态泄漏
  - 执行顺序正确，与现有逻辑一致
3. **可维护性**
  - 目录结构清晰，易于定位代码
  - 配置集中管理，易于扩展
  - 不引入过度抽象，保持简单
4. **可验证性**
  - 单实例回测结果与现有系统一致
  - 多实例并行回测结果正确
  - 实例之间无相互影响

## 第六步：关键设计决策

### 1. Commission 和 Slippage 计算

- **位置**：在 `BacktestEngine.executeExit()` 中计算
- **接口更新**：`TradeLogger.logExit()` 添加可选参数 `options?: { commission?, slippage?, exitPrice? }`
- **向后兼容**：使用可选参数，不影响现有调用

### 2. 回测循环职责

- **BacktestEngine**：只负责单个 bar 的 entry/exit 执行
- **InstanceOrchestrator.runBacktest()**：负责协调整个回测流程，包括时间同步和并行执行

### 3. 多实例时间同步

- **策略**：统一时间轴（所有实例 LTF bars 的时间并集）
- **执行**：对每个时间点，并行执行所有有数据的实例
- **处理**：实例在某个时间点无数据时跳过（相当于 HOLD）

### 4. TradeLogger 接口更新

```typescript
logExit(
  bar: Kline, 
  position: Position, 
  reason: TradeReason,
  options?: {
    commission?: number;
    slippage?: number;
    exitPrice?: number;
  }
): void
```

### 架构验证清单

- ✅ 三层架构职责清晰
- ✅ 目录结构与代码示例一致
- ✅ 实例隔离机制完整
- ✅ 执行顺序正确（RiskManager → Strategy → Engine）
- ✅ 配置驱动，新增实例无需修改业务代码


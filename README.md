# Trading Agent - 加密货币趋势跟随交易系统

MVP级加密货币趋势跟随Trading Agent，使用TypeScript开发，支持回测和实盘交易（实盘接口预留）。

## 功能特性

- ✅ 基于EMA的趋势识别（4h周期）
- ✅ 突破策略入场（1h周期）
- ✅ ATR动态止损止盈
- ✅ 严格的风控管理
- ✅ 完整的回测引擎
- ✅ 详细的交易日志

## 项目结构

```
src/
 ├── instance/             # Instance Layer（实例层）
 │   ├── strategyInstance.ts
 │   ├── strategyInstanceRunner.ts
 │   └── instanceOrchestrator.ts
 ├── core/                 # Core Layer（核心业务逻辑层）
 │   ├── strategy/
 │   │   └── trendStrategy.ts
 │   ├── risk/
 │   │   └── riskManager.ts
 │   ├── state/
 │   │   └── positionStore.ts
 │   └── logger/
 │       └── tradeLogger.ts
 ├── engine/               # Engine Layer（执行引擎层）
 │   ├── IEngine.ts
 │   └── backtestEngine.ts
 ├── config/               # 配置层
 │   ├── config.ts
 │   └── instanceConfig.ts
 ├── data/                 # 数据层
 │   ├── fetcher.ts
 │   └── cache.ts
 ├── indicators/           # 指标层
 │   └── indicators.ts
 ├── backtest/             # 回测工具（保留用于 robustness check）
 │   ├── backtestEngine.ts
 │   └── robustnessCheck.ts
 ├── types.ts              # 类型定义
 └── index.ts              # 程序入口
```

## 安装

```bash
npm install
```

## 构建

```bash
npm run build
```

## 运行回测

```bash
npm run backtest
# 或
npm run dev
```

## 策略说明

### 趋势定义（4h周期）
- EMA50 > EMA200 → 多头趋势
- EMA50 < EMA200 → 空头趋势

### 入场条件（1h周期）

**多头：**
1. 4h为多头趋势
2. 1h EMA20 > EMA50
3. 价格突破最近20根K线最高价

**空头：**
1. 4h为空头趋势
2. 1h EMA20 < EMA50
3. 价格跌破最近20根K线最低价

### 止损止盈
- 初始止损：入场价 ± 1.5 × ATR(1h)
- 移动止盈：价格从最高/最低回撤 ≥ 2.5 × ATR

### 强制平仓
- 4h趋势反转
- 持仓超过50根1h K线

## 风控规则

1. 单笔最大风险 = 账户净值的1%
2. 同一时间只允许1笔持仓
3. 连续3笔亏损 → 停止交易24h

## 配置

所有关键参数在 `src/config/config.ts` 中集中配置，包括：
- 交易所设置
- 策略参数
- 风控参数
- 回测参数

策略实例配置在 `src/config/instanceConfig.ts` 中管理，新增策略实例只需添加配置即可。

## 扩展性

代码结构设计支持未来扩展为AI Agent：
- 策略层与执行层分离
- 状态管理独立
- 接口设计清晰
- 易于集成ML模型

## 注意事项

- 当前版本仅支持回测模式
- 实盘交易接口已预留但未实现
- 默认使用Binance API（USDT永续合约）
- 所有参数可在config.ts中调整

## License

MIT

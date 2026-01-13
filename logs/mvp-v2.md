# MVP 多时间框架趋势跟踪策略文档 (v2.0)

## 🧠 MVP 策略核心思想

- 用 **4h 时间框架**判断"市场环境"（趋势过滤），
- 用 **1h 时间框架**判断"入场时机和出场时机"，
- 用 **RiskManager** 控制"亏多少 & 什么时候必须走"。

## ⏱️ 时间周期

- **HTF（Higher Timeframe）**：4 小时（4h）- 用于趋势环境过滤
- **LTF（Lower Timeframe）**：1 小时（1h）- 用于入场/出场执行
- 所有逻辑在 bar close 执行

## 📊 使用指标

策略使用多时间框架指标：

### 4h 时间框架（趋势过滤）

#### 1. EMA（趋势方向）
- EMA50
- EMA200

#### 2. ADX（趋势强度）
- period = 14

**4h 趋势状态判断：**
```
BULL: EMA50 > EMA200 AND ADX > 20
RANGE: 其他情况
```

### 1h 时间框架（入场/出场执行）

#### 1. EMA（趋势方向）
- EMA20
- EMA50

方向判断：
```
EMA20 > EMA50 → 多头趋势
EMA20 < EMA50 → 非多头（MVP 阶段不做空）
```

#### 2. ADX（入场过滤）
- period = 14
- 规则：ADX > 25 → 允许入场

#### 3. Donchian High（突破确认）
- lookback = 20
- 计算最近 20 根已完成 1h K 线的最高价
- **仅使用历史已完成的 K 线，排除当前 bar，避免未来函数**

#### 4. ATR（风控）
- ATR period = 14
- 只给 RiskManager 用
- Strategy 不使用 ATR

---

## 🎯 入场规则

### 多头 ENTRY（必须全部满足）

1. 当前无持仓（PositionState === FLAT）
2. **4h 趋势状态 === BULL**（EMA50_4h > EMA200_4h AND ADX_4h > 20）
3. ADX_1h > 25
4. EMA20_1h > EMA50_1h
5. **收盘价突破 Donchian High**（close > Donchian High，lookback = 20）

**v2 升级说明：**
- 新增第 5 个条件：趋势启动突破确认
- 减少趋势启动前的低质量入场，降低频繁止损
- 不影响真趋势盈利单

👉 Strategy 只输出信号：

```ts
{
  type: "ENTRY",
  side: "LONG",
  reason: "HTF_BULL_BREAKOUT_CONFIRMED"
}
```

## 🚪 出场规则

### EXIT（趋势逻辑）

满足任意一个：
1. EMA20_1h < EMA50_1h（趋势反转）

**注意**：4h 趋势状态**不用于**出场决策，只用于入场过滤。

```ts
{
  type: "EXIT",
  reason: "EMA_REVERSAL_1H"
}
```

## 🛡️ RiskManager

### 职责

- 是否允许 ENTRY
- 仓位大小
- 强制 EXIT（止损）

### 仓位控制

- riskPerTrade = 1%
- 仓位计算：

```ts
positionSize =
  accountEquity * riskPerTrade
  / (ATR * stopLossATRMultiplier)
```

### 初始止损（必须）

stopLoss = entryPrice - 1.5 * ATR

---

## 🔄 架构说明

### 多时间框架设计

- **HTF（4h）**：仅用于入场前的趋势环境过滤，不参与出场决策
- **LTF（1h）**：负责具体的入场和出场执行逻辑

### 策略职责分离

- **Strategy**：只决定何时入场/出场（基于指标信号）
- **RiskManager**：负责仓位大小、止损计算和强制出场
- **Strategy 不访问账户权益**，保持确定性，便于回测

### 安全机制

- 指标缺失时返回 `HOLD`
- HTF 指标缺失时，仍可执行出场检查（仅需 LTF 指标）
- HTF 指标缺失时，无法执行入场（需要完整的多时间框架上下文）
- Donchian High 数据不足时，无法执行入场（需要足够的历史数据）

### 回测安全

- Donchian High 仅基于历史已完成的 K 线计算
- 排除当前 bar，严格避免 lookahead bias
- 所有指标在 bar close 时计算，确保回测与实盘一致

---

## 📈 v2 版本变更

### 新增功能

1. **Donchian High 突破确认**
   - 新增指标：Donchian High（1h，lookback = 20）
   - 作为 ENTRY 的第 5 个必要条件
   - 仅使用历史已完成的 K 线，排除当前 bar

2. **信号更新**
   - ENTRY reason 从 `HTF_BULL_TREND_CONFIRMED` 改为 `HTF_BULL_BREAKOUT_CONFIRMED`

### 保持不变

- EXIT 规则（仅 EMA20_1h < EMA50_1h）
- RiskManager 逻辑
- 4h 趋势过滤逻辑
- 其他指标计算方式

---

## 📊 回测结果

## 2025-01-01 ～ 2026-01-01

```
Total Return: $10824.91 (8.25%)
Max Drawdown: $512.80 (5.13%)
Total Trades: 14
Winning Trades: 4
Losing Trades: 10
Win Rate: 28.57%
Profit Factor: 1.81
Average Win: $461.92
Average Loss: $102.28
```

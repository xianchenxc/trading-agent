# MVP 趋势跟踪策略文档 (v1.0)

## 🧠 MVP 策略核心思想

- 用 ADX 判断“要不要交易”，
- 用 EMA 判断“往哪边交易”，
- 用 RiskManager 控制“亏多少 & 什么时候必须走”。

## ⏱️ 时间周期

- K 线周期：1 小时（1h）
- 所有逻辑在 bar close 执行

## 📊 使用指标

策略使用以下三个核心指标：

### 1. 平均趋向指标 (ADX)

- period = 14
- 规则：
    - ADX > 25 → 允许进场
    - ADX < 18 → 认为趋势衰竭

### 2. EMA（趋势方向）

- EMA20
- EMA50

方向判断：

```
EMA20 > EMA50 → 多头趋势
EMA20 < EMA50 → 非多头（MVP 阶段不做空）
```

### 3. ATR（风控）

- ATR period = 14
- 只给 RiskManager 用
- Strategy 不使用 ATR

---

## 🎯 入场规则

### 多头 ENTRY（必须全部满足）

1. 当前无持仓（PositionState === FLAT）
2. ADX > 25
3. EMA20 > EMA50

👉 Strategy 只输出信号：

```ts
{
  type: "ENTRY",
  side: "LONG",
  reason: "TREND_CONFIRMED"
}
```

## 🚪 出场规则

### EXIT（趋势逻辑）

满足任意一个：
1. ADX < 18（趋势衰竭）
2. EMA20 < EMA50（趋势反转）

```ts
{
  type: "EXIT",
  reason: "TREND_INVALIDATED"
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

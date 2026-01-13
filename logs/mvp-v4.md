# MVP 多时间框架趋势跟踪策略文档 (v4.0)

## 🧠 MVP 策略核心思想

- 用 **4h 时间框架**判断"市场环境"（趋势过滤），
- 用 **1h 时间框架**判断"入场时机"，
- 用 **RiskManager** 控制"亏多少 & 什么时候必须走"（固定止损 + 延迟追踪止损）。

## ⏱️ 时间周期

- **HTF（Higher Timeframe）**：4 小时（4h）- 用于趋势环境过滤
- **LTF（Lower Timeframe）**：1 小时（1h）- 用于入场执行
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

### 1h 时间框架（入场执行）

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
- 仅用于日志记录，不参与策略决策

---

## 🎯 入场规则

### 多头 ENTRY（必须全部满足）

1. 当前无持仓（PositionState === FLAT）
2. **4h 趋势状态 === BULL**（EMA50_4h > EMA200_4h AND ADX_4h > 20）
3. ADX_1h > 25
4. EMA20_1h > EMA50_1h
5. **收盘价突破 Donchian High**（close > Donchian High，lookback = 20）

👉 Strategy 只输出信号：

```ts
{
  type: "ENTRY",
  side: "LONG",
  reason: "HTF_BULL_BREAKOUT_CONFIRMED"
}
```

## 🚪 出场规则

### EXIT（v4 重大变化：Delayed Trailing Stop）

**v4 版本：策略层不生成任何 EXIT 信号**

所有退出都由 **RiskManager** 处理，采用**三阶段止损机制**：

#### 阶段 1：未盈利阶段（unrealizedR < 1R）
- **仅使用初始止损**：固定 1% 止损（entryPrice * 0.99）
- `stopLoss = initialStopLoss`
- 不启用任何追踪机制

#### 阶段 2：Break-even 保护阶段（1R ≤ unrealizedR < 2R）
- **移动到盈亏平衡点**：`stopLoss = entryPrice`
- `isTrailingActive = false`（不激活追踪止损）
- 允许趋势在早期自由波动，避免过早被踢出

#### 阶段 3：趋势跟随阶段（unrealizedR ≥ 2R）
- **激活追踪止损**：`isTrailingActive = true`
- **更新规则**：基于 EMA20_1H，只能向上移动（保护利润）
- `stopLoss = trailingStop`（跟随 trailingStop 更新）

**退出原因：**
- `STOP_LOSS_INITIAL`：初始止损触发（阶段 1）
- `STOP_LOSS_BREAK_EVEN`：Break-even 止损触发（阶段 2）
- `TRAILING_STOP_HIT`：追踪止损触发（阶段 3）

**v4 设计理念：**
- **延迟激活追踪止损**：+2R 才启用，给趋势更多发展空间
- **早期保护**：+1R 时移动到 break-even，避免亏损
- **让利润奔跑**：移除策略层的过早退出信号
- **趋势跟随**：追踪止损基于 EMA20_1H 动态调整

---

## 🛡️ RiskManager

### 职责

- 仓位大小计算
- 初始止损设置（固定 1%）
- **三阶段止损管理**（v4 核心）
- 强制 EXIT（止损触发）

### 仓位控制

- riskPerTrade = 1%
- 初始止损百分比 = 1%
- 仓位计算：

```ts
initialStopLoss = entryPrice * (1 - 0.01)  // 固定 1% 止损
riskAmount = equity * 0.01                 // 风险金额 = 账户权益 * 1%
positionSize = riskAmount / (entryPrice - initialStopLoss)
```

### 初始止损（必须）

- `initialStopLoss = entryPrice * 0.99`（固定 1%）
- 所有入场都必须设置初始止损
- 永久保存，用于计算 R 单位

### 三阶段止损机制（v4 核心）

#### 阶段 1：未盈利阶段（unrealizedR < 1R）

- **生效止损**：`stopLoss = initialStopLoss`
- **状态**：`isTrailingActive = false`
- **行为**：仅使用初始止损，不进行任何调整

#### 阶段 2：Break-even 保护阶段（1R ≤ unrealizedR < 2R）

- **生效止损**：`stopLoss = entryPrice`（移动到盈亏平衡点）
- **状态**：`isTrailingActive = false`（不激活追踪）
- **行为**：
  - 止损移动到 entryPrice，避免亏损
  - **不启用追踪止损**，允许趋势在早期自由波动
  - 这是 v4 的关键改进：延迟激活追踪止损

#### 阶段 3：趋势跟随阶段（unrealizedR ≥ 2R）

- **生效止损**：`stopLoss = trailingStop`（跟随 trailingStop）
- **状态**：`isTrailingActive = true`（激活追踪）
- **更新规则**：
  - 基于 EMA20_1H 动态更新
  - **只能向上移动**，保护已实现利润
  - 如果 EMA20_1H 下降，追踪止损保持不变
- **初始化**：激活时 `trailingStop = entryPrice`（从 break-even 开始）

#### 触发条件

- 价格跌破 `stopLoss` → 根据阶段判断退出原因
  - 阶段 1：`STOP_LOSS_INITIAL`
  - 阶段 2：`STOP_LOSS_BREAK_EVEN`
  - 阶段 3：`TRAILING_STOP_HIT`

---

## 🔄 架构说明

### 多时间框架设计

- **HTF（4h）**：仅用于入场前的趋势环境过滤
- **LTF（1h）**：负责具体的入场执行逻辑和追踪止损更新

### 策略职责分离

- **Strategy**：只决定何时入场（基于指标信号），**不生成退出信号**
- **RiskManager**：负责仓位大小、止损计算、三阶段止损管理和强制出场
- **Strategy 不访问账户权益**，保持确定性，便于回测

### Position 结构

```ts
interface Position {
  entryPrice: number;
  initialStopLoss: number;  // 初始止损（永久保存，用于计算 R）
  stopLoss: number;         // 当前生效的止损
  trailingStop?: number;    // 追踪止损（仅在阶段 3 使用）
  isTrailingActive: boolean; // 是否激活追踪（阶段 3）
  maxUnrealizedR: number;   // 最大未实现盈亏（R 单位）
}
```

### 安全机制

- 指标缺失时返回 `HOLD`
- HTF 指标缺失时，无法执行入场（需要完整的多时间框架上下文）
- Donchian High 数据不足时，无法执行入场（需要足够的历史数据）
- 追踪止损只能向上移动，保护利润
- 三阶段机制确保止损逐步收紧，不会突然变化

### 回测安全

- Donchian High 仅基于历史已完成的 K 线计算
- 排除当前 bar，严格避免 lookahead bias
- 所有指标在 bar close 时计算，确保回测与实盘一致
- 追踪止损基于已完成的 EMA20_1H 值，不使用未来数据

---

## 📈 v4 版本变更

### 重大变化

1. **延迟追踪止损机制（核心改进）**
   - v3：+1R 时激活追踪止损
   - v4：+1R 时只移动到 break-even，+2R 才激活追踪止损
   - **目标**：允许趋势在早期自由波动，避免过早被踢出

2. **三阶段止损管理**
   - 阶段 1（< 1R）：仅使用初始止损
   - 阶段 2（1R - 2R）：移动到 break-even，不激活追踪
   - 阶段 3（≥ 2R）：激活追踪止损，基于 EMA20_1H

3. **新增退出原因**
   - `STOP_LOSS_BREAK_EVEN`：Break-even 止损触发（阶段 2）

4. **配置参数优化**
   - 移除 `strategy.stopLoss.fixedPercent`（统一使用 `risk.initialStopPct`）
   - 移除 `strategy.trailingStop.activationR`（统一使用 `risk.trailingActivationR`）
   - 新增 `risk.breakEvenR`：Break-even 阈值（默认 1.0）
   - 新增 `risk.trailingActivationR`：追踪止损激活阈值（默认 2.0）

### 保持不变

- ENTRY 规则（与 v3 完全相同）
- 4h 趋势过滤逻辑
- Donchian High 突破确认
- 指标计算方式
- 多时间框架架构
- 固定 1% 初始止损

### v4 设计理念

- **延迟激活追踪止损**：+2R 才启用，给趋势更多发展空间
- **早期保护**：+1R 时移动到 break-even，避免亏损
- **让利润奔跑**：移除策略层的过早退出信号
- **趋势跟随**：追踪止损基于 EMA20_1H 动态调整
- **简化风控逻辑**：固定百分比止损，提高确定性

---

## 📊 回测结果

## 2025-01-01 ～ 2026-01-01

```
Total Return: $10808.01 (8.08%)
Max Drawdown: $448.95 (4.49%)
Total Trades: 15
Winning Trades: 7
Losing Trades: 8
Win Rate: 46.67%
Profit Factor: 1.93
Average Win: $240.09
Average Loss: $109.08
Max Win: $438.37
```

---

## 🔍 v3 vs v4 对比

| 特性 | v3 | v4 |
|------|----|----|
| **追踪止损激活** | +1R 激活 | +2R 激活（延迟激活） |
| **Break-even 阶段** | ❌ 无独立阶段 | ✅ 有（1R - 2R） |
| **止损阶段** | 2 阶段 | 3 阶段 |
| **退出原因** | 2 种 | 3 种（新增 BREAK_EVEN） |
| **早期趋势保护** | 立即追踪 | 延迟追踪，允许波动 |
| **配置参数** | `strategy.trailingStop.activationR` | `risk.trailingActivationR` + `risk.breakEvenR` |
| **入场规则** | ✅ 相同 | ✅ 相同 |
| **初始止损** | ✅ 相同（1%） | ✅ 相同（1%） |

---

## 💡 v4 优势

1. **延迟激活追踪止损**：+2R 才启用，避免过早被踢出大趋势
2. **早期趋势保护**：+1R 移动到 break-even，避免亏损但不限制波动
3. **三阶段管理**：更精细的止损控制，适应不同盈利阶段
4. **提高平均盈利**：允许趋势在早期自由发展，捕获更大利润
5. **配置统一**：所有风控参数集中在 `risk` 配置下

---

## ⚙️ 配置参数

### Risk Management 配置

```ts
risk: {
  maxRiskPerTrade: 0.01,        // 每笔交易风险（1%）
  initialStopPct: 0.01,          // 初始止损百分比（1%）
  breakEvenR: 1.0,              // Break-even 阈值（+1R）
  trailingActivationR: 2.0,      // 追踪止损激活阈值（+2R）
}
```

### 策略配置

```ts
strategy: {
  lookbackPeriod: 20,            // Donchian High 回看周期
}
```

---

## 🎯 v4 解决的问题

### v3 的问题

- Trailing Stop **启动过早**（+1R 即启用）
- EMA20 在 BTC 1H 下 **过于敏感**
- 导致：
  - Avg Win 偏低
  - 大趋势被提前踢出

### v4 的解决方案

- **延迟激活**：+2R 才启用追踪止损
- **早期保护**：+1R 移动到 break-even，避免亏损
- **允许波动**：阶段 2 不启用追踪，给趋势发展空间
- **提高盈利**：捕获更大的趋势利润

---

## 📝 实现细节

### R 单位计算

```ts
unrealizedR = (currentPrice - entryPrice) * size / (entryPrice - initialStopLoss) * size
```

R 单位始终基于 `initialStopLoss` 计算，确保一致性。

### 止损更新逻辑

每根 1H K 线收盘后：

1. 计算当前 `unrealizedR`
2. 根据 `unrealizedR` 判断阶段
3. 阶段 2：更新 `stopLoss = entryPrice`
4. 阶段 3：更新 `trailingStop` 基于 EMA20_1H，然后 `stopLoss = trailingStop`

### 生效止损计算

```ts
activeStop = stopLoss  // stopLoss 始终是当前生效的止损
```

阶段 1：`stopLoss = initialStopLoss`
阶段 2：`stopLoss = entryPrice`
阶段 3：`stopLoss = trailingStop`（跟随 EMA20_1H 更新）

# MVP 多时间框架趋势跟踪策略文档 (v5.0)

## 🧠 MVP 策略核心思想

- 用 **4h 时间框架**判断"市场环境"（趋势过滤），
- 用 **1h 时间框架**判断"入场时机"，
- 用 **RiskManager** 控制"亏多少 & 什么时候必须走"（固定止损 + 延迟追踪止损 + 趋势退化确认）。

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

#### 2. ADX（入场过滤 + v5 趋势退化判断）
- period = 14
- **入场过滤**：ADX > 25 → 允许入场
- **v5 新增**：用于阶段 3 的趋势退化确认（见出场规则）

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

### EXIT（v5 重大变化：趋势退化确认 + 锁盈）

**v5 版本：策略层不生成任何 EXIT 信号**

所有退出都由 **RiskManager** 处理，采用**三阶段止损机制**（v4 基础）+ **趋势退化确认**（v5 增强）：

#### 阶段 1：未盈利阶段（unrealizedR < 1R）
- **仅使用初始止损**：固定 1% 止损（entryPrice * 0.99）
- `stopLoss = initialStopLoss`
- 不启用任何追踪机制
- **不受趋势退化影响**（保持 v4 行为）

#### 阶段 2：Break-even 保护阶段（1R ≤ unrealizedR < 2R）
- **移动到盈亏平衡点**：`stopLoss = entryPrice`
- `isTrailingActive = false`（不激活追踪止损）
- 允许趋势在早期自由波动，避免过早被踢出
- **不受趋势退化影响**（保持 v4 行为）

#### 阶段 3：趋势跟随阶段（unrealizedR ≥ 2R）

**v5 核心增强：趋势退化确认 + 可选锁盈模式**

- **激活追踪止损**：`isTrailingActive = true`
- **追踪模式**：
  - 默认：基于 EMA20_1H（`trailingMode = "EMA20"`）
  - 可选锁盈：当 `maxUnrealizedR ≥ profitLockR` 时，切换到 EMA50_1H（`trailingMode = "EMA50"`）
- **更新规则**：
  - 基于 `trailingMode` 选择 EMA20_1H 或 EMA50_1H
  - **只能向上移动**，保护已实现利润
  - 如果 EMA 下降，追踪止损保持不变
- **初始化**：激活时 `trailingStop = entryPrice`（从 break-even 开始）

**v5 关键变化：趋势退化确认**

- **只有当趋势退化时，才允许追踪止损触发 EXIT**
- **趋势退化判断**：
  - ADX_1H < `trendExhaustADX`（默认 20）
  - **且** ADX_1H 连续下降 `trendExhaustBars` 根（默认 3 根）
- **趋势未退化时**：
  - 即使价格触及 `trailingStop`，**也不退出**
  - 继续更新 `trailingStop`，跟随趋势
  - 这是 v5 的核心改进：**让强趋势继续奔跑**

**退出原因：**
- `STOP_LOSS_INITIAL`：初始止损触发（阶段 1）
- `STOP_LOSS_BREAK_EVEN`：Break-even 止损触发（阶段 2）
- `TRAILING_STOP_HIT`：追踪止损触发（阶段 3，**且趋势已退化**）

**v5 设计理念：**
- **延迟激活追踪止损**：+2R 才启用，给趋势更多发展空间（继承 v4）
- **早期保护**：+1R 时移动到 break-even，避免亏损（继承 v4）
- **趋势退化确认**：只有趋势真正退化时才退出，避免在强趋势中被踢出（v5 新增）
- **可选锁盈模式**：大盈利时切换到 EMA50，更宽松的追踪（v5 新增）
- **让利润奔跑**：移除策略层的过早退出信号（继承 v4）

---

## 🛡️ RiskManager

### 职责

- 仓位大小计算
- 初始止损设置（固定 1%）
- **三阶段止损管理**（v4 核心）
- **趋势退化确认**（v5 新增）
- **可选锁盈模式**（v5 新增）
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

### 三阶段止损机制（v4 核心 + v5 增强）

#### 阶段 1：未盈利阶段（unrealizedR < 1R）

- **生效止损**：`stopLoss = initialStopLoss`
- **状态**：`isTrailingActive = false`
- **行为**：仅使用初始止损，不进行任何调整
- **趋势退化判断**：❌ 不适用（保持 v4 行为）

#### 阶段 2：Break-even 保护阶段（1R ≤ unrealizedR < 2R）

- **生效止损**：`stopLoss = entryPrice`（移动到盈亏平衡点）
- **状态**：`isTrailingActive = false`（不激活追踪）
- **行为**：
  - 止损移动到 entryPrice，避免亏损
  - **不启用追踪止损**，允许趋势在早期自由波动
  - 这是 v4 的关键改进：延迟激活追踪止损
- **趋势退化判断**：❌ 不适用（保持 v4 行为）

#### 阶段 3：趋势跟随阶段（unrealizedR ≥ 2R）

**v5 核心增强：趋势退化确认 + 可选锁盈模式**

- **生效止损**：`stopLoss = trailingStop`（跟随 trailingStop）
- **状态**：`isTrailingActive = true`（激活追踪）
- **追踪模式**：
  - 默认：`trailingMode = "EMA20"`（基于 EMA20_1H）
  - 锁盈模式：当 `maxUnrealizedR ≥ profitLockR` 时，`trailingMode = "EMA50"`（基于 EMA50_1H）
- **更新规则**：
  - 根据 `trailingMode` 选择对应的 EMA 值
  - **只能向上移动**，保护已实现利润
  - 如果 EMA 下降，追踪止损保持不变
- **初始化**：激活时 `trailingStop = entryPrice`（从 break-even 开始）

**v5 关键变化：趋势退化确认**

- **趋势退化判断函数**：
  ```ts
  function isTrendExhausted(
    adxSeries: number[],  // ADX_1H 历史序列（不包含当前 bar）
    threshold: number,    // trendExhaustADX（默认 20）
    bars: number          // trendExhaustBars（默认 3）
  ): boolean
  ```
  
- **判断条件**：
  1. ADX_1H < `trendExhaustADX`（当前 ADX 低于阈值）
  2. **且** ADX_1H 连续下降 `trendExhaustBars` 根（趋势强度持续减弱）

- **出场逻辑**：
  ```ts
  if (bar.low <= position.trailingStop) {
    const trendExhausted = isTrendExhausted(
      indicators.adx_1h_series,
      risk.trendExhaustADX,
      risk.trendExhaustBars
    );
    
    if (trendExhausted) {
      // 趋势已退化，允许退出
      return { action: "EXIT", reason: "TRAILING_STOP_HIT" };
    }
    // 趋势仍然强，不允许退出，继续更新 trailing stop
  }
  ```

- **关键点**：
  - 只有**阶段 3**使用趋势退化判断
  - 趋势未退化时，即使价格触及 `trailingStop`，也不退出
  - 继续更新 `trailingStop`，让强趋势继续奔跑

#### 触发条件

- 价格跌破 `stopLoss` → 根据阶段判断退出原因
  - 阶段 1：`STOP_LOSS_INITIAL`（不受趋势退化影响）
  - 阶段 2：`STOP_LOSS_BREAK_EVEN`（不受趋势退化影响）
  - 阶段 3：`TRAILING_STOP_HIT`（**且趋势已退化**）

---

## 🔄 架构说明

### 多时间框架设计

- **HTF（4h）**：仅用于入场前的趋势环境过滤
- **LTF（1h）**：负责具体的入场执行逻辑和追踪止损更新

### 策略职责分离

- **Strategy**：只决定何时入场（基于指标信号），**不生成退出信号**
- **RiskManager**：负责仓位大小、止损计算、三阶段止损管理、趋势退化确认和强制出场
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
  trailingMode?: "EMA20" | "EMA50"; // v5: 追踪模式（EMA20 默认，EMA50 锁盈）
}
```

### 安全机制

- 指标缺失时返回 `HOLD`
- HTF 指标缺失时，无法执行入场（需要完整的多时间框架上下文）
- Donchian High 数据不足时，无法执行入场（需要足够的历史数据）
- 追踪止损只能向上移动，保护利润
- 三阶段机制确保止损逐步收紧，不会突然变化
- **v5 新增**：趋势退化确认避免在强趋势中被过早踢出

### 回测安全

- Donchian High 仅基于历史已完成的 K 线计算
- 排除当前 bar，严格避免 lookahead bias
- 所有指标在 bar close 时计算，确保回测与实盘一致
- 追踪止损基于已完成的 EMA20_1H/EMA50_1H 值，不使用未来数据
- **v5 新增**：ADX_1H 历史序列不包含当前 bar，避免未来数据泄露

---

## 📈 v5 版本变更

### 重大变化

1. **趋势退化确认机制（v5 核心改进）**
   - v4：阶段 3 中，价格触及 `trailingStop` 即退出
   - v5：阶段 3 中，**只有趋势退化时才允许退出**
   - **目标**：避免在强趋势中被过早踢出，让利润继续奔跑

2. **可选锁盈模式（Profit Lock）**
   - 当 `maxUnrealizedR ≥ profitLockR` 时，切换到 EMA50 追踪
   - EMA50 比 EMA20 更宽松，适合大盈利时的锁盈
   - 可选功能，可通过配置禁用（`profitLockR = undefined`）

3. **趋势退化判断**
   - 基于 ADX_1H 历史序列（不包含当前 bar）
   - 条件：ADX < 阈值 **且** 连续下降 N 根
   - 仅在阶段 3 生效，不影响阶段 1/2

4. **新增配置参数**
   - `risk.trendExhaustADX`：ADX 阈值（默认 20）
   - `risk.trendExhaustBars`：连续下降 bar 数（默认 3）
   - `risk.profitLockR`：锁盈阈值（默认 4.0，可选）

5. **Position 结构扩展**
   - 新增 `trailingMode?: "EMA20" | "EMA50"`

### 保持不变

- ENTRY 规则（与 v4 完全相同）
- 4h 趋势过滤逻辑
- Donchian High 突破确认
- 指标计算方式
- 多时间框架架构
- 固定 1% 初始止损
- 三阶段止损框架（阶段 1/2 行为完全一致）
- 阶段 1/2 不受趋势退化影响

### v5 设计理念

- **趋势退化确认**：只有趋势真正退化时才退出，避免在强趋势中被踢出
- **可选锁盈模式**：大盈利时切换到更宽松的 EMA50 追踪
- **保守单向**：趋势未退化时，即使价格触及止损也不退出
- **可解释性**：基于 ADX 的趋势强度判断，逻辑清晰
- **保持 v4 优势**：延迟激活追踪止损、早期保护、让利润奔跑

---

## 📊 回测结果

## 2025-01-01 ～ 2026-01-01

```
Total Return: $10871.39 (8.71%)
Max Drawdown: $338.69 (3.39%)
Total Trades: 13
Winning Trades: 6
Losing Trades: 7
Win Rate: 46.15%
Profit Factor: 2.14
Average Win: $272.64
Average Loss: $109.21
Max Win: $572.08
```

---

## 🔍 v4 vs v5 对比

| 特性 | v4 | v5 |
|------|----|----|
| **追踪止损激活** | +2R 激活 | ✅ 相同（+2R 激活） |
| **Break-even 阶段** | ✅ 有（1R - 2R） | ✅ 相同 |
| **止损阶段** | 3 阶段 | ✅ 相同（3 阶段） |
| **阶段 3 退出条件** | 价格触及 trailingStop | **趋势退化 + 价格触及 trailingStop** |
| **趋势退化判断** | ❌ 无 | ✅ 有（仅在阶段 3） |
| **锁盈模式** | ❌ 无 | ✅ 有（可选，EMA50） |
| **追踪模式** | 仅 EMA20 | EMA20（默认）+ EMA50（锁盈） |
| **Position 结构** | 无 trailingMode | 新增 trailingMode |
| **配置参数** | breakEvenR, trailingActivationR | **新增** trendExhaustADX, trendExhaustBars, profitLockR |
| **入场规则** | ✅ 相同 | ✅ 相同 |
| **初始止损** | ✅ 相同（1%） | ✅ 相同（1%） |
| **阶段 1/2 行为** | ✅ 相同 | ✅ 完全相同 |

---

## 💡 v5 优势

1. **趋势退化确认**：只有趋势真正退化时才退出，避免在强趋势中被过早踢出
2. **提高平均盈利**：让强趋势继续奔跑，捕获更大利润
3. **可选锁盈模式**：大盈利时切换到 EMA50，更宽松的追踪
4. **保持 v4 优势**：延迟激活追踪止损、早期保护、三阶段管理
5. **保守单向**：趋势未退化时，即使价格触及止损也不退出
6. **可解释性**：基于 ADX 的趋势强度判断，逻辑清晰

---

## ⚙️ 配置参数

### Risk Management 配置

```ts
risk: {
  maxRiskPerTrade: 0.01,        // 每笔交易风险（1%）
  initialStopPct: 0.01,          // 初始止损百分比（1%）
  breakEvenR: 1.0,              // Break-even 阈值（+1R）
  trailingActivationR: 2.0,      // 追踪止损激活阈值（+2R）
  // v5: 趋势退化确认
  trendExhaustADX: 20,          // ADX 阈值（趋势退化判断）
  trendExhaustBars: 3,          // 连续下降 bar 数（趋势退化判断）
  profitLockR: 4.0,             // 锁盈阈值（可选，切换到 EMA50）
}
```

### 策略配置

```ts
strategy: {
  lookbackPeriod: 20,            // Donchian High 回看周期
}
```

---

## 🎯 v5 解决的问题

### v4 的问题

- 阶段 3 中，价格触及 `trailingStop` 即退出
- 在**强趋势**中，可能因为短期波动被过早踢出
- 导致：
  - 错过后续大趋势
  - 平均盈利偏低

### v5 的解决方案

- **趋势退化确认**：只有趋势真正退化时才退出
- **让强趋势继续奔跑**：趋势未退化时，即使价格触及止损也不退出
- **可选锁盈模式**：大盈利时切换到 EMA50，更宽松的追踪
- **提高平均盈利**：捕获更大的趋势利润

---

## 📝 实现细节

### R 单位计算

```ts
unrealizedR = (currentPrice - entryPrice) * size / (entryPrice - initialStopLoss) * size
```

R 单位始终基于 `initialStopLoss` 计算，确保一致性。

### 趋势退化判断

```ts
function isTrendExhausted(
  adxSeries: number[],  // ADX_1H 历史序列（不包含当前 bar）
  threshold: number,    // trendExhaustADX（默认 20）
  bars: number          // trendExhaustBars（默认 3）
): boolean {
  if (adxSeries.length < bars + 1) return false;
  
  const recent = adxSeries.slice(-bars - 1);
  
  // 当前 ADX 必须低于阈值
  if (recent[recent.length - 1] >= threshold) return false;
  
  // 检查连续下降
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] >= recent[i - 1]) {
      return false; // 没有连续下降
    }
  }
  
  return true;
}
```

### 止损更新逻辑

每根 1H K 线收盘后：

1. 计算当前 `unrealizedR`
2. 根据 `unrealizedR` 判断阶段
3. 阶段 2：更新 `stopLoss = entryPrice`
4. 阶段 3：
   - 检查是否需要切换到锁盈模式（`maxUnrealizedR ≥ profitLockR`）
   - 根据 `trailingMode` 选择 EMA20_1H 或 EMA50_1H
   - 更新 `trailingStop`（只能上移）
   - 更新 `stopLoss = trailingStop`
   - **如果价格触及 `trailingStop`，检查趋势是否退化**
     - 趋势已退化 → 退出
     - 趋势未退化 → 继续持仓，更新 trailing stop

### 生效止损计算

```ts
activeStop = stopLoss  // stopLoss 始终是当前生效的止损
```

阶段 1：`stopLoss = initialStopLoss`
阶段 2：`stopLoss = entryPrice`
阶段 3：`stopLoss = trailingStop`（跟随 EMA20_1H 或 EMA50_1H 更新）

### 阶段 3 出场判断（v5 核心）

```ts
if (bar.low <= position.trailingStop) {
  // v5: 只有趋势退化时才允许退出
  const trendExhausted = isTrendExhausted(
    indicators.adx_1h_series,
    risk.trendExhaustADX,
    risk.trendExhaustBars
  );
  
  if (trendExhausted) {
    return { action: "EXIT", reason: "TRAILING_STOP_HIT" };
  }
  // 趋势仍然强，不允许退出，继续更新 trailing stop
}
```

---

## 🚨 关键原则

### v5 严格遵循的原则

1. **保守单向**：趋势未退化时，即使价格触及止损也不退出
2. **可解释性**：基于 ADX 的趋势强度判断，逻辑清晰
3. **保持 v4 行为**：阶段 1/2 完全一致，仅在阶段 3 增强
4. **不修改 Strategy**：Strategy 层不生成任何 EXIT 信号
5. **不新增信号来源**：仅增强 RiskManager 的出场判断
6. **趋势系统优先**：这是趋势系统，不是高频止损系统

---

## 📚 相关文档

- [mvp-v4.md](./mvp-v4.md) - v4 版本文档
- [mvp-v3.md](./mvp-v3.md) - v3 版本文档

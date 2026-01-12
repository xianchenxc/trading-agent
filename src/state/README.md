## 🧠 PositionStore FSM（有限状态机）

### 1️⃣ 状态（States）

只有 2 个核心状态：

```
    ┌─────────────┐
    │   FLAT      │  无仓位
    └─────────────┘
            │
            │ OPEN_POSITION
            ▼
    ┌─────────────┐
    │   OPEN      │  有仓位（LONG / SHORT）
    └─────────────┘
            │
            │ CLOSE_POSITION
            ▼
    ┌─────────────┐
    │   FLAT      │
    └─────────────┘
```
👉 这是最干净、最安全的交易状态机

### 2️⃣ 状态定义（你画图时用）

🔹 FLAT（无仓位）

- position === null
- 系统允许：
    - 接收 Strategy 的 ENTER
- 系统禁止：
    - UPDATE_STOP
    - EXIT（无仓位无法平仓）

🔹 OPEN（持仓中）

- position !== null

- position 内部包含：
    - side（LONG / SHORT）
    - entryPrice
    - stopLoss（唯一生效止损）
    - trailingStop（可选）

- 系统允许：
    - RiskManager → UPDATE_STOP
    - RiskManager → EXIT

- 系统禁止：
    - 再次 ENTER（禁止加仓 / 反手）

### 3️⃣ 事件（Events / Actions）

🔵 OPEN_POSITION

```
FLAT ─────────────▶ OPEN
```

- 触发来源：trendStrategy
- 执行者：BacktestEngine
- 作用：
    - 创建 Position
    - 初始化 stopLoss
- ❌ 如果当前不是 FLAT → throw error

🟡 UPDATE_STOP

```
OPEN ────────▶ OPEN   （自循环）
```

- 触发来源：riskManager
- 执行者：BacktestEngine
- 作用：
    - 更新 stopLoss / trailingStop
    - ❌ FLAT 状态下直接 ignore

🔴 CLOSE_POSITION

```
OPEN ─────────────▶ FLAT
```

- 触发来源：riskManager
- 执行者：BacktestEngine
- 作用：
    - 销毁 Position
- ❌ FLAT 状态下直接 ignore

### 4️⃣ FSM 图

```
                +-------------------+
                |                   |
                |   UPDATE_STOP     |
                |                   |
                v                   |
        +---------------+    CLOSE_POSITION
        |               |------------------+
        |     OPEN      |                  |
        |               |<-----------------+
        +---------------+
                ^
                |
                | OPEN_POSITION
                |
        +---------------+
        |               |
        |     FLAT      |
        |               |
        +---------------+
```

✅ Invariants（不变量）

- FLAT → position === null
- OPEN → position !== null
- stopLoss 始终是 唯一生效止损
- trailingStop 只能朝盈利方向移动

❌ 禁止的状态迁移

|From|	Action|	Why|
|-|-|-|
| FLAT |	UPDATE_STOP |	无仓位 |
| FLAT |	CLOSE_POSITION	| 无意义 |
| OPEN |	OPEN_POSITION	| 禁止加仓|
| OPEN → OPEN |	ENTER	| 防止反手 |
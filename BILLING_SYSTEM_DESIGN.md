# OmniCanvas 收费系统设计方案

## 1. 现状分析

### 1.1 当前架构

| 模块 | 现状 | 收费相关度 |
|------|------|-----------|
| **用户系统** | 用户名/密码 + Google OAuth，角色分 `user` / `admin` | ✅ 已有用户标识，缺少套餐/余额 |
| **Token 统计** | `token_logs` 表记录 LLM 调用的 prompt/completion tokens | ⚠️ 仅统计不限制，无视频/图片计费 |
| **图片生成** | 通过 `AiService.generateImageFromJson()` 调用多渠道上游 API | ❌ 无任何扣费/配额校验 |
| **视频生成** | 通过 `AiService.generateVideoFromJson()` 调用上游 API | ❌ 无任何扣费/配额校验 |
| **图片处理** | 去背景 / 超分 / 局部重绘 / 编辑 | ❌ 无计费 |
| **Agent 会话** | 一次用户请求触发多轮 LLM + 多次 tool call | ❌ 无单次请求级别的成本追踪 |
| **管理后台** | 独立 Vue3 SPA (`admin/`)，含渠道/模型/用户/Token 统计面板 | ⚠️ 缺少套餐管理和计费看板 |

### 1.2 核心成本来源（需计费的操作）

```
┌─────────────────────────────────────────────────────┐
│                    用户请求                          │
│  "帮我生成一套淘宝电商主图，5张不同卖点"              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│               Agent (LLM 推理)                       │
│  plan_ecommerce_suite → 5× generate_image           │
│                                                      │
│  成本 1: LLM Chat Tokens (prompt + completion)       │
│  成本 2: 5× 图片生成 API 调用                         │
│  成本 3: 可能包含 upscale_image / remove_background   │
└─────────────────────────────────────────────────────┘
```

**计费维度矩阵：**

| 操作类型 | 调用来源 | 上游成本特征 | 建议计费单位 |
|---------|---------|-------------|-------------|
| LLM Chat | Agent / Vision 分析 | token 数 × 单价 | Token 数 |
| 图片生成 | generate_image | 按次 × 模型 × 尺寸/质量 | 积分/次 |
| 视频生成 | generate_video | 按次 × 模型 × 时长 × 尺寸 | 积分/次 |
| 去背景 | remove_background | 按次 | 积分/次 |
| 超分放大 | upscale_image | 按次 | 积分/次 |
| 局部重绘 | inpaint_image | 按次（等同图片生成） | 积分/次 |
| 图片编辑 | edit_image | 按次（等同图片生成） | 积分/次 |

---

## 2. 计费模型设计

### 2.1 积分制（Credits System）

采用**统一积分制**，将所有上游 API 调用成本抽象为用户侧的"积分"概念。

**为什么用积分而不是直接人民币/美元？**

1. **模型成本不透明**：不同渠道同一模型价格不同，内部切换渠道不应影响用户感知
2. **灵活调价**：积分与货币解耦，可以随时调整积分兑换比例而不改用户已购套餐
3. **促销友好**：赠送积分、活动加倍等运营手段更灵活
4. **多操作归一**：Token 和图片生成可以用同一积分池，降低用户理解成本

### 2.2 积分消耗规则

#### 基础消耗矩阵

```typescript
// 积分消耗配置（可在管理后台动态调整）
interface CreditCostRule {
  id: string;
  operation: OperationType;          // 操作类型
  modelPattern?: string;             // 模型匹配规则（正则），null 表示通配
  baseCost: number;                  // 基础积分消耗
  qualityMultiplier?: Record<string, number>;  // 质量档位倍率
  sizeMultiplier?: Record<string, number>;     // 尺寸档位倍率
  durationMultiplier?: number;       // 视频每秒倍率
  enabled: boolean;
}

type OperationType =
  | 'llm_chat'           // LLM 对话
  | 'image_generation'   // 图片生成（含 text2img / img2img / edit）
  | 'video_generation'   // 视频生成
  | 'remove_background'  // 去背景
  | 'upscale_image'      // 超分
  | 'inpaint_image';     // 局部重绘
```

#### 建议默认定价（1 积分 ≈ ¥0.01）

| 操作 | 基础积分 | 说明 |
|------|---------|------|
| **LLM Chat** | 每 1K tokens = 1 积分 | prompt + completion 合计 |
| **图片生成 (标准)** | 10 积分/张 | GPT-Image-1, DALL-E-3 等 |
| **图片生成 (高清)** | 20 积分/张 | GPT-Image-2, Gemini 2K+ |
| **图片生成 (超高清)** | 40 积分/张 | 4K 输出 |
| **视频生成 (基础)** | 50 积分/次 | 5 秒视频 |
| **视频生成 (长)** | 10 积分/秒 | 超过 5 秒的部分 |
| **去背景** | 5 积分/次 | |
| **超分放大** | 8 积分/次 | |
| **局部重绘** | 10 积分/次 | 等同于一次图片生成 |
| **图片编辑** | 10 积分/次 | 等同于一次图片生成 |

> [!NOTE]
> 所有价格应在管理后台可配置，并可按模型 ID 精细覆盖。例如 `gpt-image-2` 的 4K 输出积分可以比 `dall-e-3` 的 HD 更贵。

### 2.3 套餐体系

```
┌──────────────────────────────────────────────────────────┐
│                      套餐层级                             │
├──────────┬────────────┬──────────────┬───────────────────┤
│  免费体验  │  基础版      │  专业版        │  企业版           │
│  Free    │  Starter   │  Pro         │  Enterprise       │
├──────────┼────────────┼──────────────┼───────────────────┤
│  100 积分 │  2000 积分  │  10000 积分   │  自定义            │
│  注册赠送  │  ¥29/月    │  ¥99/月      │  联系销售           │
├──────────┼────────────┼──────────────┼───────────────────┤
│  生成水印  │  无水印      │  无水印        │  无水印            │
│  基础模型  │  全部模型    │  全部模型      │  全部模型+优先队列  │
│  无批量    │  单次 3 张   │  单次 8 张    │  无限制            │
│  1 工作区  │  5 工作区    │  20 工作区    │  无限制            │
└──────────┴────────────┴──────────────┴───────────────────┘
```

同时支持**积分包单独购买**（不绑定月费，永不过期）：

| 积分包 | 价格 | 有效期 |
|--------|------|--------|
| 500 积分 | ¥19 | 永久 |
| 2000 积分 | ¥59 | 永久 |
| 5000 积分 | ¥129 | 永久 |
| 20000 积分 | ¥399 | 永久 |

---

## 3. 数据库设计

### 3.1 新增表

基于现有 SQLite (`bun:sqlite`) 架构，新增以下表：

```sql
-- 3.1.1 用户余额表
CREATE TABLE IF NOT EXISTS user_credits (
  userId       TEXT PRIMARY KEY,
  balance      INTEGER NOT NULL DEFAULT 0,    -- 当前可用积分
  totalEarned  INTEGER NOT NULL DEFAULT 0,    -- 累计获得积分（含购买+赠送+订阅）
  totalSpent   INTEGER NOT NULL DEFAULT 0,    -- 累计消耗积分
  updatedAt    TEXT NOT NULL
);

-- 3.1.2 积分流水表（核心审计表）
CREATE TABLE IF NOT EXISTS credit_transactions (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL,
  amount       INTEGER NOT NULL,              -- 正数=充入，负数=扣除
  balance      INTEGER NOT NULL,              -- 操作后余额（快照）
  type         TEXT NOT NULL,                 -- purchase|subscription|gift|consume|refund|admin_adjust
  operation    TEXT,                          -- image_generation|video_generation|llm_chat|...
  detail       TEXT,                          -- JSON: {model, size, quality, taskId, ...}
  orderId      TEXT,                          -- 关联订单 ID
  createdAt    TEXT NOT NULL,

  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(type, createdAt);

-- 3.1.3 套餐定义表
CREATE TABLE IF NOT EXISTS plans (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,              -- 显示名称
  tier            TEXT NOT NULL,              -- free|starter|pro|enterprise
  monthlyCredits  INTEGER NOT NULL DEFAULT 0, -- 每月赠送积分
  price           INTEGER NOT NULL DEFAULT 0, -- 月费（分）
  maxWorkspaces   INTEGER NOT NULL DEFAULT 1,
  maxBatchSize    INTEGER NOT NULL DEFAULT 1, -- 单次最大生成数
  features        TEXT,                       -- JSON: 功能开关列表
  sortOrder       INTEGER NOT NULL DEFAULT 0,
  enabled         BOOLEAN NOT NULL DEFAULT 1,
  createdAt       TEXT NOT NULL
);

-- 3.1.4 用户订阅表
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id              TEXT PRIMARY KEY,
  userId          TEXT NOT NULL,
  planId          TEXT NOT NULL,
  status          TEXT NOT NULL,              -- active|expired|cancelled
  currentPeriodStart TEXT NOT NULL,
  currentPeriodEnd   TEXT NOT NULL,
  autoRenew       BOOLEAN NOT NULL DEFAULT 1,
  createdAt       TEXT NOT NULL,
  updatedAt       TEXT NOT NULL,

  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (planId) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS idx_subscription_user ON user_subscriptions(userId);

-- 3.1.5 订单表（充值 / 套餐购买）
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  userId          TEXT NOT NULL,
  type            TEXT NOT NULL,              -- credit_pack|subscription
  planId          TEXT,
  creditAmount    INTEGER,                    -- 积分包数量
  amount          INTEGER NOT NULL,           -- 实付金额（分）
  currency        TEXT NOT NULL DEFAULT 'CNY',
  status          TEXT NOT NULL,              -- pending|paid|failed|refunded
  paymentMethod   TEXT,                       -- wechat|alipay|stripe
  paymentId       TEXT,                       -- 第三方支付流水号
  createdAt       TEXT NOT NULL,
  paidAt          TEXT,

  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(userId, createdAt);

-- 3.1.6 积分消耗规则表
CREATE TABLE IF NOT EXISTS credit_cost_rules (
  id              TEXT PRIMARY KEY,
  operation       TEXT NOT NULL,
  modelPattern    TEXT,                       -- 正则匹配模型 ID，NULL = 通配
  baseCost        INTEGER NOT NULL,
  qualityMultiplier TEXT,                     -- JSON: {"hd": 2, "4K": 4}
  sizeMultiplier    TEXT,                     -- JSON: {"2048x2048": 1.5}
  durationMultiplier REAL,                    -- 视频秒数倍率
  priority        INTEGER NOT NULL DEFAULT 0, -- 越大优先级越高
  enabled         BOOLEAN NOT NULL DEFAULT 1,
  notes           TEXT,
  updatedAt       TEXT NOT NULL
);
```

### 3.2 现有表修改

```sql
-- users 表增加套餐关联（可选，快速查询用）
ALTER TABLE users ADD COLUMN currentPlanId TEXT;
ALTER TABLE users ADD COLUMN creditBalance INTEGER DEFAULT 0;
```

---

## 4. 服务端架构设计

### 4.1 模块结构

```
server/src/
├── billing/                          ← 新模块
│   ├── billing.module.ts
│   ├── billing.controller.ts         ← REST API
│   ├── credits.service.ts            ← 积分核心逻辑
│   ├── plans.service.ts              ← 套餐管理
│   ├── orders.service.ts             ← 订单/支付
│   ├── cost-calculator.service.ts    ← 积分消耗计算
│   ├── billing.guard.ts              ← 余额校验中间件
│   ├── billing.interceptor.ts        ← 自动扣费拦截器
│   └── dto/
│       ├── create-order.dto.ts
│       └── credit-cost-rule.dto.ts
```

### 4.2 核心服务：CreditsService

```typescript
@Injectable()
export class CreditsService {
  /**
   * 预扣积分（操作开始前冻结）
   * 返回 transactionId，用于后续确认或回滚
   */
  async preDeduct(userId: string, amount: number, detail: CreditDetail): Promise<string>;

  /**
   * 确认扣费（操作成功后）
   * 将预扣转为正式扣除
   */
  async confirmDeduction(transactionId: string): Promise<void>;

  /**
   * 回滚预扣（操作失败时退还）
   */
  async rollbackDeduction(transactionId: string): Promise<void>;

  /**
   * 充值积分（购买 / 订阅 / 赠送）
   */
  async addCredits(userId: string, amount: number, type: TransactionType, orderId?: string): Promise<void>;

  /**
   * 查询用户余额
   */
  async getBalance(userId: string): Promise<{ balance: number; totalEarned: number; totalSpent: number }>;

  /**
   * 查询用户消费明细（分页）
   */
  async getTransactions(userId: string, page: number, pageSize: number): Promise<PaginatedResult<CreditTransaction>>;
}
```

### 4.3 核心服务：CostCalculatorService

```typescript
@Injectable()
export class CostCalculatorService {
  /**
   * 根据操作类型 + 参数计算积分消耗
   * 优先匹配管理员自定义规则，回落到默认
   */
  async calculateCost(params: {
    operation: OperationType;
    model?: string;
    quality?: string;
    size?: string;
    seconds?: number;
    tokenCount?: number;
  }): Promise<number>;

  /**
   * 获取所有可配置的消耗规则（管理后台用）
   */
  async getCostRules(): Promise<CreditCostRule[]>;

  /**
   * 新增/修改消耗规则
   */
  async upsertCostRule(rule: CreditCostRule): Promise<void>;
}
```

### 4.4 计费拦截点

收费拦截需要嵌入到以下位置：

```
┌─────────────────────────────────────────────────────────────┐
│                     请求流程 + 计费拦截点                      │
│                                                              │
│  1. Agent 执行 tool call                                      │
│     │                                                        │
│     ├─→ generate_image execute()                             │
│     │   ├─→ 🔒 CostCalculator.calculateCost(...)            │
│     │   ├─→ 🔒 CreditsService.preDeduct(userId, cost)       │
│     │   ├─→ AiService.generateImageFromJson(...)             │
│     │   ├─→ ✅ CreditsService.confirmDeduction(txId)         │
│     │   └─→ ❌ CreditsService.rollbackDeduction(txId)        │
│     │                                                        │
│     ├─→ generate_video execute()                             │
│     │   └─→ (同上)                                           │
│     │                                                        │
│     ├─→ remove_background / upscale / inpaint execute()      │
│     │   └─→ (同上)                                           │
│     │                                                        │
│  2. Agent 每个 turn 完成后                                    │
│     ├─→ 🔒 TokensService.recordTokenUsage(...)              │
│     └─→ 🔒 CreditsService.deductForTokens(userId, tokens)   │
│                                                              │
│  3. 前端直接调用 /generate-image (非 Agent 模式)              │
│     ├─→ 🔒 BillingGuard 校验余额                             │
│     ├─→ AiService.generateImageFromJson(...)                 │
│     └─→ 🔒 BillingInterceptor 自动扣费                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 关键设计：预扣 → 确认/回滚

图片/视频生成是异步的（返回 `taskId`），需要"预扣"机制：

```typescript
// 在 generation.tools.ts 的 execute() 中植入
async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
  // 1. 计算成本
  const cost = await ctx.billing.calculateCost({
    operation: 'image_generation',
    model: input.model,
    quality: input.quality,
    size: input.size,
  });

  // 2. 预扣积分（余额不足会抛出 InsufficientCreditsError）
  const txId = await ctx.billing.preDeduct(ctx.userId, cost, {
    operation: 'image_generation',
    model: input.model,
  });

  try {
    // 3. 调用上游 API
    const res = await ctx.ai.generateImageFromJson(...);

    // 4. 确认扣费
    await ctx.billing.confirmDeduction(txId);

    return { output: { ... } };
  } catch (err) {
    // 5. 失败回滚
    await ctx.billing.rollbackDeduction(txId);
    throw err;
  }
}
```

### 4.6 BillingGuard（余额校验中间件）

```typescript
@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private credits: CreditsService,
    private costCalc: CostCalculatorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;
    if (!userId) return true; // 游客走其他逻辑

    const balance = await this.credits.getBalance(userId);
    if (balance.balance <= 0) {
      throw new HttpException(
        { error: '积分不足，请充值后再试', code: 'INSUFFICIENT_CREDITS' },
        HttpStatus.PAYMENT_REQUIRED, // 402
      );
    }
    return true;
  }
}
```

---

## 5. API 设计

### 5.1 用户侧 API

```
GET    /api/billing/balance              → 查询当前余额和套餐
GET    /api/billing/transactions          → 消费明细（分页）
GET    /api/billing/plans                 → 获取可用套餐列表
POST   /api/billing/orders               → 创建充值/订阅订单
GET    /api/billing/orders/:id            → 查询订单状态
POST   /api/billing/orders/:id/pay       → 触发支付（返回支付链接/二维码）
GET    /api/billing/usage-summary         → 获取本月使用量概览
```

### 5.2 管理后台 API

```
GET    /api/admin/billing/overview        → 收入总览仪表盘
GET    /api/admin/billing/orders          → 全部订单列表
GET    /api/admin/billing/users/:id/credits → 查看用户积分详情
POST   /api/admin/billing/users/:id/adjust  → 手动调整用户积分
GET    /api/admin/billing/cost-rules      → 查看消耗规则
PUT    /api/admin/billing/cost-rules/:id  → 修改消耗规则
POST   /api/admin/billing/plans           → 创建/修改套餐
```

### 5.3 支付回调

```
POST   /api/billing/webhooks/wechat       → 微信支付回调
POST   /api/billing/webhooks/alipay       → 支付宝回调
POST   /api/billing/webhooks/stripe       → Stripe 回调（海外）
```

---

## 6. 前端集成方案

### 6.1 用户侧 UI 组件

```
src/
├── components/
│   ├── billing/
│   │   ├── CreditBalance.vue           ← 顶栏积分余额显示
│   │   ├── InsufficientCreditsModal.vue ← 余额不足弹窗
│   │   ├── PricingPlans.vue            ← 套餐选择页
│   │   ├── CreditPackPurchase.vue      ← 积分包购买
│   │   ├── TransactionHistory.vue      ← 消费记录
│   │   ├── UsageSummary.vue            ← 使用量概览图表
│   │   └── PaymentQrCode.vue           ← 支付二维码弹窗
│   └── ...
├── composables/
│   └── useBilling.ts                   ← 计费状态管理
```

### 6.2 积分余额显示

在顶栏用户头像旁显示当前积分余额，每次 Agent 操作结束后自动刷新。

### 6.3 余额不足拦截

当后端返回 `402 PAYMENT_REQUIRED` 时，前端弹出升级/充值引导弹窗。

### 6.4 操作前预估

在用户发送生成请求之前，可选地展示本次操作的预估积分消耗：

```
┌──────────────────────────────────────┐
│ 📷 图片生成 · GPT-Image-2           │
│ 尺寸: 2048×2048 · 质量: high        │
│                                      │
│ 预估消耗: 20 积分                     │
│ 当前余额: 1,350 积分                  │
│                                      │
│     [取消]           [确认生成]       │
└──────────────────────────────────────┘
```

### 6.5 管理后台扩展

在现有 `admin/src/components/` 下新增：

```
admin/src/components/
├── BillingSection.vue                  ← 计费管理面板
│   ├── 收入概览 (日/周/月)
│   ├── 套餐管理 (CRUD)
│   ├── 积分规则配置 (按操作/模型)
│   ├── 订单列表
│   └── 用户积分调整
```

---

## 7. 实施路线图

### Phase 1：核心计费引擎（1 周）

- [ ] 数据库 schema 变更（`database.service.ts` 新增建表语句）
- [ ] 实现 `CreditsService`（余额管理 + 预扣/确认/回滚）
- [ ] 实现 `CostCalculatorService`（积分计算 + 规则匹配）
- [ ] 在 `generation.tools.ts` 的图片/视频生成中嵌入计费拦截
- [ ] 在 `image-processing.tools.ts` 的去背景/超分/重绘中嵌入计费拦截
- [ ] Agent turn 完成后记录 LLM token 积分消耗
- [ ] 新用户注册时赠送初始积分

### Phase 2：用户侧 UI（3-5 天）

- [ ] 顶栏积分余额显示组件
- [ ] 余额不足引导弹窗
- [ ] 消费明细页面
- [ ] 使用量概览
- [ ] 套餐展示页面

### Phase 3：管理后台 + 套餐（3-5 天）

- [ ] 管理后台计费面板（收入概览 + 订单列表）
- [ ] 套餐 CRUD 管理
- [ ] 积分消耗规则可视化配置
- [ ] 手动调整用户积分
- [ ] 套餐定义种子数据

### Phase 4：支付集成（1-2 周）

- [ ] 订单创建流程
- [ ] 微信支付 / 支付宝集成
- [ ] 支付回调处理 + 积分到账
- [ ] Stripe 集成（国际用户）
- [ ] 订阅自动续费处理（cron job）

### Phase 5：运营与增强（持续）

- [ ] 邀请注册奖励积分
- [ ] 首充双倍活动
- [ ] 过期积分回收（订阅类积分月末清零，充值积分永久有效）
- [ ] 积分消耗预估接口（前端生成前预显示）
- [ ] 使用量报表导出

---

## 8. 关键设计决策

### 8.1 为什么不直接用 token_logs 扩展？

现有 `token_logs` 只记录 LLM tokens，无法覆盖图片/视频的按次计费。新建 `credit_transactions` 表作为统一账本，`token_logs` 作为 LLM 细粒度审计保留。

### 8.2 为什么用预扣模式？

图片/视频生成是异步的（`taskId` + 轮询），从请求到完成可能 10-60 秒。如果在成功后才扣费：
- 用户可能在等待期间发起更多请求，超出余额
- 并发请求导致超扣

预扣模式在调用前冻结积分，失败时释放，避免超卖。

### 8.3 为什么在 ToolContext 注入计费能力？

Agent 的 tool 执行通过 `ToolContext` 获取所有依赖。将 `billing` 注入 `ToolContext`，比在 `AiService` 层做计费更精确：
- Tool 层知道操作语义（是"生成图片"还是"编辑图片"）
- Tool 层知道用户意图上下文
- `AiService` 层可能被非计费场景调用（管理员测试等）

### 8.4 SQLite 能否支撑？

当前项目用 `bun:sqlite` 单文件数据库。对于中小规模部署（<1000 DAU），SQLite 的写性能完全够用。积分操作是低频的（每次生成只写 1 条流水），不会成为瓶颈。后期如需横向扩展，核心 SQL schema 可直接迁移到 PostgreSQL。

### 8.5 游客/匿名用户怎么处理？

建议**关闭游客访问生成类功能**。未登录用户只能浏览画布，登录后自动获得免费积分。这也与现有 `AuthGuard` / `OptionalAuthGuard` 机制兼容。

---

## 9. ToolContext 扩展

```typescript
// tool.interface.ts 扩展
export interface ToolContext {
  // ... 现有字段 ...

  /** 当前请求的用户 ID（来自 JWT） */
  userId: string;

  /** 计费服务 */
  billing: {
    calculateCost(params: CostParams): Promise<number>;
    preDeduct(userId: string, amount: number, detail: any): Promise<string>;
    confirmDeduction(txId: string): Promise<void>;
    rollbackDeduction(txId: string): Promise<void>;
    getBalance(userId: string): Promise<{ balance: number }>;
  };
}
```

---

## 10. 安全与容错

| 风险 | 对策 |
|------|------|
| 并发扣费超卖 | SQLite WAL 模式 + 事务级余额校验 `WHERE balance >= $amount` |
| 预扣后服务崩溃 | 定时任务扫描 >10 分钟未确认的预扣，自动回滚 |
| 支付回调重放 | 幂等性设计：orderId + status 校验，已 paid 的订单跳过 |
| 管理员手动调积分 | `credit_transactions` 记录 `admin_adjust` 类型，保留操作人 ID |
| 前端绕过计费 | 所有扣费在服务端执行，前端仅做展示引导 |

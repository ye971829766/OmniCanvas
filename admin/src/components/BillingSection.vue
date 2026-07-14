<template>
  <div v-loading="loading" class="billing-admin">
    <el-row :gutter="16">
      <el-col v-for="metric in metrics" :key="metric.label" :span="6">
        <el-card shadow="none" class="metric-card">
          <div class="metric-top">
            <span>{{ metric.label }}</span>
            <div :style="{ background: metric.bg, color: metric.color }" class="metric-icon">
              <el-icon :size="20"><component :is="metric.icon" /></el-icon>
            </div>
          </div>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.help }}</small>
        </el-card>
      </el-col>
    </el-row>

    <el-alert
      v-if="overview && !overview.payment.checkoutConfigured"
      title="支付渠道未配置"
      :description="paymentSetupMessage"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-card shadow="none">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="用户账户" name="accounts">
          <div class="table-toolbar">
            <el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索用户名或昵称" style="width: 260px" />
            <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
          </div>
          <el-table :data="filteredAccounts" style="width: 100%">
            <el-table-column label="用户" min-width="210">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :src="row.avatarUrl" :size="36">{{ initials(row) }}</el-avatar>
                  <div><strong>{{ row.nickname || row.username }}</strong><span>@{{ row.username }}</span></div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="可用积分" width="150"><template #default="{ row }"><b>{{ formatCredits(row.availableCredits) }}</b></template></el-table-column>
            <el-table-column label="预留" width="120"><template #default="{ row }">{{ formatCredits(row.reservedCredits) }}</template></el-table-column>
            <el-table-column label="累计发放" width="140"><template #default="{ row }">{{ formatCredits(row.lifetimeGrantedCredits) }}</template></el-table-column>
            <el-table-column label="累计消耗" width="140"><template #default="{ row }">{{ formatCredits(row.lifetimeSpentCredits) }}</template></el-table-column>
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }"><el-button type="primary" plain size="small" @click="openAdjust(row)">调账</el-button></template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="支付订单" name="orders">
          <div class="table-toolbar">
            <el-select v-model="orderStatusFilter" clearable placeholder="全部状态" style="width: 160px" @change="loadOrders">
              <el-option label="待支付" value="pending" /><el-option label="已支付" value="paid" /><el-option label="已关闭" value="closed" />
              <el-option label="退款中" value="refunding" /><el-option label="已退款" value="refunded" />
            </el-select>
          </div>
          <el-table :data="orders" style="width: 100%">
            <el-table-column label="订单" min-width="180"><template #default="{ row }"><div class="order-id"><strong>{{ row.product?.name || row.sku }}</strong><span>#{{ row.id.slice(0, 10) }}</span></div></template></el-table-column>
            <el-table-column label="用户" min-width="150"><template #default="{ row }">{{ row.nickname || row.username }}</template></el-table-column>
            <el-table-column label="金额" width="120"><template #default="{ row }"><b>¥{{ formatMoney(row.amountMinor) }}</b></template></el-table-column>
            <el-table-column label="积分" width="120"><template #default="{ row }">{{ formatCredits(row.product?.credits || 0) }}</template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="渠道" width="140"><template #default="{ row }">{{ row.provider || "—" }}</template></el-table-column>
            <el-table-column label="创建时间" width="180"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="计价规则" name="pricing">
          <div class="pricing-head">
            <div>
              <strong>当前版本：{{ pricing.version?.id || "—" }}</strong>
              <span>修改后立即对<strong>新预扣</strong>生效；历史订单仍按当时预扣金额结算。</span>
            </div>
            <div class="pricing-head-actions">
              <el-tag type="success">{{ pricing.version?.status || "未配置" }}</el-tag>
              <el-button type="primary" @click="openCreateRule">新增规则</el-button>
            </div>
          </div>
          <el-table :data="pricing.rules" style="width: 100%">
            <el-table-column label="计费项目" min-width="170">
              <template #default="{ row }">
                <strong>{{ operationLabel(row.operation) }}</strong>
                <div class="subtext">{{ row.operation }}</div>
              </template>
            </el-table-column>
            <el-table-column label="模型" min-width="120">
              <template #default="{ row }">{{ row.model || "全部模型" }}</template>
            </el-table-column>
            <el-table-column label="基础积分" width="110">
              <template #default="{ row }"><b>{{ formatCredits(row.baseCredits) }}</b></template>
            </el-table-column>
            <el-table-column label="输入 / 百万 Token" width="140">
              <template #default="{ row }">{{ formatCredits(row.inputCreditsPerMillionTokens) }}</template>
            </el-table-column>
            <el-table-column label="输出 / 百万 Token" width="140">
              <template #default="{ row }">{{ formatCredits(row.outputCreditsPerMillionTokens) }}</template>
            </el-table-column>
            <el-table-column label="附加配置" min-width="200">
              <template #default="{ row }"><span class="config-summary">{{ configSummary(row) }}</span></template>
            </el-table-column>
            <el-table-column label="优先级" width="80">
              <template #default="{ row }">{{ row.priority ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="right" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" plain size="small" @click="openEditRule(row)">编辑</el-button>
                <el-button
                  v-if="row.model"
                  type="danger"
                  plain
                  size="small"
                  @click="removeRule(row)"
                >删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="adjustVisible" title="积分调账" width="500px" :close-on-click-modal="false">
      <div v-if="selectedAccount" class="adjust-user">
        <span>{{ selectedAccount.nickname || selectedAccount.username }}</span>
        <strong>当前 {{ formatCredits(selectedAccount.availableCredits) }} 积分</strong>
      </div>
      <el-form label-position="top">
        <el-form-item label="调整积分" required>
          <el-input-number v-model="adjustAmount" :precision="2" :step="10" controls-position="right" style="width: 100%" />
          <div class="form-hint">正数为发放，负数为扣减；扣减不能超过可用余额。</div>
        </el-form-item>
        <el-form-item label="调账原因" required>
          <el-input v-model="adjustReason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入可审计的具体原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjusting" @click="submitAdjust">确认调账</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="ruleVisible"
      :title="ruleForm.mode === 'create' ? '新增计价规则' : '编辑计价规则'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="计费项目" required>
          <el-select
            v-model="ruleForm.operation"
            :disabled="ruleForm.mode === 'edit'"
            style="width: 100%"
            placeholder="选择操作类型"
          >
            <el-option
              v-for="op in operationOptions"
              :key="op.value"
              :label="op.label"
              :value="op.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型（留空 = 全部模型）">
          <el-input
            v-model="ruleForm.model"
            :disabled="ruleForm.mode === 'edit' && !ruleForm.modelEditable"
            clearable
            placeholder="例如 gpt-image-1 / kling-v1"
          />
          <div class="form-hint">模型专用规则优先级更高；默认「全部模型」规则不可删除，只能改价。</div>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="基础积分" required>
              <el-input-number
                v-model="ruleForm.baseCredits"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-input-number
                v-model="ruleForm.priority"
                :min="0"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="输入 / 百万 Token">
              <el-input-number
                v-model="ruleForm.inputCreditsPerMillionTokens"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="输出 / 百万 Token">
              <el-input-number
                v-model="ruleForm.outputCreditsPerMillionTokens"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="ruleForm.operation === 'video_generation'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="包含秒数（基础积分覆盖）">
                <el-input-number
                  v-model="ruleForm.includedSeconds"
                  :min="0"
                  :step="1"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="超出后积分 / 秒">
                <el-input-number
                  v-model="ruleForm.additionalCreditsPerSecond"
                  :min="0"
                  :precision="2"
                  :step="10"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <div class="form-hint video-hint">
            例：基础 500 积分 + 含 5 秒 + 超出 100 积分/秒 → 5 秒 = 500，6 秒 = 600，10 秒 = 1000。
            按创作包约 ¥0.03/积分，约等于 ¥3/秒（对应上游 0.7–1.5 元/秒约 50–75% 毛利）。
          </div>
        </template>

        <template v-if="ruleForm.operation === 'image_generation' || ruleForm.operation === 'image_edit'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="high 质量倍率">
                <el-input-number v-model="ruleForm.qualityHigh" :min="0.1" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="hd 质量倍率">
                <el-input-number v-model="ruleForm.qualityHd" :min="0.1" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="2048 尺寸倍率">
                <el-input-number v-model="ruleForm.size2048" :min="0.1" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="4096 尺寸倍率">
                <el-input-number v-model="ruleForm.size4096" :min="0.1" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="4k 尺寸倍率">
                <el-input-number v-model="ruleForm.size4k" :min="0.1" :step="0.5" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <template v-if="ruleForm.operation === 'upscale_image'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="2× 倍率">
                <el-input-number v-model="ruleForm.scale2" :min="0.1" :step="0.1" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="4× 倍率">
                <el-input-number v-model="ruleForm.scale4" :min="0.1" :step="0.1" :precision="2" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="ruleVisible = false">取消</el-button>
        <el-button type="primary" :loading="ruleSaving" @click="submitRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Coin, Money, Refresh, Search, ShoppingCart, TrendCharts } from "@element-plus/icons-vue";
import {
  adjustUserCredits,
  createBillingPricingRule,
  deleteBillingPricingRule,
  getBillingAccounts,
  getBillingAdminOrders,
  getBillingOverview,
  getBillingPricing,
  updateBillingPricingRule,
  type BillingAccountAdmin,
  type BillingOrderAdmin,
  type BillingOverview,
  type BillingPricingRule,
} from "../utils/api";

const loading = ref(false);
const overview = ref<BillingOverview | null>(null);
const accounts = ref<BillingAccountAdmin[]>([]);
const orders = ref<BillingOrderAdmin[]>([]);
const pricing = ref<{ version: any; rules: BillingPricingRule[] }>({ version: null, rules: [] });
const activeTab = ref("accounts");
const keyword = ref("");
const orderStatusFilter = ref("");
const adjustVisible = ref(false);
const selectedAccount = ref<BillingAccountAdmin | null>(null);
const adjustAmount = ref(0);
const adjustReason = ref("");
const adjusting = ref(false);

const ruleVisible = ref(false);
const ruleSaving = ref(false);
const ruleForm = ref(emptyRuleForm());

const operationOptions = [
  { value: "llm_chat", label: "Agent 对话" },
  { value: "image_generation", label: "图像生成" },
  { value: "image_edit", label: "图像编辑" },
  { value: "video_generation", label: "视频生成" },
  { value: "remove_background", label: "智能抠图" },
  { value: "upscale_image", label: "图像放大" },
  { value: "inpaint_image", label: "局部重绘" },
];

const metrics = computed(() => [
  { label: "积分账户", value: formatInteger(overview.value?.accountCount || 0), help: "已建立积分账户", icon: Coin, bg: "#e0f2fe", color: "#0369a1" },
  { label: "流通积分", value: formatCredits(overview.value?.availableCredits || 0), help: `预留 ${formatCredits(overview.value?.reservedCredits || 0)}`, icon: Money, bg: "#dcfce7", color: "#15803d" },
  { label: "累计消耗", value: formatCredits(overview.value?.lifetimeSpentCredits || 0), help: `${formatInteger(overview.value?.capturedOperations || 0)} 笔已结算`, icon: TrendCharts, bg: "#ede9fe", color: "#6d28d9" },
  { label: "实收金额", value: `¥${formatMoney(overview.value?.paidAmountMinor || 0)}`, help: `${formatInteger(overview.value?.pendingOrders || 0)} 笔待支付`, icon: ShoppingCart, bg: "#ffedd5", color: "#c2410c" },
]);
const filteredAccounts = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  return key
    ? accounts.value.filter((item) => item.username.toLowerCase().includes(key) || item.nickname?.toLowerCase().includes(key))
    : accounts.value;
});
const paymentSetupMessage = computed(() => {
  const stripe = overview.value?.payment.stripe;
  if (stripe?.secretConfigured && !stripe.webhookConfigured) {
    return "Stripe 私钥已识别；还需配置 STRIPE_WEBHOOK_SECRET，验签到账启用后用户才能购买。";
  }
  return "配置 Stripe 私钥与 webhook 签名密钥后，用户端购买按钮会自动启用。";
});

function emptyRuleForm() {
  return {
    mode: "create" as "create" | "edit",
    id: "",
    operation: "video_generation",
    model: "",
    modelEditable: true,
    baseCredits: 0,
    inputCreditsPerMillionTokens: 0,
    outputCreditsPerMillionTokens: 0,
    priority: 0,
    includedSeconds: 5,
    additionalCreditsPerSecond: 100,
    qualityHigh: 2,
    qualityHd: 2,
    size2048: 2,
    size4096: 4,
    size4k: 4,
    scale2: 1,
    scale4: 1.5,
  };
}

async function loadAll() {
  loading.value = true;
  try {
    const [overviewResult, accountResult, orderResult, pricingResult] = await Promise.all([
      getBillingOverview(), getBillingAccounts(), getBillingAdminOrders(orderStatusFilter.value), getBillingPricing(),
    ]);
    overview.value = overviewResult;
    accounts.value = accountResult;
    orders.value = orderResult.items;
    pricing.value = pricingResult;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || "加载计费数据失败");
  } finally {
    loading.value = false;
  }
}
async function loadOrders() {
  orders.value = (await getBillingAdminOrders(orderStatusFilter.value)).items;
}
function openAdjust(account: BillingAccountAdmin) {
  selectedAccount.value = account;
  adjustAmount.value = 0;
  adjustReason.value = "";
  adjustVisible.value = true;
}
async function submitAdjust() {
  if (!selectedAccount.value || !adjustAmount.value || !adjustReason.value.trim()) {
    ElMessage.warning("请填写非零积分和调账原因");
    return;
  }
  adjusting.value = true;
  try {
    await adjustUserCredits(selectedAccount.value.userId, adjustAmount.value, adjustReason.value.trim());
    ElMessage.success("调账已写入不可变账本");
    adjustVisible.value = false;
    await loadAll();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || error?.response?.data?.message || "调账失败");
  } finally {
    adjusting.value = false;
  }
}

function openCreateRule() {
  ruleForm.value = emptyRuleForm();
  ruleForm.value.mode = "create";
  ruleForm.value.operation = "video_generation";
  ruleForm.value.baseCredits = 500;
  ruleForm.value.includedSeconds = 5;
  ruleForm.value.additionalCreditsPerSecond = 100;
  ruleVisible.value = true;
}

function openEditRule(row: BillingPricingRule) {
  const cfg = (row.config || {}) as Record<string, any>;
  const quality = cfg.qualityMultipliers || {};
  const size = cfg.sizeMultipliers || {};
  const scale = cfg.scaleMultipliers || {};
  ruleForm.value = {
    ...emptyRuleForm(),
    mode: "edit",
    id: row.id,
    operation: row.operation,
    model: row.model || "",
    modelEditable: Boolean(row.model),
    baseCredits: Number(row.baseCredits) || 0,
    inputCreditsPerMillionTokens: Number(row.inputCreditsPerMillionTokens) || 0,
    outputCreditsPerMillionTokens: Number(row.outputCreditsPerMillionTokens) || 0,
    priority: Number(row.priority ?? 0),
    includedSeconds: Number(cfg.includedSeconds ?? 5),
    additionalCreditsPerSecond: Number(
      cfg.additionalCreditsPerSecond
        ?? (cfg.additionalMicrosPerSecond != null ? Number(cfg.additionalMicrosPerSecond) / 1_000_000 : 0),
    ),
    qualityHigh: Number(quality.high ?? 2),
    qualityHd: Number(quality.hd ?? 2),
    size2048: Number(size["2048x2048"] ?? 2),
    size4096: Number(size["4096x4096"] ?? 4),
    size4k: Number(size["4k"] ?? 4),
    scale2: Number(scale["2"] ?? 1),
    scale4: Number(scale["4"] ?? 1.5),
  };
  ruleVisible.value = true;
}

function buildConfigPayload() {
  const form = ruleForm.value;
  if (form.operation === "video_generation") {
    return {
      includedSeconds: form.includedSeconds,
      additionalCreditsPerSecond: form.additionalCreditsPerSecond,
    };
  }
  if (form.operation === "image_generation" || form.operation === "image_edit") {
    return {
      qualityMultipliers: { high: form.qualityHigh, hd: form.qualityHd },
      sizeMultipliers: {
        "2048x2048": form.size2048,
        "4096x4096": form.size4096,
        "4k": form.size4k,
      },
    };
  }
  if (form.operation === "upscale_image") {
    return {
      scaleMultipliers: { "2": form.scale2, "4": form.scale4 },
    };
  }
  return {};
}

async function submitRule() {
  const form = ruleForm.value;
  if (!form.operation) {
    ElMessage.warning("请选择计费项目");
    return;
  }
  if (form.baseCredits < 0) {
    ElMessage.warning("基础积分不能为负");
    return;
  }
  ruleSaving.value = true;
  try {
    const payload = {
      operation: form.operation,
      model: form.model.trim() || null,
      baseCredits: form.baseCredits,
      inputCreditsPerMillionTokens: form.inputCreditsPerMillionTokens,
      outputCreditsPerMillionTokens: form.outputCreditsPerMillionTokens,
      priority: form.priority,
      config: buildConfigPayload(),
    };
    if (form.mode === "create") {
      await createBillingPricingRule(payload);
      ElMessage.success("计价规则已创建");
    } else {
      await updateBillingPricingRule(form.id, payload);
      ElMessage.success("计价规则已更新");
    }
    ruleVisible.value = false;
    pricing.value = await getBillingPricing();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.response?.data?.error || "保存失败");
  } finally {
    ruleSaving.value = false;
  }
}

async function removeRule(row: BillingPricingRule) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${operationLabel(row.operation)} / ${row.model}」的模型规则？`,
      "删除计价规则",
      { type: "warning" },
    );
    await deleteBillingPricingRule(row.id);
    ElMessage.success("已删除");
    pricing.value = await getBillingPricing();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(error?.response?.data?.message || error?.response?.data?.error || "删除失败");
  }
}

function configSummary(row: BillingPricingRule) {
  const cfg = (row.config || {}) as Record<string, any>;
  if (row.operation === "video_generation") {
    const included = cfg.includedSeconds ?? "—";
    const extra = cfg.additionalCreditsPerSecond
      ?? (cfg.additionalMicrosPerSecond != null ? Number(cfg.additionalMicrosPerSecond) / 1_000_000 : null);
    return `含 ${included} 秒 · 超出 ${extra != null ? formatCredits(Number(extra)) : "—"} 积分/秒`;
  }
  if (cfg.qualityMultipliers || cfg.sizeMultipliers) {
    const q = cfg.qualityMultipliers || {};
    const parts = [];
    if (q.high != null) parts.push(`high×${q.high}`);
    if (q.hd != null) parts.push(`hd×${q.hd}`);
    return parts.length ? parts.join(" · ") : "尺寸/质量倍率";
  }
  if (cfg.scaleMultipliers) {
    return Object.entries(cfg.scaleMultipliers).map(([k, v]) => `${k}×${v}`).join(" · ");
  }
  return "—";
}

function initials(row: BillingAccountAdmin) {
  return (row.nickname || row.username || "U").slice(0, 2).toUpperCase();
}
function formatCredits(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
function formatMoney(value: number) {
  return (value / 100).toFixed(2);
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function statusLabel(status: string) {
  return ({ pending: "待支付", paid: "已支付", closed: "已关闭", refunding: "退款中", refunded: "已退款" } as Record<string, string>)[status] || status;
}
function statusType(status: string) {
  return ({ pending: "warning", paid: "success", closed: "info", refunding: "warning", refunded: "info" } as Record<string, any>)[status] || "info";
}
function operationLabel(operation: string) {
  return ({
    llm_chat: "Agent 对话",
    image_generation: "图像生成",
    image_edit: "图像编辑",
    video_generation: "视频生成",
    remove_background: "智能抠图",
    upscale_image: "图像放大",
    inpaint_image: "局部重绘",
  } as Record<string, string>)[operation] || operation;
}
defineExpose({ refresh: loadAll });
onMounted(loadAll);
</script>

<style scoped>
.billing-admin { display: flex; flex-direction: column; gap: 18px; }
.metric-card { height: 138px; }
.metric-top { display: flex; align-items: center; justify-content: space-between; color: #64748b; font-size: 13px; font-weight: 650; }
.metric-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 14px; }
.metric-card strong { display: block; margin-top: 4px; font-size: 27px; color: #0f172a; letter-spacing: -.03em; }
.metric-card small { color: #94a3b8; font-size: 11px; }
.table-toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }
.user-cell { display: flex; align-items: center; gap: 11px; }
.user-cell > div, .order-id { display: flex; flex-direction: column; gap: 3px; }
.user-cell strong, .order-id strong { color: #0f172a; font-size: 13px; }
.user-cell span, .order-id span, .subtext { color: #94a3b8; font-size: 11px; }
.pricing-head {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  margin: 4px 0 18px; padding: 15px 17px; border-radius: 14px; background: #f8fafc;
}
.pricing-head > div:first-child { display: flex; flex-direction: column; gap: 5px; }
.pricing-head span { color: #64748b; font-size: 12px; }
.pricing-head-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.config-summary { color: #475569; font-size: 12px; }
.adjust-user {
  display: flex; justify-content: space-between; margin-bottom: 18px; padding: 14px;
  border-radius: 13px; background: #f8fafc;
}
.adjust-user span { color: #64748b; }
.adjust-user strong { color: #0f172a; }
.form-hint { margin-top: 7px; color: #94a3b8; font-size: 11px; line-height: 1.45; }
.video-hint { margin: -6px 0 8px; }
</style>

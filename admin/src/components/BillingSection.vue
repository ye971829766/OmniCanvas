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
            <div><strong>当前版本：{{ pricing.version?.id || "—" }}</strong><span>已发布规则只读展示，修改价格应发布新版本以保证历史订单可审计。</span></div>
            <el-tag type="success">{{ pricing.version?.status || "未配置" }}</el-tag>
          </div>
          <el-table :data="pricing.rules" style="width: 100%">
            <el-table-column label="计费项目" min-width="190"><template #default="{ row }"><strong>{{ operationLabel(row.operation) }}</strong><div class="subtext">{{ row.operation }}</div></template></el-table-column>
            <el-table-column label="模型" min-width="150"><template #default="{ row }">{{ row.model || "全部模型" }}</template></el-table-column>
            <el-table-column label="基础积分" width="130"><template #default="{ row }"><b>{{ formatCredits(row.baseCredits) }}</b></template></el-table-column>
            <el-table-column label="输入 / 百万 Token" width="170"><template #default="{ row }">{{ formatCredits(row.inputCreditsPerMillionTokens) }}</template></el-table-column>
            <el-table-column label="输出 / 百万 Token" width="170"><template #default="{ row }">{{ formatCredits(row.outputCreditsPerMillionTokens) }}</template></el-table-column>
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
        <el-form-item label="调账原因" required><el-input v-model="adjustReason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入可审计的具体原因" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="adjustVisible = false">取消</el-button><el-button type="primary" :loading="adjusting" @click="submitAdjust">确认调账</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Coin, Money, Refresh, Search, ShoppingCart, TrendCharts } from "@element-plus/icons-vue";
import {
  adjustUserCredits,
  getBillingAccounts,
  getBillingAdminOrders,
  getBillingOverview,
  getBillingPricing,
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

const metrics = computed(() => [
  { label: "积分账户", value: formatInteger(overview.value?.accountCount || 0), help: "已建立积分账户", icon: Coin, bg: "#e0f2fe", color: "#0369a1" },
  { label: "流通积分", value: formatCredits(overview.value?.availableCredits || 0), help: `预留 ${formatCredits(overview.value?.reservedCredits || 0)}`, icon: Money, bg: "#dcfce7", color: "#15803d" },
  { label: "累计消耗", value: formatCredits(overview.value?.lifetimeSpentCredits || 0), help: `${formatInteger(overview.value?.capturedOperations || 0)} 笔已结算`, icon: TrendCharts, bg: "#ede9fe", color: "#6d28d9" },
  { label: "实收金额", value: `¥${formatMoney(overview.value?.paidAmountMinor || 0)}`, help: `${formatInteger(overview.value?.pendingOrders || 0)} 笔待支付`, icon: ShoppingCart, bg: "#ffedd5", color: "#c2410c" },
]);
const filteredAccounts = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  return key ? accounts.value.filter((item) => item.username.toLowerCase().includes(key) || item.nickname?.toLowerCase().includes(key)) : accounts.value;
});
const paymentSetupMessage = computed(() => {
  const stripe = overview.value?.payment.stripe;
  if (stripe?.secretConfigured && !stripe.webhookConfigured) {
    return "Stripe 私钥已识别；还需配置 STRIPE_WEBHOOK_SECRET，验签到账启用后用户才能购买。";
  }
  return "配置 Stripe 私钥与 webhook 签名密钥后，用户端购买按钮会自动启用。";
});

async function loadAll() {
  loading.value = true;
  try {
    const [overviewResult, accountResult, orderResult, pricingResult] = await Promise.all([
      getBillingOverview(), getBillingAccounts(), getBillingAdminOrders(orderStatusFilter.value), getBillingPricing(),
    ]);
    overview.value = overviewResult; accounts.value = accountResult; orders.value = orderResult.items; pricing.value = pricingResult;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || "加载计费数据失败");
  } finally { loading.value = false; }
}
async function loadOrders() { orders.value = (await getBillingAdminOrders(orderStatusFilter.value)).items; }
function openAdjust(account: BillingAccountAdmin) { selectedAccount.value = account; adjustAmount.value = 0; adjustReason.value = ""; adjustVisible.value = true; }
async function submitAdjust() {
  if (!selectedAccount.value || !adjustAmount.value || !adjustReason.value.trim()) { ElMessage.warning("请填写非零积分和调账原因"); return; }
  adjusting.value = true;
  try {
    await adjustUserCredits(selectedAccount.value.userId, adjustAmount.value, adjustReason.value.trim());
    ElMessage.success("调账已写入不可变账本"); adjustVisible.value = false; await loadAll();
  } catch (error: any) { ElMessage.error(error?.response?.data?.error || error?.response?.data?.message || "调账失败"); }
  finally { adjusting.value = false; }
}
function initials(row: BillingAccountAdmin) { return (row.nickname || row.username || "U").slice(0, 2).toUpperCase(); }
function formatCredits(value: number) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value); }
function formatInteger(value: number) { return new Intl.NumberFormat("zh-CN").format(value); }
function formatMoney(value: number) { return (value / 100).toFixed(2); }
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function statusLabel(status: string) { return ({ pending: "待支付", paid: "已支付", closed: "已关闭", refunding: "退款中", refunded: "已退款" } as Record<string, string>)[status] || status; }
function statusType(status: string) { return ({ pending: "warning", paid: "success", closed: "info", refunding: "warning", refunded: "info" } as Record<string, any>)[status] || "info"; }
function operationLabel(operation: string) { return ({ llm_chat: "Agent 对话", image_generation: "图像生成", image_edit: "图像编辑", video_generation: "视频生成", remove_background: "智能抠图", upscale_image: "图像放大", inpaint_image: "局部重绘" } as Record<string, string>)[operation] || operation; }
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
.user-cell { display: flex; align-items: center; gap: 11px; }.user-cell > div, .order-id { display: flex; flex-direction: column; gap: 3px; }.user-cell strong, .order-id strong { color: #0f172a; font-size: 13px; }.user-cell span, .order-id span, .subtext { color: #94a3b8; font-size: 11px; }
.pricing-head { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 18px; padding: 15px 17px; border-radius: 14px; background: #f8fafc; }.pricing-head > div { display: flex; flex-direction: column; gap: 5px; }.pricing-head span { color: #64748b; font-size: 12px; }
.adjust-user { display: flex; justify-content: space-between; margin-bottom: 18px; padding: 14px; border-radius: 13px; background: #f8fafc; }.adjust-user span { color: #64748b; }.adjust-user strong { color: #0f172a; }.form-hint { margin-top: 7px; color: #94a3b8; font-size: 11px; }
</style>

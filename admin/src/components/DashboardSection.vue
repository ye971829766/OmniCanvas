<template>
  <div v-loading="loading" class="dash">
    <!-- Alerts -->
    <div v-if="alerts.length" class="dash-alerts">
      <el-alert
        v-for="(item, idx) in alerts"
        :key="idx"
        :title="item.title"
        :description="item.desc"
        :type="item.type"
        show-icon
        :closable="false"
      />
    </div>

    <!-- KPI row -->
    <el-row :gutter="14">
      <el-col v-for="card in kpiCards" :key="card.label" :xs="12" :sm="12" :md="6">
        <div class="kpi">
          <div class="kpi__top">
            <span>{{ card.label }}</span>
            <div class="kpi__icon" :style="{ background: card.bg, color: card.color }">
              <el-icon :size="18"><component :is="card.icon" /></el-icon>
            </div>
          </div>
          <strong>{{ card.value }}</strong>
          <small>{{ card.help }}</small>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- Ops snapshot -->
      <el-col :span="14">
        <div class="panel">
          <div class="panel__head">
            <div>
              <h3>运营快照</h3>
              <p>计费、用量与配置就绪状态</p>
            </div>
            <el-button text type="primary" @click="loadDashboard">刷新</el-button>
          </div>

          <div class="snap-grid">
            <div class="snap">
              <span class="snap__label">流通积分</span>
              <strong>{{ formatCredits(billing?.availableCredits) }}</strong>
              <em>预留 {{ formatCredits(billing?.reservedCredits) }}</em>
            </div>
            <div class="snap">
              <span class="snap__label">累计消耗积分</span>
              <strong>{{ formatCredits(billing?.lifetimeSpentCredits) }}</strong>
              <em>{{ formatInt(billing?.capturedOperations) }} 笔已结算</em>
            </div>
            <div class="snap">
              <span class="snap__label">实收金额</span>
              <strong>¥{{ formatMoney(billing?.paidAmountMinor) }}</strong>
              <em>{{ formatInt(billing?.paidOrders) }} 笔已支付 · {{ formatInt(billing?.pendingOrders) }} 待付</em>
            </div>
            <div class="snap">
              <span class="snap__label">Token 用量</span>
              <strong>{{ formatCompact(tokenStats?.total?.totalTokens) }}</strong>
              <em>{{ formatInt(tokenStats?.total?.totalRequests) }} 次请求 · {{ formatInt(tokenStats?.total?.activeUsersCount) }} 活跃用户</em>
            </div>
            <div class="snap">
              <span class="snap__label">计费进行中</span>
              <strong :class="{ 'is-warn': (billing?.reservedOperations || 0) > 0 }">
                {{ formatInt(billing?.reservedOperations) }}
              </strong>
              <em>预扣未结算（失败应自动退回）</em>
            </div>
            <div class="snap">
              <span class="snap__label">支付通道</span>
              <strong class="snap__status" :class="paymentReady ? 'ok' : 'bad'">
                {{ paymentReady ? "已就绪" : "未配置" }}
              </strong>
              <em>{{ paymentModeLabel }}</em>
            </div>
          </div>

          <div class="inventory">
            <div class="inventory__item">
              <span>对话模型</span>
              <b>{{ modelCounts.chat.enabled }}</b>
              <small>/ {{ modelCounts.chat.total }}</small>
            </div>
            <div class="inventory__item">
              <span>图像模型</span>
              <b>{{ modelCounts.image.enabled }}</b>
              <small>/ {{ modelCounts.image.total }}</small>
            </div>
            <div class="inventory__item">
              <span>视频模型</span>
              <b>{{ modelCounts.video.enabled }}</b>
              <small>/ {{ modelCounts.video.total }}</small>
            </div>
            <div class="inventory__item">
              <span>上游渠道</span>
              <b>{{ enabledChannels }}</b>
              <small>/ {{ channels.length }}</small>
            </div>
            <div class="inventory__item">
              <span>图/视模板</span>
              <b>{{ imageConfigs.length }}</b>
              <small>/ {{ videoConfigs?.length || 0 }}</small>
            </div>
            <div class="inventory__item">
              <span>Logo 字典</span>
              <b>{{ logoLibraryCount }}</b>
              <small>个资产</small>
            </div>
          </div>
        </div>
      </el-col>

      <!-- Agent defaults + config health -->
      <el-col :span="10">
        <div class="panel">
          <div class="panel__head">
            <div>
              <h3>默认 Agent 模型</h3>
              <p>对话 / 视觉 / 绘画 / 局部重绘当前绑定</p>
            </div>
          </div>
          <div class="agent-list">
            <div class="agent-row">
              <span>对话模型</span>
              <el-tag effect="plain" round>{{ agentConfig.chatModel || "未设置" }}</el-tag>
            </div>
            <div class="agent-row">
              <span>视觉模型</span>
              <el-tag effect="plain" round>{{ agentConfig.visionModel || "未设置" }}</el-tag>
            </div>
            <div class="agent-row">
              <span>绘画模型</span>
              <el-tag effect="plain" round>
                {{ agentConfig.imageModel || "自动（首个图像模型）" }}
              </el-tag>
            </div>
            <div class="agent-row">
              <span>局部重绘</span>
              <el-tag effect="plain" round>
                {{ agentConfig.inpaintModel || "自动（首个图像模型）" }}
              </el-tag>
            </div>
          </div>

          <div class="health">
            <div class="health__title">配置健康</div>
            <div
              v-for="item in healthItems"
              :key="item.label"
              class="health__row"
            >
              <span class="dot" :class="item.ok ? 'ok' : 'bad'" />
              <span class="health__label">{{ item.label }}</span>
              <span class="health__value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- Top users by token -->
      <el-col :span="12">
        <div class="panel">
          <div class="panel__head">
            <div>
              <h3>用量 Top 用户</h3>
              <p>按累计 Token 排序</p>
            </div>
          </div>
          <el-table
            :data="topUsers"
            size="small"
            empty-text="暂无用量数据"
            class="dash-table"
          >
            <el-table-column label="用户" min-width="150">
              <template #default="{ row }">
                <div class="user-cell">
                  <strong>{{ row.nickname || row.username }}</strong>
                  <span>@{{ row.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Token" width="110" align="right">
              <template #default="{ row }">
                <b>{{ formatCompact(row.totalTokens) }}</b>
              </template>
            </el-table-column>
            <el-table-column label="请求" width="80" align="right">
              <template #default="{ row }">{{ formatInt(row.requestCount) }}</template>
            </el-table-column>
            <el-table-column label="最近使用" width="120" align="right">
              <template #default="{ row }">
                <span class="muted">{{ formatRelative(row.lastUsedAt) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>

      <!-- Credit leaders + recent orders -->
      <el-col :span="12">
        <div class="panel">
          <div class="panel__head">
            <div>
              <h3>积分消耗 Top</h3>
              <p>累计消耗最高的账户</p>
            </div>
          </div>
          <el-table
            :data="topCreditSpenders"
            size="small"
            empty-text="暂无积分账户"
            class="dash-table"
          >
            <el-table-column label="用户" min-width="140">
              <template #default="{ row }">
                <div class="user-cell">
                  <strong>{{ row.nickname || row.username }}</strong>
                  <span>可用 {{ formatCredits(row.availableCredits) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="累计消耗" width="120" align="right">
              <template #default="{ row }">
                <b>{{ formatCredits(row.lifetimeSpentCredits) }}</b>
              </template>
            </el-table-column>
            <el-table-column label="累计发放" width="110" align="right">
              <template #default="{ row }">
                {{ formatCredits(row.lifetimeGrantedCredits) }}
              </template>
            </el-table-column>
          </el-table>

          <div class="orders-block">
            <div class="health__title">最近支付订单</div>
            <div v-if="!recentOrders.length" class="muted empty-line">暂无已支付订单</div>
            <div v-for="order in recentOrders" :key="order.id" class="order-row">
              <div>
                <strong>{{ order.product?.name || order.sku }}</strong>
                <span>{{ order.nickname || order.username }}</span>
              </div>
              <div class="order-row__right">
                <b>¥{{ formatMoney(order.amountMinor) }}</b>
                <span>{{ formatRelative(order.paidAt || order.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Channels compact status -->
    <div class="panel">
      <div class="panel__head">
        <div>
          <h3>上游渠道状态</h3>
          <p>启用状态与权重（调度优先级）</p>
        </div>
      </div>
      <el-table :data="sortedChannels" size="small" empty-text="尚未配置上游渠道" class="dash-table">
        <el-table-column label="渠道" min-width="160">
          <template #default="{ row }">
            <strong style="color: #0f172a">{{ row.name }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" round>{{ channelTypeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权重" prop="weight" width="80" align="center" />
        <el-table-column label="绑定模型" width="100" align="center">
          <template #default="{ row }">
            {{ mappingsForChannel(row.id) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status ? 'success' : 'info'" effect="light" round>
              {{ row.status ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Coin,
  CreditCard,
  Files,
  User,
} from "@element-plus/icons-vue";
import {
  getAdminUsers,
  getBillingAccounts,
  getBillingAdminOrders,
  getBillingOverview,
  getModelConfig,
  getTokenStats,
  type AdminUser,
  type BillingAccountAdmin,
  type BillingOrderAdmin,
  type BillingOverview,
  type Channel,
  type ImageConfig,
  type ModelMapping,
  type SystemTokenStats,
  type VideoConfig,
} from "../utils/api";

const props = defineProps<{
  channels: Channel[];
  mappings: ModelMapping[];
  imageConfigs: ImageConfig[];
  videoConfigs?: VideoConfig[];
  pingResults?: Record<string, { success: boolean; latency?: number; error?: string }>;
  logoLibrary?: { id: string }[];
}>();

const loading = ref(false);
const billing = ref<BillingOverview | null>(null);
const tokenStats = ref<SystemTokenStats | null>(null);
const users = ref<AdminUser[]>([]);
const accounts = ref<BillingAccountAdmin[]>([]);
const recentOrders = ref<BillingOrderAdmin[]>([]);
const agentConfig = ref<{
  chatModel?: string;
  visionModel?: string;
  imageModel?: string;
  inpaintModel?: string;
}>({});

const logoLibraryCount = computed(() => props.logoLibrary?.length || 0);
const enabledChannels = computed(() => props.channels.filter((c) => c.status).length);
const enabledMappings = computed(() => props.mappings.filter((m) => m.enabled).length);

const modelCounts = computed(() => {
  const count = (purpose: string) => {
    const list = props.mappings.filter((m) => m.purpose === purpose);
    return {
      total: list.length,
      enabled: list.filter((m) => m.enabled).length,
    };
  };
  return {
    chat: count("chat"),
    image: count("image"),
    video: count("video"),
  };
});

const paymentReady = computed(() => Boolean(billing.value?.payment?.checkoutConfigured));
const paymentModeLabel = computed(() => {
  const p = billing.value?.payment;
  if (!p) return "加载中…";
  if (p.checkoutConfigured) {
    const providers = p.providers?.length ? p.providers.join(" / ") : p.mode || "checkout";
    return `模式 ${p.mode || "checkout"} · ${providers}`;
  }
  if (p.stripe?.secretConfigured && !p.stripe?.webhookConfigured) {
    return "Stripe 私钥已配，缺 webhook 密钥";
  }
  return "需配置 Stripe 密钥后用户才能充值";
});

const kpiCards = computed(() => [
  {
    label: "注册用户",
    value: formatInt(users.value.length),
    help: `${formatInt(tokenStats.value?.total?.activeUsersCount)} 有用量记录`,
    icon: User,
    bg: "#e0f2fe",
    color: "#0369a1",
  },
  {
    label: "启用模型",
    value: `${enabledMappings.value}`,
    help: `共 ${props.mappings.length} 个映射 · 渠道 ${enabledChannels.value}/${props.channels.length}`,
    icon: Files,
    bg: "#ede9fe",
    color: "#6d28d9",
  },
  {
    label: "累计消耗积分",
    value: formatCredits(billing.value?.lifetimeSpentCredits),
    help: `流通 ${formatCredits(billing.value?.availableCredits)}`,
    icon: Coin,
    bg: "#dcfce7",
    color: "#15803d",
  },
  {
    label: "实收金额",
    value: `¥${formatMoney(billing.value?.paidAmountMinor)}`,
    help: `${formatInt(billing.value?.paidOrders)} 笔支付 · ${formatInt(billing.value?.pendingOrders)} 待付`,
    icon: CreditCard,
    bg: "#ffedd5",
    color: "#c2410c",
  },
]);

const alerts = computed(() => {
  const list: { title: string; desc: string; type: "warning" | "error" | "info" }[] = [];
  if (billing.value && !billing.value.payment.checkoutConfigured) {
    list.push({
      title: "支付通道未就绪",
      desc: paymentModeLabel.value,
      type: "warning",
    });
  }
  if ((billing.value?.reservedOperations || 0) > 5) {
    list.push({
      title: "较多预扣未结算",
      desc: `当前有 ${billing.value?.reservedOperations} 笔 reserved，请检查生成任务是否卡死。`,
      type: "warning",
    });
  }
  if (props.channels.length === 0) {
    list.push({
      title: "尚未配置上游渠道",
      desc: "用户无法调用模型，请先在「上游渠道」添加。",
      type: "error",
    });
  } else if (enabledChannels.value === 0) {
    list.push({
      title: "所有上游渠道已停用",
      desc: "请至少启用一个渠道。",
      type: "error",
    });
  }
  if (props.mappings.length === 0) {
    list.push({
      title: "模型目录为空",
      desc: "请在「模型目录」绑定前端模型到上游。",
      type: "warning",
    });
  } else if (modelCounts.value.image.enabled === 0) {
    list.push({
      title: "无可用图像模型",
      desc: "画布生图/重绘将失败，请启用至少一个图像映射。",
      type: "warning",
    });
  }
  if (!agentConfig.value.chatModel) {
    list.push({
      title: "Agent 对话模型未设置",
      desc: "请到「Agent 配置」指定默认 chat 模型。",
      type: "info",
    });
  }
  return list;
});

const healthItems = computed(() => [
  {
    label: "支付结账",
    ok: paymentReady.value,
    value: paymentReady.value ? "可用" : "未配置",
  },
  {
    label: "启用渠道",
    ok: enabledChannels.value > 0,
    value: `${enabledChannels.value} / ${props.channels.length}`,
  },
  {
    label: "启用图像模型",
    ok: modelCounts.value.image.enabled > 0,
    value: `${modelCounts.value.image.enabled} 个`,
  },
  {
    label: "启用视频模型",
    ok: modelCounts.value.video.enabled > 0,
    value: modelCounts.value.video.enabled > 0
      ? `${modelCounts.value.video.enabled} 个`
      : "无（可选）",
  },
  {
    label: "对话模型映射",
    ok: modelCounts.value.chat.enabled > 0,
    value: `${modelCounts.value.chat.enabled} 个`,
  },
  {
    label: "进行中预扣",
    ok: (billing.value?.reservedOperations || 0) === 0,
    value: formatInt(billing.value?.reservedOperations),
  },
]);

const topUsers = computed(() =>
  [...(tokenStats.value?.users || [])]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 8),
);

const topCreditSpenders = computed(() =>
  [...accounts.value]
    .sort((a, b) => b.lifetimeSpentCredits - a.lifetimeSpentCredits)
    .filter((a) => a.lifetimeSpentCredits > 0)
    .slice(0, 6),
);

const sortedChannels = computed(() =>
  [...props.channels].sort((a, b) => {
    if (Boolean(b.status) !== Boolean(a.status)) return Number(b.status) - Number(a.status);
    return (b.weight || 0) - (a.weight || 0);
  }),
);

function mappingsForChannel(channelId: string) {
  return props.mappings.filter((m) => m.channelId === channelId && m.enabled).length;
}

function channelTypeText(type: string) {
  return (
    {
      all: "全部",
      chat: "对话",
      image: "图像",
      video: "视频",
    } as Record<string, string>
  )[type] || type;
}

function formatInt(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatCredits(value?: number | null) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatMoney(value?: number | null) {
  return (Number(value || 0) / 100).toFixed(2);
}

function formatCompact(value?: number | null) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatInt(n);
}

function formatRelative(value?: string | null) {
  if (!value) return "—";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

async function loadDashboard() {
  loading.value = true;
  try {
    const [billingRes, tokensRes, usersRes, accountsRes, ordersRes, modelCfg] =
      await Promise.all([
        getBillingOverview().catch(() => null),
        getTokenStats().catch(() => null),
        getAdminUsers().catch(() => []),
        getBillingAccounts().catch(() => []),
        getBillingAdminOrders("paid").catch(() => ({ items: [] as BillingOrderAdmin[], total: 0 })),
        getModelConfig().catch(() => null),
      ]);
    billing.value = billingRes;
    tokenStats.value = tokensRes;
    users.value = usersRes || [];
    accounts.value = accountsRes || [];
    recentOrders.value = (ordersRes?.items || []).slice(0, 5);
    agentConfig.value = {
      chatModel: modelCfg?.agentConfig?.chatModel,
      visionModel: modelCfg?.agentConfig?.visionModel,
      imageModel: modelCfg?.agentConfig?.imageModel,
      inpaintModel: modelCfg?.agentConfig?.inpaintModel,
    };
  } finally {
    loading.value = false;
  }
}

defineExpose({ refresh: loadDashboard });
onMounted(loadDashboard);
</script>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dash-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kpi {
  background: #fff;
  border: 1px solid #e8ecf1;
  border-radius: 18px;
  padding: 16px 18px;
  height: 132px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.kpi__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}

.kpi__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}

.kpi strong {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.kpi small {
  margin-top: auto;
  color: #94a3b8;
  font-size: 11px;
}

.panel {
  background: #fff;
  border: 1px solid #e8ecf1;
  border-radius: 18px;
  padding: 18px 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  margin-bottom: 0;
}

.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
}

.panel__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 750;
  color: #0f172a;
}

.panel__head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.snap-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.snap {
  padding: 12px 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 88px;
}

.snap__label {
  font-size: 11px;
  font-weight: 650;
  color: #64748b;
}

.snap strong {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.snap strong.is-warn {
  color: #c2410c;
}

.snap__status.ok {
  color: #15803d;
  font-size: 18px;
}

.snap__status.bad {
  color: #b91c1c;
  font-size: 18px;
}

.snap em {
  font-style: normal;
  font-size: 11px;
  color: #94a3b8;
}

.inventory {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
}

.inventory__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 12px;
  background: #fafbfc;
}

.inventory__item span {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
}

.inventory__item b {
  font-size: 18px;
  color: #0f172a;
  font-weight: 800;
}

.inventory__item small {
  font-size: 11px;
  color: #94a3b8;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.agent-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.health {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health__title {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 2px;
}

.health__row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #cbd5e1;
}

.dot.ok {
  background: #22c55e;
}

.dot.bad {
  background: #f59e0b;
}

.health__label {
  color: #475569;
}

.health__value {
  color: #0f172a;
  font-weight: 700;
  font-size: 12px;
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-cell strong {
  color: #0f172a;
  font-size: 13px;
}

.user-cell span {
  color: #94a3b8;
  font-size: 11px;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
}

.empty-line {
  padding: 8px 0 4px;
}

.orders-block {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
}

.order-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.order-row:last-child {
  border-bottom: none;
}

.order-row > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.order-row strong {
  color: #0f172a;
  font-size: 13px;
}

.order-row span {
  color: #94a3b8;
  font-size: 11px;
}

.order-row__right {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.order-row__right b {
  color: #0f172a;
  font-size: 13px;
}

.dash-table {
  width: 100%;
}

@media (max-width: 1100px) {
  .snap-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .inventory {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>

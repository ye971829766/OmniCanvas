<template>
  <Dialog
    v-model:visible="visible"
    modal
    :draggable="false"
    :style="{ width: '68rem', maxWidth: '94vw' }"
    :content-style="{ padding: '0' }"
    header="积分与账单"
    @show="loadAll"
  >
    <div class="billing-shell">
      <section class="balance-card">
        <div>
          <div class="eyebrow">可用积分</div>
          <div class="balance-value">
            {{ balanceLoading ? "—" : formatCredits(balance?.availableCredits || 0) }}
          </div>
          <div class="balance-meta">
            已预留 {{ formatCredits(balance?.reservedCredits || 0) }} · 累计消耗
            {{ formatCredits(balance?.lifetimeSpentCredits || 0) }}
          </div>
        </div>
        <div class="balance-icon"><Coins :size="28" /></div>
      </section>

      <nav class="billing-tabs" aria-label="账单页面">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="['billing-tab', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="activeTab === 'plans'" class="billing-content">
        <div v-if="!payment.checkoutConfigured" class="provider-notice">
          <CircleAlert :size="18" />
          <span>{{ paymentNotice }}</span>
        </div>
        <div v-if="loading" class="plan-grid">
          <Skeleton v-for="n in 4" :key="n" height="17rem" border-radius="18px" />
        </div>
        <div v-else class="plan-grid">
          <article
            v-for="product in products"
            :key="product.sku"
            :class="['plan-card', { featured: Boolean(product.badge) }]"
          >
            <span v-if="product.badge" class="plan-badge">{{ product.badge }}</span>
            <div class="plan-name">{{ product.name }}</div>
            <div class="plan-description">{{ product.description }}</div>
            <div class="plan-credits">{{ formatCredits(product.credits) }} <small>积分</small></div>
            <div class="plan-price">¥{{ formatMoney(product.amountMinor) }}</div>
            <ul>
              <li v-for="feature in product.features" :key="feature">
                <Check :size="15" /> {{ feature }}
              </li>
            </ul>
            <Button
              :label="payment.checkoutConfigured ? '立即购买' : '支付暂不可用'"
              :disabled="!payment.checkoutConfigured"
              :loading="purchasingSku === product.sku"
              class="w-full"
              @click="purchase(product)"
            />
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'transactions'" class="billing-content">
        <div v-if="transactions.length" class="record-list">
          <div v-for="item in transactions" :key="item.id" class="record-row">
            <div class="record-icon"><ReceiptText :size="17" /></div>
            <div class="record-main">
              <strong>{{ transactionLabel(item.type) }}</strong>
              <span>{{ formatDate(item.createdAt) }}</span>
            </div>
            <div :class="['record-amount', { positive: item.availableDeltaCredits > 0 }]">
              {{ signedCredits(item) }}
            </div>
          </div>
        </div>
        <div v-else class="empty-state"><ReceiptText :size="30" /><span>暂无积分明细</span></div>
      </section>

      <section v-else class="billing-content">
        <div v-if="orders.length" class="record-list">
          <div v-for="order in orders" :key="order.id" class="record-row">
            <div class="record-icon"><ShoppingBag :size="17" /></div>
            <div class="record-main">
              <strong>{{ order.product?.name || order.sku }}</strong>
              <span>{{ formatDate(order.createdAt) }} · {{ shortOrderId(order.id) }}</span>
            </div>
            <div class="order-tail">
              <strong>¥{{ formatMoney(order.amountMinor) }}</strong>
              <span :class="['status-pill', `status-${order.status}`]">{{ orderStatus(order.status) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state"><ShoppingBag :size="30" /><span>暂无订单</span></div>
      </section>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, CircleAlert, Coins, ReceiptText, ShoppingBag } from "lucide-vue-next";
import { useToast } from "primevue/usetoast";
import { useBilling } from "@/composables/useBilling";
import {
  checkoutBillingOrder,
  createBillingOrder,
  getBillingCatalog,
  getBillingOrders,
  getBillingTransactions,
  type BillingOrder,
  type BillingProduct,
  type BillingTransaction,
} from "@/utils/api";

const { visible, activeTab, balance, balanceLoading, refreshBalance } = useBilling();
const toast = useToast();
const tabs = [
  { key: "plans", label: "购买积分" },
  { key: "transactions", label: "积分明细" },
  { key: "orders", label: "订单记录" },
] as const;
const products = ref<BillingProduct[]>([]);
const transactions = ref<BillingTransaction[]>([]);
const orders = ref<BillingOrder[]>([]);
const payment = ref({ checkoutConfigured: false, mode: "unconfigured", providers: [] as string[] });
const paymentNotice = computed(() => {
  const stripe = (payment.value as any).stripe;
  if (stripe?.secretConfigured && !stripe?.webhookConfigured) {
    return "Stripe 测试密钥已识别，配置 webhook 签名密钥后即可安全购买。";
  }
  return "支付渠道尚未配置。套餐可正常查看，管理员完成 Stripe 配置后即可购买。";
});
const loading = ref(false);
const purchasingSku = ref("");

async function loadAll() {
  loading.value = true;
  try {
    const [catalog, transactionPage, orderPage] = await Promise.all([
      getBillingCatalog(),
      getBillingTransactions(),
      getBillingOrders(),
      refreshBalance(),
    ]);
    products.value = catalog.products;
    payment.value = catalog.payment;
    transactions.value = transactionPage.items;
    orders.value = orderPage.items;
  } catch (error: any) {
    toast.add({
      severity: "error",
      summary: "账单加载失败",
      detail: error?.userMessage || error?.response?.data?.message || "请稍后重试",
      life: 3500,
    });
  } finally {
    loading.value = false;
  }
}

async function purchase(product: BillingProduct) {
  purchasingSku.value = product.sku;
  try {
    const order = await createBillingOrder(product.sku);
    const checkout = await checkoutBillingOrder(order.id);
    window.location.assign(checkout.checkoutUrl);
  } catch (error: any) {
    const detail = error?.response?.data?.error || error?.response?.data?.message || "请稍后重试";
    toast.add({ severity: "warn", summary: "暂时无法支付", detail, life: 4500 });
    const result = await getBillingOrders();
    orders.value = result.items;
  } finally {
    purchasingSku.value = "";
  }
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
function formatMoney(minor: number) {
  return (minor / 100).toFixed(2);
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function shortOrderId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
function transactionLabel(type: string) {
  return ({ grant: "积分入账", reserve: "任务预留", capture: "任务结算", release: "预留退回", expire: "积分过期", admin_adjust: "管理员调账" } as Record<string, string>)[type] || type;
}
function signedCredits(item: BillingTransaction) {
  const value = item.availableDeltaCredits !== 0 ? item.availableDeltaCredits : -item.consumedDeltaCredits;
  return `${value > 0 ? "+" : ""}${formatCredits(value)} 积分`;
}
function orderStatus(status: BillingOrder["status"]) {
  return ({ pending: "待支付", paid: "已支付", closed: "已关闭", refunding: "退款中", refunded: "已退款" })[status];
}
</script>

<style scoped>
.billing-shell { min-height: 520px; color: var(--p-text-color); }
.balance-card { margin: 0 24px 18px; padding: 24px 28px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; color: white; background: linear-gradient(135deg, #111827, #334155); box-shadow: 0 14px 30px rgba(15, 23, 42, .18); }
.eyebrow { font-size: 12px; color: #cbd5e1; font-weight: 700; letter-spacing: .08em; }
.balance-value { font-size: 38px; font-weight: 800; line-height: 1.15; margin: 5px 0; }
.balance-meta { font-size: 12px; color: #cbd5e1; }
.balance-icon { width: 54px; height: 54px; border-radius: 17px; background: rgba(255,255,255,.12); display: grid; place-items: center; }
.billing-tabs { display: flex; gap: 6px; padding: 0 24px; border-bottom: 1px solid var(--p-surface-200); }
.billing-tab { border: 0; background: transparent; color: var(--p-text-muted-color); padding: 11px 15px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; border-bottom: 2px solid transparent; }
.billing-tab.active { color: var(--p-text-color); border-color: var(--p-primary-color); }
.billing-content { padding: 22px 24px 28px; }
.provider-notice { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; padding: 11px 14px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: 12px; }
.plan-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.plan-card { position: relative; display: flex; flex-direction: column; min-height: 270px; padding: 20px; border: 1px solid var(--p-surface-200); border-radius: 18px; background: var(--p-surface-0); }
.plan-card.featured { border-color: color-mix(in srgb, var(--p-primary-color), transparent 45%); box-shadow: 0 10px 24px rgba(15, 23, 42, .08); }
.plan-badge { position: absolute; right: 12px; top: 12px; padding: 4px 8px; border-radius: 20px; color: white; background: #2563eb; font-size: 10px; font-weight: 700; }
.plan-name { font-size: 16px; font-weight: 750; }
.plan-description { min-height: 34px; margin: 6px 0 16px; color: var(--p-text-muted-color); font-size: 11px; line-height: 1.5; }
.plan-credits { font-size: 25px; font-weight: 800; letter-spacing: -.03em; }
.plan-credits small { font-size: 11px; font-weight: 600; color: var(--p-text-muted-color); }
.plan-price { margin: 3px 0 14px; color: var(--p-text-muted-color); font-size: 13px; }
.plan-card ul { padding: 0; margin: 0 0 18px; flex: 1; list-style: none; }
.plan-card li { display: flex; align-items: center; gap: 6px; margin: 7px 0; font-size: 12px; }
.record-list { border: 1px solid var(--p-surface-200); border-radius: 16px; overflow: hidden; }
.record-row { display: flex; align-items: center; gap: 13px; padding: 14px 16px; border-bottom: 1px solid var(--p-surface-100); }
.record-row:last-child { border-bottom: 0; }
.record-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: var(--p-surface-100); color: var(--p-text-muted-color); }
.record-main { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 3px; }
.record-main strong, .order-tail strong { font-size: 13px; }
.record-main span, .order-tail span { color: var(--p-text-muted-color); font-size: 11px; }
.record-amount { font-size: 13px; font-weight: 700; color: #dc2626; }
.record-amount.positive { color: #16a34a; }
.order-tail { display: flex; align-items: flex-end; flex-direction: column; gap: 5px; }
.status-pill { padding: 3px 7px; border-radius: 12px; background: var(--p-surface-100); }
.status-paid { color: #15803d !important; background: #dcfce7; }
.status-pending { color: #b45309 !important; background: #fef3c7; }
.empty-state { height: 240px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; color: var(--p-text-muted-color); font-size: 13px; }
@media (max-width: 850px) { .plan-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>

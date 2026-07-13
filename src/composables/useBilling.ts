import { ref } from "vue";
import { getBillingBalance, type BillingBalance } from "@/utils/api";

const visible = ref(false);
const activeTab = ref<"plans" | "transactions" | "orders">("plans");
const balance = ref<BillingBalance | null>(null);
const balanceLoading = ref(false);

export function useBilling() {
  const refreshBalance = async () => {
    if (!localStorage.getItem("omnicanvas_token")) {
      balance.value = null;
      return null;
    }
    balanceLoading.value = true;
    try {
      balance.value = await getBillingBalance();
      return balance.value;
    } finally {
      balanceLoading.value = false;
    }
  };

  const openBilling = (tab: typeof activeTab.value = "plans") => {
    activeTab.value = tab;
    visible.value = true;
    void refreshBalance();
  };

  return { visible, activeTab, balance, balanceLoading, openBilling, refreshBalance };
}

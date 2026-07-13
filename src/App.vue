<template>
  <router-view />
  <AuthModal />
  <BillingDialog />
  <Toast position="top-center" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Toast from "primevue/toast";
import AuthModal from "@/components/auth/AuthModal.vue";
import BillingDialog from "@/components/billing/BillingDialog.vue";
import { useUser } from "@/composables/useUser";
import { useBilling } from "@/composables/useBilling";
import { useToast } from "primevue/usetoast";

const route = useRoute();
const router = useRouter();
const { isLoggedIn, isInitializing } = useUser();
const { openBilling } = useBilling();
const toast = useToast();
const handlePaymentRequired = () => openBilling("plans");

onMounted(() => window.addEventListener("omnicanvas:payment-required", handlePaymentRequired));
onUnmounted(() => window.removeEventListener("omnicanvas:payment-required", handlePaymentRequired));

watch(
  () => route.query.payment,
  (payment) => {
    if (payment === "stripe_success") {
      openBilling("orders");
      toast.add({ severity: "info", summary: "支付确认中", detail: "Stripe 到账后积分会自动更新", life: 4500 });
    } else if (payment === "stripe_cancelled") {
      openBilling("orders");
      toast.add({ severity: "secondary", summary: "支付已取消", life: 3000 });
    } else {
      return;
    }
    const query = { ...route.query };
    delete query.payment;
    delete query.orderId;
    delete query.session_id;
    void router.replace({ path: route.path, query });
  },
  { immediate: true },
);

watch([isLoggedIn, isInitializing], ([loggedIn, initializing]) => {
  if (initializing) return;
  if (!loggedIn && route.path !== "/login") {
    router.push("/login");
  }
});
</script>

<style>
/*
 * Global Typography Scale
 * Modify these variables to adjust font sizes across the entire app.
 */
:root {
  --text-xs:   11px;   /* tiny hints, counters */
  --text-sm:   13px;   /* secondary / muted text */
  --text-base: 15px;   /* primary body text, chat messages */
  --text-lg:   17px;   /* headings, titles */
}

body {
  font-size: var(--text-base);
  /* App canvas: soft warm-gray backdrop that white panels float above. */
  background: var(--surface-app);
  color: var(--text-primary);
}

img {
  max-width: 100%;
  height: auto;
}
</style>

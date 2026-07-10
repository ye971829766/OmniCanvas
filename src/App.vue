<template>
  <router-view />
  <AuthModal />
  <Toast position="top-center" />
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Toast from "primevue/toast";
import AuthModal from "@/components/auth/AuthModal.vue";
import { useUser } from "@/composables/useUser";

const route = useRoute();
const router = useRouter();
const { isLoggedIn, isInitializing } = useUser();

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

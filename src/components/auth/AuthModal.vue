<template>
  <Dialog
    v-model:visible="authModalVisible"
    modal
    :dismissableMask="true"
    :style="{ width: '420px', maxWidth: '92vw' }"
    :pt="{
      root: {
        class:
          '!rounded-3xl !border-none !shadow-2xl !bg-[var(--p-surface-0)] !text-[var(--p-text-color)]',
      },
      header: {
        class:
          '!pb-0 !pt-5 !px-6 flex items-center justify-between !bg-transparent',
      },
      content: { class: '!px-6 !pb-6 !pt-2 !bg-transparent' },
    }"
    @show="onShow"
  >
    <template #header>
      <div class="flex items-center gap-2.5">
        <img
          src="@/assets/logo.png"
          alt="OmniCanvas"
          class="w-7 h-7 rounded-lg object-cover shadow-sm"
        />
        <span class="font-bold text-lg text-[var(--p-text-color)]"
          >OmniCanvas</span
        >
      </div>
    </template>

    <AuthForm ref="formRef" />
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog } from "primevue";
import { useUser } from "@/composables/useUser";
import AuthForm from "./AuthForm.vue";

const { authModalVisible } = useUser();
const formRef = ref<InstanceType<typeof AuthForm> | null>(null);

const onShow = () => {
  formRef.value?.resetForms();
};

watch(authModalVisible, (visible) => {
  if (visible) {
    formRef.value?.resetForms();
  }
});
</script>

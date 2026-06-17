<script setup lang="ts">
import { RotateCcw, PanelRightClose } from "lucide-vue-next";
import { Button } from "primevue";

defineProps<{
  messagesCount: number;
}>();

const emit = defineEmits<{
  (e: "reset"): void;
  (e: "collapse"): void;
}>();
</script>

<template>
  <div class="agent-header">
    <div class="flex items-center gap-2">
      <span class="agent-logo">
        <img src="@/assets/logo.jpg" alt="PlotTwist" class="agent-logo-img" />
      </span>
      <span class="font-600 text-13px">AI 设计助手</span>
    </div>
    <div class="flex items-center gap-1">
      <button
        v-if="messagesCount > 0"
        class="agent-icon-btn"
        title="新会话"
        @click="emit('reset')"
      >
        <RotateCcw :size="14" />
      </button>
      <Button text rounded size="small" title="收起" @click="emit('collapse')">
        <PanelRightClose :size="18" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--p-surface-100, #f3f4f6);
}

.agent-logo {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #fff;
  background: #000;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.agent-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.agent-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--p-text-muted-color, #6b7280);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.agent-icon-btn:hover {
  background: var(--p-surface-100, #f3f4f6);
}
</style>

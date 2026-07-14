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
    <div class="header-left">
      <span class="header-title">AI 助手</span>
    </div>
    <div class="header-actions">
      <Button
        v-if="messagesCount > 0"
        text
        rounded
        class="header-icon-btn"
        title="新对话"
        aria-label="新对话"
        @click="emit('reset')"
      >
        <RotateCcw :size="18" :stroke-width="2" />
      </Button>
      <Button
        text
        rounded
        class="header-icon-btn"
        title="收起"
        aria-label="收起面板"
        @click="emit('collapse')"
      >
        <PanelRightClose :size="18" :stroke-width="2" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 52px;
  padding: 10px 12px 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--surface-panel, var(--p-surface-0));
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--p-text-color));
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Larger hit targets — easier to click than size="small" Prime defaults */
.header-icon-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  padding: 0 !important;
  color: var(--text-secondary, var(--p-text-muted-color)) !important;
}

.header-icon-btn :deep(svg) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.header-icon-btn:hover {
  color: var(--text-primary, var(--p-text-color)) !important;
  background: var(--surface-hover, var(--p-surface-100)) !important;
}
</style>

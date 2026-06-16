<script setup lang="ts">
import { Check, Loader2 } from "lucide-vue-next";

defineProps<{
  label: string;
  done: boolean;
}>();
</script>

<template>
  <div class="tool-row-basic">
    <Check v-if="done" :size="12" class="text-emerald-500" />
    <Loader2 v-else :size="12" class="animate-spin text-primary" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.tool-row-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--p-surface-50, #f9fafb);
  border: 1px solid var(--p-surface-200, #e5e7eb);
  font-size: 12px;
  color: var(--p-text-color, #374151);
  margin-top: 4px;
  width: fit-content;
}
</style>

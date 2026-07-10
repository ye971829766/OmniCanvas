<script setup lang="ts">
import { computed } from "vue";
import { Check, Circle, LoaderCircle } from "lucide-vue-next";
import type { AgentPlan } from "@/types/agent";

const props = defineProps<{ plan: AgentPlan }>();

const completedCount = computed(
  () => props.plan.steps.filter((step) => step.status === "completed").length,
);
</script>

<template>
  <section class="agent-plan" aria-label="任务计划">
    <header class="plan-header">
      <div>
        <p class="plan-kicker">任务计划</p>
        <h3>{{ plan.title }}</h3>
      </div>
      <span class="plan-count">{{ completedCount }}/{{ plan.steps.length }}</span>
    </header>

    <ol class="plan-steps">
      <li v-for="step in plan.steps" :key="step.id" :class="`is-${step.status}`">
        <span class="step-status" aria-hidden="true">
          <Check v-if="step.status === 'completed'" :size="13" />
          <LoaderCircle v-else-if="step.status === 'in_progress'" :size="13" />
          <Circle v-else :size="11" />
        </span>
        <div class="step-copy">
          <span class="step-title">{{ step.title }}</span>
          <span v-if="step.description" class="step-description">{{ step.description }}</span>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.agent-plan {
  margin: 5px 0 10px;
  border: 1px solid var(--p-surface-200, #e4e4e7);
  border-radius: 8px;
  background: var(--p-surface-0, #fff);
  overflow: hidden;
}

.plan-header {
  min-height: 52px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--p-surface-100, #f4f4f5);
}

.plan-kicker,
.plan-header h3 {
  margin: 0;
  letter-spacing: 0;
}

.plan-kicker {
  color: var(--p-text-muted-color, #71717a);
  font-size: 11px;
  line-height: 1.2;
}

.plan-header h3 {
  margin-top: 2px;
  color: var(--p-text-color, #18181b);
  font-size: 13px;
  line-height: 1.35;
  font-weight: 650;
}

.plan-count {
  flex: 0 0 auto;
  color: var(--p-text-muted-color, #71717a);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.plan-steps {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.plan-steps li {
  min-height: 38px;
  padding: 6px 12px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
}

.step-status {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-muted-color, #a1a1aa);
}

.is-in_progress .step-status {
  color: var(--accent-primary, #10b981);
}

.is-in_progress .step-status :deep(svg) {
  animation: plan-spin 1s linear infinite;
}

.is-completed .step-status {
  color: #16a34a;
}

.step-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.step-title {
  color: var(--p-text-color, #27272a);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.is-pending .step-title {
  color: var(--p-text-muted-color, #71717a);
}

.step-description {
  color: var(--p-text-muted-color, #71717a);
  font-size: 10.5px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

@keyframes plan-spin {
  to { transform: rotate(360deg); }
}

:global(.p-dark .agent-plan) {
  background: #18181b;
  border-color: #2f2f33;
}

:global(.p-dark .plan-header) {
  border-bottom-color: #27272a;
}
</style>

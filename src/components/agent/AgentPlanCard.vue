<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  Check,
  ChevronDown,
  Circle,
  LoaderCircle,
  X,
} from "lucide-vue-next";
import type { AgentPlan, AgentPlanStep } from "@/types/agent";
import { isInternalAgentTool } from "./tool-labels";

type PlanVisualStatus = "pending" | "in_progress" | "completed" | "failed";

const props = defineProps<{ plan: AgentPlan }>();

function getVisualStatus(step: AgentPlanStep): PlanVisualStatus {
  const status = String(step.status).toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  return "pending";
}

function isInternalStep(step: AgentPlanStep): boolean {
  const tools = [...(step.tools || []), step.completionTool].filter(
    (tool): tool is string => Boolean(tool),
  );
  return tools.length > 0 && tools.every(isInternalAgentTool);
}

const visibleSteps = computed(() =>
  props.plan.steps.filter((step) => !isInternalStep(step)),
);
const stepStatuses = computed(() => visibleSteps.value.map(getVisualStatus));
const totalCount = computed(() => visibleSteps.value.length);
const completedCount = computed(
  () => stepStatuses.value.filter((status) => status === "completed").length,
);
const failedCount = computed(
  () => stepStatuses.value.filter((status) => status === "failed").length,
);
const activeCount = computed(
  () => stepStatuses.value.filter((status) => status === "in_progress").length,
);
const pendingCount = computed(
  () => stepStatuses.value.filter((status) => status === "pending").length,
);
const handledCount = computed(() => completedCount.value + failedCount.value);
const progressPercent = computed(() =>
  totalCount.value
    ? Math.round((handledCount.value / totalCount.value) * 100)
    : 0,
);
const completedPercent = computed(() =>
  totalCount.value ? (completedCount.value / totalCount.value) * 100 : 0,
);
const failedPercent = computed(() =>
  totalCount.value ? (failedCount.value / totalCount.value) * 100 : 0,
);
const isTerminal = computed(
  () =>
    totalCount.value > 0 &&
    activeCount.value === 0 &&
    pendingCount.value === 0,
);
const overallStatus = computed<PlanVisualStatus>(() => {
  if (activeCount.value) return "in_progress";
  if (pendingCount.value) return failedCount.value ? "in_progress" : "pending";
  if (failedCount.value) return "failed";
  if (isTerminal.value) return "completed";
  return "pending";
});
const overallLabel = computed(() => {
  if (overallStatus.value === "failed") return `${failedCount.value} 项失败`;
  if (overallStatus.value === "in_progress") {
    return failedCount.value ? `执行中 · ${failedCount.value} 项失败` : "执行中";
  }
  if (overallStatus.value === "completed") return "已完成";
  return "待开始";
});

const shouldStartExpanded = () => !isTerminal.value && totalCount.value <= 4;
const isExpanded = ref(shouldStartExpanded());
const stepsId = `${useId()}-plan-steps`;

watch(
  () => props.plan.id,
  () => {
    isExpanded.value = shouldStartExpanded();
  },
);

watch(isTerminal, (terminal) => {
  if (terminal) isExpanded.value = false;
});

function toggleExpanded() {
  if (totalCount.value) isExpanded.value = !isExpanded.value;
}

function getStepLabel(status: PlanVisualStatus) {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "进行中";
  if (status === "failed") return "失败";
  return "待处理";
}
</script>

<template>
  <section
    v-if="totalCount"
    class="agent-plan"
    :class="`has-${overallStatus}`"
    aria-label="任务计划"
  >
    <header class="plan-header">
      <button
        type="button"
        class="plan-toggle"
        :aria-expanded="isExpanded"
        :aria-controls="stepsId"
        :disabled="!totalCount"
        :title="isExpanded ? '收起任务步骤' : '展开任务步骤'"
        @click="toggleExpanded"
      >
        <span class="plan-heading">
          <span class="plan-meta">
            <span class="plan-kicker">任务计划</span>
            <span class="plan-state" :class="`is-${overallStatus}`">
              <Check v-if="overallStatus === 'completed'" :size="12" />
              <LoaderCircle
                v-else-if="overallStatus === 'in_progress'"
                :size="12"
              />
              <X v-else-if="overallStatus === 'failed'" :size="12" />
              <Circle v-else :size="10" />
              {{ overallLabel }}
            </span>
          </span>
          <span class="plan-title">{{ plan.title }}</span>
        </span>

        <span class="plan-actions">
          <span class="plan-count" :aria-label="`已处理 ${handledCount}/${totalCount}`">
            <strong>{{ handledCount }}</strong>/{{ totalCount }}
          </span>
          <ChevronDown
            v-if="totalCount"
            class="plan-chevron"
            :class="{ 'is-expanded': isExpanded }"
            :size="15"
            aria-hidden="true"
          />
        </span>
      </button>

      <div class="plan-progress-row">
        <div
          class="plan-progress"
          role="progressbar"
          aria-label="任务总进度"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="progressPercent"
          :aria-valuetext="`已处理 ${handledCount}/${totalCount}`"
        >
          <span
            class="progress-completed"
            :style="{ width: `${completedPercent}%` }"
          />
          <span
            class="progress-failed"
            :style="{ width: `${failedPercent}%` }"
          />
        </div>
        <span class="progress-copy">已处理 {{ handledCount }}/{{ totalCount }}</span>
      </div>
    </header>

    <ol v-if="isExpanded && totalCount" :id="stepsId" class="plan-steps">
      <li
        v-for="(step, index) in visibleSteps"
        :key="step.id"
        :class="`is-${getVisualStatus(step)}`"
      >
        <span class="step-status" aria-hidden="true">
          <Check v-if="getVisualStatus(step) === 'completed'" :size="13" />
          <LoaderCircle
            v-else-if="getVisualStatus(step) === 'in_progress'"
            :size="13"
          />
          <X v-else-if="getVisualStatus(step) === 'failed'" :size="13" />
          <span v-else class="step-index">{{ index + 1 }}</span>
        </span>

        <div class="step-copy">
          <div class="step-title-row">
            <span class="step-title">{{ step.title }}</span>
            <span class="step-state-label">
              {{ getStepLabel(getVisualStatus(step)) }}
            </span>
          </div>
          <span v-if="step.description" class="step-description">
            {{ step.description }}
          </span>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.agent-plan {
  margin: 5px 0 10px;
  overflow: hidden;
  border: 1px solid var(--border-default, var(--p-surface-200, #e4e4e7));
  border-radius: 7px;
  background: var(--surface-panel, var(--p-surface-0, #fff));
}

.plan-header {
  background: var(--surface-sunken, var(--p-surface-50, #fafafa));
}

.plan-toggle {
  width: 100%;
  min-height: 55px;
  padding: 9px 10px 7px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.plan-toggle:hover {
  background: var(--surface-hover, var(--p-surface-100, #f4f4f5));
}

.plan-toggle:focus-visible {
  outline: 2px solid var(--accent-primary, var(--p-primary-color, #18181b));
  outline-offset: -2px;
}

.plan-toggle:disabled {
  cursor: default;
}

.plan-heading {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
}

.plan-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-kicker {
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
  font-size: 11px;
  line-height: 1.2;
}

.plan-state {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.plan-state.is-in_progress {
  color: var(--accent-primary, var(--p-primary-color, #18181b));
}

.plan-state.is-in_progress :deep(svg) {
  animation: plan-spin 1s linear infinite;
}

.plan-state.is-completed {
  color: var(--accent-success, #34c759);
}

.plan-state.is-failed {
  color: var(--accent-error, #ff3b30);
}

.plan-title {
  color: var(--text-primary, var(--p-text-color, #18181b));
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.plan-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
}

.plan-count {
  min-width: 28px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.plan-count strong {
  color: var(--text-primary, var(--p-text-color, #18181b));
  font-weight: 600;
}

.plan-chevron {
  transition: transform var(--dur-fast, 150ms) var(--ease-default, ease);
}

.plan-chevron.is-expanded {
  transform: rotate(180deg);
}

.plan-progress-row {
  padding: 0 12px 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.plan-progress {
  height: 3px;
  display: flex;
  overflow: hidden;
  border-radius: 2px;
  background: var(--surface-active, var(--p-surface-200, #e4e4e7));
}

.progress-completed,
.progress-failed {
  height: 100%;
  transition: width var(--dur-normal, 250ms) var(--ease-default, ease);
}

.progress-completed {
  background: var(--accent-primary, var(--p-primary-color, #161618));
}

.progress-failed {
  background: var(--accent-error, #ff3b30);
}

.progress-copy {
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
  font-size: 10.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.plan-steps {
  margin: 0;
  padding: 4px 0;
  border-top: 1px solid var(--border-subtle, var(--p-surface-100, #f4f4f5));
  list-style: none;
}

.plan-steps li {
  position: relative;
  min-height: 37px;
  padding: 6px 11px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
}

.plan-steps li + li {
  border-top: 1px solid var(--border-subtle, var(--p-surface-100, #f4f4f5));
}

.plan-steps li.is-in_progress {
  background: var(--surface-sunken, var(--p-surface-50, #fafafa));
  box-shadow: inset 2px 0 0 var(--accent-primary, var(--p-primary-color, #18181b));
}

.plan-steps li.is-failed {
  background: rgba(220, 38, 38, 0.06);
  background: color-mix(in srgb, var(--accent-error, #ff3b30) 6%, transparent);
  box-shadow: inset 2px 0 0 var(--accent-error, #ff3b30);
}

.step-status {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-disabled, var(--p-surface-400, #a1a1aa));
}

.step-index {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-strong, var(--p-surface-300, #d4d4d8));
  border-radius: 50%;
  font-size: 10px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.is-in_progress .step-status {
  color: var(--accent-primary, var(--p-primary-color, #18181b));
}

.is-in_progress .step-status :deep(svg) {
  animation: plan-spin 1s linear infinite;
}

.is-completed .step-status {
  color: var(--accent-success, #34c759);
}

.is-failed .step-status {
  color: var(--accent-error, #ff3b30);
}

.step-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.step-title-row {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.step-title {
  min-width: 0;
  color: var(--text-primary, var(--p-text-color, #27272a));
  font-size: 12px;
  font-weight: 520;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.step-state-label {
  flex: 0 0 auto;
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
  font-size: 10.5px;
  line-height: 1.4;
  white-space: nowrap;
}

.is-pending .step-title,
.is-completed .step-title {
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
}

.is-in_progress .step-title {
  font-weight: 600;
}

.is-in_progress .step-state-label {
  color: var(--accent-primary, var(--p-primary-color, #18181b));
}

.is-completed .step-state-label {
  color: var(--accent-success, #34c759);
}

.is-failed .step-title,
.is-failed .step-state-label {
  color: var(--accent-error, #ff3b30);
}

.step-description {
  color: var(--text-secondary, var(--p-text-muted-color, #71717a));
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

@keyframes plan-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .plan-state.is-in_progress :deep(svg),
  .is-in_progress .step-status :deep(svg) {
    animation: none;
  }

  .plan-chevron,
  .progress-completed,
  .progress-failed {
    transition: none;
  }
}
</style>

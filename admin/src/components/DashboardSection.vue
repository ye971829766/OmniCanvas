<template>
  <div style="display: flex; flex-direction: column; gap: 24px">
    <!-- 4 Stats Cards -->
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="dashboard-stat-card" shadow="hover">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div>
              <span style="font-size: 12px; color: #a1a1aa; font-weight: 500">信道数量 (已启用)</span>
              <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff">
                {{ channels.filter((c) => c.status).length }}
                <span style="font-size: 14px; color: #71717a; font-weight: normal">/ {{ channels.length }}</span>
              </h2>
            </div>
            <el-icon class="dashboard-stat-icon" style="color: #3b82f6"><Connection /></el-icon>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="dashboard-stat-card" shadow="hover">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div>
              <span style="font-size: 12px; color: #a1a1aa; font-weight: 500">模型目录（已绑定）</span>
              <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff">
                {{ mappings.filter((m) => m.enabled).length }}
                <span style="font-size: 14px; color: #71717a; font-weight: normal">/ {{ mappings.length }}</span>
              </h2>
            </div>
            <el-icon class="dashboard-stat-icon" style="color: #10b981"><Files /></el-icon>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="dashboard-stat-card" shadow="hover">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div>
              <span style="font-size: 12px; color: #a1a1aa; font-weight: 500">配置模板 (图像/视频)</span>
              <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff">
                {{ imageConfigs.length }} <span style="font-size: 16px; color: #71717a">/ {{ videoConfigs?.length || 0 }}</span>
              </h2>
            </div>
            <el-icon class="dashboard-stat-icon" style="color: #f59e0b"><Setting /></el-icon>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="dashboard-stat-card" shadow="hover">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div>
              <span style="font-size: 12px; color: #a1a1aa; font-weight: 500">网关平均延迟</span>
              <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff">
                {{ averageLatency }}
              </h2>
            </div>
            <el-icon class="dashboard-stat-icon" style="color: #ef4444"><Timer /></el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Lower Section: Mapping Distribution & Channels Priority -->
    <el-row :gutter="20">
      <!-- Left Panel: Models Distribution -->
      <el-col :span="12">
        <el-card
          style="
            background-color: #141416;
            border: 1px solid #27272a;
            border-radius: 12px;
          "
        >
          <template #header>
            <span style="font-size: 14px; font-weight: 600; color: #fff">模型结构配比</span>
          </template>
          <div style="display: flex; flex-direction: column; gap: 20px; padding: 10px 0">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px">
                <span style="color: #e4e4e7">对话文本模型 (Chat)</span>
                <span style="color: #a1a1aa; font-weight: 600">{{ getPercentage('chat') }}%</span>
              </div>
              <el-progress
                :percentage="getPercentage('chat')"
                :show-text="false"
                stroke-width="8"
                color="#3b82f6"
              />
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px">
                <span style="color: #e4e4e7">AI 绘图绘画模型 (Image)</span>
                <span style="color: #a1a1aa; font-weight: 600">{{ getPercentage('image') }}%</span>
              </div>
              <el-progress
                :percentage="getPercentage('image')"
                :show-text="false"
                stroke-width="8"
                color="#f59e0b"
              />
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px">
                <span style="color: #e4e4e7">音视频生视频模型 (Video)</span>
                <span style="color: #a1a1aa; font-weight: 600">{{ getPercentage('video') }}%</span>
              </div>
              <el-progress
                :percentage="getPercentage('video')"
                :show-text="false"
                stroke-width="8"
                color="#ef4444"
              />
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Right Panel: Channels Health Rank -->
      <el-col :span="12">
        <el-card
          style="
            background-color: #141416;
            border: 1px solid #27272a;
            border-radius: 12px;
          "
        >
          <template #header>
            <span style="font-size: 14px; font-weight: 600; color: #fff">信道调度表（权重降序）</span>
          </template>
          <el-table :data="sortedChannelsForDashboard" style="width: 100%" size="small">
            <el-table-column label="信道名称" prop="name">
              <template #default="{ row }">
                <span style="font-weight: 600; color: #fafafa">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="权重" prop="weight" width="70" align="center" />
            <el-table-column label="类型" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="getTagType(row.type)">{{ getTypeText(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status ? 'success' : 'danger'">
                  {{ row.status ? "已启用" : "已禁用" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="最近延迟" width="90" align="center">
              <template #default="{ row }">
                <span
                  v-if="pingResults[row.id] && pingResults[row.id].success"
                  style="color: #10b981; font-weight: 500"
                >
                  {{ pingResults[row.id].latency }}ms
                </span>
                <span v-else-if="pingResults[row.id]" style="color: #ef4444">FAIL</span>
                <span v-else style="color: #71717a"> - </span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Channel, ModelMapping, ImageConfig, VideoConfig, ModelType } from "../utils/api";

const props = defineProps<{
  channels: Channel[];
  mappings: ModelMapping[];
  imageConfigs: ImageConfig[];
  videoConfigs?: VideoConfig[];
  pingResults: Record<string, { success: boolean; latency?: number; error?: string }>;
}>();

const averageLatency = computed(() => {
  const testedList = Object.values(props.pingResults).filter(
    (r) => r.success && typeof r.latency === "number",
  );
  if (testedList.length === 0) return "未测试";
  const sum = testedList.reduce((acc, r) => acc + (r.latency || 0), 0);
  return `${Math.round(sum / testedList.length)} ms`;
});

const sortedChannelsForDashboard = computed(() => {
  return [...props.channels].sort((a, b) => b.weight - a.weight);
});

function getPercentage(purpose: ModelType): number {
  if (props.mappings.length === 0) return 0;
  const count = props.mappings.filter((m) => m.purpose === purpose).length;
  return Math.round((count / props.mappings.length) * 100);
}

function getTypeText(type: string) {
  return type === "all"
    ? "全部模型"
    : type === "chat"
      ? "文本模型"
      : type === "image"
        ? "图像模型"
        : "视频模型";
}

function getTagType(type: string) {
  if (type === "all") return "success";
  if (type === "chat") return "primary";
  if (type === "image") return "warning";
  return "danger";
}
</script>

<style scoped>
.dashboard-stat-card {
  background-color: #141416;
  border: 1px solid #27272a;
  border-radius: 12px;
}
.dashboard-stat-icon {
  font-size: 24px;
  opacity: 0.8;
}
</style>

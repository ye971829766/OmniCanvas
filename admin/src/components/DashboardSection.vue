<template>
  <div style="display: flex; flex-direction: column; gap: 24px">
    <!-- 4 Metrics Stats Overview (Matching Reference Card Layout) -->
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="none" style="border-radius: 20px; background: #ffffff; border: 1px solid #e5e7eb">
          <div style="display: flex; flex-direction: column; gap: 16px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; color: #64748b; font-weight: 600">上游渠道 (已启用)</span>
              <div style="width: 40px; height: 40px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 20px; color: #0f172a"><Connection /></el-icon>
              </div>
            </div>
            <div>
              <div style="font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.1">
                {{ channels.filter((c) => c.status).length }}
                <span style="font-size: 16px; color: #94a3b8; font-weight: 600">/ {{ channels.length }}</span>
              </div>
              <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px">
                <span style="font-size: 12px; font-weight: 700; color: #15803d; background-color: #dcfce7; padding: 2px 8px; border-radius: 10px">
                  ↑ 100% 可用
                </span>
                <span style="font-size: 12px; color: #94a3b8">运行正常</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="none" style="border-radius: 20px; background: #ffffff; border: 1px solid #e5e7eb">
          <div style="display: flex; flex-direction: column; gap: 16px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; color: #64748b; font-weight: 600">模型目录 (已绑定)</span>
              <div style="width: 40px; height: 40px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 20px; color: #0f172a"><Files /></el-icon>
              </div>
            </div>
            <div>
              <div style="font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.1">
                {{ mappings.filter((m) => m.enabled).length }}
                <span style="font-size: 16px; color: #94a3b8; font-weight: 600">/ {{ mappings.length }}</span>
              </div>
              <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px">
                <span style="font-size: 12px; font-weight: 700; color: #c2410c; background-color: #ffedd5; padding: 2px 8px; border-radius: 10px">
                  Active
                </span>
                <span style="font-size: 12px; color: #94a3b8">已注册路由映射</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="none" style="border-radius: 20px; background: #ffffff; border: 1px solid #e5e7eb">
          <div style="display: flex; flex-direction: column; gap: 16px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; color: #64748b; font-weight: 600">配置模板 (图/视)</span>
              <div style="width: 40px; height: 40px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 20px; color: #0f172a"><Setting /></el-icon>
              </div>
            </div>
            <div>
              <div style="font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.1">
                {{ imageConfigs.length }}
                <span style="font-size: 16px; color: #94a3b8; font-weight: 600">/ {{ videoConfigs?.length || 0 }}</span>
              </div>
              <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px">
                <span style="font-size: 12px; font-weight: 700; color: #1d4ed8; background-color: #dbeafe; padding: 2px 8px; border-radius: 10px">
                  Presets
                </span>
                <span style="font-size: 12px; color: #94a3b8">标准渲染预设</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="none" style="border-radius: 20px; background: #ffffff; border: 1px solid #e5e7eb">
          <div style="display: flex; flex-direction: column; gap: 16px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; color: #64748b; font-weight: 600">网关平均延迟</span>
              <div style="width: 40px; height: 40px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 20px; color: #0f172a"><Timer /></el-icon>
              </div>
            </div>
            <div>
              <div style="font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.1">
                {{ averageLatency }}
              </div>
              <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px">
                <span style="font-size: 12px; font-weight: 700; color: #15803d; background-color: #dcfce7; padding: 2px 8px; border-radius: 10px">
                  Fast
                </span>
                <span style="font-size: 12px; color: #94a3b8">实时心跳统计</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Lower Section: Mapping Distribution & Channels Priority -->
    <el-row :gutter="20">
      <!-- Left Panel: Models Distribution -->
      <el-col :span="12">
        <el-card shadow="none" style="border-radius: 20px; background: #ffffff; border: 1px solid #e5e7eb">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a">模型类型占比分布</span>
            </div>
          </template>
          <div style="display: flex; flex-direction: column; gap: 24px; padding: 10px 0">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; font-weight: 600">
                <span style="color: #334155">对话文本模型 (Chat)</span>
                <span style="color: #0f172a; font-weight: 800">{{ getPercentage('chat') }}%</span>
              </div>
              <el-progress
                :percentage="getPercentage('chat')"
                :show-text="false"
                stroke-width="10"
                color="#0f172a"
              />
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; font-weight: 600">
                <span style="color: #334155">AI 绘画图像模型 (Image)</span>
                <span style="color: #0f172a; font-weight: 800">{{ getPercentage('image') }}%</span>
              </div>
              <el-progress
                :percentage="getPercentage('image')"
                :show-text="false"
                stroke-width="10"
                color="#f59e0b"
              />
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; font-weight: 600">
                <span style="color: #334155">音视频生成模型 (Video)</span>
                <span style="color: #0f172a; font-weight: 800">{{ getPercentage('video') }}%</span>
              </div>
              <el-progress
                :percentage="getPercentage('video')"
                :show-text="false"
                stroke-width="10"
                color="#ef4444"
              />
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Right Panel: Channels Health Rank -->
      <el-col :span="12">
        <el-card shadow="none" style="border-radius: 20px; background: #ffffff; border: 1px solid #e5e7eb">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a">上游信道调度表</span>
            </div>
          </template>
          <el-table :data="sortedChannelsForDashboard" style="width: 100%" size="small">
            <el-table-column label="信道名称" prop="name">
              <template #default="{ row }">
                <span style="font-weight: 700; color: #0f172a">{{ row.name }}</span>
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
                  {{ row.status ? "启用" : "禁用" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="延迟" width="90" align="center">
              <template #default="{ row }">
                <span
                  v-if="pingResults[row.id] && pingResults[row.id].success"
                  style="color: #15803d; font-weight: 700"
                >
                  {{ pingResults[row.id].latency }}ms
                </span>
                <span v-else-if="pingResults[row.id]" style="color: #b91c1c">FAIL</span>
                <span v-else style="color: #94a3b8"> - </span>
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
  if (type === "chat") return "info";
  if (type === "image") return "warning";
  return "danger";
}
</script>

<template>
  <el-container
    class="admin-dashboard-layout"
    style="height: 100vh; width: 100vw; background-color: #09090b"
  >
    <!-- Sidebar Navigation -->
    <el-aside
      width="240px"
      style="
        background-color: #141416;
        border-right: 1px solid #27272a;
        display: flex;
        flex-direction: column;
      "
    >
      <div
        class="sidebar-header"
        style="padding: 24px 20px; border-bottom: 1px solid #27272a"
      >
        <span
          class="logo-text"
          style="
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 8px;
          "
        >
          <el-icon style="color: #f97316"><Cpu /></el-icon> Viboard Admin
        </span>
      </div>
      <el-menu
        :default-active="activeTab"
        style="
          border-right: none;
          background: transparent;
          flex: 1;
          padding: 16px 8px;
        "
        text-color="#a1a1aa"
        active-text-color="#f97316"
        @select="(key: string) => (activeTab = key as any)"
      >
        <el-menu-item
          index="dashboard"
          style="border-radius: 8px; margin-bottom: 4px; height: 48px"
        >
          <el-icon><Odometer /></el-icon>
          <span>系统概览</span>
        </el-menu-item>
        <el-menu-item
          index="channels"
          style="border-radius: 8px; margin-bottom: 4px; height: 48px"
        >
          <el-icon><Connection /></el-icon>
          <span>上游渠道管理</span>
        </el-menu-item>
        <el-menu-item
          index="models"
          style="border-radius: 8px; margin-bottom: 4px; height: 48px"
        >
          <el-icon><Files /></el-icon>
          <span>模型目录</span>
        </el-menu-item>
        <el-menu-item
          index="agent"
          style="border-radius: 8px; margin-bottom: 4px; height: 48px"
        >
          <el-icon><Cpu /></el-icon>
          <span>Agent配置</span>
        </el-menu-item>
        <el-menu-item
          index="diagnostics"
          style="border-radius: 8px; height: 48px"
        >
          <el-icon><ChatLineRound /></el-icon>
          <span>路由与接口测试</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container
      style="display: flex; flex-direction: column; overflow: hidden"
    >
      <!-- Page Header -->
      <el-header
        style="
          height: 72px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #27272a;
          padding: 0 40px;
          background-color: #141416;
          flex-shrink: 0;
        "
      >
        <div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff">
            {{
              activeTab === "dashboard"
                ? "系统概览"
                : activeTab === "channels"
                  ? "上游渠道管理"
                  : activeTab === "models"
                    ? "模型目录"
                    : activeTab === "agent"
                      ? "Agent配置"
                      : "路由与接口测试"
            }}
          </h1>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #a1a1aa">
            {{
              activeTab === "dashboard"
                ? "企业级网关运行指标、信道延迟及配置统计"
                : activeTab === "channels"
                  ? "维护可用的上游渠道、密钥和路由优先级"
                  : activeTab === "models"
                    ? "维护前端显示名、上游渠道、上游模型名及图标的映射表"
                    : activeTab === "agent"
                      ? "配置Agent画布操作的系统提示词（SYSTEM_PROMPT）与调用的核心对话/工具调用模型"
                      : "测试模型映射关系并实时诊断接口延迟与底座返回负载"
            }}
          </p>
        </div>
        <div>
          <el-button
            v-if="activeTab === 'channels'"
            type="primary"
            @click="openChannelModal"
          >
            <el-icon style="margin-right: 4px"><Plus /></el-icon>添加上游渠道
          </el-button>
          <template v-else-if="activeTab === 'models'">
            <el-button
              v-if="modelsSubTab === 'mappings'"
              type="primary"
              @click="openMappingModal"
            >
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增模型
            </el-button>
            <el-button
              v-else-if="modelsSubTab === 'templates'"
              type="primary"
              @click="openTemplateModal"
            >
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增图像模板
            </el-button>
            <el-button
              v-else-if="modelsSubTab === 'videoTemplates'"
              type="primary"
              @click="openVideoTemplateModal"
            >
              <el-icon style="margin-right: 4px"><Plus /></el-icon>新增视频模板
            </el-button>
          </template>
          <el-button
            v-else-if="activeTab === 'dashboard'"
            type="info"
            plain
            @click="refreshAllData"
          >
            <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新数据
          </el-button>
        </div>
      </el-header>

      <!-- Main Contents -->
      <el-main
        style="
          padding: 30px 40px;
          overflow: auto;
          background-color: #09090b;
          display: flex;
          flex-direction: column;
          gap: 20px;
        "
      >
        <DashboardSection
          v-if="activeTab === 'dashboard'"
          :channels="channels"
          :mappings="mappings"
          :imageConfigs="imageConfigs"
          :videoConfigs="videoConfigs"
          :ping-results="pingResults"
        />

        <ChannelsSection
          v-else-if="activeTab === 'channels'"
          ref="channelsRef"
          :channels="channels"
          :loading="loading"
          :ping-results="pingResults"
          @refresh-channels="loadChannels"
          @update-ping-result="handleUpdatePingResult"
        />

        <ModelsSection
          v-else-if="activeTab === 'models'"
          ref="modelsRef"
          v-model:modelsSubTab="modelsSubTab"
          :mappings="mappings"
          :image-configs="imageConfigs"
          :video-configs="videoConfigs"
          :channels="channels"
          :dictionaries="dictionaries"
          :mappings-loading="mappingsLoading"
          @refresh-mappings="loadMappings"
        />

        <AgentSection
          v-else-if="activeTab === 'agent'"
          :mappings="mappings"
          @refresh-mappings="loadMappings"
        />

        <DiagnosticsSection
          v-else-if="activeTab === 'diagnostics'"
          :channels="channels"
          :mappings="mappings"
        />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { Cpu, Odometer, Connection, Files, ChatLineRound, Plus, Refresh } from "@element-plus/icons-vue";
import {
  getChannels,
  getModelConfig,
  type Channel,
  type ModelMapping,
  type ImageConfig,
  type VideoConfig,
} from "./utils/api";

import DashboardSection from "./components/DashboardSection.vue";
import ChannelsSection from "./components/ChannelsSection.vue";
import ModelsSection from "./components/ModelsSection.vue";
import DiagnosticsSection from "./components/DiagnosticsSection.vue";
import AgentSection from "./components/AgentSection.vue";

const activeTab = ref<"dashboard" | "channels" | "models" | "agent" | "diagnostics">("dashboard");
const modelsSubTab = ref<"mappings" | "templates" | "videoTemplates" | "dictionaries">("mappings");

const channels = ref<Channel[]>([]);
const mappings = ref<ModelMapping[]>([]);
const imageConfigs = ref<ImageConfig[]>([]);
const videoConfigs = ref<VideoConfig[]>([]);
const dictionaries = ref<{
  sizes: string[];
  aspectRatios: string[];
  qualities: string[];
  videoSizes: string[];
}>({
  sizes: [],
  aspectRatios: [],
  qualities: [],
  videoSizes: [],
});
const loading = ref(false);
const mappingsLoading = ref(false);

const pingResults = ref<
  Record<string, { success: boolean; latency?: number; error?: string }>
>({});

// Component template references
const channelsRef = ref<InstanceType<typeof ChannelsSection> | null>(null);
const modelsRef = ref<InstanceType<typeof ModelsSection> | null>(null);

function handleUpdatePingResult(payload: { id: string; result: any }) {
  pingResults.value[payload.id] = payload.result;
}

function openChannelModal() {
  channelsRef.value?.openChannelModal();
}

function openMappingModal() {
  modelsRef.value?.openMappingModal();
}

function openTemplateModal() {
  modelsRef.value?.openTemplateModal();
}

function openVideoTemplateModal() {
  modelsRef.value?.openVideoTemplateModal();
}

async function loadChannels() {
  loading.value = true;
  try {
    channels.value = await getChannels();
  } catch (err) {
    console.error(err);
    ElMessage.error("加载渠道列表失败");
  } finally {
    loading.value = false;
  }
}

async function loadMappings() {
  mappingsLoading.value = true;
  try {
    const cfg = await getModelConfig();
    mappings.value = (cfg.mappings || []) as ModelMapping[];
    imageConfigs.value = (cfg.imageConfigs || []) as ImageConfig[];
    videoConfigs.value = (cfg.videoConfigs || []) as VideoConfig[];
    if (cfg.dictionaries) {
      dictionaries.value = {
        sizes: cfg.dictionaries.sizes || [],
        aspectRatios: cfg.dictionaries.aspectRatios || [],
        qualities: cfg.dictionaries.qualities || [],
        videoSizes: cfg.dictionaries.videoSizes || [],
      };
    }
  } catch (err) {
    console.error(err);
    ElMessage.error("加载模型目录失败");
  } finally {
    mappingsLoading.value = false;
  }
}

async function refreshAllData() {
  await loadChannels();
  await loadMappings();
  ElMessage.success("数据已刷新");
}

onMounted(() => {
  void loadChannels();
  void loadMappings();
});
</script>

<style scoped lang="scss">
.admin-dashboard-layout {
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;

  :deep(.el-table) {
    --el-table-bg-color: #141416;
    --el-table-tr-bg-color: #141416;
    --el-table-header-bg-color: #1a1a1e;
    --el-table-border-color: #27272a;
    --el-table-header-text-color: #a1a1aa;
    --el-table-text-color: #e4e4e7;
    background-color: #141416;
    border-radius: 8px;
    overflow: hidden;
  }

  :deep(.el-table__row:hover > td) {
    background-color: #1d1d22 !important;
  }

  :deep(.el-dialog) {
    --el-dialog-bg-color: #141416;
    --el-dialog-title-font-size: 16px;
    --el-dialog-title-text-color: #fff;
    --el-dialog-content-font-size: 14px;
    border: 1px solid #27272a;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  :deep(.el-form-item__label) {
    color: #a1a1aa !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    padding-bottom: 4px !important;
  }

  :deep(.el-input__inner),
  :deep(.el-textarea__inner) {
    font-family: inherit;
  }

  :deep(.el-input-number .el-input__inner) {
    text-align: left;
  }
}
</style>

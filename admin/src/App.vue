<template>
  <el-container
    class="admin-dashboard-layout"
    style="height: 100vh; width: 100vw; background-color: #f1f3f5"
  >
    <!-- Sidebar Navigation -->
    <el-aside
      width="220px"
      style="
        width: 220px !important;
        min-width: 220px !important;
        max-width: 220px !important;
        flex-shrink: 0 !important;
        background-color: #f1f3f5;
        display: flex;
        flex-direction: column;
        padding: 20px 14px;
        box-sizing: border-box;
      "
    >
      <!-- Brand Logo Header -->
      <div
        class="sidebar-header"
        style="
          margin-bottom: 20px;
          padding: 0 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          white-space: nowrap;
          cursor: pointer;
        "
        @click="router.push('/dashboard')"
      >
        <div
          style="
            width: 32px;
            height: 32px;
            border-radius: 10px;
            background-color: #0f172a;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            box-shadow: 0 3px 8px rgba(15, 23, 42, 0.2);
            flex-shrink: 0;
          "
        >
          <el-icon :size="16"><Cpu /></el-icon>
        </div>
        <span
          class="logo-text"
          style="
            font-size: 17px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.3px;
            white-space: nowrap;
          "
        >
          OmniAdmin
        </span>
      </div>

      <!-- Navigation Menu -->
      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; width: 100%">
        <div
          v-for="item in navItems"
          :key="item.key"
          @click="navigateTo(item.key)"
          :style="getItemStyle(item.key)"
          style="
            height: 42px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
            box-sizing: border-box;
            width: 100%;
          "
        >
          <div style="display: flex; align-items: center; gap: 10px; white-space: nowrap">
            <el-icon
              :size="18"
              :style="{
                color: isCurrentRoute(item.key) ? '#0f172a' : '#64748b',
                flexShrink: 0,
              }"
            >
              <component :is="item.icon" />
            </el-icon>
            <span
              :style="{
                fontSize: '13.5px',
                fontWeight: isCurrentRoute(item.key) ? '700' : '500',
                color: isCurrentRoute(item.key) ? '#0f172a' : '#475569',
                whiteSpace: 'nowrap',
              }"
            >
              {{ item.label }}
            </span>
          </div>
          <span
            v-if="item.badge"
            :style="{
              fontSize: '11px',
              fontWeight: '700',
              padding: '2px 7px',
              borderRadius: '8px',
              backgroundColor: item.badgeBg || '#ffedd5',
              color: item.badgeColor || '#c2410c',
              whiteSpace: 'nowrap',
            }"
          >
            {{ item.badge }}
          </span>
        </div>
      </div>
    </el-aside>

    <!-- Content Workspace -->
    <el-container
      style="display: flex; flex-direction: column; overflow: hidden"
    >
      <!-- Page Header -->
      <el-header
        style="
          height: 80px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 40px;
          background-color: #f1f3f5;
          flex-shrink: 0;
        "
      >
        <div>
          <h1
            style="
              margin: 0;
              font-size: 26px;
              font-weight: 800;
              color: #0f172a;
              letter-spacing: -0.5px;
            "
          >
            {{ route.meta.title || "系统概览" }}
          </h1>
          <p
            style="
              margin: 4px 0 0 0;
              font-size: 13px;
              color: #64748b;
              font-weight: 500;
            "
          >
            {{ route.meta.description || "企业级网关运行指标、信道延迟及配置统计" }}
          </p>
        </div>

        <div>
          <el-button
            v-if="currentKey === 'channels'"
            type="primary"
            @click="openChannelModal"
          >
            <el-icon style="margin-right: 4px"><Plus /></el-icon>添加上游渠道
          </el-button>
          <el-button
            v-else-if="currentKey === 'users'"
            type="primary"
            @click="openUserModal"
          >
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新增用户
          </el-button>
          <template v-else-if="currentKey === 'models'">
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
            v-else-if="currentKey === 'dashboard'"
            type="info"
            plain
            style="
              background-color: #ffffff;
              border: 1px solid #e2e8f0;
              color: #0f172a;
              border-radius: 12px;
            "
            @click="refreshAllData"
          >
            <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新数据
          </el-button>
        </div>
      </el-header>

      <!-- Main Contents -->
      <el-main
        style="
          padding: 10px 40px 30px 40px;
          overflow: auto;
          background-color: #f1f3f5;
          display: flex;
          flex-direction: column;
          gap: 20px;
        "
      >
        <router-view v-slot="{ Component }">
          <component
            :is="Component"
            ref="activeComponentRef"
            v-model:modelsSubTab="modelsSubTab"
            :channels="channels"
            :mappings="mappings"
            :image-configs="imageConfigs"
            :video-configs="videoConfigs"
            :ping-results="pingResults"
            :loading="loading"
            :mappings-loading="mappingsLoading"
            :dictionaries="dictionaries"
            @refresh-channels="loadChannels"
            @refresh-mappings="loadMappings"
            @update-ping-result="handleUpdatePingResult"
          />
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  Cpu,
  Odometer,
  Connection,
  Files,
  ChatLineRound,
  Plus,
  Refresh,
  User,
  DataAnalysis,
} from "@element-plus/icons-vue";
import {
  getChannels,
  getModelConfig,
  type Channel,
  type ModelMapping,
  type ImageConfig,
  type VideoConfig,
} from "./utils/api";

const route = useRoute();
const router = useRouter();

const currentKey = computed(() => (route.meta?.key as string) || "dashboard");

const modelsSubTab = computed<"mappings" | "templates" | "videoTemplates" | "dictionaries">({
  get() {
    return (route.query.tab as any) || "mappings";
  },
  set(val) {
    router.replace({ query: { ...route.query, tab: val } });
  },
});

const navItems = [
  { key: "dashboard", label: "系统概览", icon: Odometer },
  { key: "channels", label: "上游渠道", icon: Connection },
  { key: "models", label: "模型目录", icon: Files },
  { key: "users", label: "用户管理", icon: User },
  { key: "tokens", label: "Token 统计", icon: DataAnalysis, badge: "Live", badgeBg: "#dcfce7", badgeColor: "#15803d" },
  { key: "agent", label: "Agent 配置", icon: Cpu },
  { key: "diagnostics", label: "接口测试", icon: ChatLineRound },
];

function isCurrentRoute(key: string): boolean {
  return currentKey.value === key || route.path.startsWith(`/${key}`);
}

function navigateTo(key: string) {
  router.push(`/${key}`);
}

function getItemStyle(key: string) {
  if (isCurrentRoute(key)) {
    return {
      backgroundColor: "#ffffff",
      borderRadius: "14px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    };
  }
  return {
    backgroundColor: "transparent",
    borderRadius: "14px",
  };
}

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

// Component template reference for current active route
const activeComponentRef = ref<any>(null);

function openUserModal() {
  activeComponentRef.value?.openCreateModal?.();
}

function handleUpdatePingResult(payload: { id: string; result: any }) {
  pingResults.value[payload.id] = payload.result;
}

function openChannelModal() {
  activeComponentRef.value?.openModal?.();
}

function openMappingModal() {
  activeComponentRef.value?.openMappingModal?.();
}

function openTemplateModal() {
  activeComponentRef.value?.openTemplateModal?.();
}

function openVideoTemplateModal() {
  activeComponentRef.value?.openVideoTemplateModal?.();
}

async function loadChannels() {
  loading.value = true;
  try {
    channels.value = await getChannels();
  } catch (e) {
    ElMessage.error("获取上游渠道列表失败");
  } finally {
    loading.value = false;
  }
}

async function loadMappings() {
  mappingsLoading.value = true;
  try {
    const data = await getModelConfig();
    mappings.value = data.mappings || [];
    imageConfigs.value = data.imageConfigs || [];
    videoConfigs.value = data.videoConfigs || [];
    if (data.dictionaries) {
      dictionaries.value = {
        sizes: data.dictionaries.sizes || [],
        aspectRatios: data.dictionaries.aspectRatios || [],
        qualities: data.dictionaries.qualities || [],
        videoSizes: data.dictionaries.videoSizes || [],
      };
    }
  } catch (e) {
    ElMessage.error("获取模型配置失败");
  } finally {
    mappingsLoading.value = false;
  }
}

async function refreshAllData() {
  await Promise.all([loadChannels(), loadMappings()]);
  ElMessage.success("数据已刷新");
}

onMounted(() => {
  loadChannels();
  loadMappings();
});
</script>

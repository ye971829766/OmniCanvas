<template>
  <div style="display: flex; flex-direction: column; gap: 20px">
    <!-- Top Stat Cards -->
    <el-row :gutter="16">
      <!-- Total Tokens Card -->
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="none">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; font-weight: 600; color: #64748b">全站总 Token 消耗</span>
              <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 16px; color: #0f172a"><DataAnalysis /></el-icon>
              </div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px">
              {{ formatNumber(stats?.total?.totalTokens || 0) }}
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background-color: #dcfce7; color: #15803d">
                ↑ 实时汇总
              </span>
              <span style="font-size: 12px; color: #94a3b8">
                所有模型总计
              </span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Prompt Tokens Card -->
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="none">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; font-weight: 600; color: #64748b">输入 Token (Prompt)</span>
              <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 16px; color: #2563eb"><BottomLeft /></el-icon>
              </div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px">
              {{ formatNumber(stats?.total?.promptTokens || 0) }}
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background-color: #dbeafe; color: #1d4ed8">
                {{ promptPercent }}%
              </span>
              <span style="font-size: 12px; color: #94a3b8">
                占全站总消耗
              </span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Completion Tokens Card -->
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="none">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; font-weight: 600; color: #64748b">输出 Token (Completion)</span>
              <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 16px; color: #d97706"><TopRight /></el-icon>
              </div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px">
              {{ formatNumber(stats?.total?.completionTokens || 0) }}
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background-color: #fef3c7; color: #b45309">
                {{ completionPercent }}%
              </span>
              <span style="font-size: 12px; color: #94a3b8">
                占全站总消耗
              </span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Requests Count Card -->
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="none">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-size: 13px; font-weight: 600; color: #64748b">累计 API 请求次数</span>
              <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center">
                <el-icon style="font-size: 16px; color: #059669"><Connection /></el-icon>
              </div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px">
              {{ formatNumber(stats?.total?.totalRequests || 0) }} 次
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background-color: #f1f5f9; color: #475569">
                {{ stats?.total?.activeUsersCount || 0 }} 活跃用户
              </span>
              <span style="font-size: 12px; color: #94a3b8">
                平均 {{ avgTokensPerRequest }} T/次
              </span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- User Token Breakdown Table Card -->
    <el-card shadow="none">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
          <div>
            <div style="font-size: 16px; font-weight: 700; color: #0f172a">对应用户 Token 消耗明细</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px">按用户统计的输入/输出 Token 消耗量及占全站比例排行</div>
          </div>
          <div style="display: flex; gap: 12px; align-items: center">
            <el-input
              v-model="userSearchQuery"
              placeholder="搜索用户名 / 昵称..."
              style="width: 240px"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary" plain @click="fetchStats" :loading="loading">
              <el-icon style="margin-right: 4px"><Refresh /></el-icon>
              刷新数据
            </el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="filteredUsers" style="width: 100%">
        <!-- Rank Column -->
        <el-table-column label="排名" width="70" align="center">
          <template #default="{ $index }">
            <span
              v-if="$index === 0"
              style="display: inline-block; width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background-color: #fef08a; color: #854d0e; font-weight: 800; font-size: 12px"
            >
              1
            </span>
            <span
              v-else-if="$index === 1"
              style="display: inline-block; width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background-color: #e2e8f0; color: #475569; font-weight: 800; font-size: 12px"
            >
              2
            </span>
            <span
              v-else-if="$index === 2"
              style="display: inline-block; width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background-color: #ffedd5; color: #9a3412; font-weight: 800; font-size: 12px"
            >
              3
            </span>
            <span v-else style="font-size: 13px; font-weight: 600; color: #94a3b8">
              {{ $index + 1 }}
            </span>
          </template>
        </el-table-column>

        <!-- User Profile Column -->
        <el-table-column label="用户信息" min-width="180">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 10px">
              <el-avatar
                :size="32"
                :src="row.avatarUrl"
                style="background-color: #0f172a; color: #fff; font-weight: 700; flex-shrink: 0"
              >
                {{ row.nickname ? row.nickname.charAt(0).toUpperCase() : row.username.charAt(0).toUpperCase() }}
              </el-avatar>
              <div style="display: flex; flex-direction: column">
                <span style="font-size: 14px; font-weight: 700; color: #0f172a">
                  {{ row.nickname || row.username }}
                </span>
                <span style="font-size: 12px; color: #64748b">
                  @{{ row.username }}
                </span>
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- Total Tokens Column -->
        <el-table-column label="总 Token 消耗" prop="totalTokens" min-width="180" sortable>
          <template #default="{ row }">
            <div style="display: flex; flex-direction: column; gap: 4px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <span style="font-size: 14px; font-weight: 800; color: #0f172a">
                  {{ formatNumber(row.totalTokens) }}
                </span>
                <span style="font-size: 11px; font-weight: 700; color: #64748b">
                  {{ getUserShare(row.totalTokens) }}%
                </span>
              </div>
              <!-- Mini Progress Bar -->
              <el-progress
                :percentage="getUserShareNumber(row.totalTokens)"
                :show-text="false"
                :stroke-width="6"
                color="#0f172a"
              />
            </div>
          </template>
        </el-table-column>

        <!-- Prompt Tokens Column -->
        <el-table-column label="输入 Token (Prompt)" prop="promptTokens" min-width="140" sortable align="right">
          <template #default="{ row }">
            <span style="font-size: 13.5px; font-weight: 600; color: #2563eb; font-family: monospace">
              {{ formatNumber(row.promptTokens) }}
            </span>
          </template>
        </el-table-column>

        <!-- Completion Tokens Column -->
        <el-table-column label="输出 Token (Completion)" prop="completionTokens" min-width="150" sortable align="right">
          <template #default="{ row }">
            <span style="font-size: 13.5px; font-weight: 600; color: #d97706; font-family: monospace">
              {{ formatNumber(row.completionTokens) }}
            </span>
          </template>
        </el-table-column>

        <!-- Request Count Column -->
        <el-table-column label="请求次数" prop="requestCount" width="110" sortable align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small" style="font-weight: 600">
              {{ row.requestCount }} 次
            </el-tag>
          </template>
        </el-table-column>

        <!-- Avg Tokens per Request -->
        <el-table-column label="单次平均消耗" width="130" align="right">
          <template #default="{ row }">
            <span style="font-size: 12.5px; color: #475569; font-family: monospace">
              {{ row.requestCount > 0 ? formatNumber(Math.round(row.totalTokens / row.requestCount)) : 0 }} T
            </span>
          </template>
        </el-table-column>

        <!-- Last Active Time Column -->
        <el-table-column label="最近调用时间" prop="lastUsedAt" min-width="160" align="center">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #64748b">
              {{ formatDate(row.lastUsedAt) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import {
  DataAnalysis,
  BottomLeft,
  TopRight,
  Connection,
  Search,
  Refresh,
} from "@element-plus/icons-vue";
import { getTokenStats, type SystemTokenStats, type UserTokenStat } from "../utils/api";

const loading = ref(false);
const userSearchQuery = ref("");
const stats = ref<SystemTokenStats | null>(null);

async function fetchStats() {
  loading.value = true;
  try {
    stats.value = await getTokenStats();
  } catch (err: any) {
    ElMessage.error("获取 Token 统计失败: " + (err.message || err));
  } finally {
    loading.value = false;
  }
}

const promptPercent = computed(() => {
  const total = stats.value?.total?.totalTokens || 0;
  if (!total) return "0.0";
  return (((stats.value?.total?.promptTokens || 0) / total) * 100).toFixed(1);
});

const completionPercent = computed(() => {
  const total = stats.value?.total?.totalTokens || 0;
  if (!total) return "0.0";
  return (((stats.value?.total?.completionTokens || 0) / total) * 100).toFixed(1);
});

const avgTokensPerRequest = computed(() => {
  const total = stats.value?.total?.totalTokens || 0;
  const reqs = stats.value?.total?.totalRequests || 0;
  if (!reqs) return "0";
  return formatNumber(Math.round(total / reqs));
});

const filteredUsers = computed(() => {
  const users = stats.value?.users || [];
  if (!userSearchQuery.value.trim()) return users;
  const q = userSearchQuery.value.trim().toLowerCase();
  return users.filter(
    (u) =>
      u.username.toLowerCase().includes(q) ||
      (u.nickname && u.nickname.toLowerCase().includes(q)),
  );
});

function getUserShare(userTokens: number): string {
  const total = stats.value?.total?.totalTokens || 0;
  if (!total) return "0.0";
  return ((userTokens / total) * 100).toFixed(1);
}

function getUserShareNumber(userTokens: number): number {
  const total = stats.value?.total?.totalTokens || 0;
  if (!total) return 0;
  return Math.min(100, Math.round((userTokens / total) * 100));
}

function formatNumber(num: number): string {
  return (num || 0).toLocaleString();
}

function formatDate(isoString?: string): string {
  if (!isoString) return "暂无调用记录";
  try {
    const date = new Date(isoString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

onMounted(() => {
  fetchStats();
});
</script>

<style scoped>
/* Scoped custom styling if needed */
</style>

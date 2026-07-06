<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <el-card shadow="none" style="border-radius: 20px; background-color: #ffffff; border: 1px solid #e5e7eb">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
          <!-- Filter Controls -->
          <div style="display: flex; gap: 12px; align-items: center">
            <el-input
              v-model="searchQuery"
              placeholder="搜索渠道名称..."
              style="width: 250px"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-select
              v-model="filterType"
              placeholder="选择类型"
              style="width: 140px"
              clearable
            >
              <el-option label="全部模型" value="all" />
              <el-option label="文本模型" value="chat" />
              <el-option label="图像模型" value="image" />
              <el-option label="视频模型" value="video" />
            </el-select>
            <el-select
              v-model="filterStatus"
              placeholder="选择状态"
              style="width: 140px"
              clearable
            >
              <el-option label="已启用" value="active" />
              <el-option label="已禁用" value="inactive" />
            </el-select>
          </div>

          <el-button type="primary" @click="openChannelModal()">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>添加上游渠道
          </el-button>
        </div>
      </template>

      <!-- Channels Table -->
      <el-table
        v-loading="loading"
        :data="filteredChannels"
        style="width: 100%"
      >
        <el-table-column label="渠道名称" min-width="160">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 12px">
              <span class="channel-avatar">{{ row.name.charAt(0).toUpperCase() }}</span>
              <span style="font-weight: 700; color: #0f172a">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="getTagType(row.type)">{{ getTypeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="接口地址"
          prop="baseUrl"
          show-overflow-tooltip
          min-width="200"
        />
        <el-table-column label="API Key" min-width="190" align="center">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px">
              <span style="font-family: monospace; font-size: 12px; color: #334155; font-weight: 600">
                {{ showKeyMap[row.id] ? row.apiKey : maskValue(row.apiKey) }}
              </span>
              <el-button
                type="info"
                link
                :icon="showKeyMap[row.id] ? Hide : View"
                @click="showKeyMap[row.id] = !showKeyMap[row.id]"
                style="padding: 0; min-height: auto; height: auto"
              />
              <el-button
                type="info"
                link
                :icon="CopyDocument"
                @click="copyToClipboard(row.apiKey)"
                style="padding: 0; min-height: auto; height: auto"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="权重"
          prop="weight"
          width="80"
          align="center"
          sortable
        />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status"
              @change="toggleStatus(row)"
              :loading="togglingMap[row.id]"
              active-color="#0f172a"
            />
          </template>
        </el-table-column>
        <el-table-column label="近期延迟" width="110" align="center">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px">
              <span
                v-if="pingResults[row.id] && pingResults[row.id].success"
                style="color: #15803d; font-weight: 700; font-size: 12px"
              >
                {{ pingResults[row.id].latency }}ms
              </span>
              <span v-else-if="pingResults[row.id]" style="color: #b91c1c; font-weight: 700; font-size: 12px">FAIL</span>
              <span v-else style="color: #94a3b8"> - </span>
              <el-button
                type="primary"
                link
                :icon="Refresh"
                :loading="testingMap[row.id]"
                @click="testConnection(row.id)"
                style="padding: 0; min-height: auto; height: auto"
                title="测试延迟"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="支持模型" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 80px; overflow-y: auto; padding-right: 4px">
              <el-tag
                v-for="model in row.models.slice(0, 10)"
                :key="model"
                size="small"
                type="info"
                effect="plain"
              >
                {{ model === "*" ? "全部 (*)" : model }}
              </el-tag>
              <el-tag v-if="row.models.length > 10" size="small" type="info" effect="plain">
                +{{ row.models.length - 10 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="{ row }">
            <div style="display: flex; justify-content: center; gap: 8px">
              <el-button
                size="small"
                type="info"
                plain
                @click="refreshChannelModelsDirect(row)"
                :loading="refreshingModelsMap[row.id]"
              >
                同步模型
              </el-button>
              <el-button
                size="small"
                type="primary"
                plain
                @click="openChannelModal(row)"
              >
                编辑
              </el-button>
              <el-popconfirm title="确定删除该渠道吗？" @confirm="confirmDeleteChannel(row)">
                <template #reference>
                  <el-button size="small" type="danger" plain>删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Channel Form Dialog Modal -->
      <el-dialog
        v-model="channelModalOpen"
        :title="editingChannelId ? '编辑上游渠道' : '新增上游渠道'"
        width="540px"
        destroy-on-close
      >
        <el-form :model="channelForm" label-position="top">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="渠道名称" required>
                <el-input v-model="channelForm.name" placeholder="如 官方OpenAI, 微软Azure" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="渠道类型">
                <el-select v-model="channelForm.type" style="width: 100%">
                  <el-option label="全部模型 (all)" value="all" />
                  <el-option label="对话模型 (chat)" value="chat" />
                  <el-option label="图像模型 (image)" value="image" />
                  <el-option label="视频模型 (video)" value="video" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="16">
              <el-form-item label="接口 Base URL (地址)" required>
                <el-input v-model="channelForm.baseUrl" placeholder="如 https://api.openai.com/v1" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="渠道权重 (负载优先级)">
                <el-input-number
                  v-model="channelForm.weight"
                  :min="1"
                  :max="1000"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="API Key (密钥)">
                <el-input
                  v-model="channelForm.apiKey"
                  type="password"
                  show-password
                  placeholder="输入上游接口对接密钥（留空则不修改原密码）"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="支持上游模型列表 (以逗号分隔)">
            <div style="display: flex; gap: 8px; width: 100%">
              <el-input
                v-model="channelForm.modelsRaw"
                placeholder="*, gpt-4o, veo_3_1_fast_vip"
                style="flex: 1"
              />
              <el-button
                type="info"
                plain
                :loading="discoveringModels"
                @click="discoverModels"
              >
                自动发现模型
              </el-button>
            </div>
          </el-form-item>
        </el-form>

        <template #footer>
          <div style="display: flex; justify-content: flex-end; gap: 12px">
            <el-button @click="channelModalOpen = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveChannel">保存</el-button>
          </div>
        </template>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import {
  Search,
  Plus,
  Refresh,
  View,
  Hide,
  CopyDocument,
} from "@element-plus/icons-vue";
import {
  createChannel,
  updateChannel,
  deleteChannel,
  pingChannel,
  discoverChannelModels,
  type Channel,
} from "../utils/api";

const props = defineProps<{
  channels: Channel[];
  loading: boolean;
  pingResults: Record<
    string,
    { success: boolean; latency?: number; error?: string }
  >;
}>();

const emit = defineEmits<{
  (e: "refresh-channels"): void;
  (
    e: "update-ping-result",
    payload: { id: string; result: { success: boolean; latency?: number; error?: string } },
  ): void;
}>();

const searchQuery = ref("");
const filterType = ref("");
const filterStatus = ref("");
const showKeyMap = ref<Record<string, boolean>>({});
const testingMap = ref<Record<string, boolean>>({});
const togglingMap = ref<Record<string, boolean>>({});
const refreshingModelsMap = ref<Record<string, boolean>>({});

const channelModalOpen = ref(false);
const editingChannelId = ref<string | null>(null);
const discoveringModels = ref(false);
const saving = ref(false);

const channelForm = ref({
  name: "",
  type: "all" as "all" | "chat" | "image" | "video",
  baseUrl: "",
  apiKey: "",
  weight: 10,
  modelsRaw: "*",
});

const filteredChannels = computed(() => {
  return props.channels.filter((c) => {
    if (searchQuery.value && !c.name.toLowerCase().includes(searchQuery.value.toLowerCase())) {
      return false;
    }
    if (filterType.value && c.type !== filterType.value) {
      return false;
    }
    if (filterStatus.value === "active" && !c.status) return false;
    if (filterStatus.value === "inactive" && c.status) return false;
    return true;
  });
});

function openChannelModal(channel?: Channel) {
  openModal(channel);
}

function openModal(channel?: Channel) {
  if (channel) {
    editingChannelId.value = channel.id;
    channelForm.value = {
      name: channel.name,
      type: channel.type,
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey,
      weight: channel.weight,
      modelsRaw: channel.models ? channel.models.join(", ") : "*",
    };
  } else {
    editingChannelId.value = null;
    channelForm.value = {
      name: "",
      type: "all",
      baseUrl: "",
      apiKey: "",
      weight: 10,
      modelsRaw: "*",
    };
  }
  channelModalOpen.value = true;
}

function maskValue(val: string): string {
  if (!val) return "";
  if (val.length <= 8) return "********";
  return val.slice(0, 4) + "..." + val.slice(-4);
}

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => ElMessage.success("已复制到剪贴板"))
    .catch(() => ElMessage.error("复制失败"));
}

function getTypeText(type: string) {
  return type === "all"
    ? "全部"
    : type === "chat"
      ? "文本"
      : type === "image"
        ? "图像"
        : "视频";
}

function getTagType(type: string) {
  if (type === "all") return "success";
  if (type === "chat") return "info";
  if (type === "image") return "warning";
  return "danger";
}

async function toggleStatus(channel: Channel) {
  togglingMap.value[channel.id] = true;
  try {
    await updateChannel(channel.id, { status: !channel.status });
    ElMessage.success(`信道 [${channel.name}] 状态已更新`);
    emit("refresh-channels");
  } catch (err: any) {
    ElMessage.error("更新失败: " + (err.message || "未知错误"));
  } finally {
    togglingMap.value[channel.id] = false;
  }
}

async function testConnection(id: string) {
  testingMap.value[id] = true;
  try {
    const res = await pingChannel(id);
    emit("update-ping-result", { id, result: res });
    if (res.success) {
      ElMessage.success(`测试成功，延迟 ${res.latency}ms`);
    } else {
      ElMessage.error(`测试失败: ${res.error}`);
    }
  } catch (err: any) {
    emit("update-ping-result", { id, result: { success: false, error: err.message } });
    ElMessage.error("测试异常: " + (err.message || "未知错误"));
  } finally {
    testingMap.value[id] = false;
  }
}

async function refreshChannelModelsDirect(channel: Channel) {
  refreshingModelsMap.value[channel.id] = true;
  try {
    const models = await discoverChannelModels(channel.baseUrl, channel.apiKey);
    if (models.length > 0) {
      await updateChannel(channel.id, { models });
      ElMessage.success(`发现并更新了 ${models.length} 个模型`);
      emit("refresh-channels");
    } else {
      ElMessage.warning("未检测到有效模型");
    }
  } catch (err: any) {
    ElMessage.error("自动同步模型失败: " + (err.message || "未知错误"));
  } finally {
    refreshingModelsMap.value[channel.id] = false;
  }
}

async function discoverModels() {
  if (!channelForm.value.baseUrl || !channelForm.value.apiKey) {
    ElMessage.warning("请填写地址和API Key后再试");
    return;
  }
  discoveringModels.value = true;
  try {
    const models = await discoverChannelModels(
      channelForm.value.baseUrl,
      channelForm.value.apiKey,
    );
    if (models.length > 0) {
      channelForm.value.modelsRaw = models.join(", ");
      ElMessage.success(`成功拉取到 ${models.length} 个上游模型`);
    } else {
      ElMessage.warning("未检测到有效模型");
    }
  } catch (err: any) {
    ElMessage.error("获取模型失败: " + (err.message || "未知错误"));
  } finally {
    discoveringModels.value = false;
  }
}

async function saveChannel() {
  if (!channelForm.value.name || !channelForm.value.baseUrl) {
    ElMessage.warning("请补充完整必填字段");
    return;
  }
  const models = channelForm.value.modelsRaw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  saving.value = true;
  try {
    const payload = {
      name: channelForm.value.name,
      type: channelForm.value.type,
      baseUrl: channelForm.value.baseUrl,
      apiKey: channelForm.value.apiKey,
      weight: channelForm.value.weight,
      models,
    };
    if (editingChannelId.value) {
      await updateChannel(editingChannelId.value, payload);
      ElMessage.success("渠道保存成功");
    } else {
      await createChannel(payload);
      ElMessage.success("渠道添加成功");
    }
    channelModalOpen.value = false;
    emit("refresh-channels");
  } catch (err: any) {
    ElMessage.error("保存失败: " + (err.message || "未知错误"));
  } finally {
    saving.value = false;
  }
}

function confirmDeleteChannel(channel: Channel) {
  handleDelete(channel);
}

async function handleDelete(channel: Channel) {
  try {
    await deleteChannel(channel.id);
    ElMessage.success("已删除该渠道");
    emit("refresh-channels");
  } catch (err: any) {
    ElMessage.error("删除失败: " + (err.message || "未知错误"));
  }
}

defineExpose({
  openModal,
  openChannelModal,
});
</script>

<style scoped>
.channel-avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #ffffff;
  background: #0f172a;
  flex-shrink: 0;
}
</style>

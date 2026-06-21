<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <!-- Filter Controls -->
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
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

    <!-- Channels Table -->
    <el-table
      v-loading="loading"
      :data="filteredChannels"
      style="width: 100%"
      border
    >
      <el-table-column label="渠道名称" min-width="160">
        <template #default="{ row }">
          <div style="display: flex; align-items: center; gap: 12px">
            <span class="channel-avatar">{{ row.name.charAt(0).toUpperCase() }}</span>
            <span style="font-weight: 600; color: #fff">{{ row.name }}</span>
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
            <span style="font-family: monospace; font-size: 12px; color: #e4e4e7">
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
            active-color="#f97316"
          />
        </template>
      </el-table-column>
      <el-table-column label="延迟" width="100" align="center">
        <template #default="{ row }">
          <div v-if="pingResults[row.id]">
            <el-tag v-if="pingResults[row.id].success" type="success" size="small">
              {{ pingResults[row.id].latency }}ms
            </el-tag>
            <el-tooltip v-else :content="pingResults[row.id].error" placement="top">
              <el-tag type="danger" size="small" style="cursor: pointer">错误 ❓</el-tag>
            </el-tooltip>
          </div>
          <span v-else style="color: #71717a; font-size: 12px">未测试</span>
        </template>
      </el-table-column>
      <el-table-column
        label="支持模型"
        min-width="200"
        show-overflow-tooltip
      >
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
      <el-table-column label="操作" width="260" align="center" fixed="right">
        <template #default="{ row }">
          <div style="display: flex; justify-content: center; gap: 8px">
            <el-button
              size="small"
              :type="getPingBtnType(row.id)"
              @click="testConnection(row.id)"
              :loading="testingMap[row.id]"
            >
              测试
            </el-button>
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
      style="border-radius: 12px; background-color: #141416"
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
              @click="discoverModelsForForm"
            >
              拉取上游模型
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="channelForm.notes"
            type="textarea"
            :rows="2"
            placeholder="输入关乎此渠道的备注信息..."
          />
        </el-form-item>
        <el-form-item style="margin-bottom: 0">
          <el-checkbox v-model="channelForm.status">启用此渠道</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <div
          style="
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            border-top: 1px solid #27272a;
            padding-top: 16px;
          "
        >
          <el-button @click="closeChannelModal">取消</el-button>
          <el-button type="primary" @click="saveChannel">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { Search, Hide, View, CopyDocument } from "@element-plus/icons-vue";
import {
  createChannel,
  deleteChannel,
  updateChannel,
  testChannelConnection,
  discoverChannelModels,
  discoverModelsWithCredentials,
  type Channel,
} from "../utils/api";

const props = defineProps<{
  channels: Channel[];
  loading: boolean;
  pingResults: Record<string, { success: boolean; latency?: number; error?: string }>;
}>();

const emit = defineEmits<{
  (e: "refresh-channels"): void;
  (e: "update-ping-result", payload: { id: string; result: any }): void;
}>();

const searchQuery = ref("");
const filterType = ref("");
const filterStatus = ref("");

const testingMap = ref<Record<string, boolean>>({});
const togglingMap = ref<Record<string, boolean>>({});
const refreshingModelsMap = ref<Record<string, boolean>>({});
const showKeyMap = ref<Record<string, boolean>>({});

const channelModalOpen = ref(false);
const editingChannelId = ref<string | null>(null);

const emptyChannelForm = () => ({
  name: "",
  baseUrl: "",
  apiKey: "",
  type: "all" as "image" | "chat" | "video" | "all",
  weight: 10,
  modelsRaw: "*",
  status: true,
  notes: "",
});

const channelForm = ref(emptyChannelForm());
const discoveringModels = ref(false);

const filteredChannels = computed(() => {
  let list = [...props.channels].sort((a, b) => b.weight - a.weight);
  if (searchQuery.value.trim())
    list = list.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
    );
  if (filterType.value) list = list.filter((c) => c.type === filterType.value);
  if (filterStatus.value)
    list = list.filter((c) =>
      filterStatus.value === "active" ? c.status : !c.status,
    );
  return list;
});

function maskValue(key: string): string {
  if (!key) return "未配置";
  if (key.length <= 10) return "••••••••";
  return `${key.substring(0, 6)}••••${key.substring(key.length - 4)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => ElMessage.success("已复制到剪贴板"))
    .catch(() => ElMessage.error("复制失败"));
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

function getPingBtnType(id: string) {
  const testResult = props.pingResults[id];
  if (!testResult) return "info";
  return testResult.success ? "success" : "danger";
}

// Dialog trigger methods
function openChannelModal(channel?: Channel) {
  editingChannelId.value = channel?.id || null;
  channelForm.value = channel
    ? {
        name: channel.name,
        baseUrl: channel.baseUrl,
        apiKey: "",
        type: channel.type,
        weight: channel.weight,
        modelsRaw: channel.models.join(", "),
        status: channel.status,
        notes: channel.notes || "",
      }
    : emptyChannelForm();
  channelModalOpen.value = true;
}

function closeChannelModal() {
  channelModalOpen.value = false;
}

defineExpose({
  openChannelModal,
});

async function saveChannel() {
  if (!channelForm.value.name.trim() || !channelForm.value.baseUrl.trim()) {
    ElMessage.warning("请填写必填项");
    return;
  }
  const payload: any = {
    name: channelForm.value.name.trim(),
    baseUrl: channelForm.value.baseUrl.trim(),
    type: channelForm.value.type,
    weight: channelForm.value.weight,
    status: channelForm.value.status,
    notes: channelForm.value.notes,
    models: channelForm.value.modelsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  if (channelForm.value.apiKey.trim())
    payload.apiKey = channelForm.value.apiKey.trim();
  try {
    if (editingChannelId.value)
      await updateChannel(editingChannelId.value, payload);
    else await createChannel(payload);
    ElMessage.success("渠道已保存");
    channelModalOpen.value = false;
    emit("refresh-channels");
  } catch (err: any) {
    ElMessage.error("保存失败: " + (err.message || "未知错误"));
  }
}

async function discoverModelsForForm() {
  if (!channelForm.value.baseUrl.trim()) {
    ElMessage.warning("请先填写接口地址");
    return;
  }
  discoveringModels.value = true;
  try {
    const res = await discoverModelsWithCredentials(
      channelForm.value.baseUrl.trim(),
      channelForm.value.apiKey.trim(),
    );
    if (res.success && res.models && res.models.length > 0) {
      channelForm.value.modelsRaw = res.models.join(", ");
      ElMessage.success(`成功拉取到 ${res.models.length} 个上游模型！`);
    } else {
      ElMessage.error(
        res.error || "未拉取到可用模型，请确认接口地址与密钥是否正确",
      );
    }
  } catch (err: any) {
    ElMessage.error("拉取失败: " + (err.message || "未知错误"));
  } finally {
    discoveringModels.value = false;
  }
}

async function refreshChannelModelsDirect(channel: Channel) {
  if (refreshingModelsMap.value[channel.id]) return;
  refreshingModelsMap.value[channel.id] = true;
  try {
    const res = await discoverChannelModels(channel.id);
    if (res.success && res.models && res.models.length > 0) {
      const payload = {
        ...channel,
        models: res.models,
      };
      await updateChannel(channel.id, payload);
      ElMessage.success(
        `信道 [${channel.name}] 成功同步 ${res.models.length} 个可用模型！`,
      );
      emit("refresh-channels");
    } else {
      ElMessage.error(res.error || "同步失败：上游未返回可用模型列表");
    }
  } catch (err: any) {
    ElMessage.error("同步失败: " + (err.message || "未知错误"));
  } finally {
    refreshingModelsMap.value[channel.id] = false;
  }
}

async function toggleStatus(channel: Channel) {
  if (togglingMap.value[channel.id]) return;
  togglingMap.value[channel.id] = true;
  try {
    await updateChannel(channel.id, { status: !channel.status });
    channel.status = !channel.status;
    ElMessage.success(channel.status ? "渠道已启用" : "渠道已禁用");
    emit("refresh-channels");
  } catch (err: any) {
    ElMessage.error("切换状态失败：" + (err.message || "未知错误"));
  } finally {
    togglingMap.value[channel.id] = false;
  }
}

async function testConnection(id: string) {
  testingMap.value[id] = true;
  try {
    const result = await testChannelConnection(id);
    emit("update-ping-result", { id, result });
    if (result.success) {
      ElMessage.success(`连接成功 (${result.latency}ms)`);
    } else {
      ElMessage.error(`连接失败: ${result.error || "未知错误"}`);
    }
  } catch (err: any) {
    emit("update-ping-result", { id, result: { success: false, error: err.message } });
    ElMessage.error(`连接出错: ${err.message || "未知错误"}`);
  } finally {
    testingMap.value[id] = false;
  }
}

function confirmDeleteChannel(channel: Channel) {
  deleteChannel(channel.id)
    .then(() => {
      ElMessage.success("渠道已删除");
      emit("refresh-channels");
    })
    .catch((err) => {
      ElMessage.error("删除失败: " + (err.message || "未知错误"));
    });
}
</script>

<style scoped>
.channel-avatar {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #f97316, #ea580c);
  flex-shrink: 0;
}
</style>

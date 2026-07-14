<template>
  <div style="display: flex; flex-direction: column; gap: 20px">
    <el-card
      shadow="none"
      style="
        border-radius: 20px;
        background-color: #ffffff;
        border: 1px solid #e5e7eb;
      "
    >
      <template #header>
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <span
            style="
              font-size: 16px;
              font-weight: 700;
              color: #0f172a;
              display: flex;
              align-items: center;
              gap: 8px;
            "
          >
            <el-icon style="color: #0f172a"><Cpu /></el-icon>
            Agent 核心参数配置
          </span>
          <div style="display: flex; gap: 12px">
            <el-button
              type="primary"
              @click="saveConfig"
              :loading="saving"
              :disabled="loading"
            >
              <el-icon style="margin-right: 4px"><Check /></el-icon>保存配置
            </el-button>
          </div>
        </div>
      </template>

      <div
        v-loading="loading"
        element-loading-background="rgba(20, 20, 22, 0.8)"
      >
        <el-form label-position="top">
          <!-- Model Selection -->
          <el-form-item label="Agent 驱动模型 (chatModel)" required>
            <template #label>
              <span
                style="
                  color: #a1a1aa;
                  font-weight: 600;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                "
              >
                Agent 驱动模型 (chatModel)
                <el-tooltip
                  content="选择已配置的聊天映射模型，或直接输入未映射的上游模型 ID（支持回车创建）"
                  placement="top"
                >
                  <el-icon style="cursor: help"><InfoFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <el-select
              v-model="agentConfig.chatModel"
              filterable
              allow-create
              default-first-option
              placeholder="请选择或输入模型 ID"
              style="width: 100%"
            >
              <el-option
                v-for="mapping in chatModelMappings"
                :key="mapping.id"
                :label="`${mapping.label} (${mapping.id})`"
                :value="mapping.id"
              />
            </el-select>
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #71717a">
              该模型需对应一个处于启用状态的上游聊天渠道（purpose 为
              chat）。如未包含，Agent 在运行时将报错。
            </p>
          </el-form-item>

          <!-- Vision Model Selection -->
          <el-form-item
            label="Agent 视觉自查模型 (visionModel)"
            required
            style="margin-top: 16px"
          >
            <template #label>
              <span
                style="
                  color: #a1a1aa;
                  font-weight: 600;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                "
              >
                Agent 视觉自查模型 (visionModel)
                <el-tooltip
                  content="选择已配置的用于 MCoT 视觉分析的聊天映射模型（需要支持 Multimodal 多模态输入），或直接输入未映射的上游模型 ID"
                  placement="top"
                >
                  <el-icon style="cursor: help"><InfoFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <el-select
              v-model="agentConfig.visionModel"
              filterable
              allow-create
              default-first-option
              placeholder="请选择或输入模型 ID"
              style="width: 100%"
            >
              <el-option
                v-for="mapping in chatModelMappings"
                :key="mapping.id"
                :label="`${mapping.label} (${mapping.id})`"
                :value="mapping.id"
              />
            </el-select>
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #71717a">
              该模型用于设计生成后的截图自查（Multimodal Chain of
              Thought）。请确保所选模型具有多模态视觉能力（如 gpt-4o,
              gemini-3.5-flash）。
            </p>
          </el-form-item>

          <!-- Inpaint / local redraw model -->
          <el-form-item
            label="局部重绘模型 (inpaintModel)"
            style="margin-top: 16px"
          >
            <template #label>
              <span
                style="
                  color: #a1a1aa;
                  font-weight: 600;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                "
              >
                局部重绘模型 (inpaintModel)
                <el-tooltip
                  content="画布橡皮擦「局部重绘」使用的图片模型。请选择支持图生图 + mask 的模型；留空则使用模型目录中第一个启用的图片模型"
                  placement="top"
                >
                  <el-icon style="cursor: help"><InfoFilled /></el-icon>
                </el-tooltip>
              </span>
            </template>
            <el-select
              v-model="agentConfig.inpaintModel"
              filterable
              allow-create
              clearable
              default-first-option
              placeholder="自动（第一个启用的图片模型）"
              style="width: 100%"
            >
              <el-option label="自动（第一个启用的图片模型）" value="" />
              <el-option
                v-for="mapping in imageModelMappings"
                :key="mapping.id"
                :label="`${mapping.label} (${mapping.id})`"
                :value="mapping.id"
              />
            </el-select>
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #71717a">
              对应画布工具栏的局部重绘 / inpaint。需支持参考图与遮罩（mask）。
            </p>
          </el-form-item>

          <!-- Monospace System Prompt -->
        </el-form>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { Cpu, Check, InfoFilled } from "@element-plus/icons-vue";
import {
  getModelConfig,
  updateModelConfig,
  type ModelMapping,
  type ModelConfigState,
} from "../utils/api";

const props = defineProps<{
  mappings: ModelMapping[];
}>();

const emit = defineEmits<{
  "refresh-mappings": [];
}>();

const loading = ref(false);
const saving = ref(false);
const rawState = ref<ModelConfigState | null>(null);

const agentConfig = ref({
  chatModel: "",
  visionModel: "",
  inpaintModel: "",
});

const chatModelMappings = computed(() => {
  return props.mappings.filter((m) => m.enabled && m.purpose === "chat");
});

const imageModelMappings = computed(() => {
  return props.mappings.filter((m) => m.enabled && m.purpose === "image");
});

async function loadConfig() {
  loading.value = true;
  try {
    const config = await getModelConfig();
    rawState.value = config;
    if (config.agentConfig) {
      agentConfig.value = {
        chatModel: config.agentConfig.chatModel || "",
        visionModel: config.agentConfig.visionModel || "",
        inpaintModel: config.agentConfig.inpaintModel ?? "",
      };
    } else {
      agentConfig.value = {
        chatModel: "",
        visionModel: "",
        inpaintModel: "",
      };
    }
  } catch (err) {
    console.error(err);
    ElMessage.error("加载 Agent 配置失败");
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  if (!agentConfig.value.chatModel.trim()) {
    ElMessage.warning("请选择或输入 Agent 核心模型");
    return;
  }
  if (!agentConfig.value.visionModel.trim()) {
    ElMessage.warning("请选择或输入 Agent 视觉自查模型");
    return;
  }

  saving.value = true;
  try {
    const currentState = rawState.value || (await getModelConfig());
    const payload: ModelConfigState = {
      ...currentState,
      agentConfig: {
        chatModel: agentConfig.value.chatModel.trim(),
        visionModel: agentConfig.value.visionModel.trim(),
        inpaintModel: (agentConfig.value.inpaintModel || "").trim(),
      },
    };
    await updateModelConfig(payload);
    ElMessage.success("Agent 配置保存成功");
    emit("refresh-mappings");
    await loadConfig();
  } catch (err) {
    console.error(err);
    ElMessage.error("保存 Agent 配置失败");
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadConfig();
});
</script>

<style scoped>
:deep(.el-textarea__inner) {
  border-radius: 8px;
}
:deep(.el-textarea__inner:focus) {
  border-color: #f97316 !important;
  box-shadow: 0 0 0 1px #f97316 !important;
}
:deep(.el-select .el-input__inner:focus),
:deep(.el-select .el-input.is-focus .el-input__wrapper) {
  border-color: #f97316 !important;
  box-shadow: 0 0 0 1px #f97316 !important;
}
</style>

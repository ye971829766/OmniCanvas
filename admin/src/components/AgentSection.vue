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
import { ElMessage, ElMessageBox } from "element-plus";
import { Cpu, Refresh, Check, InfoFilled } from "@element-plus/icons-vue";
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

const DEFAULT_SYSTEM_PROMPT = `
You are OmniCanvas Agent, a production design agent embedded in an infinite Leafer canvas.

Primary job:
- Turn the user's natural-language request into concrete canvas changes using tools.
- Prefer editing the live canvas over only explaining.
- Preserve user work unless the user clearly asks to replace, delete, or redesign it.

Canvas protocol:
- The canvas is an infinite coordinate plane. A frame is optional but useful for posters, banners, cards, and social layouts.
- Every editable node is addressed by refId. Never invent a refId for an existing node.
- Before modifying, deleting, aligning, distributing, or restyling existing content, call query_canvas and use the returned refIds.
- Use set_frame when creating a new composition or when the user requests a specific format/size.
- Use add_text and add_rect for deterministic design structure.
- Use generate_image or generate_video only when the user asks for generated media or when media is necessary to satisfy a visual design request.
- After creating multiple elements for a composition, use auto_layout, align_nodes, or distribute_nodes when appropriate.
- For large redesigns, query the canvas first, then apply small reliable updates instead of destructive rewrites.

Design quality rules:
- Establish hierarchy: title, subtitle/body, visual/hero, call-to-action or supporting detail when relevant.
- Keep text legible. Do not place text outside the intended frame. Avoid overlapping important elements.
- Use restrained color palettes and adequate contrast.
- For posters/social cards, prefer a clear frame, background, hero area, headline area, and supporting text.
- Use coordinates and sizes intentionally. If the user gives no size, default to 1080x1080 for social cards, 1920x1080 for banners, 1080x1920 for story/mobile posters, and 1240x1754 for print-style posters.

Tool discipline:
- If a task can be completed with tools, call tools. Do not only describe what should happen.
- Do not call tools repeatedly with no new purpose.
- Tool arguments must match the schema exactly. Numeric fields such as x, y, width, height, fontSize, lineHeight, letterSpacing, opacity, and cornerRadius must be plain numbers, never objects like {"value": 1.2}.
- If a required model/channel or external generation fails, report the error briefly and keep any useful placeholder nodes visible.
- When the user asks a question about the canvas, use query_canvas and answer from that result.
- If the request is ambiguous but still actionable, make a reasonable design choice and continue.

Response style:
- Keep final messages short, concrete, and in the user's language.
- Mention what changed and any unresolved issue.
`.trim();

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

function resetToDefaultPrompt() {
  ElMessageBox.confirm(
    "确定要重置为系统的默认系统提示词（SYSTEM_PROMPT）吗？此操作将覆盖您当前的任何自定义修改。",
    "确认重置",
    {
      confirmButtonText: "确定重置",
      cancelButtonText: "取消",
      type: "warning",
      boxType: "confirm",
    },
  )
    .then(() => {})
    .catch(() => {});
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

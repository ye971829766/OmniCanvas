<template>
  <div style="display: flex; flex-direction: column; gap: 20px; height: 100%">
    <el-row
      :gutter="24"
      style="height: 100%; display: flex; align-items: stretch"
    >
      <!-- Left Parameter Configuration Panel -->
      <el-col :span="10">
        <el-card
          style="
            background-color: #141416;
            border: 1px solid #27272a;
            border-radius: 12px;
            height: 100%;
            display: flex;
            flex-direction: column;
          "
        >
          <template #header>
            <span
              style="
                font-size: 14px;
                font-weight: 600;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 6px;
              "
            >
              <el-icon style="color: #f97316"><Setting /></el-icon>
              测试参数配置
            </span>
          </template>
          <el-form label-position="top">
            <el-form-item label="测试模型" required>
              <el-select
                v-model="sandboxModel"
                placeholder="选择需要测试的前端模型"
                style="width: 100%"
              >
                <el-option
                  v-for="mapping in mappings.filter((m) => m.enabled)"
                  :key="mapping.id"
                  :label="`${mapping.label} (${mapping.id})`"
                  :value="mapping.id"
                />
              </el-select>
            </el-form-item>

            <div
              v-if="sandboxModelPurpose"
              style="
                margin-top: 10px;
                border-top: 1px solid #27272a;
                padding-top: 16px;
              "
            >
              <div style="margin-bottom: 12px">
                <el-tag :type="getPurposeTagType(sandboxModelPurpose)">
                  模型类型：{{ getPurposeText(sandboxModelPurpose) }}
                </el-tag>
              </div>

              <!-- Chat options -->
              <div v-if="sandboxModelPurpose === 'chat'">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="温度 (Temperature)">
                      <el-input-number
                        v-model="sandboxTemperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        style="width: 100%"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="最大 Tokens">
                      <el-input-number
                        v-model="sandboxMaxTokens"
                        :min="1"
                        :max="8192"
                        style="width: 100%"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>

              <!-- Image options -->
              <div v-if="sandboxModelPurpose === 'image'">
                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-form-item label="画幅比例">
                      <el-select
                        v-model="sandboxAspectRatio"
                        style="width: 100%"
                      >
                        <el-option label="1:1 方图" value="1:1" />
                        <el-option label="16:9 宽屏" value="16:9" />
                        <el-option label="9:16 竖屏" value="9:16" />
                        <el-option label="4:3" value="4:3" />
                        <el-option label="3:4" value="3:4" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="生成分辨率">
                      <el-select
                        v-model="sandboxSize"
                        style="width: 100%"
                      >
                        <el-option label="1024x1024" value="1024x1024" />
                        <el-option label="1536x1024" value="1536x1024" />
                        <el-option label="2048x2048" value="2048x2048" />
                        <el-option label="Auto" value="auto" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="生成质量">
                      <el-select
                        v-model="sandboxQuality"
                        style="width: 100%"
                      >
                        <el-option label="Standard" value="standard" />
                        <el-option label="HD" value="hd" />
                        <el-option label="Auto" value="auto" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>

              <el-form-item
                :label="
                  sandboxModelPurpose === 'chat'
                    ? '对话输入 (Prompt)'
                    : '生成提示词 (Prompt)'
                "
                required
              >
                <el-input
                  v-model="sandboxPrompt"
                  type="textarea"
                  :rows="4"
                  placeholder="输入提示词..."
                />
              </el-form-item>
            </div>

            <el-button
              type="primary"
              :loading="sandboxTesting"
              style="width: 100%; margin-top: 10px"
              @click="runSandboxTest"
            >
              发送测试请求
            </el-button>
          </el-form>
        </el-card>
      </el-col>

      <!-- Right Results & Diagnostics Terminal Panel -->
      <el-col
        :span="14"
        style="display: flex; flex-direction: column; gap: 16px"
      >
        <!-- Response Preview -->
        <el-card
          style="
            background-color: #141416;
            border: 1px solid #27272a;
            border-radius: 12px;
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          "
        >
          <template #header>
            <span style="font-size: 14px; font-weight: 600; color: #fff"
              >渲染预览</span
            >
          </template>
          <div
            style="
              flex: 1;
              overflow: auto;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              min-height: 250px;
              padding: 10px;
            "
          >
            <div
              v-if="
                sandboxTesting &&
                !sandboxImageUrl &&
                !sandboxVideoUrl &&
                !sandboxChatResponse
              "
              style="text-align: center; color: #a1a1aa"
            >
              <el-icon
                class="is-loading"
                style="
                  font-size: 32px;
                  color: #f97316;
                  margin-bottom: 12px;
                "
                ><Refresh
              /></el-icon>
              <div>{{ sandboxProgressText }}</div>
            </div>
            <div
              v-else-if="!sandboxResultType"
              style="color: #71717a; font-size: 14px"
            >
              等待配置参数并提交测试
            </div>

            <!-- Render chat result -->
            <div
              v-else-if="
                sandboxResultType === 'chat' && sandboxChatResponse
              "
              style="width: 100%"
              class="sandbox-chat-container"
            >
              <div class="chat-bubble user">
                {{ sandboxPrompt }}
              </div>
              <div class="chat-bubble assistant">
                {{ sandboxChatResponse }}
              </div>
            </div>

            <!-- Render image result -->
            <div
              v-else-if="sandboxResultType === 'image' && sandboxImageUrl"
              style="text-align: center"
            >
              <el-image
                :src="sandboxImageUrl"
                :preview-src-list="[sandboxImageUrl]"
                style="
                  max-width: 100%;
                  max-height: 350px;
                  border-radius: 8px;
                  border: 1px solid #27272a;
                "
                fit="contain"
              />
            </div>

            <!-- Render video result -->
            <div
              v-else-if="sandboxResultType === 'video' && sandboxVideoUrl"
              style="width: 100%; text-align: center"
            >
              <video
                :src="sandboxVideoUrl"
                controls
                autoplay
                style="
                  max-width: 100%;
                  max-height: 350px;
                  border-radius: 8px;
                  border: 1px solid #27272a;
                  background-color: #000;
                "
              />
            </div>
          </div>
        </el-card>

        <!-- Diagnostic Stats Info -->
        <el-card
          v-if="sandboxRoutingInfo"
          style="
            background-color: #141416;
            border: 1px solid #27272a;
            border-radius: 12px;
          "
        >
          <div
            style="
              display: flex;
              justify-content: space-around;
              text-align: center;
              padding: 5px 0;
            "
          >
            <div>
              <div
                style="
                  font-size: 12px;
                  color: #a1a1aa;
                  margin-bottom: 4px;
                "
              >
                路由信道
              </div>
              <el-tag size="small" type="success">{{
                sandboxRoutingInfo.channelName
              }}</el-tag>
            </div>
            <div>
              <div
                style="
                  font-size: 12px;
                  color: #a1a1aa;
                  margin-bottom: 4px;
                "
              >
                底座模型 (Upstream ID)
              </div>
              <el-tag size="small" type="info">{{
                sandboxRoutingInfo.upstreamModel
              }}</el-tag>
            </div>
            <div>
              <div
                style="
                  font-size: 12px;
                  color: #a1a1aa;
                  margin-bottom: 4px;
                "
              >
                响应总延迟
              </div>
              <span
                style="color: #f97316; font-weight: bold; font-size: 15px"
                >{{ sandboxRoutingInfo.latency }} ms</span
              >
            </div>
          </div>
        </el-card>

        <!-- JSON output log terminal -->
        <el-card
          style="
            background-color: #141416;
            border: 1px solid #27272a;
            border-radius: 12px;
          "
        >
          <template #header>
            <span style="font-size: 13px; font-weight: 600; color: #fff"
              >接口原始 JSON 响应</span
            >
          </template>
          <div class="diagnostic-terminal">
            <span v-if="sandboxRawJson">{{
              JSON.stringify(sandboxRawJson, null, 2)
            }}</span>
            <span v-else style="color: #71717a"
              >（等待请求发送以捕获响应包）</span
            >
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { Setting, Refresh } from "@element-plus/icons-vue";
import {
  testChat,
  testGenerateImage,
  testGenerateVideo,
  pollTaskStatus,
  type Channel,
  type ModelType,
} from "../utils/api";

interface ModelMapping {
  id: string;
  label: string;
  purpose: ModelType;
  channelId: string;
  upstreamModel: string;
  enabled: boolean;
  notes?: string;
  brandInitial?: string;
  brandColor?: string;
  iconUrl?: string;
  sizes?: string[];
  qualities?: string[];
  aspectRatios?: string[];
  maxReferenceImages?: number;
  defaultSize?: string;
  defaultQuality?: string;
  qualityMode?: string;
  imageConfigId?: string;
}

const props = defineProps<{
  channels: Channel[];
  mappings: ModelMapping[];
}>();

// Diagnostic state definitions
const sandboxModel = ref("");
const sandboxPrompt = ref("画一只可爱的橙色猫咪，皮克斯3D风格");
const sandboxTemperature = ref(0.7);
const sandboxMaxTokens = ref(1024);
const sandboxSize = ref("1024x1024");
const sandboxQuality = ref("standard");
const sandboxAspectRatio = ref("1:1");

const sandboxTesting = ref(false);
const sandboxResultType = ref<"chat" | "image" | "video" | null>(null);
const sandboxChatResponse = ref("");
const sandboxImageUrl = ref("");
const sandboxVideoUrl = ref("");
const sandboxRoutingInfo = ref<{
  channelName: string;
  upstreamModel: string;
  latency: number;
} | null>(null);
const sandboxRawJson = ref<any>(null);
const sandboxProgressText = ref("");

const sandboxModelPurpose = computed(() => {
  if (!sandboxModel.value) return null;
  return (
    props.mappings.find((m) => m.id === sandboxModel.value)?.purpose || null
  );
});

function getPurposeText(type: ModelType) {
  return type === "chat" ? "对话" : type === "image" ? "图片" : type === "video" ? "视频" : "未知";
}

function getPurposeTagType(purpose: string) {
  if (purpose === "chat") return "primary";
  if (purpose === "image") return "warning";
  return "danger";
}

async function runSandboxTest() {
  if (!sandboxModel.value) {
    ElMessage.warning("请选择一个模型进行测试");
    return;
  }

  const mapping = props.mappings.find((m) => m.id === sandboxModel.value);
  const purpose = mapping ? mapping.purpose : "chat";

  sandboxTesting.value = true;
  sandboxResultType.value = purpose;
  sandboxChatResponse.value = "";
  sandboxImageUrl.value = "";
  sandboxVideoUrl.value = "";
  sandboxRoutingInfo.value = null;
  sandboxRawJson.value = null;
  sandboxProgressText.value = "正在寻路路由并发送请求...";

  const startTime = Date.now();

  let expectedChannelName = "默认环境变量";
  let expectedUpstreamModel = sandboxModel.value;
  if (mapping) {
    const ch = props.channels.find((c) => c.id === mapping.channelId);
    if (ch) expectedChannelName = ch.name;
    expectedUpstreamModel = mapping.upstreamModel;
  } else {
    const activeChs = props.channels.filter(
      (c) =>
        c.status &&
        (c.type === "all" || c.type === purpose) &&
        (c.models.includes("*") || c.models.includes(sandboxModel.value)),
    );
    if (activeChs[0]) expectedChannelName = activeChs[0].name;
  }

  try {
    if (purpose === "chat") {
      const payload = {
        model: sandboxModel.value,
        messages: [{ role: "user", content: sandboxPrompt.value }],
        temperature: sandboxTemperature.value,
        maxTokens: sandboxMaxTokens.value,
      };
      const res = await testChat(payload);
      const latency = Date.now() - startTime;

      sandboxChatResponse.value = res.message?.content || "（未返回文本内容）";
      sandboxRawJson.value = res;
      sandboxRoutingInfo.value = {
        channelName: expectedChannelName,
        upstreamModel: expectedUpstreamModel,
        latency,
      };
    } else if (purpose === "image") {
      const payload = {
        model: sandboxModel.value,
        prompt: sandboxPrompt.value,
        size: sandboxSize.value,
        quality: sandboxQuality.value,
        aspectRatio: sandboxAspectRatio.value,
      };
      const initRes = await testGenerateImage(payload);
      sandboxRawJson.value = initRes;

      if (initRes.taskId) {
        sandboxProgressText.value = "图像生成任务已提交，后台排队处理中...";
        await pollGenerationTask(
          initRes.taskId,
          "image",
          startTime,
          expectedChannelName,
          expectedUpstreamModel,
        );
      } else {
        throw new Error("未返回任务 ID");
      }
    } else if (purpose === "video") {
      const payload = {
        model: sandboxModel.value,
        prompt: sandboxPrompt.value,
      };
      const initRes = await testGenerateVideo(payload);
      sandboxRawJson.value = initRes;

      if (initRes.taskId) {
        sandboxProgressText.value = "视频生成任务已提交，后台渲染中...";
        await pollGenerationTask(
          initRes.taskId,
          "video",
          startTime,
          expectedChannelName,
          expectedUpstreamModel,
        );
      } else {
        throw new Error("未返回任务 ID");
      }
    }
  } catch (err: any) {
    console.error(err);
    ElMessage.error(
      "测试请求失败: " +
        (err.response?.data?.error || err.message || "未知错误"),
    );
    sandboxRawJson.value = err.response?.data || { error: err.message };
    sandboxTesting.value = false;
  }
}

async function pollGenerationTask(
  taskId: string,
  type: "image" | "video",
  startTime: number,
  channelName: string,
  upstreamModel: string,
) {
  let attempts = 0;
  const maxAttempts = 60;

  const timer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(timer);
      ElMessage.error("测试任务超时");
      sandboxTesting.value = false;
      return;
    }

    try {
      const res = await pollTaskStatus(taskId);
      sandboxRawJson.value = res;

      if (res.status === "success") {
        clearInterval(timer);
        const latency = Date.now() - startTime;
        if (type === "image") {
          sandboxImageUrl.value = res.imageUrl || "";
        } else {
          sandboxVideoUrl.value = res.videoUrl || "";
        }
        sandboxRoutingInfo.value = {
          channelName,
          upstreamModel,
          latency,
        };
        sandboxTesting.value = false;
        ElMessage.success("生成测试成功！");
      } else if (res.status === "error") {
        clearInterval(timer);
        sandboxTesting.value = false;
        ElMessage.error("生成测试失败: " + (res.error || "未知错误"));
      } else {
        sandboxProgressText.value = `生成任务处理中（已耗时 ${Math.round((Date.now() - startTime) / 1000)} 秒）...`;
      }
    } catch (err: any) {
      console.warn("Polling task status failed: ", err);
    }
  }, 2000);
}
</script>

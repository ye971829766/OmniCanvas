<template>
  <main class="canvas-container">
    <CanvasLoader :loading="canvasLoading" />
    <CanvasBackground ref="canvasBgRef" :leafer-app="canvasApp" />
    <div
      class="flex-1 relative overflow-hidden w-full h-full"
      ref="canvasRef"
      style="z-index: 1"
      @contextmenu.prevent
    ></div>
    <ElementInfoLabel
      v-if="selectTarget"
      :target="selectTarget"
      :version="toolbarVersion"
    />
    <FloatToolbar
      v-if="selectTarget"
      :canvas-app="canvasApp"
      :target="selectTarget"
      :version="toolbarVersion"
      :class="[
        'absolute transform -translate-x-1/2 z-50 pointer-events-auto',
        selectTarget.tag === 'ImageGen' || selectTarget.tag === 'VideoGen'
          ? 'translate-y-0 pt-3'
          : '-translate-y-full pb-3',
      ]"
      :style="toolbarStyle"
      @change="
        (payload: any) => {
          if (payload?.immediateSave) {
            recordHistoryDebounced(50, true);
          } else if (!payload?.skipHistory) {
            recordHistoryDebounced();
          }
        }
      "
      @action="handleToolbarAction"
    />

    <ViboardToolbar
      ref="toolbarRef"
      v-model="activeTool"
      @change-hue="onHueChange"
      @change-saturation="onSaturationChange"
      @change-lightness="onLightnessChange"
      @change-alpha="onAlphaChange"
      @change-thickness="onThicknessChange"
      @change-font-size="onFontSizeChange"
      @change-font-family="onFontFamilyChange"
      @submit-link="onSubmitLink"
      @upload-file="onUploadFile"
      @insert-media="insertMedia"
    />

    <LayerPanel
      :canvas-app="canvasApp"
      :record-history-debounced="recordHistoryDebounced"
    />

    <!-- Canvas-based Crop Toolbar -->
    <div
      v-if="isCropping"
      class="absolute transform -translate-x-1/2 z-50 pointer-events-auto bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl"
      :style="cropToolbarStyle"
    >
      <span
        class="text-xs text-neutral-300 font-medium whitespace-nowrap flex items-center gap-1.5 select-none"
      >
        <i class="pi pi-clone text-primary-500"></i>
        裁剪模式
      </span>
      <div class="h-4 w-1px bg-neutral-700"></div>

      <Select
        v-model="cropRatio"
        :options="cropRatios"
        optionLabel="label"
        optionValue="value"
        class="text-xs custom-select-style font-medium"
        style="height: 28px; line-height: 28px"
        @change="applyRatioPreset"
      />

      <div class="h-4 w-1px bg-neutral-700"></div>

      <Button
        icon="pi pi-check"
        severity="success"
        rounded
        size="small"
        class="w-7 h-7 flex items-center justify-center p-0 cursor-pointer"
        title="确定 (Enter)"
        @click="confirmCanvasCrop"
      />
      <Button
        icon="pi pi-times"
        severity="secondary"
        rounded
        size="small"
        class="w-7 h-7 flex items-center justify-center p-0 cursor-pointer"
        title="取消 (Esc)"
        @click="cancelCanvasCrop"
      />
    </div>

    <div class="absolute right-3 top-4 z-40 flex items-center gap-3">
      <ZoomController :canvas-app="canvasApp" />
      <button
        class="agent-launcher-btn cursor-pointer flex items-center justify-center"
        title="打开 AI 助手"
        v-show="agentPanelCollapsed"
        @click="emit('toggle-agent')"
        :style="{
          transition:
            'transform ' +
            (agentPanelCollapsed ? '0.15s' : '0.15s') +
            ' cubic-bezier(0.45, 0, 0.55, 1), opacity ' +
            (agentPanelCollapsed ? '0.15s' : '0.15s') +
            ' ease',
          transform: agentPanelCollapsed
            ? 'translateX(0)'
            : 'translateX(400px)',
          opacity: agentPanelCollapsed ? 1 : 0,
          pointerEvents: agentPanelCollapsed ? 'auto' : 'none',
        }"
      >
        <img
          :src="logoImg"
          alt="OmniCanvas"
          width="28"
          height="28"
          style="width: 28px; height: 28px; object-fit: cover"
          class="w-28px h-28px rounded-full object-cover"
        />
      </button>
    </div>

    <!-- Custom Context Menu -->
    <div
      v-if="isContextMenuVisible"
      ref="contextMenuRef"
      class="custom-context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      @pointerdown.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <template v-if="hasSelection">
        <div
          class="custom-context-menu-item"
          @click="handleItemClick(handleImageToImage)"
        >
          <i
            class="pi pi-image text-primary-500"
            style="font-size: 18px !important"
          ></i>
          <span>图生图</span>
        </div>
        <div
          class="custom-context-menu-item"
          @click="handleItemClick(handleImageToVideo)"
        >
          <i
            class="pi pi-video text-primary-500"
            style="font-size: 18px !important"
          ></i>
          <span>图生视频</span>
        </div>
      </template>
      <template v-else>
        <div
          class="custom-context-menu-item"
          @click="
            handleItemClick(() =>
              addImageGenNode(contextMenuPoint?.x, contextMenuPoint?.y),
            )
          "
        >
          <i
            class="iconfont icon-tupianshengcheng text-primary-500"
            style="font-size: 18px !important"
          ></i>
          <span>图片生成</span>
        </div>
        <div
          class="custom-context-menu-item"
          @click="
            handleItemClick(() =>
              addVideoGenNode(contextMenuPoint?.x, contextMenuPoint?.y),
            )
          "
        >
          <i
            class="iconfont icon-a-shipinshengchengshipinzhizuoshipinchuangjianshipinshengchengzhizuoshipinhechengshipinshengchengchuangzuoyingpianshengchengyingpianzhizuoyingpianchuangjianshi text-primary-500"
            style="font-size: 18px !important"
          ></i>
          <span>视频生成</span>
        </div>
        <div
          class="custom-context-menu-item"
          @click="handleItemClick(() => fileInputRef?.click())"
        >
          <i
            class="pi pi-upload text-primary-500"
            style="font-size: 17px !important"
          ></i>
          <span>文件上传</span>
        </div>
        <div
          class="custom-context-menu-item"
          @click="handleItemClick(() => toolbarRef?.openAssetLibrary())"
        >
          <i
            class="pi pi-images text-primary-500"
            style="font-size: 17px !important"
          ></i>
          <span>从素材库选择</span>
        </div>
      </template>
    </div>

    <!-- Hidden File Input for context menu upload -->
    <input
      type="file"
      ref="fileInputRef"
      style="display: none"
      accept="image/*,video/*"
      @change="handleFileInputChange"
    />
  </main>
</template>

<script setup lang="ts">
import {
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  toRef,
  onMounted,
  onUnmounted,
} from "vue";
import logoImg from "@/assets/logo.jpg";
import { useToast } from "primevue/usetoast";
import CanvasBackground from "@/components/canvas/CanvasBackground.vue";
import CanvasLoader from "@/components/canvas/CanvasLoader.vue";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";

const props = defineProps<{
  agentPanelCollapsed: boolean;
  activeWorkspaceId: string | number | null;
}>();

const emit = defineEmits<{
  (e: "toggle-agent"): void;
}>();
import "@/components/canvas/utils/proxyData.ts";
import FloatToolbar from "@/components/canvas/floatToolbar/index.vue";
import ElementInfoLabel from "@/components/canvas/floatToolbar/ElementInfoLabel.vue";
import ViboardToolbar from "@/components/ViboardToolbar.vue";
import { VideoNode } from "@/components/canvas/nodes/VideoNode";
import { useCanvas } from "@/composables/useCanvas";
import { useCanvasEntrance } from "@/composables/useCanvasEntrance";
import { uploadImage, uploadVideo } from "@/utils/api";
import LayerPanel from "@/components/canvas/LayerPanel.vue";
import ZoomController from "@/components/canvas/ZoomController.vue";
import { useCanvasCrop } from "@/composables/useCanvasCrop";
import {
  getNonOverlappingCoordinates,
  isImageFile,
  isVideoFile,
} from "@/utils/utils.ts";
import { Image, PointerEvent } from "leafer-ui";

const canvasRef = useTemplateRef("canvasRef");
const canvasBgRef = shallowRef<InstanceType<typeof CanvasBackground> | null>(
  null,
);
const toast = useToast();

// State for bottom toolbar controls
const hue = ref(45);
const saturation = ref(100);
const lightness = ref(50);
const alpha = ref(100);
const thickness = ref(4);
const fontSize = ref(24);
const fontFamily = ref("Inter");

// Core Canvas Composable
const {
  loading: canvasLoading,
  canvasApp,
  activeTool,
  selectTarget,
  toolbarStyle,
  toolbarVersion,
  recordHistoryDebounced,
  addImageGenNode,
  addVideoGenNode,
} = useCanvas(
  canvasRef,
  { hue, saturation, lightness, alpha },
  thickness,
  fontSize,
  fontFamily,
  toRef(props, "activeWorkspaceId"),
);

// A2: Element entrance animations — spring scale-in on every agent-placed node
useCanvasEntrance(canvasApp);

const {
  isCropping,
  cropRatio,
  cropToolbarStyle,
  ratios: cropRatios,
  startCanvasCrop,
  confirmCanvasCrop,
  cancelCanvasCrop,
  applyRatioPreset,
} = useCanvasCrop(canvasApp, selectTarget, recordHistoryDebounced, toast);

watch(activeTool, (newTool) => {
  if (newTool === "image-gen") {
    addImageGenNode();
    activeTool.value = "select";
  } else if (newTool === "video-gen") {
    addVideoGenNode();
    activeTool.value = "select";
  }
});

const toolbarRef = ref<any>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const contextMenuPoint = ref<{ x: number; y: number } | null>(null);
const isContextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const hasSelection = ref(false);

const closeContextMenu = () => {
  isContextMenuVisible.value = false;
  contextMenuPoint.value = null;
};

const isInsideContextMenu = (event: Event) => {
  const menu = contextMenuRef.value;
  return !!(
    menu &&
    event.target instanceof Node &&
    menu.contains(event.target)
  );
};

const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
  if (!isContextMenuVisible.value || isInsideContextMenu(event)) return;
  closeContextMenu();
};

const handleContextMenuKeyDown = (event: KeyboardEvent) => {
  if (!isContextMenuVisible.value || event.key !== "Escape") return;
  event.preventDefault();
  closeContextMenu();
};

const handleLeaferContextMenu = (e: any) => {
  e.stop();
  onLeaferContextMenu(e, e.origin);
};

const onLeaferContextMenu = (e: any, originalEvent?: MouseEvent) => {
  const app = canvasApp.value;
  if (!app) return;

  // Do not show context menu when right-clicking on ImageGen or VideoGen nodes
  let checkNode: any = e.target;
  while (checkNode && checkNode !== (app.tree as any)) {
    if (checkNode.tag === "ImageGen" || checkNode.tag === "VideoGen") {
      return;
    }
    checkNode = checkNode.parent;
  }

  // Position context menu at screen coordinates (clientX / clientY)
  contextMenuX.value = originalEvent?.clientX ?? e.clientX ?? 0;
  contextMenuY.value = originalEvent?.clientY ?? e.clientY ?? 0;
  contextMenuPoint.value = { x: e.x, y: e.y };

  // Check selection state according to documentation
  hasSelection.value = !!(app.editor?.single || app.editor?.multiple);

  // If there is selection, let's keep the editor selected element
  if (hasSelection.value) {
    let targetNode: any = e.target;
    while (targetNode && targetNode !== (app.tree as any)) {
      if (targetNode.editable) {
        break;
      }
      if (
        targetNode.tag === "ImageGen" ||
        targetNode.tag === "VideoGen" ||
        targetNode.tag === "rect" ||
        targetNode.tag === "text" ||
        targetNode.tag === "ellipse" ||
        targetNode.tag === "line"
      ) {
        break;
      }
      targetNode = targetNode.parent;
    }

    if (targetNode && targetNode !== (app.tree as any)) {
      app.editor?.select(targetNode as any);
    }
  } else {
    app.editor?.cancel?.();
  }

  isContextMenuVisible.value = true;
};

const handleItemClick = (action: () => void) => {
  closeContextMenu();
  action();
};

const handleFileInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    onUploadFile(target.files[0]);
  }
};

const getElementBase64 = async (el: any): Promise<string> => {
  if (typeof el.export === "function") {
    const exportRes: any = await el.export("png");
    if (typeof exportRes === "string") {
      return exportRes;
    } else if (exportRes?.data) {
      if (typeof exportRes.data === "string") {
        return exportRes.data;
      } else if (exportRes.data instanceof Blob) {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(exportRes.data);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
      }
    }
  }
  return "";
};

const handleImageToImage = async () => {
  const el = selectTarget.value;
  if (!el) return;

  const app = canvasApp.value;
  if (!app) return;

  try {
    canvasLoading.value = true;
    const base64 = await getElementBase64(el);
    if (!base64) {
      toast.add({
        severity: "error",
        summary: "转换失败",
        detail: "无法提取选中元素的位图数据。",
        life: 3000,
      });
      return;
    }

    let targetX = contextMenuPoint.value?.x;
    let targetY = contextMenuPoint.value?.y;

    if (targetX === undefined || targetY === undefined) {
      const bounds = el.worldBoxBounds || el;
      targetX = (bounds.x || 0) + (bounds.width || 400) + 40;
      targetY = bounds.y || 0;
    } else {
      targetX -= 200; // offset half width (400 / 2)
      targetY -= 150; // offset half height (300 / 2)
    }

    const imageGen = new ImageGen({
      x: targetX,
      y: targetY,
      width: 400,
      height: 300,
      editable: true,
      images: [base64],
    });

    app.tree.add(imageGen as any);

    if (app.editor) {
      (app.tree as any).zoom?.(imageGen as any, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor?.select(imageGen as any);
      }, 500);
    }

    recordHistoryDebounced();
  } catch (err: any) {
    console.error("Image to image setup failed:", err);
    toast.add({
      severity: "error",
      summary: "图生图初始化失败",
      detail: err.message || "无法将元素作为参考图导入。",
      life: 3000,
    });
  } finally {
    canvasLoading.value = false;
  }
};

const handleImageToVideo = async () => {
  const el = selectTarget.value;
  if (!el) return;

  const app = canvasApp.value;
  if (!app) return;

  try {
    canvasLoading.value = true;
    const base64 = await getElementBase64(el);
    if (!base64) {
      toast.add({
        severity: "error",
        summary: "转换失败",
        detail: "无法提取选中元素的位图数据。",
        life: 3000,
      });
      return;
    }

    let targetX = contextMenuPoint.value?.x;
    let targetY = contextMenuPoint.value?.y;

    if (targetX === undefined || targetY === undefined) {
      const bounds = el.worldBoxBounds || el;
      targetX = (bounds.x || 0) + (bounds.width || 480) + 40;
      targetY = bounds.y || 0;
    } else {
      targetX -= 240; // offset half width (480 / 2)
      targetY -= 135; // offset half height (270 / 2)
    }

    const videoGen = new VideoGen({
      x: targetX,
      y: targetY,
      width: 480,
      height: 270,
      editable: true,
      inputReference: base64,
    });

    app.tree.add(videoGen as any);

    if (app.editor) {
      (app.tree as any).zoom?.(videoGen as any, 300, undefined, 0.5);
      setTimeout(() => {
        app.editor?.select(videoGen as any);
      }, 500);
    }

    recordHistoryDebounced();
  } catch (err: any) {
    console.error("Image to video setup failed:", err);
    toast.add({
      severity: "error",
      summary: "图生视频初始化失败",
      detail: err.message || "无法将元素作为参考图导入。",
      life: 3000,
    });
  } finally {
    canvasLoading.value = false;
  }
};

const onHueChange = (newHue: number) => {
  hue.value = newHue;
};

const onSaturationChange = (newSat: number) => {
  saturation.value = Math.round(newSat);
};

const onLightnessChange = (newLightness: number) => {
  lightness.value = Math.round(newLightness);
};

const onAlphaChange = (newAlpha: number) => {
  alpha.value = Math.round(newAlpha);
};

const onThicknessChange = (newThickness: number) => {
  thickness.value = newThickness;
};

const onFontSizeChange = (newSize: number) => {
  fontSize.value = newSize;
};

const onFontFamilyChange = (newFamily: string) => {
  fontFamily.value = newFamily;
};

const onSubmitLink = async (url: string) => {
  if (!url || typeof url !== "string") return;
  const trimmed = url.trim();
  const app = canvasApp.value;
  if (!app || !app.tree) return;

  try {
    const isImg =
      trimmed.match(/\.(jpeg|jpg|gif|png|webp)/i) ||
      trimmed.startsWith("data:image/");
    const isVid = trimmed.match(/\.(mp4|webm|ogg|mov)/i);

    if (isImg) {
      const img = new window.Image();
      img.src = trimmed;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          const naturalWidth = img.naturalWidth || 400;
          const naturalHeight = img.naturalHeight || 300;

          const existingBounds = Array.from(app.tree.children || [])
            .filter(
              (child: any) => child.x !== undefined && child.y !== undefined,
            )
            .map((child: any) => ({
              x: child.x,
              y: child.y,
              width: child.width || naturalWidth,
              height: child.height || naturalHeight,
            }));

          const { x, y } = getNonOverlappingCoordinates({
            range: 2000,
            existingBounds,
            newWidth: naturalWidth,
            newHeight: naturalHeight,
            margin: 50,
          });

          const image = new Image({
            x,
            y,
            width: naturalWidth,
            height: naturalHeight,
            url: trimmed,
            editable: true,
          });
          app.tree.add(image);
          recordHistoryDebounced();

          setTimeout(() => {
            (app.tree as any).zoom(image, 100, undefined, 0.8);
          }, 100);
          resolve();
        };
        img.onerror = reject;
      });
    } else if (isVid) {
      const video = document.createElement("video");
      video.src = trimmed;
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          const naturalWidth = video.videoWidth || 480;
          const naturalHeight = video.videoHeight || 270;

          const existingBounds = Array.from(app.tree.children || [])
            .filter(
              (child: any) => child.x !== undefined && child.y !== undefined,
            )
            .map((child: any) => ({
              x: child.x,
              y: child.y,
              width: child.width || naturalWidth,
              height: child.height || naturalHeight,
            }));

          const { x, y } = getNonOverlappingCoordinates({
            range: 2000,
            existingBounds,
            newWidth: naturalWidth,
            newHeight: naturalHeight,
            margin: 50,
          });

          VideoNode.create({
            x,
            y,
            width: naturalWidth,
            height: naturalHeight,
            videoUrl: trimmed,
            thumbnailUrl: trimmed,
            editable: true,
          })
            .then((videoNode) => {
              if (videoNode) {
                app.tree.add(videoNode);
                recordHistoryDebounced();
                setTimeout(() => {
                  (app.tree as any).zoom(videoNode, 100, undefined, 0.8);
                }, 100);
              }
              resolve();
            })
            .catch(reject);
        };
        video.onerror = reject;
      });
    } else {
      toast.add({
        severity: "error",
        summary: "格式错误",
        detail:
          "不支持的媒体链接格式，请提供图片（PNG/JPG/WEBP）或视频（MP4/WEBM）的直链。",
        life: 3000,
      });
    }
  } catch (err: any) {
    console.error("Failed to load link:", err);
    toast.add({
      severity: "error",
      summary: "加载失败",
      detail: "加载链接失败，请确认链接有效且支持跨域访问。",
      life: 3000,
    });
  }
};

const onUploadFile = async (file: File) => {
  console.log(file, isImageFile(file));
  try {
    if (isImageFile(file)) {
      const res = await uploadImage(file);
      if (res && canvasApp.value && canvasApp.value.tree) {
        // 获取图片原始尺寸
        const img = new window.Image();
        img.src = res.imageUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            const naturalWidth = img.naturalWidth;
            const naturalHeight = img.naturalHeight;

            // 获取画布上所有元素的边界框
            const existingBounds = Array.from(
              canvasApp.value!.tree.children || [],
            )
              .filter(
                (child: any) => child.x !== undefined && child.y !== undefined,
              )
              .map((child: any) => ({
                x: child.x,
                y: child.y,
                width: child.width || naturalWidth,
                height: child.height || naturalHeight,
              }));

            // 在画布较大范围内随机位置放置元素（避免堆在一起且不遮挡其他元素）
            const coords = getNonOverlappingCoordinates({
              range: 5000,
              existingBounds,
              newWidth: naturalWidth,
              newHeight: naturalHeight,
              margin: 50,
            });

            const targetX = contextMenuPoint.value
              ? contextMenuPoint.value.x - naturalWidth / 2
              : coords.x;
            const targetY = contextMenuPoint.value
              ? contextMenuPoint.value.y - naturalHeight / 2
              : coords.y;

            const image = new Image({
              x: targetX,
              y: targetY,
              width: naturalWidth,
              height: naturalHeight,
              url: res.imageUrl,
              editable: true,
            });
            if (image && canvasApp.value?.tree) {
              canvasApp.value.tree.add(image);
              recordHistoryDebounced();

              // 平滑移动画布到该元素
              setTimeout(() => {
                if (canvasApp.value?.tree) {
                  (canvasApp.value.tree as any).zoom(
                    image,
                    100,
                    undefined,
                    0.8,
                  );
                }
              }, 100);
            }
            resolve();
          };
          img.onerror = reject;
        });
      }
    }
    if (isVideoFile(file)) {
      const res = await uploadVideo(file);
      if (res && canvasApp.value && canvasApp.value.tree) {
        const { videoUrl, thumbnailUrl } = res;

        // 获取视频原始尺寸
        const video = document.createElement("video");
        video.src = videoUrl;
        video.muted = true;

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            const naturalWidth = video.videoWidth;
            const naturalHeight = video.videoHeight;

            // 获取画布上所有元素的边界框
            const existingBounds = Array.from(
              canvasApp.value!.tree.children || [],
            )
              .filter(
                (child: any) => child.x !== undefined && child.y !== undefined,
              )
              .map((child: any) => ({
                x: child.x,
                y: child.y,
                width: child.width || naturalWidth,
                height: child.height || naturalHeight,
              }));

            // 在画布较大范围内随机位置放置元素（避免堆在一起且不遮挡其他元素）
            const coords = getNonOverlappingCoordinates({
              range: 2000,
              existingBounds,
              newWidth: naturalWidth,
              newHeight: naturalHeight,
              margin: 50,
            });

            const targetX = contextMenuPoint.value
              ? contextMenuPoint.value.x - naturalWidth / 2
              : coords.x;
            const targetY = contextMenuPoint.value
              ? contextMenuPoint.value.y - naturalHeight / 2
              : coords.y;

            VideoNode.create({
              x: targetX,
              y: targetY,
              width: naturalWidth,
              height: naturalHeight,
              videoUrl: videoUrl,
              thumbnailUrl: thumbnailUrl,
              editable: true,
            })
              .then((videoNode) => {
                if (videoNode && canvasApp.value?.tree) {
                  canvasApp.value.tree.add(videoNode);
                  recordHistoryDebounced();

                  // 平滑移动画布到该元素
                  setTimeout(() => {
                    if (canvasApp.value?.tree) {
                      (canvasApp.value.tree as any).zoom(
                        videoNode,
                        100,
                        undefined,
                        0.8,
                      );
                    }
                  }, 100);
                }
                resolve();
              })
              .catch(reject);
          };
          video.onerror = reject;
        });
      }
    }
  } catch (error: any) {
    console.error("Failed to upload file:", error);
    const detail =
      error?.response?.data?.message ||
      error?.message ||
      "上传失败，请确保后端服务器正常运行。";
    toast.add({
      severity: "error",
      summary: "上传失败",
      detail,
      life: 3000,
    });
  }
};

const insertMedia = async (media: {
  url: string;
  type: string;
  thumbnailUrl?: string;
}) => {
  try {
    if (media.type === "image") {
      const img = new window.Image();
      img.src = media.url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          const naturalWidth = img.naturalWidth;
          const naturalHeight = img.naturalHeight;
          const existingBounds = Array.from(
            canvasApp.value!.tree.children || [],
          )
            .filter(
              (child: any) => child.x !== undefined && child.y !== undefined,
            )
            .map((child: any) => ({
              x: child.x,
              y: child.y,
              width: child.width || naturalWidth,
              height: child.height || naturalHeight,
            }));
          const { x, y } = getNonOverlappingCoordinates({
            range: 5000,
            existingBounds,
            newWidth: naturalWidth,
            newHeight: naturalHeight,
            margin: 50,
          });
          const image = new Image({
            x,
            y,
            width: naturalWidth,
            height: naturalHeight,
            url: media.url,
            editable: true,
          });
          if (image && canvasApp.value?.tree) {
            canvasApp.value.tree.add(image);
            recordHistoryDebounced();
            setTimeout(() => {
              if (canvasApp.value?.tree) {
                (canvasApp.value.tree as any).zoom(image, 100, undefined, 0.8);
              }
            }, 100);
          }
          resolve();
        };
        img.onerror = reject;
      });
    } else if (media.type === "video") {
      const video = document.createElement("video");
      video.src = media.url;
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          const naturalWidth = video.videoWidth;
          const naturalHeight = video.videoHeight;
          const existingBounds = Array.from(
            canvasApp.value!.tree.children || [],
          )
            .filter(
              (child: any) => child.x !== undefined && child.y !== undefined,
            )
            .map((child: any) => ({
              x: child.x,
              y: child.y,
              width: child.width || naturalWidth,
              height: child.height || naturalHeight,
            }));
          const { x, y } = getNonOverlappingCoordinates({
            range: 2000,
            existingBounds,
            newWidth: naturalWidth,
            newHeight: naturalHeight,
            margin: 50,
          });
          VideoNode.create({
            x,
            y,
            width: naturalWidth,
            height: naturalHeight,
            videoUrl: media.url,
            thumbnailUrl: media.thumbnailUrl || media.url,
            editable: true,
          })
            .then((videoNode) => {
              if (videoNode && canvasApp.value?.tree) {
                canvasApp.value.tree.add(videoNode);
                recordHistoryDebounced();
                setTimeout(() => {
                  if (canvasApp.value?.tree) {
                    (canvasApp.value.tree as any).zoom(
                      videoNode,
                      100,
                      undefined,
                      0.8,
                    );
                  }
                }, 100);
              }
              resolve();
            })
            .catch(reject);
        };
        video.onerror = reject;
      });
    }
  } catch (error: any) {
    console.error("Failed to insert media from library:", error);
    toast.add({
      severity: "error",
      summary: "插入失败",
      detail: error?.message || "无法加载媒体，请稍后重试",
      life: 3000,
    });
  }
};

const handleToolbarAction = ({ action }: { action: string }) => {
  const app = canvasApp.value;
  if (!app || !app.editor) return;

  if (action === "group") {
    if (typeof app.editor.group === "function") {
      app.editor.group();
      recordHistoryDebounced(0);
    }
  } else if (action === "ungroup") {
    if (typeof app.editor.ungroup === "function") {
      app.editor.ungroup();
      recordHistoryDebounced(0);
    }
  } else if (action === "export-multiple") {
    // 导出多个选中的元素
    if (app.editor.list && app.editor.list.length > 0) {
      const timestamp = Date.now();
      const fileName = `multiple_selection_${timestamp}.png`;

      // 先编组
      const group = app.editor.group();

      // 导出编组后的元素
      if (group && typeof group.export === "function") {
        group
          .export(fileName, { padding: 0 })
          .catch((err: any) => {
            console.error("[App] export multiple failed:", err);
          })
          .finally(() => {
            // 导出完成后立即解组
            app.editor.ungroup();
          });
      }
    }
  } else if (action === "crop") {
    if (selectTarget.value && selectTarget.value.tag === "Image") {
      startCanvasCrop();
    }
  }
};

const handleCropKeyDown = (e: KeyboardEvent) => {
  if (!isCropping.value) return;

  if (e.key === "Enter") {
    e.preventDefault();
    confirmCanvasCrop();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelCanvasCrop();
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleCropKeyDown);
  const app = canvasApp.value;
  if (app) {
    app.on(PointerEvent.MENU, handleLeaferContextMenu);
  }
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  window.addEventListener("keydown", handleContextMenuKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleCropKeyDown);
  canvasApp.value?.off?.(PointerEvent.MENU, handleLeaferContextMenu);
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  window.removeEventListener("keydown", handleContextMenuKeyDown);
});

/**
 * Convert Leafer world-space coordinates to screen coordinates,
 * then trigger a ripple on the background canvas.
 */
function triggerAgentRipple(worldX: number, worldY: number): void {
  const app = canvasApp.value;
  if (!app || !canvasBgRef.value) return;
  const zoom: number = (app.tree as any).scale ?? 1;
  const panX: number = (app.tree as any).x ?? 0;
  const panY: number = (app.tree as any).y ?? 0;
  const screenX = worldX * zoom + panX;
  const screenY = worldY * zoom + panY;
  canvasBgRef.value.triggerRipple(screenX, screenY);
}

defineExpose({
  canvasApp,
  recordHistoryDebounced,
  triggerAgentRipple,
});
</script>

<style>
/* Custom Select style overrides for Crop Toolbar */
.custom-select-style {
  border-radius: 9999px !important;
  color: #f3f4f6 !important;
  box-shadow: none !important;
  display: flex !important;
  align-items: center !important;
  padding: 0 8px 0 12px !important;
  transition: all 0.2s ease !important;
}

.custom-select-style :deep(.p-select-label) {
  padding: 0 4px 0 0 !important;
  font-size: 11px !important;
  color: #e5e7eb !important;
  font-weight: 500 !important;
  display: flex !important;
  align-items: center !important;
}
.custom-select-style :deep(.p-select-dropdown) {
  width: 1rem !important;
  height: 1rem !important;
  color: #9ca3af !important;
}

/* Global CSS variables & layout */
:root {
  --blue-bg: var(--p-primary-100, var(--p-surface-100));
  --blue-text: var(--p-primary-color);
  --brand-bg: var(--p-primary-100, var(--p-surface-100));
  --brand-text: var(--p-primary-color);
  --bg-color: var(--p-surface-50);
  --border-color: var(--p-surface-200);
  --text-primary: var(--p-text-color);
  --text-secondary: var(--p-text-muted-color);
  --tooltip-bg: var(--p-surface-900);
  --zinc-100: var(--p-surface-100);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

#app {
  height: 100vh;
  width: 100vw;
}

html {
  font-size: 14px;
}

body {
  font-family: var(--font-family-sans);
  background-color: var(--bg-color);
  color: var(--text-primary);
  overflow: hidden;
  margin: 0;
  font-size: 1rem;
}

/* Canvas Container */
.canvas-container {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Demo Info */
.demo-info {
  position: absolute;
  top: 48px;
  text-align: center;
  max-width: 500px;
  z-index: 10;
  padding: 0 20px;
  pointer-events: none;
}

.demo-info h1 {
  font-size: 1.6rem;
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

.demo-info p {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

#status-panel {
  margin-top: 16px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface-panel);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  display: inline-block;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.state-val {
  color: var(--brand-text);
  font-weight: 600;
  text-transform: capitalize;
}

.state-detail {
  margin-top: 4px;
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.state-val-small {
  color: var(--text-primary);
  font-weight: 600;
  font-family: var(--font-family-mono);
}

/* Global Scrollbar Styles (Matching PrimeVue ScrollPanel styling, shown only on hover) */
::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: var(--p-scrollpanel-bar-border-radius, 99px);
  transition: background-color 0.2s ease;
}

*:hover::-webkit-scrollbar-thumb {
  background: var(--p-scrollpanel-bar-background, rgba(0, 0, 0, 0.18));
}

*:hover::-webkit-scrollbar-thumb:hover {
  background: var(--p-scrollpanel-bar-hover-background, rgba(0, 0, 0, 0.35));
}

.p-dark ::-webkit-scrollbar-thumb {
  background: transparent;
}

.p-dark *:hover::-webkit-scrollbar-thumb {
  background: var(--p-scrollpanel-bar-background, rgba(255, 255, 255, 0.18));
}

.p-dark *:hover::-webkit-scrollbar-thumb:hover {
  background: var(
    --p-scrollpanel-bar-hover-background,
    rgba(255, 255, 255, 0.35)
  );
}

/* Firefox Support */
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

*:hover {
  scrollbar-color: var(--p-scrollpanel-bar-background, rgba(0, 0, 0, 0.18))
    transparent;
}

.p-dark * {
  scrollbar-color: transparent transparent;
}

.p-dark *:hover {
  scrollbar-color: var(
      --p-scrollpanel-bar-background,
      rgba(255, 255, 255, 0.18)
    )
    transparent;
}

/* AI Launcher Button Styles */
.agent-launcher-btn {
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  background-color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, var(--p-surface-200));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275),
    background-color 0.2s;
  padding: 0;
}

.p-dark .agent-launcher-btn {
  background-color: rgba(30, 30, 30, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.agent-launcher-btn:hover {
  background-color: var(--p-surface-100);
  transform: scale(1.08);
}

.agent-launcher-btn:active {
  transform: scale(0.92);
}

/* Launcher transition */
.launcher-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.launcher-leave-active {
  transition: all 0.2s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
.launcher-enter-from {
  transform: scale(0) rotate(-45deg);
  opacity: 0;
}
.launcher-leave-to {
  transform: scale(0) rotate(45deg);
  opacity: 0;
}

/* Premium Context Menu Style */
.custom-context-menu {
  position: fixed;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 6px;
  min-width: 160px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: contextMenuFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.p-dark .custom-context-menu {
  background: rgba(30, 30, 30, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.custom-context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #333333;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.p-dark .custom-context-menu-item {
  color: #e5e5e5;
}

.custom-context-menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #111111;
}

.p-dark .custom-context-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.custom-context-menu-item i {
  transition: color 0.15s ease;
  width: 18px;
  height: 18px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}

.custom-context-menu-item i.iconfont {
  font-size: 13px !important;
}

.custom-context-menu-item i.pi {
  font-size: 17px !important;
}

.custom-context-menu-item:hover i {
  color: var(--p-primary-color) !important;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

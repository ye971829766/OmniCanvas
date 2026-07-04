<template>
  <div>
    <button
      type="button"
      class="export-trigger"
      title="导出与下载"
      :disabled="disabled"
      @click="togglePanel"
    >
      <Download :size="15" />
    </button>

    <Popover
      ref="popoverRef"
      append-to="body"
      :dismissable="true"
      :pt="popoverPt"
    >
      <div class="export-panel">
        <div class="panel-header">
          <span class="panel-title">选择导出格式</span>
        </div>

        <div class="format-options-grid">
          <button
            v-for="fmt in formatList"
            :key="fmt.ext"
            type="button"
            class="format-card"
            @click="doExport(fmt.ext)"
          >
            <!-- <div class="format-badge" :style="{ backgroundColor: fmt.badgeBg, color: fmt.badgeColor }">
              {{ fmt.ext.toUpperCase() }}
            </div> -->
            <div class="format-info">
              <span class="format-name">{{ fmt.label }}</span>
              <span class="format-desc">{{ fmt.desc }}</span>
            </div>
          </button>
        </div>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { ref, type PropType } from "vue";
import { Download } from "lucide-vue-next";
import Popover from "primevue/popover";
import type { ToolbarItem, ToolbarTarget } from "../types";

const props = defineProps({
  target: {
    type: Object as PropType<ToolbarTarget>,
    required: true,
  },
  item: {
    type: Object as PropType<ToolbarItem>,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const popoverRef = ref();
const popoverPt = {
  root: { class: "toolbar-popover-root" },
  content: { class: "toolbar-popover-content" },
};

interface FormatItem {
  ext: "png" | "jpg" | "webp" | "svg";
  label: string;
  desc: string;
  badgeBg: string;
  badgeColor: string;
}

const formatList: FormatItem[] = [
  {
    ext: "png",
    label: "PNG 图像",
    desc: "支持透明背景 · 高清无损",
    badgeBg: "rgba(59, 130, 246, 0.15)",
    badgeColor: "#3b82f6",
  },
  {
    ext: "jpg",
    label: "JPG 图像",
    desc: "适合照片与复杂场景",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    badgeColor: "#f59e0b",
  },
  {
    ext: "webp",
    label: "WebP 格式",
    desc: "现代 Web 高压缩率格式",
    badgeBg: "rgba(16, 185, 129, 0.15)",
    badgeColor: "#10b981",
  },
  {
    ext: "svg",
    label: "SVG 矢量图",
    desc: "无极放大 · 矢量可编辑",
    badgeBg: "rgba(139, 92, 246, 0.15)",
    badgeColor: "#8b5cf6",
  },
];

const togglePanel = (event: Event) => {
  if (props.disabled) return;
  popoverRef.value?.toggle(event);
};

const triggerDownload = (url: string, name: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const escapeXml = (str: string): string => {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
};

const getElementImageUrl = (el: any): string => {
  if (typeof el.url === "string" && el.url) return el.url;
  if (el.fill) {
    if (
      typeof el.fill === "string" &&
      (el.fill.startsWith("http") ||
        el.fill.startsWith("data:") ||
        el.fill.startsWith("/"))
    ) {
      return el.fill;
    }
    if (typeof el.fill === "object") {
      if (typeof el.fill.url === "string") return el.fill.url;
      if (typeof el.fill.image === "string") return el.fill.image;
    }
  }
  return "";
};

const exportToSVG = async (el: any, fileName: string) => {
  const bounds = (typeof el.getBounds === "function"
    ? el.getBounds("box")
    : null) || {
    width: el.width || 300,
    height: el.height || 300,
  };
  const width = Math.max(1, Math.round(bounds.width || 300));
  const height = Math.max(1, Math.round(bounds.height || 300));

  const tag = el.tag || el.__tag || "";
  const directImageUrl = getElementImageUrl(el);

  // 提取 Leaf 节点的渲染位图
  let pngDataUrl = "";
  try {
    if (typeof el.export === "function") {
      const exportRes: any = await el.export({ format: "png" });
      if (typeof exportRes === "string") {
        pngDataUrl = exportRes;
      } else if (exportRes?.data) {
        if (typeof exportRes.data === "string") {
          pngDataUrl = exportRes.data;
        } else if (exportRes.data instanceof Blob) {
          pngDataUrl = await blobToDataUrl(exportRes.data);
        }
      }
    }
  } catch (e) {
    console.warn("[ExportTool] PNG rasterization for SVG container failed:", e);
  }

  const finalImgSrc = pngDataUrl || directImageUrl;
  let svgInner = "";

  // 1. 如果是图片节点 (Image) 或带有图片填充、或者拿到了图片 Base64
  if (
    tag === "Image" ||
    directImageUrl ||
    (tag === "Rect" && typeof el.fill === "object") ||
    (!["Rect", "Ellipse", "Circle", "Text"].includes(tag) && finalImgSrc)
  ) {
    if (finalImgSrc) {
      const rx = el.cornerRadius ? `rx="${el.cornerRadius}"` : "";
      svgInner = `<image href="${finalImgSrc}" x="0" y="0" width="${width}" height="${height}" ${rx} preserveAspectRatio="none" />`;
    }
  }

  // 2. 如果是纯矢量 Rect 矩形 (非图片填充)
  if (!svgInner && (tag === "Rect" || tag === "Box")) {
    const fill = typeof el.fill === "string" ? el.fill : "#3b82f6";
    const stroke = typeof el.stroke === "string" ? el.stroke : "none";
    const strokeWidth = el.strokeWidth || 0;
    const rx = el.cornerRadius || 0;
    svgInner = `<rect x="0" y="0" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  // 3. 如果是 Ellipse / Circle
  if (!svgInner && (tag === "Ellipse" || tag === "Circle")) {
    const fill = typeof el.fill === "string" ? el.fill : "#3b82f6";
    const stroke = typeof el.stroke === "string" ? el.stroke : "none";
    const rx = width / 2;
    const ry = height / 2;
    svgInner = `<ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" />`;
  }

  // 4. 如果是 Text 文本
  if (!svgInner && tag === "Text" && el.text) {
    const fill = typeof el.fill === "string" ? el.fill : "#000000";
    const fontSize = el.fontSize || 24;
    const fontFamily = el.fontFamily || "sans-serif";
    svgInner = `<text x="0" y="${fontSize}" font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}">${escapeXml(String(el.text))}</text>`;
  }

  // 5. 兜底方案：使用位图 Base64 画面
  if (!svgInner && finalImgSrc) {
    svgInner = `<image href="${finalImgSrc}" x="0" y="0" width="${width}" height="${height}" />`;
  }

  // 6. 如果仍然没有任何内容，绘制最基本的透明或真实填充框，绝不硬编码灰色块
  if (!svgInner) {
    const bgFill = typeof el.fill === "string" ? el.fill : "transparent";
    svgInner = `<rect width="${width}" height="${height}" fill="${bgFill}" />`;
  }

  const svgXml = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${svgInner}
</svg>`;

  const blob = new Blob([svgXml], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  triggerDownload(blobUrl, fileName);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
};

const doExport = async (ext: "png" | "jpg" | "webp" | "svg") => {
  popoverRef.value?.hide();

  const targetObj = props.target as any;
  if (!targetObj) return;

  const el =
    targetObj.tag === "MultipleSelect"
      ? targetObj.editor || targetObj
      : targetObj;

  // 1. 如果是视频节点直接打开/下载视频文件
  if (el.tag === "VideoNode") {
    const videoUrl = el.videoUrl || el.url;
    if (videoUrl) {
      window.open(videoUrl, "_blank");
    } else {
      console.error("[ExportTool] VideoNode has no videoUrl");
    }
    return;
  }

  const timestamp = Date.now();
  const baseName = el.name || el.tag || "canvas_export";
  const fileName = `${baseName}_${timestamp}.${ext}`;

  // 2. 如果是 SVG 格式，使用 OmniCanvas SVG 转换导出引擎
  if (ext === "svg") {
    await exportToSVG(el, fileName);
    return;
  }

  // 3. PNG / JPG / WebP 导出处理
  try {
    const options: any = {
      filename: fileName,
      format: ext,
      fill: ext === "jpg" ? "#ffffff" : undefined,
    };

    let result: any = null;

    if (typeof el.export === "function") {
      result = await el.export(fileName, options);
    } else if (el.editor && typeof el.editor.export === "function") {
      result = await el.editor.export(fileName, options);
    } else if (typeof el.exportImage === "function") {
      result = await el.exportImage(fileName, options);
    }

    if (result) {
      if (
        typeof result === "string" &&
        (result.startsWith("data:") ||
          result.startsWith("blob:") ||
          result.startsWith("http"))
      ) {
        triggerDownload(result, fileName);
      } else if (result.data) {
        if (typeof result.data === "string") {
          triggerDownload(result.data, fileName);
        } else if (result.data instanceof Blob) {
          const blobUrl = URL.createObjectURL(result.data);
          triggerDownload(blobUrl, fileName);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        }
      }
    }
  } catch (err) {
    console.error("[ExportTool] Export image failed:", err);
  }
};
</script>

<style scoped lang="scss">
.export-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--p-text-muted-color);
  background: transparent;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--p-text-color);
    background: var(--p-surface-100);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.export-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 220px;
  padding: 4px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 4px 4px;
  border-bottom: 1px solid var(--p-surface-200);
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.format-options-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.format-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--p-surface-0);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;

  &:hover {
    background: var(--p-surface-100);
    border-color: var(--p-surface-200);
  }

  &:active {
    transform: scale(0.98);
  }
}

.format-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.format-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.format-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--p-text-color);
  line-height: 1.2;
}

.format-desc {
  font-size: 9.5px;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

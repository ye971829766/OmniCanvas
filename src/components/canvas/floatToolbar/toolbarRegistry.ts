import { Download, Lock, LockOpen, Group, Ungroup, Crop } from "lucide-vue-next";
import RadiusTool from "./custom/RadiusTool.vue";
import FillTool from "./custom/FillTool.vue";
import BorderTool from "./custom/BorderTool.vue";
import FontFamilyTool from "./custom/FontFamilyTool.vue";
import FontSizeTool from "./custom/FontSizeTool.vue";
import type { ToolbarItem, ToolbarTarget } from "./types";
import AutoLayoutAndFreeLayout from "./custom/AutoLayoutAndFreeLayout.vue";
import LayoutAndArrangement from "./custom/LayoutAndArrangement.vue";
import ImageGenTool from "./custom/ImageGenTool.vue";

const isEditableNumber = (key: string) => {
  return (target: ToolbarTarget) => typeof target[key] !== "undefined";
};

/* ------------------------------------------------------------------ */
/*  宽高比锁定状态 — 使用 LeaferJS 原生 lockRatio 属性                */
/* ------------------------------------------------------------------ */

/** 读取元素自身的 lockRatio 属性 */
export const isSizeLocked = (target: ToolbarTarget): boolean =>
  Boolean(target?.lockRatio);

/** 切换元素自身的 lockRatio 属性 */
export const toggleSizeLock = (target: ToolbarTarget) => {
  // video元素必须锁定宽高比
  if (target.tag === "VideoNode") return;
  if (typeof target.set === "function") {
    target.set({ lockRatio: !target.lockRatio });
  } else {
    target.lockRatio = !target.lockRatio;
  }
};

const sizeTools: ToolbarItem[] = [
  {
    type: "number",
    key: "width",
    label: "宽度",
    min: 1,
    precision: 0,
    disabled: (target) => !isEditableNumber("width")(target),
  },
  {
    type: "button",
    action: "toggle-size-link",
    icon: LockOpen,
    reactiveIcon: (target) => (isSizeLocked(target) ? Lock : LockOpen),
    label: "",
  },
  {
    type: "number",
    key: "height",
    label: "高度",
    min: 1,
    precision: 0,
    disabled: (target) => !isEditableNumber("height")(target),
  },
];

const shapeTools: ToolbarItem[] = [
  {
    type: "custom",
    key: "fill",
    label: "填充",
    component: FillTool,
  },
  {
    type: "custom",
    key: "border",
    label: "边框",
    component: BorderTool,
  },
  {
    type: "custom",
    key: "cornerRadius",
    label: "圆角",
    component: RadiusTool,
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];

const lineTools: ToolbarItem[] = [
  {
    type: "custom",
    key: "border",
    label: "边框",
    component: BorderTool,
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];
const videoTools: ToolbarItem[] = [
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];

const frameTools: ToolbarItem[] = [
  {
    type: "custom",
    key: "autoLayoutAndFreeLayout",
    label: "自动布局",
    component: AutoLayoutAndFreeLayout,
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];

const textTools: ToolbarItem[] = [
  {
    type: "custom",
    key: "fontFamily",
    label: "字体",
    component: FontFamilyTool,
  },
  {
    type: "custom",
    key: "fontSize",
    label: "字号",
    component: FontSizeTool,
  },
  {
    type: "custom",
    key: "fill",
    label: "填充",
    component: FillTool,
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];

const groupTools: ToolbarItem[] = [
  {
    type: "button",
    action: "ungroup",
    icon: Ungroup,
    label: "解组",
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];

const multipleSelectTools: ToolbarItem[] = [
  {
    type: "button",
    action: "group",
    icon: Group,
    label: "编组",
  },
  {
    type: "divider",
  },
  {
    type: "custom",
    key: "layoutAndArrangement",
    label: "布局与排列",
    component: LayoutAndArrangement,
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];
const imageTools: ToolbarItem[] = [
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "crop",
    icon: Crop,
    label: "裁剪",
  },
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];
const penTools: ToolbarItem[] = [
  {
    type: "custom",
    key: "fill",
    label: "填充",
    component: FillTool,
  },
  {
    type: "custom",
    key: "border",
    label: "边框",
    component: BorderTool,
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];
const imageGenTools: ToolbarItem[] = [
  {
    type: "custom",
    key: "imageGen",
    label: "生成",
    component: ImageGenTool,
  },
  {
    type: "custom",
    key: "fill",
    label: "填充",
    component: FillTool,
  },
  {
    type: "custom",
    key: "border",
    label: "边框",
    component: BorderTool,
  },
  {
    type: "custom",
    key: "cornerRadius",
    label: "圆角",
    component: RadiusTool,
  },
  {
    type: "divider",
  },
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];
const videoGenTools: ToolbarItem[] = [
  ...sizeTools,
  {
    type: "divider",
  },
  {
    type: "button",
    action: "export",
    icon: Download,
    label: "下载",
  },
];
export const toolbarRegistry: Record<string, ToolbarItem[]> = {
  Rect: shapeTools,
  Ellipse: shapeTools,
  Polygon: shapeTools,
  Star: shapeTools,
  Line: lineTools,
  VideoNode: videoTools,
  Frame: frameTools,
  Text: textTools,
  Group: groupTools,
  MultipleSelect: multipleSelectTools,
  Image: imageTools,
  Pen: penTools,
  ImageGen: imageGenTools,
  VideoGen: videoGenTools,
};

export const getToolbarItems = (target?: ToolbarTarget) => {
  if (!target?.tag) return [];
  return toolbarRegistry[target.tag] ?? [];
};

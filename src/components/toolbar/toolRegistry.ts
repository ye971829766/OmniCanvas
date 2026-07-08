/**
 * Tool Registry — single source of truth for all toolbar tools.
 *
 * To add a new tool:
 *   1. Import its panel component (if it has one).
 *   2. Add an entry to the `tools` array below.
 *   3. That's it — the toolbar and properties panel will pick it up automatically.
 */
import { computed, markRaw, type Component } from "vue";

import MarkerPanel from "./panels/MarkerPanel.vue";
import TextPanel from "./panels/TextPanel.vue";
import ShapePanel from "./panels/ShapePanel.vue";
import { selectedShapeType } from "../../composables/useShapeState";

export interface ToolDefinition {
  name: string;
  shortcut: string;
  theme: string;
  icon: string;
  label: string;
  panel?: Component;
  panelWidth?: string;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
}

const shapeIconMap: Record<string, string> = {
  rect: "Square",
  ellipse: "Circle",
  polygon: "Triangle",
  star: "Star",
  line: "Minus",
};

export const defaultTools = computed<ToolDefinition[]>(() => [
  {
    name: "select",
    shortcut: "v",
    theme: "blue",
    icon: "MousePointer2",
    label: "选择",
  },
  {
    name: "pan",
    shortcut: "p",
    theme: "blue",
    icon: "Hand",
    label: "抓手",
  },
  {
    name: "frame",
    shortcut: "f",
    theme: "blue",
    icon: "Frame",
    label: "Frame",
    dividerAfter: true,
  },
  {
    name: "text",
    shortcut: "t",
    theme: "blue",
    icon: "Type",
    label: "文本",
    panel: markRaw(TextPanel),
    panelWidth: "300px",
  },
  {
    name: "marker",
    shortcut: "m",
    theme: "blue",
    icon: "Pencil",
    label: "笔",
    panel: markRaw(MarkerPanel),
    panelWidth: "420px",
  },
  {
    name: "shape",
    shortcut: "k",
    theme: "blue",
    icon: shapeIconMap[selectedShapeType.value] || "Circle",
    label: "形状",
    panel: markRaw(ShapePanel),
    panelWidth: "480px",
  },
  {
    name: "image-gen",
    shortcut: "i",
    theme: "blue",
    icon: "icon-tupianshengcheng",
    label: "图片生成器",
  },
  {
    name: "video-gen",
    shortcut: "o",
    theme: "blue",
    icon: "icon-a-shipinshengchengshipinzhizuoshipinchuangjianshipinshengchengzhizuoshipinhechengshipinshengchengchuangzuoyingpianshengchengyingpianzhizuoyingpianchuangjianshi",
    label: "视频生成器",
  },
  {
    name: "link",
    shortcut: "l",
    theme: "blue",
    icon: "Upload",
    label: "上传",
  },
]);

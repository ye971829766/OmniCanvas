import type { Component } from "vue";

export type ToolbarTarget = Record<string, any>;

export type ToolbarItem =
  | {
      type: "button";
      action: string;
      icon: Component;
      /** 动态图标：根据 target 状态返回不同图标（优先级高于 icon） */
      reactiveIcon?: (target: ToolbarTarget) => Component;
      label: string;
      disabled?: (target: ToolbarTarget) => boolean;
    }
  | {
      type: "color";
      key: string;
      label: string;
      fallback?: string;
      disabled?: (target: ToolbarTarget) => boolean;
    }
  | {
      type: "divider";
    }
  | {
      type: "number";
      key: string;
      label: string;
      min?: number;
      max?: number;
      precision?: number;
      step?: number;
      disabled?: (target: ToolbarTarget) => boolean;
    }
  | {
      type: "custom";
      key: string;
      component: Component;
      label?: string;
      disabled?: (target: ToolbarTarget) => boolean;
    };

export type ToolbarChangePayload = {
  key: string;
  value: unknown;
  /** When true, Canvas.vue should NOT record this change into undo/redo history */
  skipHistory?: boolean;
  /** When true, save the canvas state immediately bypassing the debounce time */
  immediateSave?: boolean;
};

export type ToolbarActionPayload = {
  action: string;
  target?: ToolbarTarget;
};

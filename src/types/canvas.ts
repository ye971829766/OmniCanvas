/**
 * Canvas node types
 */
export type CanvasNodeTag =
  | "Rect"
  | "Ellipse"
  | "Polygon"
  | "Star"
  | "Line"
  | "Text"
  | "Group"
  | "Frame"
  | "Pen"
  | "Image"
  | "Box"
  | "Path"
  | "ImageGen"
  | "VideoGen"
  | "VideoNode";

/**
 * Canvas node base interface
 */
export interface CanvasNode {
  tag: CanvasNodeTag;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  editable?: boolean;
  children?: CanvasNode[];
  [key: string]: any;
}

/**
 * Workspace metadata
 */
export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Canvas history state
 */
export interface CanvasHistoryState {
  data: any[];
  timestamp: number;
}

/**
 * Tool types
 */
export type ToolType =
  | "select"
  | "pan"
  | "frame"
  | "rect"
  | "ellipse"
  | "polygon"
  | "star"
  | "line"
  | "arrow"
  | "pen"
  | "text"
  | "image-gen"
  | "video-gen";

/**
 * Color state
 */
export interface ColorState {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
}

/**
 * Canvas app instance type (from Leafer UI)
 */
export interface CanvasApp {
  tree: any;
  editor: any;
  view: HTMLElement;
  sky: any;
  ground: any;
  [key: string]: any;
}

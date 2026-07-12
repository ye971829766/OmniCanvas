export type CanvasImageGenerationType =
  | "edit"
  | "removeBg"
  | "inpaint"
  | "upscale";

const IMAGE_TASK_LOADING_TEXT: Record<CanvasImageGenerationType, string> = {
  edit: "正在编辑图片...",
  removeBg: "正在去除背景...",
  inpaint: "正在进行图像擦除...",
  upscale: "正在进行 HD 放大...",
};

export function getImageTaskLoadingText(generationType: unknown): string {
  if (typeof generationType !== "string") return "正在处理图片...";
  return (
    IMAGE_TASK_LOADING_TEXT[generationType as CanvasImageGenerationType] ??
    "正在处理图片..."
  );
}

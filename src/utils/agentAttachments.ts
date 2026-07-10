import type { AgentAttachmentInput } from "@/types/agent";

export const MAX_AGENT_ATTACHMENTS = 8;
export const SUPPORTED_AGENT_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function createAssetId(): string {
  const randomId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `asset_${randomId}`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法解析图片尺寸"));
    image.src = source;
  });
}

async function createPreview(file: File): Promise<{
  previewUrl: string;
  width?: number;
  height?: number;
}> {
  const source = await readAsDataUrl(file);
  try {
    const image = await loadImage(source);
    const maxEdge = 512;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { previewUrl: source, width: image.naturalWidth, height: image.naturalHeight };
    context.drawImage(image, 0, 0, width, height);
    const previewType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    return {
      previewUrl: canvas.toDataURL(previewType, 0.82),
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } catch {
    return { previewUrl: source };
  }
}

export async function createAgentAttachment(file: File): Promise<AgentAttachmentInput> {
  if (!SUPPORTED_AGENT_IMAGE_TYPES.has(file.type)) {
    throw new Error("Agent 素材仅支持 PNG、JPEG 和 WebP");
  }
  const preview = await createPreview(file);
  return {
    id: createAssetId(),
    name: file.name || `image-${Date.now()}`,
    mimeType: file.type,
    size: file.size,
    file,
    ...preview,
  };
}

export async function createAgentAttachmentFromSource(
  source: string,
  name = `canvas-reference-${Date.now()}.png`,
): Promise<AgentAttachmentInput> {
  if (/^https?:\/\//i.test(source)) {
    return {
      id: createAssetId(),
      name,
      mimeType: "image/png",
      size: 0,
      previewUrl: source,
      url: source,
    };
  }
  const response = await fetch(source);
  const blob = await response.blob();
  const mimeType = SUPPORTED_AGENT_IMAGE_TYPES.has(blob.type) ? blob.type : "image/png";
  const file = new File([blob], name, { type: mimeType });
  return createAgentAttachment(file);
}

export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

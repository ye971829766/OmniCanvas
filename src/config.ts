/**
 * 全局配置 — 从 Vite 环境变量读取，统一管理所有配置项。
 */
import { reactive } from "vue";

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function envEnabled(value: string | undefined, defaultValue = true): boolean {
  if (value == null || String(value).trim() === "") return defaultValue;
  return !["false", "0", "off", "no"].includes(String(value).trim().toLowerCase());
}

export type AppFeatureFlags = {
  agent: boolean;
  imageGen: boolean;
  videoGen: boolean;
  removeBg: boolean;
};

/** Runtime feature switches. Seeded from Vite env, then overwritten by Admin `/features`. */
export const features = reactive<AppFeatureFlags>({
  agent: envEnabled(import.meta.env.VITE_ENABLE_AGENT),
  imageGen: envEnabled(import.meta.env.VITE_ENABLE_IMAGE_GEN),
  videoGen: envEnabled(import.meta.env.VITE_ENABLE_VIDEO_GEN),
  removeBg: envEnabled(import.meta.env.VITE_ENABLE_REMOVE_BG),
});

export async function loadFeatureFlags(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/features`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Partial<AppFeatureFlags>;
    if (typeof data.agent === "boolean") features.agent = data.agent;
    if (typeof data.imageGen === "boolean") features.imageGen = data.imageGen;
    if (typeof data.videoGen === "boolean") features.videoGen = data.videoGen;
    if (typeof data.removeBg === "boolean") features.removeBg = data.removeBg;
  } catch {
    /* keep env defaults */
  }
}

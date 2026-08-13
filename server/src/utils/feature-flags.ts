import { envEnabled } from "./env-flag";

export type AppFeatureFlags = {
  agent: boolean;
  imageGen: boolean;
  videoGen: boolean;
  removeBg: boolean;
};

let cached: AppFeatureFlags | null = null;

export function envFeatureDefaults(): AppFeatureFlags {
  return {
    agent: envEnabled(process.env.ENABLE_AGENT),
    imageGen: envEnabled(process.env.ENABLE_IMAGE_GEN),
    videoGen: envEnabled(process.env.ENABLE_VIDEO_GEN),
    removeBg: envEnabled(process.env.ENABLE_REMOVE_BG),
  };
}

function parseFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return fallback;
  return envEnabled(String(value), fallback);
}

export function normalizeFeatureFlags(
  raw: Partial<AppFeatureFlags> | null | undefined,
  fallback: AppFeatureFlags = envFeatureDefaults(),
): AppFeatureFlags {
  return {
    agent: parseFlag(raw?.agent, fallback.agent),
    imageGen: parseFlag(raw?.imageGen, fallback.imageGen),
    videoGen: parseFlag(raw?.videoGen, fallback.videoGen),
    removeBg: parseFlag(raw?.removeBg, fallback.removeBg),
  };
}

export function getFeatureFlags(): AppFeatureFlags {
  return cached ?? envFeatureDefaults();
}

export function setFeatureFlagsCache(flags: AppFeatureFlags): void {
  cached = { ...flags };
}

export function resetFeatureFlagsCache(): void {
  cached = null;
}

export function isAgentEnabled(): boolean {
  return getFeatureFlags().agent;
}

export function isImageGenEnabled(): boolean {
  return getFeatureFlags().imageGen;
}

export function isVideoGenEnabled(): boolean {
  return getFeatureFlags().videoGen;
}

export function isRemoveBgEnabled(): boolean {
  return getFeatureFlags().removeBg;
}

const TOOL_FLAGS: Record<string, () => boolean> = {
  generate_image: isImageGenEnabled,
  generate_video: isVideoGenEnabled,
  remove_background: isRemoveBgEnabled,
};

export function isAgentToolEnabled(toolName: string): boolean {
  const check = TOOL_FLAGS[toolName];
  return check ? check() : true;
}

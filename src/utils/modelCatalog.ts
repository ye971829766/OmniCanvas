import { getModelConfig, type ModelMapping } from "@/utils/api";

export interface ModelVisualMeta {
  id: string;
  label: string;
  brandInitial: string;
  brandColor: string;
  iconUrl?: string;
}

let cache: Map<string, ModelVisualMeta> | null = null;
let loadPromise: Promise<Map<string, ModelVisualMeta>> | null = null;

function toMeta(item: ModelMapping): ModelVisualMeta {
  const label = item.label || item.id;
  return {
    id: item.id,
    label,
    brandInitial:
      item.brandInitial ||
      (label ? label.charAt(0).toUpperCase() : "M"),
    brandColor:
      item.brandColor || "linear-gradient(135deg, #475569, #94a3b8)",
    iconUrl: item.iconUrl,
  };
}

function indexMeta(
  map: Map<string, ModelVisualMeta>,
  meta: ModelVisualMeta,
) {
  map.set(meta.id, meta);
  map.set(meta.id.toLowerCase(), meta);
  if (meta.label) {
    map.set(meta.label, meta);
    map.set(meta.label.toLowerCase(), meta);
  }
}

/** Load and cache model mappings (icon / brand) for agent UI. */
export async function ensureModelCatalog(): Promise<
  Map<string, ModelVisualMeta>
> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;

  loadPromise = getModelConfig()
    .then((config) => {
      const map = new Map<string, ModelVisualMeta>();
      for (const item of config.mappings || []) {
        if (!item?.id) continue;
        indexMeta(map, toMeta(item));
      }
      cache = map;
      return map;
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

export function getModelVisualMeta(
  modelId: string | null | undefined,
): ModelVisualMeta | null {
  if (!modelId || !cache) return null;
  const key = modelId.trim();
  if (!key) return null;
  return cache.get(key) || cache.get(key.toLowerCase()) || null;
}

/** Best-effort lookup; triggers catalog load if needed. */
export async function resolveModelVisualMeta(
  modelId: string | null | undefined,
): Promise<ModelVisualMeta | null> {
  if (!modelId?.trim()) return null;
  try {
    await ensureModelCatalog();
  } catch {
    return null;
  }
  return getModelVisualMeta(modelId);
}

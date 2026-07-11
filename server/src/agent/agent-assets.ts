export interface AgentAssetInput {
  id?: string;
  url: string;
  publicUrl?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface AgentAsset extends AgentAssetInput {
  id: string;
  createdAt: number;
}

const ASSET_ID_PATTERN = /^[a-zA-Z0-9_-]{3,120}$/;

function compactAssetLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().replace(/[\r\n";]/g, ' ').slice(0, 160);
}

export function formatAgentAssetForPrompt(
  asset: AgentAsset,
  includeDetails = false,
): string {
  const base =
    `- assetId: "${asset.id}"; ` +
    `name: "${compactAssetLabel(asset.name, 'image')}"`;
  if (!includeDetails) return base;
  return (
    `${base}; type: "${compactAssetLabel(asset.mimeType, 'image')}"; ` +
    `dimensions: ${asset.width || '?'}x${asset.height || '?'}`
  );
}

export function normalizeAgentAssets(inputs?: AgentAssetInput[]): AgentAsset[] {
  if (!Array.isArray(inputs)) return [];

  return inputs
    .filter((asset) => asset && typeof asset.url === 'string' && asset.url.trim())
    .slice(0, 16)
    .map((asset) => ({
      ...asset,
      publicUrl:
        typeof asset.publicUrl === 'string' && asset.publicUrl.trim()
          ? asset.publicUrl.trim()
          : undefined,
      id:
        typeof asset.id === 'string' && ASSET_ID_PATTERN.test(asset.id)
          ? asset.id
          : `asset_${crypto.randomUUID()}`,
      url: asset.url.trim(),
      createdAt: Date.now(),
    }));
}

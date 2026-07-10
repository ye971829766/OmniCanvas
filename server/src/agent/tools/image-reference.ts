import * as fs from 'fs';
import * as path from 'path';
import type { ToolContext } from '../tool.interface';
import { exportNodeImageTool } from './canvas.tools';

function normalizeReference(ref: string): string {
  const match = ref.match(/^\[?assetId:([^\]]+)\]?$/i);
  return match?.[1]?.trim() || ref.trim();
}

function getLocalFilePath(imageUrl: string, origin: string): string | null {
  const isLocalUrl =
    imageUrl.startsWith(origin) ||
    imageUrl.startsWith('http://localhost') ||
    imageUrl.startsWith('http://127.0.0.1');

  if (isLocalUrl) {
    const match = imageUrl.match(/\/files\/([^/?#]+)(?:[?#].*)?$/);
    return match?.[1] ? path.join(process.cwd(), 'files', match[1]) : null;
  }
  if (imageUrl.startsWith('files/')) return path.join(process.cwd(), imageUrl);
  if (imageUrl.startsWith('/files/')) return path.join(process.cwd(), imageUrl.slice(1));
  return null;
}

export async function resolveReferenceUrl(
  rawRef: string | undefined,
  ctx: ToolContext,
): Promise<string | null> {
  if (!rawRef || typeof rawRef !== 'string') return null;
  const ref = normalizeReference(rawRef);

  if (ref.startsWith('data:image/') || ref.startsWith('http://') || ref.startsWith('https://')) {
    return ref;
  }

  const asset = ctx.assets?.find((item) => item.id === ref);
  const assetUrl = asset?.publicUrl || asset?.url;
  if (assetUrl) {
    if (assetUrl.startsWith('/')) return `${ctx.origin}${assetUrl}`;
    if (!/^(?:https?:|data:)/i.test(assetUrl)) return `${ctx.origin}/${assetUrl}`;
    return assetUrl;
  }

  const node = ctx.canvasState.find((item: any) => item.refId === ref);
  if (typeof node?.url === 'string' && node.url) {
    if (node.url.startsWith('/')) return `${ctx.origin}${node.url}`;
    if (!/^(?:https?:|data:)/i.test(node.url)) return `${ctx.origin}/${node.url}`;
    return node.url;
  }

  if (ref.startsWith('/')) return `${ctx.origin}${ref}`;
  if (ref.startsWith('files/')) return `${ctx.origin}/${ref}`;
  return null;
}

export async function resolveReferenceToBase64(
  rawRef: string | undefined,
  ctx: ToolContext,
): Promise<string | null> {
  if (!rawRef) return null;
  const ref = normalizeReference(rawRef);

  if (ref.startsWith('data:image/')) return ref;

  const node = ctx.canvasState.find((item: any) => item.refId === ref);
  if (node && !node.url) {
    const exportResult = await exportNodeImageTool.execute(
      { refId: ref, waitForGeneration: false },
      ctx,
    );
    const output = exportResult.output as any;
    if (typeof output?.image === 'string') return output.image;
  }

  const imageUrl = await resolveReferenceUrl(ref, ctx);
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:image/')) return imageUrl;

  const localPath = getLocalFilePath(imageUrl, ctx.origin);
  if (localPath) {
    let finalPath = localPath;
    if (!fs.existsSync(finalPath)) {
      const altPath = localPath.replace(/[\\/]files[\\/]/, '/server/files/');
      if (fs.existsSync(altPath)) finalPath = altPath;
    }
    if (fs.existsSync(finalPath)) {
      const buffer = fs.readFileSync(finalPath);
      const ext = path.extname(finalPath).slice(1).toLowerCase() || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference image: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function resolveReferencesToBase64(
  refs: string[] | undefined,
  ctx: ToolContext,
): Promise<string[]> {
  if (!Array.isArray(refs)) return [];
  const results: string[] = [];
  for (const ref of refs) {
    const resolved = await resolveReferenceToBase64(ref, ctx);
    if (resolved) results.push(resolved);
  }
  return results;
}

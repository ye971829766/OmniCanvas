import * as fs from 'fs';
import * as path from 'path';
import type { ToolContext } from '../tool.interface';
import { exportNodeImageTool } from './canvas.tools';

function normalizeReference(ref: string): string {
  const match = ref.match(/^\[?assetId:([^\]]+)\]?$/i);
  return match?.[1]?.trim() || ref.trim();
}

function getUploadRoots(): string[] {
  const roots = new Set<string>();
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'files');
  roots.add(path.resolve(uploadDir));
  roots.add(path.resolve(process.cwd(), 'files'));
  roots.add(path.resolve(process.cwd(), 'server', 'files'));
  return [...roots];
}

function extractFilesBasename(imageUrl: string): string | null {
  const match = imageUrl.match(/\/files\/([^/?#]+)(?:[?#].*)?$/i);
  if (match?.[1]) return match[1];
  if (imageUrl.startsWith('files/')) return imageUrl.slice('files/'.length).split(/[?#]/)[0] || null;
  if (imageUrl.startsWith('/files/')) return imageUrl.slice('/files/'.length).split(/[?#]/)[0] || null;
  return null;
}

function isProbablyLocalHostUrl(imageUrl: string, origin: string): boolean {
  if (imageUrl.startsWith(origin)) return true;
  try {
    const parsed = new URL(imageUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    // Same host as request origin (covers public IP / domain of this server)
    if (origin) {
      const originHost = new URL(origin).hostname.toLowerCase();
      if (host === originHost) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function resolveExistingLocalFile(imageUrl: string, origin: string): string | null {
  const basename = extractFilesBasename(imageUrl);
  if (!basename || basename.includes('..') || basename.includes('/') || basename.includes('\\')) {
    return null;
  }

  // Prefer local disk for any URL that points at our /files/* route, even when
  // origin host differs slightly (proxy / public IP vs container hostname).
  const shouldTryLocal =
    isProbablyLocalHostUrl(imageUrl, origin) ||
    imageUrl.startsWith('files/') ||
    imageUrl.startsWith('/files/') ||
    /\/files\//i.test(imageUrl);

  if (!shouldTryLocal) return null;

  for (const root of getUploadRoots()) {
    const candidate = path.join(root, basename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
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

  const localPath = resolveExistingLocalFile(imageUrl, ctx.origin);
  if (localPath) {
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).slice(1).toLowerCase() || 'png';
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch reference image: HTTP ${response.status} (${imageUrl}). ` +
          `文件在服务器上不存在或不可访问，请重新上传素材。`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      throw new Error(
        `Failed to fetch reference image: unexpected content-type ${contentType} (${imageUrl})`,
      );
    }
    return `data:${contentType.split(';')[0] || 'image/png'};base64,${buffer.toString('base64')}`;
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('Failed to fetch reference image')) {
      throw err;
    }
    throw new Error(
      `Failed to fetch reference image: ${err?.message || 'network error'} (${imageUrl})`,
    );
  }
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

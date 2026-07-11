import { Image } from "leafer-ui";

export type LeaferImagePaintMode = "fit" | "cover";

export function applyImagePaintMode(
  node: any,
  mode: LeaferImagePaintMode = "fit",
  url?: string,
) {
  if (!node) return node;
  const source = url || node.url;
  if (!source) return node;

  if (url && node.url !== url) node.url = url;
  node.fill = {
    type: "image",
    url: source,
    mode,
  };
  return node;
}

export function createFitImage(data: Record<string, any>) {
  return applyImagePaintMode(new Image(data), "fit", data.url);
}

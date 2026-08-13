const IMAGE_PART_TYPES = new Set([
  "image",
  "image_url",
  "input_image",
  "inline_data",
  "inlinedata",
]);

/** Conservative vision surcharge so URL-only image parts are not reserved as ~100 bytes. */
export const ESTIMATED_TOKENS_PER_IMAGE = 2_500;

export function countMultimodalParts(value: unknown, seen = new Set<unknown>()): number {
  if (!value || typeof value !== "object") return 0;
  if (seen.has(value)) return 0;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countMultimodalParts(item, seen), 0);
  }

  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  const isImagePart =
    IMAGE_PART_TYPES.has(type) ||
    typeof record.image === "string" ||
    typeof record.image_url === "string" ||
    (record.image_url && typeof record.image_url === "object");

  let count = isImagePart ? 1 : 0;
  for (const nested of Object.values(record)) {
    count += countMultimodalParts(nested, seen);
  }
  return count;
}

/**
 * Reserve tokens for a chat/agent turn.
 * Text uses ~4 bytes/token; each image part adds a vision surcharge.
 */
export function estimatePromptTokenReserve(
  messages: unknown,
  extra: unknown = "",
  imageTokens = ESTIMATED_TOKENS_PER_IMAGE,
): number {
  const messageJson = JSON.stringify(messages ?? []);
  const extraJson = typeof extra === "string" ? extra : JSON.stringify(extra ?? "");
  const textTokens = Math.ceil(
    (Buffer.byteLength(messageJson, "utf8") + Buffer.byteLength(extraJson, "utf8")) / 4,
  );
  const images = countMultimodalParts(messages);
  return Math.max(1, textTokens + images * Math.max(0, imageTokens) + 2_048);
}

/** Parse a feature-flag env value. Unset / empty uses `defaultValue` (true). */
export function envEnabled(value: string | undefined, defaultValue = true): boolean {
  if (value == null || String(value).trim() === "") return defaultValue;
  return !["false", "0", "off", "no"].includes(String(value).trim().toLowerCase());
}

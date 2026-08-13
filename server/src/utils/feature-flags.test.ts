import { afterEach, describe, expect, test } from "bun:test";
import {
  isAgentEnabled,
  isAgentToolEnabled,
  isImageGenEnabled,
  isRemoveBgEnabled,
  isVideoGenEnabled,
  resetFeatureFlagsCache,
  setFeatureFlagsCache,
} from "./feature-flags";

const KEYS = [
  "ENABLE_AGENT",
  "ENABLE_IMAGE_GEN",
  "ENABLE_VIDEO_GEN",
  "ENABLE_REMOVE_BG",
] as const;

describe("feature flags", () => {
  const originals: Record<string, string | undefined> = Object.fromEntries(
    KEYS.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    resetFeatureFlagsCache();
    for (const key of KEYS) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  });

  test("defaults to enabled when unset", () => {
    for (const key of KEYS) delete process.env[key];
    expect(isAgentEnabled()).toBe(true);
    expect(isImageGenEnabled()).toBe(true);
    expect(isVideoGenEnabled()).toBe(true);
    expect(isRemoveBgEnabled()).toBe(true);
  });

  test("treats false/0/off/no as disabled", () => {
    for (const value of ["false", "FALSE", "0", "off", "no"]) {
      process.env.ENABLE_IMAGE_GEN = value;
      process.env.ENABLE_VIDEO_GEN = value;
      process.env.ENABLE_REMOVE_BG = value;
      expect(isImageGenEnabled()).toBe(false);
      expect(isVideoGenEnabled()).toBe(false);
      expect(isRemoveBgEnabled()).toBe(false);
    }
  });

  test("gates matching agent tools", () => {
    process.env.ENABLE_IMAGE_GEN = "false";
    process.env.ENABLE_VIDEO_GEN = "false";
    process.env.ENABLE_REMOVE_BG = "false";
    expect(isAgentToolEnabled("generate_image")).toBe(false);
    expect(isAgentToolEnabled("generate_video")).toBe(false);
    expect(isAgentToolEnabled("remove_background")).toBe(false);
    expect(isAgentToolEnabled("edit_image")).toBe(true);
    expect(isAgentToolEnabled("add_text")).toBe(true);
  });

  test("admin cache overrides env defaults", () => {
    process.env.ENABLE_AGENT = "true";
    process.env.ENABLE_VIDEO_GEN = "true";
    setFeatureFlagsCache({
      agent: false,
      imageGen: true,
      videoGen: false,
      removeBg: true,
    });
    expect(isAgentEnabled()).toBe(false);
    expect(isVideoGenEnabled()).toBe(false);
    expect(isImageGenEnabled()).toBe(true);
  });
});

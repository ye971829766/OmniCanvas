import { afterEach, describe, expect, test } from "bun:test";
import { isAgentEnabled } from "./agent-enabled";
import { resetFeatureFlagsCache } from "../utils/feature-flags";

describe("isAgentEnabled", () => {
  const original = process.env.ENABLE_AGENT;

  afterEach(() => {
    resetFeatureFlagsCache();
    if (original === undefined) {
      delete process.env.ENABLE_AGENT;
    } else {
      process.env.ENABLE_AGENT = original;
    }
  });

  test("defaults to enabled when unset", () => {
    delete process.env.ENABLE_AGENT;
    expect(isAgentEnabled()).toBe(true);
  });

  test("treats false/0/off/no as disabled", () => {
    for (const value of ["false", "FALSE", "0", "off", "no"]) {
      process.env.ENABLE_AGENT = value;
      expect(isAgentEnabled()).toBe(false);
    }
  });

  test("treats true/1/on/yes as enabled", () => {
    for (const value of ["true", "1", "on", "yes"]) {
      process.env.ENABLE_AGENT = value;
      expect(isAgentEnabled()).toBe(true);
    }
  });
});

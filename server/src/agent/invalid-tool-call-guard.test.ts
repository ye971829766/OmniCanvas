import { describe, expect, test } from "bun:test";
import { InvalidToolCallGuard } from "./invalid-tool-call-guard";

describe("InvalidToolCallGuard", () => {
  test("stops after repeated validation-only steps", () => {
    const guard = new InvalidToolCallGuard(3);

    expect(guard.recordStep(1, 0)).toBe(false);
    expect(guard.recordStep(2, 0)).toBe(false);
    expect(guard.recordStep(1, 0)).toBe(true);
  });

  test("resets after a valid tool call", () => {
    const guard = new InvalidToolCallGuard(2);

    expect(guard.recordStep(1, 0)).toBe(false);
    expect(guard.recordStep(2, 1)).toBe(false);
    expect(guard.recordStep(1, 0)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getImageTaskLoadingText } from "../imageTask";

describe("image task loading text", () => {
  it("shows the operation that is actually running", () => {
    expect(getImageTaskLoadingText("edit")).toBe("正在编辑图片...");
    expect(getImageTaskLoadingText("removeBg")).toBe("正在去除背景...");
    expect(getImageTaskLoadingText("inpaint")).toBe("正在进行图像擦除...");
    expect(getImageTaskLoadingText("upscale")).toBe("正在进行 HD 放大...");
  });

  it("uses a neutral fallback for unknown operations", () => {
    expect(getImageTaskLoadingText(undefined)).toBe("正在处理图片...");
    expect(getImageTaskLoadingText("future_operation")).toBe("正在处理图片...");
  });
});

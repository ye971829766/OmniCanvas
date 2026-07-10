import { describe, expect, it } from "vitest";
import {
  createHiddenReasoningStreamFilter,
  stripHiddenReasoning,
} from "@/utils/agentText";

describe("agent text sanitizing", () => {
  it("removes complete and unclosed think blocks", () => {
    expect(
      stripHiddenReasoning("开始<think>内部推理</think>最终答案"),
    ).toBe("开始最终答案");
    expect(stripHiddenReasoning("可见内容<thinking>未闭合推理")).toBe(
      "可见内容",
    );
  });

  it("filters think tags split across streaming chunks", () => {
    const filter = createHiddenReasoningStreamFilter();
    const output = [
      filter.push("回答前缀<thi"),
      filter.push("nk>不应显示"),
      filter.push("的推理</thi"),
      filter.push("nk>回答正文"),
      filter.flush(),
    ].join("");

    expect(output).toBe("回答前缀回答正文");
  });

  it("keeps ordinary angle-bracket text", () => {
    const filter = createHiddenReasoningStreamFilter();
    expect(filter.push("使用 <div> 标签") + filter.flush()).toBe(
      "使用 <div> 标签",
    );
  });
});

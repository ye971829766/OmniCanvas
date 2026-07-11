import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentPlan } from "@/types/agent";
import AgentPlanCard from "./AgentPlanCard.vue";

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLDivElement | null = null;

async function mountPlan(plan: AgentPlan) {
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(AgentPlanCard, { plan });
  app.mount(host);
  await nextTick();
  return host;
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
});

describe("AgentPlanCard", () => {
  it("shows total progress and makes the active step easy to scan", async () => {
    const element = await mountPlan({
      id: "plan-1",
      title: "Amazon / 淘宝电商套图",
      steps: [
        { id: "one", title: "准备产品资产", status: "completed" },
        {
          id: "two",
          title: "Amazon 主图",
          description: "2000x2000 · 纯白背景",
          status: "in_progress",
        },
        { id: "three", title: "商品细节图", status: "pending" },
      ],
    });

    expect(element.textContent).toContain("Amazon / 淘宝电商套图");
    expect(element.textContent).toContain("执行中");
    expect(element.textContent).toContain("已处理 1/3");
    expect(element.textContent).toContain("2000x2000 · 纯白背景");
    expect(
      element.querySelector(".plan-steps .is-in_progress")?.textContent,
    ).toContain("进行中");

    const progress = element.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-valuenow")).toBe("33");
    expect(progress?.getAttribute("aria-valuetext")).toBe("已处理 1/3");

    const toggle = element.querySelector<HTMLButtonElement>(".plan-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    toggle?.click();
    await nextTick();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(element.querySelector(".plan-steps")).toBeNull();
  });

  it("starts completed plans collapsed and lets the user inspect them", async () => {
    const element = await mountPlan({
      id: "plan-complete",
      title: "商品图生成",
      steps: [
        { id: "one", title: "主图", status: "completed" },
        { id: "two", title: "细节图", status: "completed" },
      ],
    });

    const toggle = element.querySelector<HTMLButtonElement>(".plan-toggle");
    expect(element.textContent).toContain("已完成");
    expect(element.textContent).toContain("已处理 2/2");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(element.querySelector(".plan-steps")).toBeNull();

    toggle?.click();
    await nextTick();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(element.querySelectorAll(".plan-steps .is-completed")).toHaveLength(2);
  });

  it("keeps a partially failed plan active while pending work remains", async () => {
    const element = await mountPlan({
      id: "plan-failed",
      title: "图片生成",
      steps: [
        { id: "one", title: "主图", status: "completed" },
        { id: "two", title: "侧面图", status: "error" },
        { id: "three", title: "细节图", status: "pending" },
      ],
    } as AgentPlan);

    expect(element.textContent).toContain("执行中 · 1 项失败");
    expect(element.textContent).toContain("已处理 2/3");
    expect(element.querySelector(".is-failed")?.textContent).toContain("失败");
    expect(
      element.querySelector<HTMLElement>(".progress-failed")?.style.width,
    ).toBe("33.33333333333333%");
  });

  it("starts long active plans collapsed", async () => {
    const element = await mountPlan({
      id: "plan-long",
      title: "长任务",
      steps: Array.from({ length: 6 }, (_, index) => ({
        id: `step-${index}`,
        title: `步骤 ${index + 1}`,
        status: index === 0 ? "in_progress" : "pending",
      })),
    });

    const toggle = element.querySelector<HTMLButtonElement>(".plan-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(element.querySelector(".plan-steps")).toBeNull();
  });
});

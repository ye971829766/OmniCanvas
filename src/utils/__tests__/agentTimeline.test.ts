import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("leafer-ui", () => ({
  Text: class {},
  Rect: class {},
  Frame: class {},
  Group: class {},
  MoveEvent: { MOVE: "move" },
  ZoomEvent: { ZOOM: "zoom" },
}));
vi.mock("@/components/canvas/nodes/ImageGen", () => ({ ImageGen: class {} }));
vi.mock("@/components/canvas/nodes/VideoGen", () => ({ VideoGen: class {} }));
vi.mock("@/utils/leaferImage", () => ({ createFitImage: () => ({}) }));

import { buildChatMessagesFromHistory } from "@/composables/useAgent";
import GeneratedMediaGallery from "@/components/agent/GeneratedMediaGallery.vue";

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
});

describe("agent history execution timeline", () => {
  it("rebuilds tool-step updates and the final answer in chronological order", () => {
    const initialPlan = {
      id: "plan-1",
      title: "商品图任务",
      steps: [{ id: "step-1", title: "生成主图", status: "pending" }],
    };
    const savedPlan = {
      ...initialPlan,
      steps: [{ ...initialPlan.steps[0], status: "completed" as const }],
    };
    const rawHistory = [
      { role: "user", content: "生成一张商品图" },
      {
        role: "assistant",
        content: "先建立任务计划。",
        tool_calls: [
          {
            id: "tool-1",
            function: {
              name: "plan_ecommerce_suite",
              arguments: JSON.stringify({ platforms: ["amazon"] }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "tool-1",
        content: JSON.stringify({ plan: initialPlan }),
      },
      { role: "assistant", content: "### 完成\n主图已经生成。" },
    ];

    const messages = buildChatMessagesFromHistory(rawHistory, savedPlan);
    const assistant = messages.find((message) => message.role === "assistant");

    expect(assistant?.text).toContain("主图已经生成");
    expect(assistant?.blocks?.map((block) => block.type)).toEqual([
      "update",
      "tools",
      "plan",
      "text",
    ]);
    const planBlock = assistant?.blocks?.find((block) => block.type === "plan");
    expect(planBlock?.type === "plan" && planBlock.plan.steps[0].status).toBe(
      "completed",
    );
  });

  it("restores persisted media in the timeline without rendering the same ref twice", async () => {
    const rawHistory = [
      { role: "user", content: "Generate a product image" },
      {
        role: "assistant",
        content: "Preparing the image.",
        tool_calls: [
          {
            id: "tool-image",
            function: {
              name: "generate_image",
              arguments: JSON.stringify({ prompt: "product front view" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "tool-image",
        content: JSON.stringify({
          refId: "image-history-1",
          status: "success",
          url: "https://example.com/history-image.png",
        }),
      },
      {
        role: "assistant",
        content: "The image is ready.",
      },
    ];

    const assistant = buildChatMessagesFromHistory(rawHistory).find(
      (message) => message.role === "assistant",
    );
    expect(assistant).toBeDefined();
    expect(assistant?.blocks?.map((block) => block.type)).toEqual([
      "update",
      "tools",
      "text",
    ]);
    expect(assistant?.tools).toHaveLength(1);
    expect(assistant?.tools[0].output).toEqual({
      refId: "image-history-1",
      status: "success",
      url: "https://example.com/history-image.png",
    });

    host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp(GeneratedMediaGallery, {
      tools: [
        ...(assistant?.tools || []),
        {
          id: "tool-duplicate",
          name: "edit_image",
          done: true,
          input: { prompt: "same output" },
          output: {
            refId: "image-history-1",
            status: "success",
            url: "https://example.com/history-image.png",
          },
        },
      ],
      nodeStates: {},
    });
    app.mount(host);
    await nextTick();

    expect(host.querySelectorAll(".generated-media-item")).toHaveLength(1);
    expect(
      host.querySelector<HTMLImageElement>(".preview-img")?.src,
    ).toBe("https://example.com/history-image.png");
  });
});

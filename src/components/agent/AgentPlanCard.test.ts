import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import AgentPlanCard from "./AgentPlanCard.vue";

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
});

describe("AgentPlanCard", () => {
  it("renders progress and task descriptions", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp(AgentPlanCard, {
      plan: {
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
        ],
      },
    });
    app.mount(host);
    await nextTick();

    expect(host.textContent).toContain("Amazon / 淘宝电商套图");
    expect(host.textContent).toContain("1/2");
    expect(host.textContent).toContain("2000x2000 · 纯白背景");
  });
});

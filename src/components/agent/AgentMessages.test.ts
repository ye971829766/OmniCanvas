import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/composables/useAgent";
import AgentMessages from "./AgentMessages.vue";
import agentMessagesSource from "./AgentMessages.vue?raw";

vi.mock("@/composables/useAgent", () => ({
  stripInternalToolErrors: (text: string) => text,
}));

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

let app: ReturnType<typeof createApp> | null = null;
let host: HTMLDivElement | null = null;

async function mountMessages(
  messages: ChatMessage[],
  nodeStates: Record<string, any> = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(AgentMessages, {
    messages,
    nodeStates,
    suggestions: [],
    loading: false,
    running: false,
  });
  app.mount(host);

  await nextTick();
  await Promise.resolve();
  await nextTick();
  return host;
}

async function mountMarkdown(content: string) {
  return mountMessages([
    {
      id: "markdown-message",
      role: "assistant",
      text: content,
      tools: [],
      streaming: false,
      runStatus: "completed",
    },
  ]);
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.documentElement.classList.remove("p-dark");
  app = null;
  host = null;
});

describe("AgentMessages markdown", () => {
  it("keeps heading levels compact and visually ordered", async () => {
    const element = await mountMarkdown(
      [
        "# Level 1",
        "## Level 2",
        "### Level 3",
        "#### Level 4",
        "##### Level 5",
        "###### Level 6",
        "Body copy",
      ].join("\n\n"),
    );

    const markdown = element.querySelector<HTMLElement>(".markdown-body");
    const headings = Array.from(
      element.querySelectorAll<HTMLElement>(".markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6"),
    );

    expect(markdown).not.toBeNull();
    expect(headings.map((heading) => heading.tagName)).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
    ]);
  });

  it("renders representative GFM content with safe interactive affordances", async () => {
    const element = await mountMarkdown(
      [
        "### 交付结果",
        "正文包含 [平台规范](https://example.com/spec) 和 `imageSize`。",
        "",
        "- [x] 主图已完成",
        "- [ ] 侧面图待复核",
        "",
        "| 图片 | 状态 |",
        "| --- | --- |",
        "| 主图 | 已完成 |",
        "",
        "> 正式发布前请核对平台规则。",
        "",
        "```ts",
        "const ready = true;",
        "```",
        "",
        "![商品参考](https://example.com/product.png)",
      ].join("\n"),
    );

    expect(element.querySelector(".markdown-body h3")?.textContent).toContain(
      "交付结果",
    );

    const link = element.querySelector<HTMLAnchorElement>(
      '.markdown-body a[href="https://example.com/spec"]',
    );
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");

    expect(element.querySelector(".incremark-table-wrapper table")).not.toBeNull();
    expect(element.querySelectorAll('.task-list input[type="checkbox"]')).toHaveLength(
      2,
    );
    expect(element.querySelector(".incremark-code pre code")?.textContent).toContain(
      "const ready = true;",
    );
    expect(element.querySelector("blockquote")?.textContent).toContain(
      "正式发布前请核对平台规则",
    );

    const image = element.querySelector<HTMLImageElement>(
      '.markdown-body img[src="https://example.com/product.png"]',
    );
    expect(image?.alt).toBe("商品参考");
    expect(image?.getAttribute("loading")).toBe("lazy");
  });
});

describe("AgentMessages markdown style contract", () => {
  it("keeps the heading scale compact", () => {
    const headingSizes = new Map<number, number>();
    const rulePattern = /([^{}]+)\{([^{}]+)\}/g;

    for (const [, selector, declarations] of agentMessagesSource.matchAll(rulePattern)) {
      if (!selector.includes(".markdown-body") || !declarations.includes("font-size")) {
        continue;
      }
      const size = declarations.match(/font-size:\s*([\d.]+)px/)?.[1];
      if (!size) continue;
      for (const heading of selector.matchAll(/:deep\(h([1-6])\)/g)) {
        const level = Number(heading[1]);
        const pixels = Number(size);
        headingSizes.set(level, Math.max(headingSizes.get(level) || 0, pixels));
      }
    }

    expect([...headingSizes.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const sizes = [1, 2, 3, 4, 5, 6].map((level) => headingSizes.get(level)!);
    expect(sizes.every((size, index) => index === 0 || size <= sizes[index - 1])).toBe(
      true,
    );
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(5);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(19);
  });

  it("defines matching light and dark markdown theme tokens", () => {
    const tokenNames = [
      "--markdown-border",
      "--markdown-border-strong",
      "--markdown-surface",
      "--markdown-surface-raised",
      "--markdown-muted",
    ];
    const lightRule = agentMessagesSource.match(/\.markdown-body\s*\{([^}]+)\}/)?.[1] || "";
    const darkRule =
      agentMessagesSource.match(/:global\(\.p-dark \.markdown-body\)\s*\{([^}]+)\}/)?.[1] ||
      "";

    for (const token of tokenNames) {
      expect(lightRule).toContain(token);
      expect(darkRule).toContain(token);
    }
    expect(lightRule).toContain("var(--agent-text-primary)");
    expect(agentMessagesSource).toContain(":global(.p-dark .markdown-body strong)");
    expect(agentMessagesSource).toContain(":global(.p-dark .markdown-body code)");
    expect(agentMessagesSource).toContain(":global(.p-dark .markdown-body blockquote)");
  });
});

describe("AgentMessages execution timeline", () => {
  it("renders the thinking status with the animated text label", async () => {
    const element = await mountMessages([
      {
        id: "run-thinking",
        role: "assistant",
        text: "",
        tools: [],
        streaming: true,
        runStatus: "running",
        progress: { message: "正在思考" },
      },
    ]);

    const status = element.querySelector<HTMLElement>(".run-progress");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.querySelector(".thinking-label")?.textContent).toBe("正在思考");
    expect(agentMessagesSource).toContain(
      "--thinking-ink: var(--agent-text-primary, #1d1d1f)",
    );
    expect(agentMessagesSource).toContain("@supports ((-webkit-background-clip: text)");
    expect(agentMessagesSource).toContain("animation: thinking-text-sheen 2.2s linear infinite");
    expect(agentMessagesSource).toContain(":global(.p-dark .run-progress)");
    expect(agentMessagesSource).toContain("--thinking-muted: #92929c");
    expect(agentMessagesSource).not.toContain(":global(.p-dark .thinking-label)");
  });

  it("keeps internal quality checks out of the customer-facing timeline", async () => {
    const visibleTool = {
      id: "generate-visible",
      name: "generate_image",
      done: true,
      input: { prompt: "premium product image" },
      output: {
        refId: "visible-image",
        status: "success",
        url: "https://example.com/visible.png",
      },
    };
    const internalTool = {
      id: "quality-internal",
      name: "verify_design",
      done: true,
      input: { refId: "visible-image" },
      output: { status: "error", error: "internal review timeout" },
    };
    const element = await mountMessages([
      {
        id: "run-quality-hidden",
        role: "assistant",
        text: "Design ready",
        tools: [visibleTool, internalTool],
        streaming: false,
        runStatus: "completed",
        blocks: [
          { id: "tools", type: "tools", tools: [visibleTool, internalTool] },
          { id: "final", type: "text", text: "Design ready" },
        ],
      },
    ], {
      "visible-image": {
        refId: "visible-image",
        type: "image",
        status: "done",
        url: "https://example.com/visible.png",
      },
    });

    expect(element.querySelectorAll(".tool-event")).toHaveLength(1);
    expect(element.querySelectorAll(".tool-event.is-failed")).toHaveLength(0);
    expect(element.querySelectorAll(".generated-media-item")).toHaveLength(1);
    expect(element.querySelector(".run-final")?.textContent).toContain("Design ready");
  });

  it("keeps update, plan, tool, artifact, and final output in order", async () => {
    const tool = {
      id: "generate-1",
      name: "generate_image",
      done: true,
      input: { prompt: "product photo" },
      output: {
        refId: "image-1",
        status: "success",
        url: "https://example.com/generated.png",
      },
    };
    const plan = {
      id: "plan-1",
      title: "商品图任务",
      steps: [{ id: "step-1", title: "生成主图", status: "completed" as const }],
    };
    const element = await mountMessages([
      {
        id: "run-1",
        role: "assistant",
        text: "### 完成\n图片已生成。",
        tools: [tool],
        streaming: false,
        elapsedMs: 65_000,
        runStatus: "completed",
        plan,
        blocks: [
          { id: "update", type: "update", text: "正在准备商品素材。" },
          { id: "plan", type: "plan", plan },
          { id: "tools", type: "tools", tools: [tool] },
          { id: "final", type: "text", text: "### 完成\n图片已生成。" },
        ],
      },
    ]);

    const run = element.querySelector(".assistant-run");
    expect(run?.querySelector(".run-meta")?.textContent).toContain("已处理");
    expect(run?.querySelector(".run-meta")?.textContent).toContain("1m 5s");
    const ordered = Array.from(
      run?.querySelectorAll(
        ".run-update, .agent-plan, .tool-event, .generated-media-gallery, .run-final",
      ) || [],
    ).map((node) =>
      ["run-update", "agent-plan", "tool-event", "generated-media-gallery", "run-final"].find(
        (name) => node.classList.contains(name),
      ),
    );
    expect(ordered).toEqual([
      "run-update",
      "agent-plan",
      "tool-event",
      "generated-media-gallery",
      "run-final",
    ]);
    expect(element.querySelectorAll(".generated-media-gallery")).toHaveLength(1);
  });

  it("keeps streamed step text out of the final markdown block", async () => {
    const element = await mountMessages([
      {
        id: "run-live",
        role: "assistant",
        text: "",
        liveText: "正在检查画布结构。",
        tools: [],
        blocks: [],
        streaming: true,
        runStatus: "running",
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 120));
    await nextTick();

    expect(element.querySelector(".run-live-update")).not.toBeNull();
    expect(element.querySelector(".run-final")).toBeNull();
  });
});

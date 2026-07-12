import { describe, expect, test } from "bun:test";
import { AgentMemory } from "./agent.memory";
import { AgentService } from "./agent.service";
import { TOOL_MAP } from "./tool.registry";

function createService(): AgentService {
  return new AgentService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe("AgentService event lifecycle", () => {
  test("normalizes weaker ecommerce tool-call shapes before validation", () => {
    const service = createService() as any;
    const input = service.normalizeToolInput("plan_ecommerce_suite", {
      platform: "taobao",
      assetId: "asset-product",
      sellingPoints: "透气鞋面；轻量鞋身",
      imagesPerPlatform: "6",
    });

    expect(input).toMatchObject({
      sourceAssetId: "asset-product",
      platforms: ["taobao"],
      sellingPoints: ["透气鞋面", "轻量鞋身"],
      imagesPerPlatform: 6,
    });
  });

  test("emits the provider error before closing the stream", async () => {
    const service = createService() as any;
    service.logger.error = () => undefined;
    service.dispatch = async () => {
      const cause: any = new Error("unknown certificate verification error");
      cause.code = "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR";
      throw new Error("AI stream failed", { cause });
    };

    const events: any[] = [];
    const sink = service.run(
      "session-1",
      "generate",
      "http://localhost",
    );
    for await (const event of sink.stream()) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["error", "done"]);
    expect(events[0]?.message).toBe("unknown certificate verification error");
  });

  test("emits an error tool result and persists the matching plan step as failed", async () => {
    const plan = {
      id: "plan-1",
      title: "Inspect the canvas",
      steps: [
        {
          id: "step-1",
          title: "Inspect",
          status: "pending",
          tools: ["query_canvas"],
          completionTool: "query_canvas",
        },
      ],
    } as any;
    const session = { messages: [], lastAccess: Date.now(), plan };
    const savedStatuses: string[] = [];
    const memory = Object.create(AgentMemory.prototype) as any;
    memory.getSession = () => session;
    memory.saveSession = () => savedStatuses.push(plan.steps[0].status);
    memory.get = () => [];
    memory.consumeScreenshot = () => null;
    memory.registerAssets = () => [];
    memory.compactForModel = (messages: any[]) => messages;
    memory.set = () => undefined;

    let requestCount = 0;
    const ai = {
      resolveChannelAndModel: async () => ({
        channel: { apiKey: "test-key", baseUrl: "http://example.invalid/v1" },
        upstreamModel: "test-model",
      }),
      fetchProvider: async () => {
        requestCount++;
        const chunks =
          requestCount === 1
            ? [
                'data: {"id":"chatcmpl-tool","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"query_canvas","arguments":"{}"}}]},"finish_reason":null}]}',
                'data: {"id":"chatcmpl-tool","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                "data: [DONE]",
                "",
              ]
            : [
                'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Handled the tool failure."},"finish_reason":null}]}',
                'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
                "data: [DONE]",
                "",
              ];
        return new Response(chunks.join("\n\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    };
    const service = new AgentService(
      ai as any,
      memory,
      { getConfig: async () => ({ agentConfig: { chatModel: "test-model" } }) } as any,
      { recordTokenUsage: () => undefined } as any,
      {} as any,
    ) as any;
    service.logger.warn = () => undefined;
    service.logger.error = () => undefined;
    service.logger.debug = () => undefined;
    service.logger.log = () => undefined;

    const tool = TOOL_MAP.get("query_canvas")!;
    const originalExecute = tool.execute;
    tool.execute = async () => {
      throw new Error("canvas unavailable");
    };

    try {
      const events: any[] = [];
      for await (const event of service
        .run("session-tool-failure", "inspect the canvas", "http://localhost")
        .stream()) {
        events.push(event);
      }

      expect(events).toContainEqual({
        type: "tool_result",
        id: "call-1",
        tool: "query_canvas",
        output: { status: "error", error: "canvas unavailable" },
      });
      expect(plan.steps[0].status).toBe("failed");
      expect(savedStatuses).toEqual(["in_progress", "failed"]);
    } finally {
      tool.execute = originalExecute;
    }
  });

  test("injects the previous generated image when an edit call omits its source", async () => {
    const previousHistory = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "previous-call",
            toolName: "generate_image",
            input: { prompt: "a heroic puppy" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "previous-call",
            toolName: "generate_image",
            output: {
              type: "json",
              value: {
                refId: "img_existing",
                url: "https://example.com/original.png",
                status: "success",
              },
            },
          },
        ],
      },
    ] as any[];
    const session = { messages: previousHistory, lastAccess: Date.now() };
    const memory = Object.create(AgentMemory.prototype) as any;
    memory.getSession = () => session;
    memory.get = () => previousHistory;
    memory.consumeScreenshot = () => null;
    memory.registerAssets = () => [];
    memory.compactForModel = (messages: any[]) => messages;
    memory.set = () => undefined;
    memory.saveSession = () => undefined;

    let requestCount = 0;
    const ai = {
      resolveChannelAndModel: async () => ({
        channel: { apiKey: "test-key", baseUrl: "http://example.invalid/v1" },
        upstreamModel: "test-model",
      }),
      fetchProvider: async () => {
        requestCount++;
        const chunks =
          requestCount === 1
            ? [
                'data: {"id":"chatcmpl-edit","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-edit","type":"function","function":{"name":"edit_image","arguments":"{\\"prompt\\":\\"add an evil cat beside the puppy\\"}"}}]},"finish_reason":null}]}',
                'data: {"id":"chatcmpl-edit","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                "data: [DONE]",
                "",
              ]
            : [
                'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"The cat was added."},"finish_reason":null}]}',
                'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
                "data: [DONE]",
                "",
              ];
        return new Response(chunks.join("\n\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    };
    const service = new AgentService(
      ai as any,
      memory,
      { getConfig: async () => ({ agentConfig: { chatModel: "test-model" } }) } as any,
      { recordTokenUsage: () => undefined } as any,
      {} as any,
    ) as any;
    service.logger.warn = () => undefined;
    service.logger.error = () => undefined;
    service.logger.debug = () => undefined;
    service.logger.log = () => undefined;

    const tool = TOOL_MAP.get("edit_image")!;
    const originalExecute = tool.execute;
    tool.execute = async (input: any) => ({
      output: { refId: "img_new", status: "success", received: input },
    });

    try {
      const events: any[] = [];
      for await (const event of service
        .run(
          "session-implicit-edit",
          "在这只小狗的旁边加一只小猫",
          "http://localhost",
          undefined,
          [
            {
              refId: "img_existing",
              tag: "Image",
              selected: true,
              url: "https://example.com/original.png",
            },
          ],
        )
        .stream()) {
        events.push(event);
      }

      const editCall = events.find(
        (event) => event.type === "tool_call" && event.id === "call-edit",
      );
      expect(editCall?.input.source).toBe("img_existing");
    } finally {
      tool.execute = originalExecute;
    }
  });

  test("promotes a reference-free generation after inspecting the selected image", async () => {
    const userRequest =
      "\u5728\u8fd9\u5f20\u56fe\u7247\u4e2d\u5c0f\u72d7\u65c1\u8fb9\u52a0\u5c0f\u732b";
    const session = { messages: [], lastAccess: Date.now() };
    const memory = Object.create(AgentMemory.prototype) as any;
    memory.getSession = () => session;
    memory.get = () => [];
    memory.consumeScreenshot = () => null;
    memory.registerAssets = () => [];
    memory.compactForModel = (messages: any[]) => messages;
    memory.set = () => undefined;
    memory.saveSession = () => undefined;

    let requestCount = 0;
    const ai = {
      resolveChannelAndModel: async () => ({
        channel: { apiKey: "test-key", baseUrl: "http://example.invalid/v1" },
        upstreamModel: "test-model",
      }),
      fetchProvider: async () => {
        requestCount++;
        const chunks =
          requestCount === 1
            ? [
                'data: {"id":"chatcmpl-query","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-query","type":"function","function":{"name":"query_canvas","arguments":"{\\"scope\\":\\"auto\\"}"}}]},"finish_reason":null}]}',
                'data: {"id":"chatcmpl-query","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                "data: [DONE]",
                "",
              ]
            : requestCount === 2
              ? [
                  'data: {"id":"chatcmpl-generate","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-generate","type":"function","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"a fluffy kitten beside the puppy\\",\\"x\\":120,\\"y\\":80,\\"width\\":1024,\\"height\\":1024}"}}]},"finish_reason":null}]}',
                  'data: {"id":"chatcmpl-generate","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                  "data: [DONE]",
                  "",
                ]
              : [
                  'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"The selected image was edited."},"finish_reason":null}]}',
                  'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
                  "data: [DONE]",
                  "",
                ];
        return new Response(chunks.join("\n\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    };
    const service = new AgentService(
      ai as any,
      memory,
      { getConfig: async () => ({ agentConfig: { chatModel: "test-model" } }) } as any,
      { recordTokenUsage: () => undefined } as any,
      {} as any,
    ) as any;
    service.logger.warn = () => undefined;
    service.logger.error = () => undefined;
    service.logger.debug = () => undefined;
    service.logger.log = () => undefined;

    const tool = TOOL_MAP.get("edit_image")!;
    const originalExecute = tool.execute;
    tool.execute = async (input: any) => ({
      output: { refId: "img_edited", status: "success", received: input },
    });

    try {
      const events: any[] = [];
      for await (const event of service
        .run(
          "session-selected-image-edit",
          userRequest,
          "http://localhost",
          undefined,
          [
            {
              refId: "img_selected",
              tag: "Image",
              selected: true,
              url: "https://example.com/selected.png",
              x: 0,
              y: 0,
              width: 1024,
              height: 1024,
            },
          ],
        )
        .stream()) {
        events.push(event);
      }

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "tool_result",
          id: "call-query",
          tool: "query_canvas",
          output: expect.objectContaining({
            scope: "selection",
            selectedRefIds: ["img_selected"],
          }),
        }),
      );
      const normalizedCall = events.find(
        (event) => event.type === "tool_call" && event.id === "call-generate",
      );
      expect(normalizedCall?.tool).toBe("edit_image");
      expect(normalizedCall?.input.source).toBe("img_selected");
      expect(normalizedCall?.input.prompt).toContain(userRequest);
      expect(normalizedCall?.input).toMatchObject({
        x: 120,
        y: 80,
        width: 1024,
        height: 1024,
      });
      expect(
        events.some(
          (event) => event.type === "tool_call" && event.tool === "generate_image",
        ),
      ).toBe(false);
    } finally {
      tool.execute = originalExecute;
    }
  });

  test("emits the terminal result for an asynchronous media tool call", async () => {
    const service = createService() as any;
    service.ai.getTaskStatus = () => ({
      status: "success",
      imageUrl: "https://example.com/final.png",
    });

    const output = {
      refId: "image-live",
      taskId: "task-live",
      status: "generating",
    };
    const events: any[] = [];
    const ctx = {
      canvasState: [],
      newRefId: (prefix: string) => `${prefix}-1`,
    } as any;
    const pending: any[] = [];
    const outputs = new Map<string, Record<string, any>>();
    service.capturePendingGeneration(
      "call-live",
      "edit_image",
      output,
      pending,
      outputs,
    );

    await service.settlePendingGenerations(
      pending,
      outputs,
      ctx,
      { emit: (event: any) => events.push(event) },
    );

    expect(output).toMatchObject({
      status: "success",
      url: "https://example.com/final.png",
    });
    expect(events).toContainEqual({
      type: "tool_result",
      id: "call-live",
      tool: "edit_image",
      output,
    });
  });
});

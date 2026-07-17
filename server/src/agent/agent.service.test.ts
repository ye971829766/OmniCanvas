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

  test("rehosts untrusted historical multimodal URLs and isolates a broken image", async () => {
    const service = createService() as any;
    const publishCalls: any[] = [];
    service.logger.warn = () => undefined;
    service.ai = {
      isTrustedImageHostUrl: (source: string) =>
        source.includes("cloudflareimg.cdn.sn"),
      ensurePublicImageUrl: async (source: string, options: any) => {
        publishCalls.push({ source, options });
        if (source.includes("expired")) return null;
        if (options?.forceRehost) {
          return "https://cloudflareimg.cdn.sn/i/rehosted.jpg";
        }
        return source;
      },
    };

    const result = await service.prepareHistoricalImageMessages([{
      role: "user",
      content: [
        {
          type: "text",
          text: "Balanced visual references from separate design-research queries. Derive distinct abstract creative territories only. Do not copy any image's set, props, camera setup, layout, or campaign, and never use these images as product references or refImages/source.",
        },
        { type: "image", image: "https://www.tiktok.com/api/img/?itemId=good" },
        { type: "image", image: "https://www.tiktok.com/api/img/?itemId=expired" },
        { type: "image", image: "https://cloudflareimg.cdn.sn/i/product.jpg" },
      ],
    }], "session-history-images");

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("https://cloudflareimg.cdn.sn/i/rehosted.jpg");
    expect(serialized).toContain("https://cloudflareimg.cdn.sn/i/product.jpg");
    expect(serialized).not.toContain("itemId=expired");
    expect(serialized).toContain("unavailable historical research image");
    expect(serialized).toContain("concrete art direction is allowed");
    expect(serialized).not.toContain("abstract creative territories only");
    expect(publishCalls).toContainEqual({
      source: "https://www.tiktok.com/api/img/?itemId=good",
      options: { forceRehost: true },
    });
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

  test("passes independently authored production prompts through a researched multi-image brief", async () => {
    const userRequest = "请先搜索电商视觉趋势并优化提示词，帮我生成适合的电商主图，生成 5 张，风格要统一";
    const optimizedPrompt =
      "为白色厚底运动鞋创作品牌 campaign 主视觉：夸张低机位透视、深靛蓝空间光场、电光青边缘光与动态切片排版，让产品成为压倒性视觉主体；保持参考鞋款结构与配色，不虚构参数。";
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
    let firstRequestBody: any;
    const requestBodies: any[] = [];
    const generationTrace: string[] = [];
    const publishedImageRequests: Array<{ source: string; forceRehost: boolean }> = [];
    const ai = {
      resolveChannelAndModel: async () => ({
        channel: { apiKey: "test-key", baseUrl: "http://example.invalid/v1" },
        upstreamModel: "test-model",
      }),
      fetchProvider: async (_url: unknown, init: any) => {
        requestCount++;
        const requestBody = JSON.parse(String(init?.body || "{}"));
        requestBodies.push(requestBody);
        if (requestCount === 1) firstRequestBody = requestBody;
        const chunks = requestCount === 1
          ? [
              `data: ${JSON.stringify({
                id: "chatcmpl-research",
                object: "chat.completion.chunk",
                created: 1,
                model: "test-model",
                choices: [{
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: 0,
                        id: "call-research",
                        type: "function",
                        function: {
                          name: "web_search",
                          arguments: JSON.stringify({
                            query: "2026 鞋类淘宝主图设计趋势 优秀案例",
                            search_depth: "advanced",
                            include_images: true,
                            search_scope: "visual_design",
                          }),
                        },
                      },
                      {
                        index: 1,
                        id: "call-too-early",
                        type: "function",
                        function: {
                          name: "generate_image",
                          arguments: JSON.stringify({ prompt: userRequest }),
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                }],
              })}`,
              'data: {"id":"chatcmpl-research","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
              "data: [DONE]",
              "",
            ]
          : requestCount === 2
            ? [
                `data: ${JSON.stringify({
                  id: "chatcmpl-image",
                  object: "chat.completion.chunk",
                  created: 1,
                  model: "test-model",
                  choices: [{
                    index: 0,
                    delta: {
                      role: "assistant",
                      tool_calls: [
                        {
                          index: 0,
                          id: "call-image-1",
                          type: "function",
                          function: {
                            name: "generate_image",
                            arguments: JSON.stringify({
                              prompt: optimizedPrompt,
                              platform: "taobao",
                              quality: "hd",
                            }),
                          },
                        },
                        {
                          index: 1,
                          id: "call-image-2",
                          type: "function",
                          function: {
                            name: "generate_image",
                            arguments: JSON.stringify({
                              prompt: "纯白背景，产品正面棚拍",
                              size: "1024x1024",
                            }),
                          },
                        },
                        {
                          index: 2,
                          id: "call-image-3",
                          type: "function",
                          function: {
                            name: "generate_image",
                            arguments: JSON.stringify({ prompt: userRequest }),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  }],
                })}`,
                'data: {"id":"chatcmpl-image","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                "data: [DONE]",
                "",
              ]
            : [
              'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Done."},"finish_reason":null}]}',
              'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
              "data: [DONE]",
              "",
            ];
        return new Response(chunks.join("\n\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
      getTaskStatus: (taskId: string) => {
        generationTrace.push(`settled:${taskId}`);
        return {
          status: "success",
          imageUrl: `https://example.com/${taskId}.png`,
        };
      },
      ensurePublicImageUrl: async (source: string, options?: { forceRehost?: boolean }) => {
        publishedImageRequests.push({
          source,
          forceRehost: options?.forceRehost === true,
        });
        return options?.forceRehost
          ? "https://cloudflareimg.cdn.sn/i/research.jpg"
          : source;
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

    const tool = TOOL_MAP.get("generate_image")!;
    const researchTool = TOOL_MAP.get("web_search");
    // Web research is an optional deployment capability. The focused prompt
    // policy remains covered elsewhere when the tools are intentionally off.
    if (!researchTool) return;
    const originalExecute = tool.execute;
    const originalResearchExecute = researchTool.execute;
    const receivedInputs: any[] = [];
    const receivedResearchInputs: any[] = [];
    researchTool.execute = async (input: any) => {
      receivedResearchInputs.push(input);
      return {
        output: {
          answer:
            "近期鞋类电商案例反复使用大比例产品、暖灰留白、克制排版和材质微距。",
          results: [{
            title: "鞋类电商视觉趋势",
            url: "https://example.com/trends",
            snippet: "侧光强化网面与鞋底层次，详情页用远景到微距建立节奏。",
          }],
          images: [{
            url: "https://example.com/reference.jpg",
            description: "暖灰背景中的鞋类大比例侧面英雄图，使用柔和方向性侧光。",
          }],
        },
      };
    };
    tool.execute = async (input: any) => {
      receivedInputs.push(input);
      const sequence = receivedInputs.length;
      generationTrace.push(`started:task-${sequence}`);
      return {
        output: {
          refId: `img_${sequence}`,
          taskId: `task-${sequence}`,
          status: "generating",
        },
      };
    };

    try {
      const events: any[] = [];
      for await (const event of service.run(
        "session-image-policy",
        userRequest,
        "http://localhost",
        undefined,
        [{
          refId: "image_selected",
          tag: "Image",
          selected: true,
          url: "https://example.com/product.png",
        }],
      ).stream()) events.push(event);

      const calls = events.filter(
        (event) => event.type === "tool_call" && event.tool === "generate_image",
      );
      expect(calls).toHaveLength(3);
      expect(receivedResearchInputs).toHaveLength(1);
      expect(receivedResearchInputs[0]).toMatchObject({
        search_depth: "advanced",
        include_images: true,
        search_scope: "visual_design",
      });
      expect(events.some(
        (event) => event.type === "tool_call" && event.id === "call-too-early",
      )).toBe(false);
      expect(JSON.stringify(requestBodies[1]?.messages)).toContain(
        "https://cloudflareimg.cdn.sn/i/research.jpg",
      );
      expect(publishedImageRequests).toContainEqual({
        source: "https://example.com/reference.jpg",
        forceRehost: true,
      });
      expect(calls.map((call) => call.input)).toEqual([
        {
          prompt: optimizedPrompt,
          platform: "taobao",
          quality: "hd",
          refImages: ["image_selected"],
        },
        {
          prompt: "纯白背景，产品正面棚拍",
          size: "1024x1024",
          quality: "high",
          refImages: ["image_selected"],
        },
        {
          prompt: userRequest,
          quality: "high",
          refImages: ["image_selected"],
        },
      ]);
      expect(receivedInputs).toEqual(calls.map((call) => call.input));
      expect(generationTrace.indexOf("settled:task-1")).toBeLessThan(
        generationTrace.indexOf("started:task-3"),
      );
      expect(events.filter((event) => event.type === "progress").map((event) => event.message)).toContain(
        "Media generation progress: 3/3",
      );
      const systemText = firstRequestBody.messages?.find((message: any) => message.role === "system")?.content;
      expect(systemText.length).toBeLessThan(5_500);
      expect(systemText).toContain("<active_tools>generate_image, web_search, web_extract</active_tools>");
      expect(systemText).toContain("<prompt_mode>optimize</prompt_mode>");
      expect(systemText).toContain("<research_mode>required</research_mode>");
      expect(systemText).toContain("run up to two focused visual-design searches");
      expect(firstRequestBody.tools.map((item: any) => item.function.name)).toEqual([
        "generate_image",
        "web_search",
        "web_extract",
      ]);
    } finally {
      tool.execute = originalExecute;
      researchTool.execute = originalResearchExecute;
    }
  });

  test("keeps a platform-default suite open for later distinct image calls", async () => {
    const scenarios = [
      {
        name: "inferred platform plan",
        request: "帮我生成这个产品的亚马逊套图",
        expectedExecutions: 3,
        expectExplicitLimitSkip: false,
      },
      {
        name: "explicit numeric limit",
        request: "帮我生成这个产品的 2 张亚马逊套图",
        expectedExecutions: 2,
        expectExplicitLimitSkip: true,
      },
    ];
    const tool = TOOL_MAP.get("generate_image")!;
    const originalExecute = tool.execute;

    try {
      for (const scenario of scenarios) {
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
            const chunks = requestCount === 1
              ? [
                  `data: ${JSON.stringify({
                    id: "chatcmpl-suite",
                    object: "chat.completion.chunk",
                    created: 1,
                    model: "test-model",
                    choices: [{
                      index: 0,
                      delta: {
                        role: "assistant",
                        tool_calls: [
                          ["call-main", "main"],
                          ["call-a-plus", "a_plus"],
                        ].map(([id, deliverable], index) => ({
                          index,
                          id,
                          type: "function",
                          function: {
                            name: "generate_image",
                            arguments: JSON.stringify({ deliverable }),
                          },
                        })),
                      },
                      finish_reason: null,
                    }],
                  })}`,
                  'data: {"id":"chatcmpl-suite","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                  "data: [DONE]",
                  "",
                ]
              : requestCount === 2
                ? [
                    `data: ${JSON.stringify({
                      id: "chatcmpl-suite-next",
                      object: "chat.completion.chunk",
                      created: 1,
                      model: "test-model",
                      choices: [{
                        index: 0,
                        delta: {
                          role: "assistant",
                          tool_calls: [{
                            index: 0,
                            id: "call-feature",
                            type: "function",
                            function: {
                              name: "generate_image",
                              arguments: JSON.stringify({ deliverable: "feature" }),
                            },
                          }],
                        },
                        finish_reason: null,
                      }],
                    })}`,
                    'data: {"id":"chatcmpl-suite-next","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
                    "data: [DONE]",
                    "",
                  ]
                : [
                  'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"完成。"},"finish_reason":null}]}',
                  'data: {"id":"chatcmpl-final","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
                  "data: [DONE]",
                  "",
                ];
            return new Response(chunks.join("\n\n"), {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            });
          },
          getTaskStatus: (taskId: string) => ({
            status: "success",
            imageUrl: `https://example.com/${taskId}.png`,
          }),
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

        const receivedInputs: any[] = [];
        tool.execute = async (input: any) => {
          receivedInputs.push(input);
          const sequence = receivedInputs.length;
          return {
            output: {
              refId: `img_${sequence}`,
              taskId: `task-${sequence}`,
              status: "generating",
            },
          };
        };

        const events: any[] = [];
        for await (const event of service.run(
          `session-suite-${scenario.expectedExecutions}`,
          scenario.request,
          "http://localhost",
          undefined,
          [{
            refId: "image_selected",
            tag: "Image",
            selected: true,
            url: "https://example.com/product.png",
          }],
        ).stream()) events.push(event);

        expect(receivedInputs, scenario.name).toHaveLength(scenario.expectedExecutions);
        expect(
          receivedInputs.map((input) => input.prompt),
          scenario.name,
        ).toEqual(
          scenario.expectedExecutions === 3
            ? ["生成主图", "生成亚马逊A+详情页", "生成功能图"]
            : ["生成主图", "生成亚马逊A+详情页"],
        );
        expect(
          events.some((event) =>
            event.type === "tool_result" &&
            event.output?.status === "skipped" &&
            String(event.output?.error).includes("User-specified image output limit")
          ),
          scenario.name,
        ).toBe(scenario.expectExplicitLimitSkip);
      }
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
    const sink = {
      emit: (event: any) => events.push(event),
      canvas: (op: any) => events.push({ type: "canvas_op", op }),
    };
    const ctx = {
      canvasState: [],
      newRefId: (prefix: string) => `${prefix}-1`,
      sink,
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
      sink,
    );

    expect(output).toMatchObject({
      status: "success",
      url: "https://example.com/final.png",
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "canvas_op",
        op: expect.objectContaining({
          op: "media_ready",
          refId: "image-live",
          url: "https://example.com/final.png",
        }),
      }),
    );
    expect(events).toContainEqual({
      type: "tool_result",
      id: "call-live",
      tool: "edit_image",
      output,
    });
  });
});

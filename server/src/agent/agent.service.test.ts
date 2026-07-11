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
});

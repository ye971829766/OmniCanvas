import { describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { buildAgentSdkTools } from "./sdk-tools";

describe("agent AI SDK tools", () => {
  test("registers ecommerce parameters through inputSchema", () => {
    const tools = buildAgentSdkTools(["plan_ecommerce_suite"]);
    const tool = tools.plan_ecommerce_suite as any;

    expect(tool.inputSchema.jsonSchema.properties.platforms.type).toBe("array");
    expect(tool.inputSchema.jsonSchema.properties.sourceAssetId.type).toBe(
      "string",
    );
    expect(tool.inputSchema.jsonSchema.required).toEqual([
      "platforms",
      "sourceAssetId",
    ]);
    expect(tool.parameters).toBeUndefined();
  });

  test("serializes the real schema into an OpenAI-compatible request", async () => {
    let requestBody: any;
    const provider = createOpenAI({
      apiKey: "test-key",
      baseURL: "http://example.invalid/v1",
      fetch: (async (_url: unknown, init: any) => {
        requestBody = JSON.parse(String(init?.body || "{}"));
        const chunks = [
          'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
          'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}',
          'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
          "data: [DONE]",
          "",
        ].join("\n\n");

        return new Response(chunks, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }) as any,
    });

    const result = streamText({
      model: provider.chat("test"),
      messages: [{ role: "user", content: "plan an Amazon image suite" }],
      tools: buildAgentSdkTools(["plan_ecommerce_suite"]),
    });
    await result.text;

    const schema = requestBody.tools[0].function.parameters;
    expect(schema.properties.platforms.items.enum).toEqual([
      "amazon",
      "taobao",
      "jd",
    ]);
    expect(schema.required).toEqual(["platforms", "sourceAssetId"]);
  });
});

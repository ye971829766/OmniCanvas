import { describe, expect, test } from "bun:test";
import {
  compactMessagesForModel,
  compactMessagesForPersistence,
} from "./message-context";

function queryMessage(id: string, nodeCount: number) {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: id,
        toolName: "query_canvas",
        output: {
          type: "json",
          value: {
            scope: "all",
            nodeCount,
            selectedRefIds: ["selected"],
            nodes: Array.from({ length: nodeCount }, (_, index) => ({
              refId: `node_${index}`,
              text: "x".repeat(500),
            })),
          },
        },
      },
    ],
  } as any;
}

function validationFailurePair(id: string) {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: id,
          toolName: "plan_ecommerce_suite",
          input: {},
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: id,
          toolName: "plan_ecommerce_suite",
          output: {
            type: "text",
            value: 'Validation error: Missing required parameter: "platforms"',
          },
        },
      ],
    },
  ] as any[];
}

describe("agent message context", () => {
  test("keeps only the latest canvas query detailed during a turn", () => {
    const messages = [queryMessage("old", 20), queryMessage("new", 2)];
    const compacted = compactMessagesForModel(messages) as any[];

    expect(compacted[0].content[0].output.value.nodes).toBeUndefined();
    expect(compacted[0].content[0].output.value.referencedNodeIds).toHaveLength(20);
    expect(compacted[1].content[0].output.value.nodes).toHaveLength(2);
  });

  test("keeps stable image URLs while compacting detailed canvas snapshots", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "edit this" },
          { type: "image", image: "https://example.com/image.png" },
        ],
      },
      queryMessage("query", 30),
    ] as any[];

    const compacted = compactMessagesForPersistence(messages) as any[];
    const serialized = JSON.stringify(compacted);

    expect(serialized).not.toContain("Visual Image Expired in History");
    expect(serialized).toContain("example.com/image.png");
    expect(compacted[1].content[0].output.value.nodes).toBeUndefined();
    expect(compacted[1].content[0].output.value.nodeCount).toBe(30);
  });

  test("drops unsafe embedded images from persistence", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "edit this" },
          { type: "image", image: "data:image/png;base64,AAAA" },
        ],
      },
    ] as any[];

    const compacted = compactMessagesForPersistence(messages) as any[];
    const serialized = JSON.stringify(compacted);

    expect(serialized).toContain("Visual Image Expired in History");
    expect(serialized).not.toContain("data:image/png;base64");
  });

  test("sends images only from the latest user message to the model", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "old reference" },
          { type: "image", image: "https://example.com/old.png" },
        ],
      },
      { role: "assistant", content: "done" },
      { role: "user", content: "continue without another image" },
    ] as any[];

    const compacted = compactMessagesForModel(messages) as any[];
    const serialized = JSON.stringify(compacted);

    expect(serialized).not.toContain("example.com/old.png");
    expect(serialized).toContain("Visual Image Expired in History");
  });

  test("handles undefined tool output without throwing", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "empty",
            toolName: "custom_tool",
            output: undefined,
          },
        ],
      },
    ] as any[];

    expect(() => compactMessagesForPersistence(messages)).not.toThrow();
  });

  test("collapses repeated validation-only tool failures", () => {
    const messages = [
      { role: "user", content: "make an Amazon image suite" },
      ...validationFailurePair("call_1"),
      ...validationFailurePair("call_2"),
      ...validationFailurePair("call_3"),
    ] as any[];

    const compactedForModel = compactMessagesForModel(messages) as any[];
    const compactedForPersistence = compactMessagesForPersistence(
      messages,
    ) as any[];

    expect(compactedForModel).toHaveLength(1);
    expect(compactedForPersistence).toHaveLength(3);
    expect(compactedForPersistence[1].content[0].toolCallId).toBe("call_1");
    expect(compactedForPersistence[2].content[0].toolCallId).toBe("call_1");
  });

  test("removes only the failed call from a mixed tool group", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "bad",
            toolName: "plan_ecommerce_suite",
            input: {},
          },
          {
            type: "tool-call",
            toolCallId: "good",
            toolName: "query_canvas",
            input: { scope: "all" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "bad",
            toolName: "plan_ecommerce_suite",
            output: {
              type: "text",
              value: 'Validation error: Missing required parameter: "platforms"',
            },
          },
        ],
      },
      queryMessage("good", 1),
    ] as any[];

    const compacted = compactMessagesForModel(messages) as any[];

    expect(compacted).toHaveLength(2);
    expect(compacted[0].content).toHaveLength(1);
    expect(compacted[0].content[0].toolCallId).toBe("good");
    expect(compacted[1].content[0].toolCallId).toBe("good");
  });
});

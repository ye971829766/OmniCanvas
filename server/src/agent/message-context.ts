import type { ModelMessage } from "ai";

const HISTORY_IMAGE_MARKER = "[Visual Image Expired in History]";
const LARGE_TOOL_RESULT_CHARS = 8_000;
const LARGE_TOOL_PREVIEW_CHARS = 1_500;
const RECENT_TOOL_MESSAGE_WINDOW = 8;

function safeJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : String(value);
  } catch {
    return String(value);
  }
}

function unwrapToolOutput(output: any): any {
  if (
    output &&
    typeof output === "object" &&
    (output.type === "json" || output.type === "text") &&
    "value" in output
  ) {
    return output.value;
  }
  return output;
}

function replaceToolOutput(part: any, value: unknown): any {
  const output = part.output;
  if (
    output &&
    typeof output === "object" &&
    (output.type === "json" || output.type === "text") &&
    "value" in output
  ) {
    return {
      ...part,
      output: {
        ...output,
        type: "json",
        value,
      },
    };
  }
  return { ...part, output: value };
}

function compactCanvasQuery(value: any) {
  const nodes = Array.isArray(value?.nodes) ? value.nodes : [];
  return {
    note: "Canvas node details omitted from retained context. Query the current canvas again before editing.",
    scope: value?.scope,
    nodeCount: value?.nodeCount,
    matchedCount: value?.matchedCount,
    returned: value?.returned,
    frame: value?.frame,
    countsByType: value?.countsByType,
    selectedRefIds: Array.isArray(value?.selectedRefIds)
      ? value.selectedRefIds.slice(0, 40)
      : undefined,
    referencedNodeIds: nodes
      .map((node: any) => node?.refId)
      .filter((refId: unknown): refId is string => typeof refId === "string")
      .slice(0, 40),
  };
}

function compactLargeToolResult(toolName: string, value: unknown) {
  const serialized = safeJson(value);
  return {
    note: `Large ${toolName || "tool"} result compacted for retained context.`,
    originalChars: serialized.length,
    preview: serialized.includes("data:")
      ? "[embedded media omitted]"
      : serialized.slice(0, LARGE_TOOL_PREVIEW_CHARS),
  };
}

function findLatestPartMessageIndex(
  messages: ModelMessage[],
  predicate: (part: any) => boolean,
): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as any;
    if (Array.isArray(message?.content) && message.content.some(predicate)) {
      return index;
    }
  }
  return -1;
}

function findLatestUserMessageIndex(messages: ModelMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function isStablePersistedImage(image: unknown): boolean {
  if (typeof image === "string") {
    const value = image.trim();
    return /^(?:https?:\/\/|\/files\/)/i.test(value);
  }

  if (image && typeof image === "object" && "href" in image) {
    return /^https?:\/\//i.test(String((image as { href?: unknown }).href ?? ""));
  }

  return false;
}

function validationFailureSignature(
  assistantMessage: ModelMessage,
  toolMessage: ModelMessage | undefined,
): string | null {
  if (assistantMessage.role !== "assistant" || toolMessage?.role !== "tool") {
    return null;
  }
  if (
    !Array.isArray((assistantMessage as any).content) ||
    !Array.isArray((toolMessage as any).content)
  ) {
    return null;
  }

  const calls = (assistantMessage as any).content.filter(
    (part: any) => part?.type === "tool-call",
  );
  const results = (toolMessage as any).content.filter(
    (part: any) => part?.type === "tool-result",
  );
  if (calls.length === 0 || calls.length !== results.length) return null;

  const signatures: string[] = [];
  for (const call of calls) {
    const result = results.find(
      (part: any) =>
        part.toolCallId === call.toolCallId && part.toolName === call.toolName,
    );
    const value = result ? unwrapToolOutput(result.output) : undefined;
    if (typeof value !== "string" || !value.startsWith("Validation error:")) {
      return null;
    }
    signatures.push(`${call.toolName}:${value}`);
  }

  return signatures.join("|");
}

function collapseRepeatedValidationFailures(
  messages: ModelMessage[],
): ModelMessage[] {
  const compacted: ModelMessage[] = [];
  let previousSignature: string | null = null;

  for (let index = 0; index < messages.length; index++) {
    const assistantMessage = messages[index]!;
    const toolMessage = messages[index + 1];
    const signature = validationFailureSignature(assistantMessage, toolMessage);

    if (signature) {
      if (signature !== previousSignature) {
        compacted.push(assistantMessage, toolMessage!);
      }
      previousSignature = signature;
      index += 1;
      continue;
    }

    compacted.push(assistantMessage);
    previousSignature = null;
  }

  return compacted;
}

function stripValidationOnlyToolGroups(
  messages: ModelMessage[],
): ModelMessage[] {
  const compacted: ModelMessage[] = [];

  for (let index = 0; index < messages.length; index++) {
    const assistantMessage = messages[index] as any;
    if (
      assistantMessage?.role !== "assistant" ||
      !Array.isArray(assistantMessage.content)
    ) {
      compacted.push(messages[index]!);
      continue;
    }

    const calls = assistantMessage.content.filter(
      (part: any) => part?.type === "tool-call",
    );
    if (calls.length === 0) {
      compacted.push(messages[index]!);
      continue;
    }

    const followingToolMessages: ModelMessage[] = [];
    let nextIndex = index + 1;
    while (nextIndex < messages.length && messages[nextIndex]?.role === "tool") {
      followingToolMessages.push(messages[nextIndex]!);
      nextIndex += 1;
    }

    const resultParts = followingToolMessages.flatMap((message: any) =>
      Array.isArray(message.content)
        ? message.content.filter((part: any) => part?.type === "tool-result")
        : [],
    );
    const validationFailureIds = new Set(
      calls
        .filter((call: any) => {
          const result = resultParts.find(
            (part: any) =>
              part.toolCallId === call.toolCallId &&
              part.toolName === call.toolName,
          );
          const value = result ? unwrapToolOutput(result.output) : undefined;
          return (
            typeof value === "string" && value.startsWith("Validation error:")
          );
        })
        .map((call: any) => call.toolCallId),
    );

    if (validationFailureIds.size === calls.length) {
      index = nextIndex - 1;
      continue;
    }

    if (validationFailureIds.size > 0) {
      compacted.push({
        ...assistantMessage,
        content: assistantMessage.content.filter(
          (part: any) =>
            part?.type !== "tool-call" ||
            !validationFailureIds.has(part.toolCallId),
        ),
      });
      for (const message of followingToolMessages as any[]) {
        const content = message.content.filter(
          (part: any) =>
            part?.type !== "tool-result" ||
            !validationFailureIds.has(part.toolCallId),
        );
        if (content.length > 0) compacted.push({ ...message, content });
      }
      index = nextIndex - 1;
      continue;
    }

    compacted.push(messages[index]!, ...followingToolMessages);
    index = nextIndex - 1;
  }

  return compacted;
}

function compactMessages(
  messages: ModelMessage[],
  mode: "working" | "persistence",
): ModelMessage[] {
  const deduplicatedMessages = collapseRepeatedValidationFailures(messages);
  const latestImageIndex = findLatestPartMessageIndex(
    deduplicatedMessages,
    (part) => part?.type === "image",
  );
  const latestUserMessageIndex = findLatestUserMessageIndex(
    deduplicatedMessages,
  );
  const latestCanvasQueryIndex = findLatestPartMessageIndex(
    deduplicatedMessages,
    (part) => part?.type === "tool-result" && part?.toolName === "query_canvas",
  );

  return deduplicatedMessages.map((message, messageIndex) => {
    if (!Array.isArray((message as any).content)) return message;

    let omittedImage = false;
    const content = (message as any).content
      .map((part: any) => {
        if (part?.type === "image") {
          if (
            mode === "working" &&
            messageIndex === latestUserMessageIndex &&
            messageIndex === latestImageIndex
          ) {
            return part;
          }
          if (mode === "persistence" && isStablePersistedImage(part.image)) {
            return part;
          }
          omittedImage = true;
          return null;
        }
        if (part?.type !== "tool-result") return part;

        const value = unwrapToolOutput(part.output);
        if (part.toolName === "query_canvas") {
          if (mode === "working" && messageIndex === latestCanvasQueryIndex) {
            return part;
          }
          return replaceToolOutput(part, compactCanvasQuery(value));
        }

        const shouldCompactLargeResult =
          safeJson(value).length > LARGE_TOOL_RESULT_CHARS &&
          (mode === "persistence" ||
            messageIndex <
              deduplicatedMessages.length - RECENT_TOOL_MESSAGE_WINDOW);
        if (shouldCompactLargeResult) {
          return replaceToolOutput(
            part,
            compactLargeToolResult(part.toolName, value),
          );
        }
        return part;
      })
      .filter(Boolean);

    if (omittedImage) {
      content.push({ type: "text", text: HISTORY_IMAGE_MARKER });
    }
    return { ...(message as any), content } as ModelMessage;
  });
}

export function compactMessagesForModel(
  messages: ModelMessage[],
): ModelMessage[] {
  return compactMessages(stripValidationOnlyToolGroups(messages), "working");
}

export function compactMessagesForPersistence(
  messages: ModelMessage[],
): ModelMessage[] {
  return compactMessages(messages, "persistence");
}

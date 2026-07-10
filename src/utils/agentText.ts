const COMPLETE_THINK_BLOCK =
  /<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/gi;
const OPEN_THINK_TAG = /<think(?:ing)?\b[^>]*>/i;
const ANY_THINK_TAG = /<\/?think(?:ing)?\b[^>]*>/gi;
const OPEN_TAG_PREFIXES = ["<think", "<thinking"];
const CLOSE_TAG_PREFIXES = ["</think", "</thinking"];

export function stripHiddenReasoning(text: string): string {
  if (!text) return "";

  let cleaned = text.replace(COMPLETE_THINK_BLOCK, "");
  const unclosed = cleaned.search(OPEN_THINK_TAG);
  if (unclosed >= 0) cleaned = cleaned.slice(0, unclosed);

  return cleaned.replace(ANY_THINK_TAG, "");
}

function partialTagLength(value: string, prefixes: string[]): number {
  const lower = value.toLowerCase();
  let max = 0;
  for (const prefix of prefixes) {
    const limit = Math.min(prefix.length - 1, lower.length);
    for (let length = 1; length <= limit; length++) {
      if (lower.endsWith(prefix.slice(0, length))) max = Math.max(max, length);
    }
  }
  return max;
}

export interface HiddenReasoningStreamFilter {
  push(chunk: string): string;
  flush(): string;
}

export function createHiddenReasoningStreamFilter(): HiddenReasoningStreamFilter {
  let buffer = "";
  let hidden = false;

  const consume = (flush = false) => {
    let visible = "";

    while (buffer) {
      if (hidden) {
        const closeMatch = /<\/think(?:ing)?\s*>/i.exec(buffer);
        if (closeMatch) {
          buffer = buffer.slice(closeMatch.index + closeMatch[0].length);
          hidden = false;
          continue;
        }

        if (flush) {
          buffer = "";
        } else {
          const keep = partialTagLength(buffer, CLOSE_TAG_PREFIXES);
          buffer = keep ? buffer.slice(-keep) : "";
        }
        break;
      }

      const openMatch = OPEN_THINK_TAG.exec(buffer);
      if (openMatch) {
        visible += buffer.slice(0, openMatch.index);
        buffer = buffer.slice(openMatch.index + openMatch[0].length);
        hidden = true;
        continue;
      }

      if (flush) {
        visible += buffer;
        buffer = "";
      } else {
        const keep = partialTagLength(buffer, OPEN_TAG_PREFIXES);
        const emitLength = buffer.length - keep;
        if (emitLength > 0) visible += buffer.slice(0, emitLength);
        buffer = keep ? buffer.slice(-keep) : "";
      }
      break;
    }

    return visible.replace(ANY_THINK_TAG, "");
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      return consume(false);
    },
    flush() {
      return consume(true);
    },
  };
}

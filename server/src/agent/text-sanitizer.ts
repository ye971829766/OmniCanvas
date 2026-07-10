const OPEN_TAG = /<think(?:ing)?\b[^>]*>/i;
const ANY_TAG = /<\/?think(?:ing)?\b[^>]*>/gi;
const OPEN_PREFIXES = ["<think", "<thinking"];
const CLOSE_PREFIXES = ["</think", "</thinking"];

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

export function stripHiddenReasoning(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(
    /<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/gi,
    "",
  );
  const unclosed = cleaned.search(OPEN_TAG);
  if (unclosed >= 0) cleaned = cleaned.slice(0, unclosed);
  return cleaned.replace(ANY_TAG, "");
}

export class HiddenReasoningStreamFilter {
  private buffer = "";
  private hidden = false;

  push(chunk: string): string {
    this.buffer += chunk;
    return this.consume(false);
  }

  flush(): string {
    return this.consume(true);
  }

  private consume(flush: boolean): string {
    let visible = "";

    while (this.buffer) {
      if (this.hidden) {
        const closeMatch = /<\/think(?:ing)?\s*>/i.exec(this.buffer);
        if (closeMatch) {
          this.buffer = this.buffer.slice(
            closeMatch.index + closeMatch[0].length,
          );
          this.hidden = false;
          continue;
        }

        if (flush) {
          this.buffer = "";
        } else {
          const keep = partialTagLength(this.buffer, CLOSE_PREFIXES);
          this.buffer = keep ? this.buffer.slice(-keep) : "";
        }
        break;
      }

      const openMatch = OPEN_TAG.exec(this.buffer);
      if (openMatch) {
        visible += this.buffer.slice(0, openMatch.index);
        this.buffer = this.buffer.slice(
          openMatch.index + openMatch[0].length,
        );
        this.hidden = true;
        continue;
      }

      if (flush) {
        visible += this.buffer;
        this.buffer = "";
      } else {
        const keep = partialTagLength(this.buffer, OPEN_PREFIXES);
        const emitLength = this.buffer.length - keep;
        if (emitLength > 0) visible += this.buffer.slice(0, emitLength);
        this.buffer = keep ? this.buffer.slice(-keep) : "";
      }
      break;
    }

    return visible.replace(ANY_TAG, "");
  }
}

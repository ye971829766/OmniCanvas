import type { Directive, DirectiveBinding } from "vue";

/**
 * v-streaming-dot directive
 *
 * When the binding value is `true`, inserts a pulsing dot <span> right after
 * the deepest last text node inside the element, and keeps it updated via
 * MutationObserver so it follows the typewriter cursor in real-time.
 *
 * Usage:  <div v-streaming-dot="isStreaming" class="markdown-body"> ... </div>
 */

const DOT_CLASS = "streaming-cursor-dot";

interface StreamingDotState {
  observer: MutationObserver | null;
  dot: HTMLSpanElement | null;
  raf: number | null;
}

const stateMap = new WeakMap<HTMLElement, StreamingDotState>();

/**
 * Walk the DOM tree to find the deepest last text node (or inline element
 * containing text) that is *not* our own dot element.
 */
function findDeepestLastTextNode(
  root: Node,
): { textNode: Text; parent: Node } | null {
  // Walk backwards through children
  for (let i = root.childNodes.length - 1; i >= 0; i--) {
    const child = root.childNodes[i];

    // Skip our own dot
    if (
      child instanceof HTMLElement &&
      child.classList.contains(DOT_CLASS)
    ) {
      continue;
    }

    // If it's a text node with actual content, return it
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      return { textNode: child as Text, parent: root };
    }

    // Recurse into element children
    if (child.nodeType === Node.ELEMENT_NODE) {
      const result = findDeepestLastTextNode(child);
      if (result) return result;
    }
  }

  return null;
}

function createDot(): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.className = DOT_CLASS;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

function positionDot(el: HTMLElement) {
  const state = stateMap.get(el);
  if (!state) return;

  const result = findDeepestLastTextNode(el);
  if (!result) {
    // No text content yet – hide dot
    state.dot?.remove();
    return;
  }

  const { textNode, parent } = result;

  if (!state.dot) {
    state.dot = createDot();
  }

  const dot = state.dot;

  // Insert the dot right after the text node inside its parent
  const nextSibling = textNode.nextSibling;

  // Check if dot is already in the correct position
  if (nextSibling === dot) return;

  // If dot is the next non-dot sibling, skip
  if (nextSibling && nextSibling !== dot) {
    parent.insertBefore(dot, nextSibling);
  } else {
    parent.appendChild(dot);
  }
}

function startObserving(el: HTMLElement) {
  let state = stateMap.get(el);
  if (!state) {
    state = { observer: null, dot: null, raf: null };
    stateMap.set(el, state);
  }

  // Clean up old observer if any
  stopObserving(el);

  state.dot = createDot();

  // Position dot initially
  positionDot(el);

  // Observe mutations to reposition
  state.observer = new MutationObserver(() => {
    // Debounce with rAF to avoid excessive repositioning
    if (state!.raf) cancelAnimationFrame(state!.raf);
    state!.raf = requestAnimationFrame(() => {
      positionDot(el);
    });
  });

  state.observer.observe(el, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function stopObserving(el: HTMLElement) {
  const state = stateMap.get(el);
  if (!state) return;

  if (state.raf) {
    cancelAnimationFrame(state.raf);
    state.raf = null;
  }

  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }

  if (state.dot) {
    state.dot.remove();
    state.dot = null;
  }
}

export const vStreamingDot: Directive<HTMLElement, boolean> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<boolean>) {
    if (binding.value) {
      startObserving(el);
    }
  },

  updated(el: HTMLElement, binding: DirectiveBinding<boolean>) {
    if (binding.value && !binding.oldValue) {
      startObserving(el);
    } else if (!binding.value && binding.oldValue) {
      stopObserving(el);
    }
  },

  unmounted(el: HTMLElement) {
    stopObserving(el);
    stateMap.delete(el);
  },
};

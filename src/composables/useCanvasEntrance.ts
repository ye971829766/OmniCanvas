import { watch, type ShallowRef } from "vue";
import type { App as LeaferApp } from "leafer-ui";

/**
 * A2 · Element entrance animations
 *
 * Hooks into Leafer's ChildEvent.ADD to play a spring scale + opacity
 * entrance on every new element added by the AI agent.
 * Works with @leafer-in/animate (already in the project).
 */
export function useCanvasEntrance(
  leaferApp: ShallowRef<LeaferApp | null>,
) {
  let cleanup: (() => void) | null = null;

  function attach(app: LeaferApp) {
    const { ChildEvent } = (window as any).__leafer_exports__ ?? {};
    // Leafer's ChildEvent is re-exported from leafer-ui
    // We import it via a dynamic side-effect import instead

    // Listen for nodes added to the tree
    const handler = (event: any) => {
      const node = event.target ?? event.child;
      if (!node || node.tag === "App" || node.tag === "Leafer") return;
      if (!node.__animateEntrance && !node.__isAgentPlaced) return;

      animateEntrance(node);
    };

    (app.tree as any).on("child.add", handler);
    cleanup = () => (app.tree as any).off("child.add", handler);
  }

  function animateEntrance(node: any) {
    if (!node || typeof node.set !== "function") return;
    delete node.__animateEntrance;
    delete node.__isAgentPlaced;

    // Record original values
    const originalScale  = node.scaleX ?? 1;
    const originalOpacity = node.opacity ?? 1;

    // Start from invisible + scaled down
    node.set({ scaleX: originalScale * 0.85, scaleY: originalScale * 0.85, opacity: 0 });

    // Animate in using Leafer's built-in animate (from @leafer-in/animate)
    if (typeof node.animate === "function") {
      node.animate(
        {
          scaleX:  originalScale,
          scaleY:  originalScale,
          opacity: originalOpacity,
        },
        {
          duration: 0.5,
          // easing string supported by Leafer animate
          easing: "spring(200, 20)",
        },
      );
    } else {
      // Fallback: manual rAF tween when animate plugin isn't loaded
      const start = performance.now();
      const duration = 500;

      function tick() {
        const t = Math.min((performance.now() - start) / duration, 1);
        const easedT = easeOutExpo(t);
        node.set({
          scaleX:  lerp(originalScale * 0.85, originalScale, easedT),
          scaleY:  lerp(originalScale * 0.85, originalScale, easedT),
          opacity: lerp(0, originalOpacity, easedT),
        });
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }

  function easeOutExpo(t: number) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  // Wire up when app becomes available
  watch(leaferApp, (app) => {
    cleanup?.();
    cleanup = null;
    if (app) attach(app);
  }, { immediate: true });

  return {};
}

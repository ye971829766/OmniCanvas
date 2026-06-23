/**
 * Performance optimization utility for large canvas scenes
 */
export class CanvasPerformance {
  private rafId: number | null = null;
  private callbacks: Set<() => void> = new Set();

  /**
   * Batch multiple updates into a single animation frame
   */
  scheduleUpdate(callback: () => void): void {
    this.callbacks.add(callback);
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.callbacks.forEach((cb) => cb());
        this.callbacks.clear();
        this.rafId = null;
      });
    }
  }

  /**
   * Cancel all pending updates
   */
  cancelUpdates(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.clear();
  }
}

/**
 * Debounce utility with cancellation support
 */
export function useDebouncedFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): { exec: T; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const exec = ((...args: Parameters<T>) => {
    cancel();
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as T;

  return { exec, cancel };
}

/**
 * Throttle utility for high-frequency events
 */
export function useThrottledFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return fn(...args);
    }
  }) as T;
}

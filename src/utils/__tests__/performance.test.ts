import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDebouncedFn, useThrottledFn } from '@/utils/performance';

describe('Performance Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useDebouncedFn', () => {
    it('should debounce function calls', () => {
      const fn = vi.fn();
      const { exec } = useDebouncedFn(fn, 100);

      exec();
      exec();
      exec();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should cancel pending calls', () => {
      const fn = vi.fn();
      const { exec, cancel } = useDebouncedFn(fn, 100);

      exec();
      cancel();
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('useThrottledFn', () => {
    it('should throttle function calls', () => {
      const fn = vi.fn();
      const throttled = useThrottledFn(fn, 100);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      throttled();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});

// Tests for TTS Queue module

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ttsQueue } from '../../scripts/api/tts-queue.js';

// Mock logging
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn()
}));

describe('api/tts-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset queue state
    ttsQueue.queue = [];
    ttsQueue.processing = false;
    ttsQueue.activeRequests = 0;
  });

  describe('TTSQueue', () => {
    it('should process single request', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      
      const result = await ttsQueue.add(fn);
      
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(ttsQueue.queue.length).toBe(0);
      expect(ttsQueue.processing).toBe(false);
    });

    it('should process requests sequentially', async () => {
      const callOrder = [];
      const fn1 = vi.fn(async () => {
        callOrder.push(1);
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result1';
      });
      const fn2 = vi.fn(async () => {
        callOrder.push(2);
        return 'result2';
      });
      
      const promise1 = ttsQueue.add(fn1);
      const promise2 = ttsQueue.add(fn2);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(callOrder).toEqual([1, 2]); // Should be sequential
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should handle request errors', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      
      await expect(ttsQueue.add(fn)).rejects.toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track active requests', async () => {
      const fn = vi.fn(async () => {
        expect(ttsQueue.activeRequests).toBe(1);
        return 'result';
      });
      
      await ttsQueue.add(fn);
      
      expect(ttsQueue.activeRequests).toBe(0);
    });

    it('should get queue status', () => {
      ttsQueue.queue = [{ fn: () => {}, resolve: () => {}, reject: () => {} }];
      ttsQueue.processing = true;
      ttsQueue.activeRequests = 1;
      
      const status = ttsQueue.getStatus();
      
      expect(status).toEqual({
        queueLength: 1,
        processing: true,
        activeRequests: 1
      });
    });

    it('should process multiple requests in order', async () => {
      const results = [];
      const fn1 = vi.fn(async () => {
        results.push(1);
        return 1;
      });
      const fn2 = vi.fn(async () => {
        results.push(2);
        return 2;
      });
      const fn3 = vi.fn(async () => {
        results.push(3);
        return 3;
      });
      
      const promise1 = ttsQueue.add(fn1);
      const promise2 = ttsQueue.add(fn2);
      const promise3 = ttsQueue.add(fn3);
      
      const [r1, r2, r3] = await Promise.all([promise1, promise2, promise3]);
      
      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);
      expect(results).toEqual([1, 2, 3]); // Should be in order
    });

    it('should handle concurrent requests correctly', async () => {
      const callOrder = [];
      const fn1 = vi.fn(async () => {
        callOrder.push(1);
        return 'result1';
      });
      const fn2 = vi.fn(async () => {
        callOrder.push(2);
        return 'result2';
      });
      
      // Add both requests at the same time
      const [result1, result2] = await Promise.all([
        ttsQueue.add(fn1),
        ttsQueue.add(fn2)
      ]);
      
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      // Both should have been called, but sequentially
      expect(callOrder).toEqual([1, 2]);
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should not process if already processing', async () => {
      const fn1 = vi.fn(async () => {
        // While this is running, queue should be processing
        expect(ttsQueue.processing).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result1';
      });
      const fn2 = vi.fn().mockResolvedValue('result2');
      
      const promise1 = ttsQueue.add(fn1);
      const promise2 = ttsQueue.add(fn2);
      
      await Promise.all([promise1, promise2]);
      
      expect(ttsQueue.processing).toBe(false);
    });
  });
});


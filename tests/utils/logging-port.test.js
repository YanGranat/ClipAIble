import { afterEach, expect, it, vi } from 'vitest';
import { logViaPort } from '../../scripts/utils/logging/logging-port.js';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('preserves diagnostic severity in the actual port batch', async () => {
  vi.useFakeTimers();
  const postMessage = vi.fn();
  const port = { postMessage, onDisconnect: { addListener: vi.fn() } };
  vi.stubGlobal('chrome', { runtime: { connect: vi.fn(() => port) } });
  logViaPort('PDF parsing failed', 'PDF_ERROR', { pageNum: 7 }, 'error');
  await vi.advanceTimersByTimeAsync(50);
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ logs: [expect.objectContaining({
    message: 'PDF parsing failed', level: 'error', data: { pageNum: 7 }
  })] }));
});

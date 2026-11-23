import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('preserves diagnostic severity in the actual port batch', async () => {
  vi.resetModules();
  const { logViaPort } = await import('../../scripts/utils/logging/logging-port.js');
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

it('flushes queued records when the same scheduled attempt reconnects', async () => {
  vi.resetModules();
  const { logViaPort } = await import('../../scripts/utils/logging/logging-port.js');
  vi.useFakeTimers();
  const first = { postMessage: vi.fn(), onDisconnect: { addListener: vi.fn() } };
  const replacement = { postMessage: vi.fn(), onDisconnect: { addListener: vi.fn() } };
  const connect = vi.fn().mockReturnValueOnce(first).mockReturnValue(replacement);
  vi.stubGlobal('chrome', { runtime: { connect } });

  logViaPort('Pending diagnostic');
  first.onDisconnect.addListener.mock.calls[0][0]();
  await vi.advanceTimersByTimeAsync(50);

  expect(connect).toHaveBeenCalledTimes(2);
  expect(first.postMessage).not.toHaveBeenCalled();
  expect(replacement.postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    logs: [expect.objectContaining({ message: 'Pending diagnostic' })]
  }));
});

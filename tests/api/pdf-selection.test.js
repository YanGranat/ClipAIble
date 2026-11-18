import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestPdfFileSelectionViaMessage } from '../../scripts/api/pdf-selection.js';
import { beginPdfOperation, takePdfOperationBlob, removePdfOperation } from '../../scripts/api/pdf-operation-storage.js';
vi.mock('../../scripts/api/pdf-operation-storage.js', () => ({ beginPdfOperation: vi.fn(), takePdfOperationBlob: vi.fn(), removePdfOperation: vi.fn() }));
const bytes = new TextEncoder().encode('%PDF-1.7\nSample').buffer;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  beginPdfOperation.mockResolvedValue(); removePdfOperation.mockResolvedValue();
  takePdfOperationBlob.mockResolvedValue(new Blob([bytes], { type: 'application/pdf' }));
});
afterEach(() => vi.useRealTimers());

it('exchanges only an owned reference, consumes it once, and releases the request', async () => {
  let packet;
  chrome.runtime.sendMessage.mockImplementation((message, reply) => { packet = message; reply({ success: true, ref: `${message.operationId}:0` }); });
  const result = await requestPdfFileSelectionViaMessage('file:///sample.pdf', { processingRunId: 'owner-a' });
  expect(new Uint8Array(result)).toEqual(new Uint8Array(bytes));
  expect(packet).toEqual({ action: 'selectPdfFile', expectedPdfUrl: 'file:///sample.pdf', operationId: expect.any(String), processingRunId: 'owner-a' });
  expect(takePdfOperationBlob).toHaveBeenCalledExactlyOnceWith(`${packet.operationId}:0`, 'owner-a', 'selection');
  expect(removePdfOperation).toHaveBeenCalledWith(packet.operationId);
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects an unrelated reference without consuming its bytes', async () => {
  chrome.runtime.sendMessage.mockImplementation((_message, reply) => reply({ success: true, ref: '00000000-0000-4000-8000-000000000099:0' }));
  await expect(requestPdfFileSelectionViaMessage('file:///sample.pdf')).rejects.toMatchObject({ translationKey: 'errorPdfDataUnavailable' });
  expect(takePdfOperationBlob).not.toHaveBeenCalled();
});

it('cancels an unanswered OS picker and removes a late-created request', async () => {
  let admit;
  beginPdfOperation.mockImplementation(() => new Promise(resolve => { admit = resolve; }));
  const controller = new AbortController();
  const failure = new DOMException('Cancelled', 'AbortError');
  const pending = requestPdfFileSelectionViaMessage('file:///sample.pdf', { signal: controller.signal }).catch(error => error);
  await vi.waitFor(() => expect(admit).toBeTypeOf('function'));
  controller.abort(failure);
  expect(await pending).toBe(failure);
  admit();
  await vi.advanceTimersByTimeAsync(1);
  expect(removePdfOperation.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('discards a picker reply that arrives after cancellation without consuming another job', async () => {
  let reply;
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => { reply = callback; });
  const controller = new AbortController();
  const pending = requestPdfFileSelectionViaMessage('file:///sample.pdf', { processingRunId: 'owner-a', signal: controller.signal }).catch(error => error);
  await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
  controller.abort(); await pending;
  reply({ success: true, ref: '00000000-0000-4000-8000-000000000099:0' });
  await vi.advanceTimersByTimeAsync(1);
  expect(takePdfOperationBlob).not.toHaveBeenCalled();
  expect(new Set(removePdfOperation.mock.calls.map(([id]) => id)).size).toBe(1);
});

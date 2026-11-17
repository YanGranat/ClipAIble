import { CONFIG } from '../../utils/config.js';
import { createPdfError } from '../../utils/pdf-errors.js';
import { destroyPdfDocument } from './core/pdf-loader.js';

const active = new Map();
const cancelled = new Map();

function cancellationError() {
  return Object.assign(createPdfError('PDF rendering cancelled', 'statusCancelled'), { name: 'AbortError' });
}

export function startPdfRender(operationId) {
  const controller = new AbortController();
  let pdf;
  let renderTask;
  let disposal;
  const operation = {
    signal: controller.signal,
    check() { if (controller.signal.aborted) throw controller.signal.reason; },
    adopt(document) { pdf = document; operation.check(); },
    track(task) {
      renderTask = task;
      if (controller.signal.aborted) {
        try { task.cancel(); } catch {}
        void task.promise.catch(() => {});
      }
      operation.check();
    },
    cancel() { controller.abort(cancellationError()); },
    finish() {
      if (!disposal) disposal = destroyPdfDocument(pdf).finally(() => {
        if (active.get(operationId) === operation) active.delete(operationId);
      });
      return disposal;
    }
  };
  controller.signal.addEventListener('abort', () => {
    try { renderTask?.cancel(); } catch {}
    if (pdf) void destroyPdfDocument(pdf);
  }, { once: true });
  if (operationId) {
    if (active.has(operationId)) controller.abort(createPdfError('PDF render request already exists', 'errorPdfRenderFailed'));
    else {
      active.set(operationId, operation);
      if (cancelled.has(operationId)) {
        clearTimeout(cancelled.get(operationId));
        cancelled.delete(operationId);
        operation.cancel();
      }
    }
  }
  return operation;
}

export function cancelPdfRender(operationId) {
  if (!operationId) return;
  const operation = active.get(operationId);
  if (operation) operation.cancel();
  else if (!cancelled.has(operationId)) {
    const timer = setTimeout(() => cancelled.delete(operationId), CONFIG.PDF_PARSE_TIMEOUT_MS);
    cancelled.set(operationId, timer);
  }
}

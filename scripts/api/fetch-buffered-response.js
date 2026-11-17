import { CONFIG } from '../utils/config.js';

// Read a non-streaming HTTP response within one request deadline.
export async function fetchBufferedResponse(url, options = {}, timeoutMs = CONFIG.API_TIMEOUT_MS, requestOptions = {}) {
  const controller = new AbortController();
  const parentSignal = options.signal;
  let response;
  let rejectCancellation;
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = reason => {
    const error = reason instanceof Error ? reason : new DOMException('Request cancelled', 'AbortError');
    controller.abort(error);
    response?.body?.cancel().catch(() => {});
    rejectCancellation(error);
  };
  const onParentAbort = () => abort(parentSignal.reason);
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(() => abort(new DOMException('Request timed out', 'AbortError')), timeoutMs);
  try {
    const operation = (async () => {
      await requestOptions.checkCancelled?.();
      if (parentSignal?.aborted) throw parentSignal.reason instanceof Error ? parentSignal.reason : new DOMException('Request cancelled', 'AbortError');
      response = await fetch(url, { ...options, signal: controller.signal });
      await requestOptions.checkCancelled?.();
      const body = await response.blob();
      await requestOptions.checkCancelled?.();
      if (controller.signal.aborted) throw controller.signal.reason;
      return new Response([204, 205, 304].includes(response.status) ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    })();
    return await Promise.race([operation, cancellation]);
  } catch (error) {
    controller.abort(error);
    response?.body?.cancel().catch(() => {});
    await requestOptions.checkCancelled?.();
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

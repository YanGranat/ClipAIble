import { CONFIG } from '../utils/config.js';

/**
 * Read a non-streaming HTTP response within one request deadline.
 * @param {RequestInfo | URL} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @param {import('../types.js').AIRequestOptions} [requestOptions]
 * @returns {Promise<Response>}
 */
export async function fetchBufferedResponse(url, options = {}, timeoutMs = CONFIG.API_TIMEOUT_MS, requestOptions = {}) {
  const controller = new AbortController();
  const parentSignals = [...new Set([options.signal, requestOptions.signal].filter(Boolean))];
  /** @type {Response | undefined} */
  let response;
  let rejectCancellation;
  /** @type {Promise<never>} */
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = reason => {
    const error = reason instanceof Error ? reason : new DOMException('Request cancelled', 'AbortError');
    controller.abort(error);
    response?.body?.cancel().catch(() => {});
    rejectCancellation(error);
  };
  const parentListeners = parentSignals.map(signal => {
    const listener = () => abort(signal.reason);
    signal.addEventListener('abort', listener, { once: true });
    return { signal, listener };
  });
  const timeout = setTimeout(() => abort(Object.assign(new DOMException('Request timed out', 'TimeoutError'), {
    translationKey: 'errorTimeout', translationParams: {}, retryable: false
  })), timeoutMs);
  let checking = false;
  const poll = requestOptions.checkCancelled ? setInterval(async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try { await requestOptions.checkCancelled(); } catch (error) { abort(error); }
    finally { checking = false; }
  }, 50) : undefined;
  try {
    const operation = (async () => {
      await requestOptions.checkCancelled?.();
      const aborted = parentSignals.find(signal => signal.aborted);
      if (aborted) throw aborted.reason instanceof Error ? aborted.reason : new DOMException('Request cancelled', 'AbortError');
      requestOptions.onRequestStart?.();
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
    if (!controller.signal.aborted) {
      await Promise.race([Promise.resolve().then(() => requestOptions.checkCancelled?.()), cancellation]);
    }
    controller.abort(error);
    response?.body?.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(poll);
    for (const { signal, listener } of parentListeners) signal.removeEventListener('abort', listener);
  }
}

// @ts-check
import { CONFIG } from './config.js';
import { createApiError } from '../api/http-errors.js';

const exhaustedErrors = new WeakSet();
const terminalCodes = new Set(['AI_RESPONSE_TRUNCATED', 'AI_RESPONSE_REFUSED', 'AI_RESPONSE_INCOMPLETE', 'AI_TRANSLATION_INVALID']);

function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : new DOMException('Request cancelled', 'AbortError');
}
function timeoutError() {
  return Object.assign(new DOMException('Request deadline exceeded', 'TimeoutError'), {
    translationKey: 'errorTimeout', translationParams: {}, retryable: false
  });
}
async function checkActive(options) {
  if (options.signal?.aborted) throw abortError(options.signal);
  await options.checkCancelled?.();
  if (options.signal?.aborted) throw abortError(options.signal);
}
function terminal(error) {
  return error?.name === 'AbortError' || error?.retryable === false || error?.retryExhausted === true ||
    terminalCodes.has(error?.code) || (error && typeof error === 'object' && exhaustedErrors.has(error));
}
function defaultRetry(error, statuses) {
  if (terminal(error)) return false;
  if (error?.retryable === true) return true;
  const status = error?.status || error?.statusCode || error?.response?.status;
  if (status) return statuses.includes(status);
  return CONFIG.RETRY_NETWORK_ERRORS && (error instanceof TypeError || error?.name === 'NetworkError' ||
    ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error?.code));
}
function exhaust(error) {
  if (error && typeof error === 'object') {
    exhaustedErrors.add(error);
    try { error.retryExhausted = true; } catch {}
  }
  return error;
}
/** One cancellable wait owns its timer and abort listener. */
function waitFor(ms, options) {
  return new Promise((resolve, reject) => {
    let done = false, checking = false;
    const finish = error => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      options.signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(abortError(options.signal));
    const timer = setTimeout(() => finish(), ms);
    const poll = options.checkCancelled ? setInterval(async () => {
      if (checking || done) return;
      checking = true;
      try { await checkActive(options); } catch (error) { finish(error); }
      finally { checking = false; }
    }, 50) : undefined;
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  });
}
/** A transport owns retries for its complete HTTP response, within one deadline. */
export async function callWithRetry(fn, options = {}) {
  const retries = options.maxRetries ?? CONFIG.RETRY_MAX_ATTEMPTS;
  const delays = options.delays || CONFIG.RETRY_DELAYS;
  const statuses = options.retryableStatusCodes || CONFIG.RETRYABLE_STATUS_CODES;
  const maximumDelay = options.maxDelayMs ?? CONFIG.RETRY_MAX_DELAY_MS ?? 60000;
  const budget = options.timeoutMs ?? CONFIG.RETRY_TIMEOUT_MS ?? 600000;
  if (!Number.isInteger(retries) || retries < 0 || !Number.isFinite(budget) || budget <= 0) throw new TypeError('Invalid retry configuration');
  const controller = new AbortController();
  const deadline = Date.now() + budget;
  let rejectStopped, checking = false;
  const stopped = new Promise((_, reject) => { rejectStopped = reject; });
  const stop = error => { if (!controller.signal.aborted) { controller.abort(error); rejectStopped(error); } };
  const onAbort = () => stop(abortError(options.signal));
  const timer = setTimeout(() => stop(timeoutError()), budget);
  const poll = options.checkCancelled ? setInterval(async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try { await checkActive(options); } catch (error) { stop(error); }
    finally { checking = false; }
  }, 50) : undefined;
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  try {
    const operation = (async () => {
      for (let attempt = 0; ; attempt++) {
        await checkActive(options);
        if (controller.signal.aborted) throw controller.signal.reason;
        try {
          const result = await fn({ signal: controller.signal, deadline });
          await checkActive(options);
          if (controller.signal.aborted) throw controller.signal.reason;
          return result;
        } catch (error) {
          await checkActive(options);
          if (controller.signal.aborted) throw controller.signal.reason;
          const decision = !terminal(error) && options.shouldRetry?.(error);
          const retry = !terminal(error) && (typeof decision === 'boolean' ? decision : defaultRetry(error, statuses));
          if (!retry) throw error;
          if (attempt >= retries) throw exhaust(error);
          let delay = delays[attempt] ?? delays.at(-1) ?? 0;
          const header = error?.response?.headers?.get('Retry-After');
          if (header) {
            const seconds = /^\s*\d+(?:\.\d+)?\s*$/.test(header) ? Number(header) : NaN;
            const date = Number.isNaN(seconds) ? Date.parse(header) : NaN;
            const required = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
            delay = Math.max(delay, required);
            if (delay > maximumDelay) throw exhaust(error);
            delay += delay * Math.random() * 0.2;
          } else delay *= 0.8 + Math.random() * 0.4;
          delay = Math.max(0, Math.floor(delay));
          if (delay > maximumDelay || delay >= deadline - Date.now()) throw exhaust(error);
          options.onRetry?.(attempt + 1, delay);
          await waitFor(delay, { signal: controller.signal, checkCancelled: options.checkCancelled });
        }
      }
    })();
    return await Promise.race([operation, stopped]);
  } finally {
    clearTimeout(timer);
    clearInterval(poll);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
export async function fetchWithRetry(url, init = {}, retryOptions = {}) {
  return callWithRetry(async ({ signal }) => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) throw await createApiError(response);
    return response;
  }, { ...retryOptions, signal: retryOptions.signal || init.signal });
}

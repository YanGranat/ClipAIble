// @ts-check
// PDF file fetching utility - handles URL conversion and file fetching

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../utils/logging.js';
import { LIMITS } from '../constants.js';
import { createPdfError } from '../../../utils/pdf-errors.js';

/**
 * Convert Windows absolute path to file:// URL
 * @param {string} url - Original URL or path
 * @returns {string} Converted URL
 */
export function toFileUrl(url) {
  if (url.match(/^[A-Za-z]:[\\/]/)) {
    // Windows absolute path (C:/... or C:\...)
    // Convert to file:// URL
    const fileUrl = 'file:///' + url.replace(/\\/g, '/');
    log('[PDF v3] Converted Windows path to file:// URL', { original: url, converted: fileUrl });
    return fileUrl;
  }
  return url;
}

/**
 * Fetch PDF file with size validation
 * Supports both URL-based fetching and direct ArrayBuffer data
 * @param {string} url - PDF file URL (or identifier if pdfData is provided)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data as ArrayBuffer (for local files)
 * @param {{checkCancelled?: function(): (void|Promise<void>)}} [requestOptions] - Optional cancellation checks
 * @returns {Promise<ArrayBuffer>} PDF file as ArrayBuffer
 */
export async function fetchPdfFile(url, pdfData = null, requestOptions) {
  const maxSize = LIMITS.MAX_FILE_SIZE;
  let cancellationError;
  const checkCancelled = async () => {
    try {
      if (requestOptions?.signal?.aborted) throw requestOptions.signal.reason;
      await requestOptions?.checkCancelled?.();
    }
    catch (error) { cancellationError = error; throw error; }
  };
  await checkCancelled();
  
  // If PDF data is provided directly, use it (for local files passed via message)
  if (pdfData && pdfData instanceof ArrayBuffer) {
    if (pdfData.byteLength > maxSize) {
      const sizeMB = (pdfData.byteLength / 1024 / 1024).toFixed(1);
      const maxMB = (maxSize / 1024 / 1024).toFixed(0);
      throw createPdfError(`PDF file is too large (${sizeMB} MB). Maximum size: ${maxMB} MB.`, 'errorPdfTooLarge', { size: sizeMB, max: maxMB });
    }
    log('[PDF v3] PDF file data provided directly', { size: pdfData.byteLength });
    await checkCancelled();
    return pdfData;
  }
  
  const fetchUrl = toFileUrl(url);
  const FETCH_TIMEOUT_MS = 10 * 60 * 1000;

  const fetchWithTimeout = async (options, readBody = false) => {
    const controller = new AbortController();
    let reader = null;
    let responseBody = null;
    let readerCancelled = false;
    const abortRead = () => {
      controller.abort();
      const bodyReader = reader || responseBody;
      if (typeof bodyReader?.cancel === 'function' && !readerCancelled) {
        readerCancelled = true;
        bodyReader.cancel().catch(() => {});
      }
    };
    let timeoutId;
    let resetTimeout;
    const timeout = new Promise((_, reject) => {
      const expire = () => {
        reject(createPdfError(`PDF download timeout after ${FETCH_TIMEOUT_MS / 1000} seconds. The file may be too large.`, 'errorTimeout'));
        abortRead();
      };
      resetTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(expire, FETCH_TIMEOUT_MS);
      };
      resetTimeout();
    });
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      cancellationError = requestOptions.signal.reason;
      abortRead();
      rejectAbort(cancellationError);
    };
    requestOptions?.signal?.addEventListener('abort', onAbort, { once: true });
    if (requestOptions?.signal?.aborted) onAbort();

    const operation = (async () => {
      await checkCancelled();
      const response = await fetch(fetchUrl, { ...options, signal: controller.signal });
      if (readBody) responseBody = response.body;
      if (readBody) resetTimeout();
      await checkCancelled();
      if (!readBody) return response;
      if (!response.ok) {
        throw createPdfError(`Failed to fetch PDF: ${response.status} ${response.statusText}`, 'errorPdfDownloadFailed', { status: response.status });
      }
      const contentLength = Number(response.headers?.get('Content-Length'));
      if (Number.isFinite(contentLength) && contentLength > maxSize) {
        throw createPdfError('PDF file is too large.', 'errorPdfTooLarge', { size: (contentLength / 1024 / 1024).toFixed(1), max: (maxSize / 1024 / 1024).toFixed(0) });
      }

      reader = response.body?.getReader() || null;
      if (!reader) {
        await checkCancelled();
        const buffer = await response.arrayBuffer();
        await checkCancelled();
        if (buffer.byteLength > maxSize) throw createPdfError('PDF file is too large.', 'errorPdfTooLarge', { size: (buffer.byteLength / 1024 / 1024).toFixed(1), max: (maxSize / 1024 / 1024).toFixed(0) });
        return buffer;
      }

      const chunks = [];
      let size = 0;
      while (true) {
        await checkCancelled();
        const { done, value } = await reader.read();
        await checkCancelled();
        if (done) break;
        size += value.byteLength;
        if (size > maxSize) {
          throw createPdfError(`PDF file is too large. Maximum size: ${(maxSize / 1024 / 1024).toFixed(0)} MB.`, 'errorPdfTooLarge', { size: (size / 1024 / 1024).toFixed(1), max: (maxSize / 1024 / 1024).toFixed(0) });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      await checkCancelled();
      return bytes.buffer;
    })();

    try {
      return await Promise.race([operation, timeout, aborted]);
    } catch (error) {
      abortRead();
      throw error;
    } finally {
      clearTimeout(timeoutId);
      requestOptions?.signal?.removeEventListener('abort', onAbort);
      if (reader) {
        try { reader.releaseLock(); } catch {}
      }
    }
  };

  try {
    const arrayBuffer = await fetchWithTimeout({ credentials: 'include' }, true);
    await checkCancelled();
    log('[PDF v3] PDF file fetched', { size: arrayBuffer.byteLength });
    return arrayBuffer;
  } catch (error) {
    await checkCancelled();
    if (error === cancellationError || error.translationKey) throw error;
    if (fetchUrl.startsWith('file://')) {
      logWarn('[PDF v3] Fetch failed for local file', { error: error.message });
      throw createPdfError(`Cannot load local file directly. Please open the PDF file in Chrome first, or use a web URL. Original error: ${error.message}`, 'errorPdfLocalFileAccess');
    }
    throw error;
  }
}


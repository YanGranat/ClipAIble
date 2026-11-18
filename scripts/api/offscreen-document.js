// Serialize offscreen document transitions and message admission.
let pending = Promise.resolve();

export function withOffscreenDocumentLock(operation) {
  const result = pending.then(operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

/** Create the shared DOM/WASM context while holding the document transition lock. */
export function setupOffscreenDocument(options) {
  return withOffscreenDocumentLock(() => setupOffscreenDocumentUnlocked(options));
}

/** For callers already holding withOffscreenDocumentLock during message admission. */
export async function setupOffscreenDocumentUnlocked({ delayMs = 500 } = {}) {
  if (!chrome.offscreen) {
    throw Object.assign(new Error('Offscreen API not available'), { translationKey: 'errorOffscreenApiNotAvailable' });
  }
  const url = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (contexts.length) return false;
  await chrome.offscreen.createDocument({ url, reasons: ['BLOBS', 'DOM_SCRAPING'], justification: 'PDF and image processing and speech synthesis require DOM and WASM support.' });
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return true;
}

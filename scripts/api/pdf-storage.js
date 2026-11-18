// @ts-check
// Request-owned PDF input bytes shared with the offscreen document.
async function transact(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('ClipAIblePDFStorage', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('pdfFiles', { keyPath: 'url' });
      store.createIndex('timestamp', 'timestamp');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('PDF storage unavailable'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('pdfFiles', mode);
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure || new Error('PDF storage operation failed'));
      const fail = error => { failure = error; tx.abort(); };
      try { operation(tx.objectStore('pdfFiles'), value => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  } finally { database.close(); }
}

export function validatePdfData(pdfData, source = 'unknown') {
  if (!(pdfData instanceof ArrayBuffer)) {
    throw new Error(`Invalid PDF data type: expected ArrayBuffer, got ${typeof pdfData} (source: ${source})`);
  }
  
  if (pdfData.byteLength < 4) {
    throw new Error(`PDF data too small: ${pdfData.byteLength} bytes (source: ${source})`);
  }
  
  const headerBytes = new Uint8Array(pdfData).slice(0, 4);
  const headerText = String.fromCharCode(...headerBytes);
  
  if (headerText !== '%PDF') {
    const firstBytesHex = Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    throw new Error(`Invalid PDF header: expected '%PDF', got '${headerText}' (source: ${source}, bytes: ${firstBytesHex})`);
  }
  
  return pdfData;
}


export async function savePdfData(ref, data, processingRunId = null) {
  validatePdfData(data, 'PDF input');
  return transact('readwrite', store => { store.put({ url: ref, data, processingRunId, timestamp: Date.now() }); });
}
export function getPdfData(ref) {
  return transact('readonly', (store, result, fail) => {
    const request = store.get(ref);
    request.onsuccess = () => {
      try { result(request.result ? validatePdfData(request.result.data, 'PDF input') : null); }
      catch (error) { fail(error); }
    };
  });
}
export function removePdfData(ref) { return transact('readwrite', store => { store.delete(ref); }); }

/** Recover abandoned inputs after restoring the active workflow, without an age limit. */
export function prunePdfData(activeRunId = null) {
  return transact('readwrite', (store, result) => {
    let count = 0;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return result(count);
      if (!activeRunId || cursor.value.processingRunId !== activeRunId) { cursor.delete(); count++; }
      cursor.continue();
    };
  });
}

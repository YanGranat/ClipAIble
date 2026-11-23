// @ts-check

export const MAX_PDF_EMBEDDED_IMAGE_BYTES = 64 * 1024 * 1024;

const validId = value => typeof value === 'string' && /^[a-f\d-]{36}$/i.test(value);
async function transact(operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('clipaible-pdf-operations', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('jobs');
      request.result.createObjectStore('objects').createIndex('operationId', 'operationId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('PDF result storage unavailable'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(['jobs', 'objects'], 'readwrite');
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error('PDF result storage failed'));
      operation(tx.objectStore('jobs'), tx.objectStore('objects'), value => { result = value; });
    });
  } finally { database.close(); }
}

export function beginPdfOperation(operationId, processingRunId = null, kind = 'render') {
  if (!validId(operationId)) return Promise.reject(new Error('Invalid PDF operation'));
  if (!['render', 'selection'].includes(kind)) return Promise.reject(new Error('Invalid PDF operation kind'));
  return transact(jobs => { jobs.add({ processingRunId, kind }, operationId); });
}

export function putPdfOperationBlob(operationId, processingRunId, pageNum, blob, kind = 'render') {
  if (!validId(operationId) || !Number.isInteger(pageNum) || pageNum < 0 || !(blob instanceof Blob) || !blob.size) return Promise.reject(new Error('Invalid PDF data result'));
  return transact((jobs, pages, result) => {
    const request = jobs.get(operationId);
    request.onsuccess = () => {
      if (!request.result || request.result.processingRunId !== processingRunId || request.result.kind !== kind) return result(null);
      const ref = `${operationId}:${pageNum}`;
      pages.put({ operationId, processingRunId, kind, blob }, ref);
      result(ref);
    };
  });
}

/** Consume one decoded page without putting image bytes in a runtime message. */
export function takePdfOperationBlob(ref, processingRunId = null, kind = 'render') {
  if (typeof ref !== 'string' || !/^[a-f\d-]{36}:\d+$/i.test(ref)) return Promise.reject(new Error('Invalid PDF page reference'));
  return transact((_jobs, pages, result) => {
    const request = pages.get(ref);
    request.onsuccess = () => {
      if (request.result?.processingRunId !== processingRunId || request.result.kind !== kind) return result(null);
      result(request.result.blob);
      pages.delete(ref);
    };
  });
}

function deletePages(pages, operationId) {
  const request = pages.index('operationId').openKeyCursor(IDBKeyRange.only(operationId));
  request.onsuccess = () => { const cursor = request.result; if (cursor) { pages.delete(cursor.primaryKey); cursor.continue(); } };
}

export function removePdfOperation(operationId) {
  if (!validId(operationId)) return Promise.reject(new Error('Invalid PDF operation'));
  return transact((jobs, pages) => { jobs.delete(operationId); deletePages(pages, operationId); });
}

/** Startup recovery runs after state restoration and before admitting new work. */
export function prunePdfOperations(activeRunId = null) {
  return transact((jobs, pages, result) => {
    let removed = 0;
    const request = jobs.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return result(removed);
      if (!activeRunId || cursor.value.processingRunId !== activeRunId) {
        deletePages(pages, cursor.key); cursor.delete(); removed++;
      }
      cursor.continue();
    };
  });
}

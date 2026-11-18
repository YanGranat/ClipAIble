// @ts-check

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('clipaible-print-jobs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('jobs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Print storage unavailable'));
    request.onblocked = () => reject(new Error('Print storage blocked'));
  });
}

async function runTransaction(jobId, operation) {
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200) throw new Error('Invalid print job');
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('jobs', 'readwrite');
      const store = transaction.objectStore('jobs');
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Print storage operation failed'));
      operation(store, value => { result = value; });
    });
  } finally {
    database.close();
  }
}

export function putPrintJob(jobId, payload) {
  return runTransaction(jobId, store => { store.put(payload, jobId); });
}

/** Consume a payload once, in the same transaction that removes its record. */
export function takePrintJob(jobId) {
  return runTransaction(jobId, (store, result) => {
    const request = store.get(jobId);
    request.onsuccess = () => { result(request.result); store.delete(jobId); };
  });
}

export function removePrintJob(jobId) {
  return runTransaction(jobId, store => { store.delete(jobId); });
}

/** Retain jobs owned by the active run or an existing print tab. */
export async function prunePrintJobs({ activeRunId = null, activeJobIds = [] } = {}) {
  const retained = new Set(activeJobIds);
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('jobs', 'readwrite');
      const request = transaction.objectStore('jobs').openCursor();
      let removed = 0;
      transaction.oncomplete = () => resolve(removed);
      transaction.onerror = transaction.onabort = () => reject(new Error('Print storage cleanup failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!retained.has(cursor.key) && !(activeRunId && cursor.value?.processingRunId === activeRunId)) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      };
    });
  } finally {
    database.close();
  }
}

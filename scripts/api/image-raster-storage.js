// @ts-check

async function transaction(id, operation) {
  if (id !== null && (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id))) throw new Error('Invalid image operation');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('clipaible-image-operations', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('jobs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('Image storage unavailable'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('jobs', 'readwrite');
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error('Image storage operation failed'));
      operation(tx.objectStore('jobs'), value => { result = value; });
    });
  } finally { database.close(); }
}

export function putRasterJob(id, value) {
  return transaction(id, store => { store.put(value, id); });
}
export function getRasterJob(id) {
  return transaction(id, (store, result) => { const request = store.get(id); request.onsuccess = () => result(request.result); });
}
export function setRasterResult(id, processingRunId, blob) {
  return transaction(id, (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const job = request.result;
      if (!job || job.processingRunId !== processingRunId || !(job.expiresAt > Date.now())) return result(false);
      store.put({ processingRunId, expiresAt: job.expiresAt, result: blob }, id);
      result(true);
    };
  });
}
export function takeRasterJob(id) {
  return transaction(id, (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => { result(request.result); store.delete(id); };
  });
}
export function removeRasterJob(id) {
  return transaction(id, store => { store.delete(id); });
}

/** Recover abandoned operations only after their request deadline. */
export function pruneExpiredRasterJobs(now = Date.now()) {
  return transaction(null, (store, result) => {
    let removed = 0;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return result(removed);
      if (!Number.isFinite(cursor.value?.expiresAt) || cursor.value.expiresAt <= now) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
  });
}

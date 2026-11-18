// @ts-check
async function transaction(id, operation) {
  if (id !== null && !/^[a-f\d-]{36}$/i.test(id)) throw new Error('Invalid download operation');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('clipaible-downloads', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('Download storage unavailable'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('files', 'readwrite');
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('Download storage failed'));
      operation(tx.objectStore('files'), value => { result = value; });
    });
  } finally { database.close(); }
}
export function putDownload(id, value) { return transaction(id, store => { store.add(value, id); }); }
export function getDownload(id) { return transaction(id, (store, result) => { const request = store.get(id); request.onsuccess = () => result(request.result); }); }
export function removeDownload(id) { return transaction(id, store => { store.delete(id); }); }
export function pruneExpiredDownloads(now = Date.now()) {
  return transaction(null, (store, result) => {
    let count = 0;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return result(count);
      if (!(cursor.value.expiresAt > now)) { cursor.delete(); count++; }
      cursor.continue();
    };
  });
}

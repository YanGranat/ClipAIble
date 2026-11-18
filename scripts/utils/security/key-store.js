// @ts-check

let cachedKey;

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('clipaible-key-store', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('API key storage unavailable'));
    request.onblocked = () => reject(new Error('API key storage blocked'));
  });
}

function readKey(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('keys', 'readonly');
    const request = transaction.objectStore('keys').get('encryption');
    let key;
    request.onsuccess = () => { key = request.result; };
    transaction.oncomplete = () => resolve(key);
    transaction.onerror = transaction.onabort = () => reject(new Error('API key storage read failed'));
  });
}

function persistKey(database, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('keys', 'readwrite');
    transaction.objectStore('keys').put(key, 'encryption');
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('API key storage write failed'));
  });
}

/** The key becomes usable only after its IndexedDB transaction commits. */
export async function getInstallationKey(create = false) {
  if (cachedKey) return cachedKey;
  return navigator.locks.request('clipaible-encryption-key', async () => {
    if (cachedKey) return cachedKey;
    const database = await openKeyDatabase();
    try {
      let key = await readKey(database);
      if (key && (key.type !== 'secret' || key.extractable || key.algorithm?.name !== 'AES-GCM' || key.algorithm?.length !== 256)) throw new Error('Invalid API encryption key');
      if (!key) {
        if (!create) throw new Error('API encryption key unavailable');
        key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await persistKey(database, key);
      }
      cachedKey = key;
      return key;
    } finally {
      database.close();
    }
  });
}

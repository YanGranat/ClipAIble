// @ts-check
import { SUPERTONIC_CACHE, SUPERTONIC_FALLBACK_URL, SUPERTONIC_MODEL_URL } from '../../api/supertonic-config.js';
import { SUPERTONIC_FILES } from './model-files.js';

const COMPLETE = SUPERTONIC_MODEL_URL + 'clipaible-model-ready';
const filesByName = new Map(SUPERTONIC_FILES.map(entry => [entry[0], entry]));
const PUBLISHER_BASES = [SUPERTONIC_MODEL_URL, SUPERTONIC_FALLBACK_URL];
const STALL_TIMEOUT = 90_000;

export async function isSupertonicInstalled() {
  if (!await caches.has(SUPERTONIC_CACHE)) return false;
  const cache = await caches.open(SUPERTONIC_CACHE);
  const urls = new Set((await cache.keys()).map(request => request.url));
  return urls.has(COMPLETE) && SUPERTONIC_FILES.every(([name]) => urls.has(SUPERTONIC_MODEL_URL + name));
}

/** ONNX initialization can only read the committed local model. */
export async function readSupertonicAsset(name) {
  if (!filesByName.has(name)) throw new Error('Unknown Supertonic model asset');
  const response = await caches.match(SUPERTONIC_MODEL_URL + name, { cacheName: SUPERTONIC_CACHE });
  if (!response) throw new Error('Supertonic model asset is missing');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== filesByName.get(name)[1]) throw new Error('Supertonic model asset has an invalid size');
  return bytes;
}

export function deleteSupertonicAssets() {
  return caches.delete(SUPERTONIC_CACHE);
}

function isPublisherUrl(url) {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && (parsed.hostname === 'huggingface.co' || parsed.hostname.endsWith('.hf.co'));
}

async function fetchAsset(url, length, expectedDigest, signal, reportBytes) {
  const request = new AbortController();
  const cancel = () => request.abort(signal.reason);
  let timeout;
  function renewTimeout() {
    clearTimeout(timeout);
    timeout = setTimeout(() => request.abort(new Error('Supertonic asset download stalled')), STALL_TIMEOUT);
  }
  signal.throwIfAborted();
  signal.addEventListener('abort', cancel, { once: true });
  renewTimeout();
  try {
    const response = await fetch(url, { signal: request.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.body || (response.url && !isPublisherUrl(response.url))) throw new Error('Supertonic asset is unavailable');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(length);
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        renewTimeout();
        if (offset + value.byteLength > length) throw new Error('Supertonic asset exceeds its expected size');
        bytes.set(value, offset);
        offset += value.byteLength;
        reportBytes(offset);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (offset !== length) throw new Error('Supertonic asset download is incomplete');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actualDigest = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actualDigest !== expectedDigest) throw new Error('Supertonic asset failed its integrity check');
    signal.throwIfAborted();
    return bytes;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    request.abort();
  }
}

/** Install only a complete, hash-verified snapshot. Reuse assets verified on earlier attempts. */
export async function installSupertonicAssets(signal, reportBytes) {
  const cache = await caches.open(SUPERTONIC_CACHE);
  await cache.delete(COMPLETE);
  let installed = 0;
  for (const [name, length, digest] of SUPERTONIC_FILES) {
    signal.throwIfAborted();
    const key = SUPERTONIC_MODEL_URL + name;
    const saved = await cache.match(key);
    if (saved?.headers.get('X-ClipAIble-Model-Digest') !== digest) {
      let bytes;
      for (const [index, base] of PUBLISHER_BASES.entries()) {
        try {
          bytes = await fetchAsset(base + name, length, digest, signal, downloaded => reportBytes(installed + downloaded));
          break;
        } catch (error) {
          signal.throwIfAborted();
          if (index === PUBLISHER_BASES.length - 1) throw error;
          reportBytes(installed);
        }
      }
      signal.throwIfAborted();
      await cache.put(key, new Response(bytes, { headers: { 'X-ClipAIble-Model-Digest': digest } }));
    }
    installed += length;
    reportBytes(installed);
  }
  signal.throwIfAborted();
  await cache.put(COMPLETE, new Response('ready'));
  signal.throwIfAborted();
}

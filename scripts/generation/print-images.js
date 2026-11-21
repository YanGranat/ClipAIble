// @ts-check
import { CONFIG } from '../utils/config.js';
import { imageDataError } from '../utils/html/image-bytes.js';

/** Preserve source references and captions when a remote print image is unavailable. */
export async function waitForPrintImages(doc, timeoutMs = CONFIG.API_TIMEOUT_MS) {
  await Promise.all(Array.from(doc.querySelectorAll('img')).map(image => new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
    };
    const finish = () => {
      cleanup();
      if (image.naturalWidth > 0) { resolve(undefined); return; }
      try {
        if (image.src.startsWith('data:')) throw imageDataError('IMAGE_DECODE_FAILED');
        const url = new URL(image.getAttribute('data-original-src') || image.src, doc.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) throw imageDataError('IMAGE_UNSAFE_URL');
        const link = doc.createElement('a');
        link.href = url.href;
        link.textContent = image.alt || url.href;
        if (image.id) link.id = image.id;
        image.replaceWith(link);
        resolve(undefined);
      } catch (error) { reject(error); }
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
    timer = setTimeout(() => { cleanup(); reject(imageDataError('IMAGE_TIMEOUT')); }, timeoutMs);
    if (image.complete) finish();
  })));
}

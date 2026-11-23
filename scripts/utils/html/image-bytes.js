// @ts-check

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

export function imageDataError(code) {
  let message = 'The image could not be read.';
  let translationKey = 'errorImageUnavailable';
  let translationParams = {};
  if (code === 'IMAGE_TOO_LARGE') {
    translationParams = { maxMiB: MAX_IMAGE_BYTES / 1024 / 1024 };
    message = `Image exceeds the ${translationParams.maxMiB} MiB limit.`;
    translationKey = 'errorImageTooLarge';
  } else if (code === 'IMAGE_UNSAFE_URL' || code === 'IMAGE_UNSAFE_REDIRECT') {
    message = 'This image URL is not allowed.';
    translationKey = 'errorImageUrlBlocked';
  } else if (code === 'IMAGE_TIMEOUT') {
    message = 'Image processing timed out.';
    translationKey = 'errorTimeout';
  } else if (code === 'IMAGE_CANCELLED') {
    message = 'Image processing was cancelled.';
    translationKey = 'statusCancelled';
  }
  return Object.assign(new Error(message), { code, translationKey, translationParams });
}

export function detectImageMime(bytes) {
  const starts = values => values.every((value, index) => bytes[index] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (starts([255, 216, 255])) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32))) return 'image/avif';
  if (starts([66, 77])) return 'image/bmp';
  const comments = /^(?:\s*<!--[\s\S]*?-->)+/;
  const svgDoctype = /^\s*<!DOCTYPE\s+svg(?:\s+(?:SYSTEM\s+(?:"[^"]*"|'[^']*')|PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*')))?\s*>/;
  const prefix = new TextDecoder().decode(bytes.subarray(0, 4096))
    .replace(/^\s*<\?xml[\s\S]*?\?>/, '')
    .replace(comments, '')
    .replace(svgDoctype, '')
    .replace(comments, '');
  if (/^\s*<svg(?:\s|>)/i.test(prefix)) return 'image/svg+xml';
  throw imageDataError(bytes.length ? 'IMAGE_UNSUPPORTED_TYPE' : 'IMAGE_EMPTY');
}

export async function readImageBytes(response) {
  const declared = response.headers?.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_IMAGE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw imageDataError('IMAGE_TOO_LARGE');
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw imageDataError('IMAGE_TOO_LARGE');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        throw imageDataError('IMAGE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function imageDataUrlBytes(url) {
  if (url.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 512) throw imageDataError('IMAGE_TOO_LARGE');
  const match = url.match(/^data:(image\/[\w.+-]+)((?:;[^\r\n,]*)?),([\s\S]*)$/i);
  if (!match) throw imageDataError('IMAGE_UNSUPPORTED_TYPE');
  let bytes;
  try {
    if (/;base64(?:;|$)/i.test(match[2])) {
      const encoded = match[3].replace(/[\t\r\n ]/g, '');
      if (!/^[a-z\d+/]*={0,2}$/i.test(encoded)) throw new Error('Invalid base64');
      bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    } else bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
  } catch { throw imageDataError('IMAGE_INVALID_DATA'); }
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw imageDataError('IMAGE_TOO_LARGE');
  return bytes;
}

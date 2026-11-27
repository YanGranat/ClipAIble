// Preserve the encoded image format when preparing provider requests.
import { renderPrompt } from '../settings/prompt-catalog.js';
export function parseBase64Image(imageData) {
  const separator = imageData.indexOf(',');
  if (separator === -1) return { base64Image: imageData, mimeType: 'image/png' };
  const declaredType = imageData.slice(0, separator).match(/^data:([^;,]+)/i)?.[1]?.toLowerCase();
  return {
    base64Image: imageData.slice(separator + 1),
    mimeType: declaredType === 'image/jpg' ? 'image/jpeg' : declaredType || 'image/png'
  };
}

const MAX_IMAGE_DATA_LENGTH = 20 * 1024 * 1024;
const invalidRaster = () => new Error('Invalid raster image data');

function decodeRasterBase64(value) {
  if (typeof value !== 'string' || !value || value.length % 4 || /[^A-Za-z0-9+/=]/.test(value)) throw invalidRaster();
  const binary = atob(value);
  if (btoa(binary) !== value) throw invalidRaster();
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function pngDimensions(bytes, view) {
  if (bytes.length < 45 || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw invalidRaster();
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 2147483647 || height > 2147483647) throw invalidRaster();
  let hasData = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), type = view.getUint32(offset + 4);
    if (length > bytes.length - offset - 12 || (offset !== 8 && type === 0x49484452)) throw invalidRaster();
    offset += length + 12;
    if (type === 0x49444154 && length > 0) hasData = true;
    if (type === 0x49454e44) {
      if (length || !hasData || offset !== bytes.length) throw invalidRaster();
      return { width, height };
    }
  }
  throw invalidRaster();
}

function jpegDimensions(bytes, view) {
  for (let offset = 2; offset < bytes.length - 2;) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += length;
  }
  throw invalidRaster();
}

function webpDimensions(bytes, view) {
  const variant = view.getUint32(12), length = view.getUint32(16, true);
  if (length > bytes.length - 20) throw invalidRaster();
  // VP8X can also contain alpha or metadata. Animated images aren't document rasters.
  if (variant === 0x56503858 && length === 10 && !(bytes[20] & 2)) {
    const read24 = offset => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  if (variant === 0x5650384c && length >= 5 && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
  }
  if (variant === 0x56503820 && length >= 10 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  throw invalidRaster();
}

/** Validate a base64 raster, deriving the actual format from its container. */
export function readRasterBase64(value, { format = '', exported = false, limitLength = false } = {}) {
  if (limitLength && (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_LENGTH)) throw invalidRaster();
  const bytes = decodeRasterBase64(value);
  if (bytes.length < 6) throw invalidRaster();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let actual, dimensions;
  if (bytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    actual = 'png';
    dimensions = pngDimensions(bytes, view);
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    actual = 'jpeg';
    if (exported) dimensions = jpegDimensions(bytes, view);
  } else if (bytes.length >= 20 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250 && view.getUint32(4, true) + 8 === bytes.length) {
    actual = 'webp';
    if (exported) dimensions = webpDimensions(bytes, view);
  }
  if (!actual || (format && format !== actual)) throw invalidRaster();
  // Bound provider output to the document canvas budget before decoding.
  if (exported && (!dimensions?.width || !dimensions?.height || dimensions.width > 32767 || dimensions.height > 32767 || dimensions.width * dimensions.height > 2 ** 25)) throw invalidRaster();
  return { format: actual, bytes, dataUrl: `data:image/${actual};base64,${value}` };
}

export function readRasterDataUrl(imageData) {
  if (typeof imageData !== 'string' || imageData.length > MAX_IMAGE_DATA_LENGTH) throw invalidRaster();
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(imageData);
  if (!match) throw invalidRaster();
  return readRasterBase64(match[2], { format: match[1] });
}

export function createImageTranslationPrompt(targetLanguage, options = {}) {
  return renderPrompt('translateImage', options, { targetLanguage: JSON.stringify(targetLanguage.trim()) });
}

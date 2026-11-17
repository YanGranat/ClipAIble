/** Transfer a fixed-length buffer in Node test environments that lack the native method. */
export function transferToFixedLength(byteLength = undefined) {
  const originalLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(this);
  new Uint8Array(this);
  const number = byteLength === undefined ? originalLength : +byteLength;
  const length = Number.isNaN(number) ? 0 : Math.trunc(number);
  if (!Number.isFinite(length) || length < 0 || length > Number.MAX_SAFE_INTEGER) throw new RangeError('Invalid buffer length');
  const result = new ArrayBuffer(length);
  new Uint8Array(result).set(new Uint8Array(this, 0, Math.min(originalLength, length)));
  structuredClone(this, { transfer: [this] });
  let detached = false;
  try { new Uint8Array(this); } catch { detached = true; }
  if (!detached) throw new TypeError('Buffer cannot be transferred');
  return result;
}

export function installPdfTestCompatibility() {
  if (typeof ArrayBuffer.prototype.transferToFixedLength !== 'function') {
    Object.defineProperty(ArrayBuffer.prototype, 'transferToFixedLength', {
      configurable: true, writable: true, value: transferToFixedLength
    });
  }
}

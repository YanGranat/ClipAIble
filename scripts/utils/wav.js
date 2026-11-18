// @ts-check
const invalid = () => Object.assign(new Error('The speech service returned invalid audio. Please try again.'), {
  translationKey: 'errorTtsInvalidAudio', translationParams: {}, retryable: false
});

/** Read PCM/IEEE-float WAV chunks without assuming a fixed 44-byte header. */
export function readWav(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12) throw invalid();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) throw invalid();
  let format;
  let data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.length) throw invalid();
    if (tag(offset) === 'fmt ') {
      if (format || size < 16) throw invalid();
      format = { encoding: view.getUint16(start, true), channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true), byteRate: view.getUint32(start + 8, true),
        blockAlign: view.getUint16(start + 12, true), bits: view.getUint16(start + 14, true) };
    } else if (tag(offset) === 'data') {
      if (data) throw invalid();
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
    if (offset > bytes.length) throw invalid();
  }
  if (!format || !data?.length || ![1, 3].includes(format.encoding) || !format.channels || !format.sampleRate ||
      ![8, 16, 24, 32, 64].includes(format.bits) || format.blockAlign !== format.channels * format.bits / 8 ||
      format.byteRate !== format.sampleRate * format.blockAlign || data.length % format.blockAlign) throw invalid();
  return { format, data };
}

export function concatenateWav(buffers, asBlob = false) {
  const parsed = buffers.map(readWav);
  const format = parsed[0]?.format;
  if (!format || parsed.some(item => Object.keys(format).some(key => format[key] !== item.format[key]))) throw invalid();
  const size = parsed.reduce((total, item) => total + item.data.length, 0);
  if (size > 0xffffffff - 36) throw invalid();
  const result = new ArrayBuffer(asBlob ? 44 : 44 + size + size % 2);
  const bytes = new Uint8Array(result);
  const view = new DataView(result);
  const tag = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + size + size % 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, format.encoding, true); view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true); view.setUint32(28, format.byteRate, true);
  view.setUint16(32, format.blockAlign, true); view.setUint16(34, format.bits, true);
  tag(36, 'data'); view.setUint32(40, size, true);
  if (asBlob) return new Blob([result, ...parsed.map(item => item.data), ...(size % 2 ? [new Uint8Array(1)] : [])], { type: 'audio/wav' });
  let offset = 44;
  for (const item of parsed) { bytes.set(item.data, offset); offset += item.data.length; }
  return result;
}

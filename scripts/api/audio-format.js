// @ts-check

/** @param {ArrayBuffer} buffer */
export function isWavBuffer(buffer) {
  if (!buffer || buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  return String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE';
}

/**
 * Wrap interleaved little-endian PCM samples in a RIFF/WAVE container.
 * @param {ArrayBuffer} pcmData
 * @param {number} sampleRate
 * @param {number} [bitsPerSample=16]
 * @param {number} [numChannels=1]
 * @returns {ArrayBuffer}
 */
export function pcmToWav(pcmData, sampleRate, bitsPerSample = 16, numChannels = 1) {
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || !Number.isInteger(blockAlign) || blockAlign <= 0 ||
      !Number.isInteger(numChannels) || numChannels <= 0 || numChannels > 0xffff || blockAlign > 0xffff ||
      ![8, 16, 24, 32].includes(bitsPerSample) || byteRate > 0xffffffff ||
      pcmData.byteLength % blockAlign !== 0 || pcmData.byteLength > 0xffffffff - 36) {
    throw new Error('Invalid PCM audio format');
  }
  const buffer = new ArrayBuffer(44 + pcmData.byteLength + pcmData.byteLength % 2);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    for (let index = 0; index < text.length; index++) bytes[offset + index] = text.charCodeAt(index);
  }
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(40, pcmData.byteLength, true);
  bytes.set(new Uint8Array(pcmData), 44);
  return buffer;
}

/**
 * Decode G.711 mu-law octets into signed 16-bit little-endian PCM.
 * @param {ArrayBuffer} encoded
 * @returns {ArrayBuffer}
 */
export function muLawToPcm(encoded) {
  const source = new Uint8Array(encoded);
  const pcm = new ArrayBuffer(source.length * 2);
  const view = new DataView(pcm);
  for (let index = 0; index < source.length; index++) {
    const code = ~source[index] & 0xff;
    const magnitude = (((code & 0x0f) * 8 + 132) << ((code >> 4) & 7)) - 132;
    view.setInt16(index * 2, code & 0x80 ? -magnitude : magnitude, true);
  }
  return pcm;
}

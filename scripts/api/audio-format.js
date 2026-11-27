// @ts-check

/** @param {ArrayBuffer} buffer */
export function isWavBuffer(buffer) {
  if (!buffer || buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  return String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE';
}

const MP3_SAMPLE_RATES = [44100, 48000, 32000];
const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function invalidMp3() {
  return Object.assign(new Error('The speech service returned invalid audio. Please try again.'), {
    translationKey: 'errorTtsInvalidAudio', translationParams: {}, retryable: false
  });
}

/** @param {Uint8Array} bytes */
function mp3TagSize(bytes) {
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const version = bytes[3];
  if (bytes.length < 10 || version < 2 || version > 4) throw invalidMp3();
  let size = 0;
  for (const byte of bytes.subarray(6, 10)) {
    if (byte > 0x7f) throw invalidMp3();
    size = size * 128 + byte;
  }
  return 10 + size + (version === 4 && (bytes[5] & 0x10) ? 10 : 0);
}

/** @param {DataView} view @param {number} offset @param {number} end @param {number} version @param {number} channels */
function isMp3IndexFrame(view, offset, end, version, channels) {
  // Xing and Info follow the side information. VBRI uses a fixed offset.
  const sideInfoSize = version === 3 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17);
  const xingOffset = offset + 4 + sideInfoSize;
  if (xingOffset + 4 <= end) {
    const marker = view.getUint32(xingOffset);
    if (marker === 0x58696e67 || marker === 0x496e666f) return true;
  }
  return offset + 40 <= end && view.getUint32(offset + 36) === 0x56425249;
}

/** Validate complete Layer III frames and return the audio bytes without file metadata. @param {ArrayBuffer} buffer */
function readMp3(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const firstFrame = mp3TagSize(bytes);
  let start = firstFrame;
  let end = bytes.length;
  let sampleRate = 0;
  let channels = 0;
  for (let offset = firstFrame; offset < end;) {
    if (end - offset === 128 && bytes[offset] === 0x54 && bytes[offset + 1] === 0x41 && bytes[offset + 2] === 0x47) {
      end = offset; // ID3v1 starts after a complete frame.
      break;
    }
    if (offset + 4 > end) throw invalidMp3();
    const header = view.getUint32(offset);
    const version = (header >>> 19) & 3;
    const layer = (header >>> 17) & 3;
    if (header >>> 21 !== 0x7ff || version === 1 || layer !== 1) throw invalidMp3();
    const bitrates = version === 3 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES;
    const bitrate = bitrates[(header >>> 12) & 15];
    const rate = MP3_SAMPLE_RATES[(header >>> 10) & 3] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const frameChannels = ((header >>> 6) & 3) === 3 ? 1 : 2;
    if (!rate || !bitrate) throw invalidMp3();
    const frameEnd = offset + Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((header >>> 9) & 1);
    if (frameEnd > end) throw invalidMp3();
    if (offset === firstFrame) {
      sampleRate = rate;
      channels = frameChannels;
      if (isMp3IndexFrame(view, offset, frameEnd, version, channels)) start = frameEnd;
    } else if (rate !== sampleRate || frameChannels !== channels) {
      throw invalidMp3();
    }
    offset = frameEnd;
  }
  if (start >= end) throw invalidMp3();
  return { data: bytes.subarray(start, end), sampleRate, channels };
}

/** @param {ArrayBuffer[]} buffers @param {boolean} asBlob */
export function concatenateMp3(buffers, asBlob) {
  const tracks = buffers.map(readMp3);
  const { sampleRate, channels } = tracks[0];
  if (tracks.some(track => track.sampleRate !== sampleRate || track.channels !== channels)) throw invalidMp3();
  // Preserve standalone files. Combined files need only the MPEG audio frames.
  if (buffers.length === 1) return asBlob ? new Blob(buffers, { type: 'audio/mpeg' }) : buffers[0];
  const audio = tracks.map(track => track.data);
  if (asBlob) return new Blob(audio, { type: 'audio/mpeg' });
  const result = new Uint8Array(audio.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of audio) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result.buffer;
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
  /** @type {Array<[number, string]>} */
  const labels = [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']];
  for (const [offset, text] of labels) {
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

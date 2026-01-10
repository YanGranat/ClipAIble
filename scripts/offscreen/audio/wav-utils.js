// @ts-check
// WAV file utilities for audio concatenation

import { log, logWarn } from '../../utils/logging.js';

/**
 * Find the data chunk in a WAV file
 * @param {Uint8Array} view - WAV file as Uint8Array
 * @returns {{dataStart: number, dataSize: number}} Position and size of data chunk
 */
export function findWavDataChunk(view) {
  let offset = 12; // Skip RIFF header
  
  while (offset < view.length - 8) {
    const chunkId = String.fromCharCode(view[offset], view[offset + 1], view[offset + 2], view[offset + 3]);
    const chunkSize = view[offset + 4] | (view[offset + 5] << 8) | (view[offset + 6] << 16) | (view[offset + 7] << 24);
    
    if (chunkId === 'data') {
      return { dataStart: offset + 8, dataSize: chunkSize };
    }
    
    offset += 8 + chunkSize;
    // Ensure even offset
    if (chunkSize % 2 !== 0) offset++;
  }
  
  // If no data chunk found, assume everything after header is data
  return { dataStart: 44, dataSize: view.length - 44 };
}

/**
 * Concatenate multiple WAV buffers into one valid WAV file
 * Extracts PCM data from each WAV and creates a new WAV with correct header
 * @param {Array<ArrayBuffer>} buffers - Array of WAV buffers
 * @returns {ArrayBuffer} Combined WAV buffer with valid header
 */
export function concatenateWavBuffers(buffers) {
  log(`[ClipAIble Offscreen] === WAV CONCATENATION START ===`, { 
    buffersCount: buffers.length 
  });
  
  if (!buffers || buffers.length === 0) {
    throw new Error('No buffers to concatenate');
  }
  
  if (buffers.length === 1) {
    log(`[ClipAIble Offscreen] Single buffer, returning as-is`);
    return buffers[0];
  }
  
  // Extract audio data from each buffer
  const dataChunks = [];
  let totalDataSize = 0;
  let sampleRate = 22050; // Default for Piper TTS
  let bitsPerSample = 16;
  let numChannels = 1;
  
  for (let i = 0; i < buffers.length; i++) {
    const view = new Uint8Array(buffers[i]);
    
    // Validate WAV format (starts with "RIFF")
    if (view.length < 44 || 
        view[0] !== 0x52 || view[1] !== 0x49 || view[2] !== 0x46 || view[3] !== 0x46) {
      logWarn(`[ClipAIble Offscreen] Buffer ${i} is not a valid WAV file, skipping`, {
        bufferIndex: i,
        bufferSize: view.length,
        firstBytes: Array.from(view.slice(0, 4))
      });
      continue;
    }
    
    const { dataStart, dataSize } = findWavDataChunk(view);
    
    // Extract format info from first valid buffer
    if (i === 0 && view.length >= 44) {
      numChannels = view[22] | (view[23] << 8);
      sampleRate = view[24] | (view[25] << 8) | (view[26] << 16) | (view[27] << 24);
      bitsPerSample = view[34] | (view[35] << 8);
      log(`[ClipAIble Offscreen] WAV format detected from first buffer`, { 
        numChannels, 
        sampleRate, 
        bitsPerSample,
        dataStart,
        dataSize
      });
    }
    
    const audioData = view.slice(dataStart, dataStart + dataSize);
    dataChunks.push(audioData);
    totalDataSize += audioData.length;
    
    log(`[ClipAIble Offscreen] Extracted audio data from buffer ${i + 1}/${buffers.length}`, {
      bufferIndex: i,
      dataStart,
      dataSize,
      audioDataLength: audioData.length,
      totalDataSizeSoFar: totalDataSize
    });
  }
  
  if (dataChunks.length === 0) {
    throw new Error('No valid WAV data chunks found');
  }
  
  // Create new WAV file with proper header
  const headerSize = 44;
  const totalSize = headerSize + totalDataSize;
  const result = new ArrayBuffer(totalSize);
  const view = new Uint8Array(result);
  const dataView = new DataView(result);
  
  // Write WAV header
  // "RIFF"
  view[0] = 0x52; view[1] = 0x49; view[2] = 0x46; view[3] = 0x46;
  // File size - 8
  dataView.setUint32(4, totalSize - 8, true);
  // "WAVE"
  view[8] = 0x57; view[9] = 0x41; view[10] = 0x56; view[11] = 0x45;
  // "fmt "
  view[12] = 0x66; view[13] = 0x6D; view[14] = 0x74; view[15] = 0x20;
  // fmt chunk size (16 for PCM)
  dataView.setUint32(16, 16, true);
  // Audio format (1 = PCM)
  dataView.setUint16(20, 1, true);
  // Number of channels
  dataView.setUint16(22, numChannels, true);
  // Sample rate
  dataView.setUint32(24, sampleRate, true);
  // Byte rate
  dataView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  // Block align
  dataView.setUint16(32, numChannels * (bitsPerSample / 8), true);
  // Bits per sample
  dataView.setUint16(34, bitsPerSample, true);
  // "data"
  view[36] = 0x64; view[37] = 0x61; view[38] = 0x74; view[39] = 0x61;
  // Data size
  dataView.setUint32(40, totalDataSize, true);
  
  // Copy all audio data
  let offset = headerSize;
  for (let i = 0; i < dataChunks.length; i++) {
    const chunk = dataChunks[i];
    view.set(chunk, offset);
    offset += chunk.length;
    
    if (i < 3 || i === dataChunks.length - 1) {
      log(`[ClipAIble Offscreen] Copied chunk ${i + 1}/${dataChunks.length}`, {
        chunkIndex: i,
        chunkSize: chunk.length,
        offsetBefore: offset - chunk.length,
        offsetAfter: offset
      });
    }
  }
  
  log(`[ClipAIble Offscreen] === WAV CONCATENATION COMPLETE ===`, { 
    chunksCount: dataChunks.length, 
    totalDataSize,
    totalSize,
    headerSize,
    sampleRate,
    numChannels,
    bitsPerSample,
    estimatedDurationSeconds: Math.round(totalDataSize / (sampleRate * numChannels * (bitsPerSample / 8)))
  });
  
  return result;
}




























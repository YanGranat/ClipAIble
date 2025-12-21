// Injected script for offline TTS execution in page context
// This script runs in MAIN world and has access to window.speechSynthesis

/**
 * Execute offline TTS in page context
 * @param {string} text - Text to convert
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice name
 * @param {number} options.speed - Speech speed
 * @param {number} options.pitch - Pitch
 * @param {number} options.volume - Volume
 * @param {string} options.language - Language code
 * @returns {Promise<string>} Base64-encoded WAV audio
 */
async function executeOfflineTTS(text, options) {
  const { voice, speed, pitch, volume, language } = options;
  
  if (!window.speechSynthesis) {
    throw new Error('SpeechSynthesis API is not available');
  }
  
  console.log('[ClipAIble] executeOfflineTTS called', { textLength: text.length });
  
  // Get available voices
  const getVoices = () => {
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) return voices;
    
    return new Promise((resolve) => {
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        resolve(voices);
      };
      setTimeout(() => resolve(voices), 1000);
    });
  };
  
  // Find voice
  const findVoice = async (voiceName, lang) => {
    const voices = await getVoices();
    if (voiceName) {
      let v = voices.find(v => v.name === voiceName);
      if (v) return v;
      v = voices.find(v => v.name.toLowerCase().includes(voiceName.toLowerCase()));
      if (v) return v;
    }
    if (lang) {
      let v = voices.find(v => v.lang === lang);
      if (v) return v;
      const prefix = lang.split('-')[0];
      v = voices.find(v => v.lang.startsWith(prefix));
      if (v) return v;
    }
    return voices.length > 0 ? voices[0] : null;
  };
  
  // Convert audio buffer to base64
  const audioBufferToBase64 = (audioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const length = audioBuffer.length;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    // Convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  
  return new Promise(async (resolve, reject) => {
    try {
      const voiceObj = await findVoice(voice, language);
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (voiceObj) {
        utterance.voice = voiceObj;
        utterance.lang = voiceObj.lang;
      } else if (language) {
        utterance.lang = language;
      }
      
      utterance.rate = Math.max(0.1, Math.min(10.0, speed));
      utterance.pitch = Math.max(0, Math.min(2.0, pitch));
      utterance.volume = Math.max(0, Math.min(1.0, volume));
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const mediaStreamDestination = audioContext.createMediaStreamDestination();
      
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }
      
      const mediaRecorder = new MediaRecorder(mediaStreamDestination.stream, { mimeType });
      const audioChunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        try {
          console.log('[ClipAIble] MediaRecorder stopped, processing audio chunks', { chunksCount: audioChunks.length });
          const blob = new Blob(audioChunks, { type: mimeType });
          const arrayBuffer = await blob.arrayBuffer();
          console.log('[ClipAIble] Audio blob created', { blobSize: blob.size, arrayBufferSize: arrayBuffer.byteLength });
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          console.log('[ClipAIble] Audio decoded', { sampleRate: audioBuffer.sampleRate, duration: audioBuffer.duration });
          const wavBase64 = audioBufferToBase64(audioBuffer);
          console.log('[ClipAIble] WAV base64 created', { base64Length: wavBase64.length });
          audioContext.close();
          resolve(wavBase64);
        } catch (error) {
          console.error('[ClipAIble] Error processing audio', error);
          audioContext.close();
          reject(error);
        }
      };
      
      mediaRecorder.onerror = (event) => {
        audioContext.close();
        reject(new Error('MediaRecorder error'));
      };
      
      // Try tabCapture first (may not be available in MAIN world), then fall back to getUserMedia
      if (typeof chrome !== 'undefined' && chrome.tabCapture && typeof chrome.tabCapture.capture === 'function') {
        console.log('[ClipAIble] Attempting to use tabCapture for offline TTS', { textLength: text.length });
        try {
          chrome.tabCapture.capture({ audio: true }, (stream) => {
            if (chrome.runtime.lastError || !stream) {
              console.warn('[ClipAIble] tabCapture failed, falling back to getUserMedia', chrome.runtime.lastError);
              useGetUserMedia();
              return;
            }
            
            console.log('[ClipAIble] tabCapture stream obtained', { streamId: stream.id, tracksCount: stream.getTracks().length });
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(mediaStreamDestination);
            mediaRecorder.start();
            console.log('[ClipAIble] MediaRecorder started', { state: mediaRecorder.state });
            
            setupSpeechHandlers(utterance, mediaRecorder, stream);
          });
        } catch (tabCaptureError) {
          console.warn('[ClipAIble] tabCapture error, falling back to getUserMedia', tabCaptureError);
          useGetUserMedia();
        }
      } else {
        console.log('[ClipAIble] tabCapture not available, using getUserMedia');
        useGetUserMedia();
      }
      
      function setupSpeechHandlers(utterance, mediaRecorder, stream) {
        utterance.onstart = () => {
          console.log('[ClipAIble] Speech synthesis started');
        };
        
        utterance.onend = () => {
          console.log('[ClipAIble] Speech synthesis ended');
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
              console.log('[ClipAIble] Stopping MediaRecorder after speech ended');
              mediaRecorder.stop();
            }
            if (stream && stream.getTracks) {
              stream.getTracks().forEach(track => track.stop());
            }
          }, 500);
        };
        
        utterance.onerror = (event) => {
          console.error('[ClipAIble] Speech synthesis error', event);
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
          if (stream && stream.getTracks) {
            stream.getTracks().forEach(track => track.stop());
          }
          reject(new Error(event.error || 'Speech synthesis error'));
        };
        
        console.log('[ClipAIble] Starting speech synthesis', { textLength: text.length, voice: voiceObj?.name, rate: utterance.rate });
        window.speechSynthesis.speak(utterance);
        
        // Fallback timeout
        setTimeout(() => {
          if (mediaRecorder.state !== 'inactive') {
            console.log('[ClipAIble] Timeout reached, stopping MediaRecorder');
            mediaRecorder.stop();
            if (stream && stream.getTracks) {
              stream.getTracks().forEach(track => track.stop());
            }
          }
        }, (text.length / 10) * 1000 * (1 / speed) + 5000);
      }
      
      function useGetUserMedia() {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          reject(new Error('getUserMedia is not available. Offline TTS requires audio capture permission.'));
          return;
        }
        
        console.log('[ClipAIble] Requesting getUserMedia for audio capture');
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            // Try to capture system audio (may not work in all browsers)
            suppressLocalAudioPlayback: false
          }
        })
        .then(stream => {
          console.log('[ClipAIble] getUserMedia stream obtained', { streamId: stream.id, tracksCount: stream.getTracks().length });
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(mediaStreamDestination);
          mediaRecorder.start();
          console.log('[ClipAIble] MediaRecorder started with getUserMedia', { state: mediaRecorder.state });
          
          setupSpeechHandlers(utterance, mediaRecorder, stream);
        })
        .catch(error => {
          console.error('[ClipAIble] getUserMedia failed', error);
          reject(new Error(`Failed to access audio: ${error.message}. Offline TTS requires audio capture permission.`));
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Export function to global scope for executeScript
// This must be executed immediately when script loads
(function() {
  if (typeof window !== 'undefined') {
    window.executeOfflineTTS = executeOfflineTTS;
    // Log for debugging
    console.log('[ClipAIble] executeOfflineTTS function exported to window', typeof window.executeOfflineTTS);
  } else {
    console.error('[ClipAIble] window is undefined, cannot export executeOfflineTTS');
  }
})();


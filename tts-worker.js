// @ts-check
// @ts-nocheck - Worker.postMessage has different signature than Window.postMessage
// TTS Web Worker - Executes TTS operations in separate thread to avoid blocking main thread
// This worker runs in offscreen document to handle WASM operations without blocking popup

console.log('[ClipAIble TTS Worker] Worker initialized', {
  timestamp: Date.now(),
  location: self.location.href
});

let ttsModule = null;
let isInitializing = false;
let initPromise = null;

/**
 * Initialize TTS module in worker
 * Sets up import map for onnxruntime-web if needed
 */
async function initTTS(moduleUrl, onnxRuntimeUrl) {
  if (ttsModule) {
    return ttsModule;
  }
  
  if (initPromise) {
    return initPromise;
  }
  
  isInitializing = true;
  initPromise = (async () => {
    try {
      console.log('[ClipAIble TTS Worker] Loading TTS module...', {
        timestamp: Date.now(),
        moduleUrl,
        onnxRuntimeUrl
      });
      
      if (!moduleUrl) {
        throw new Error('Module URL is required');
      }
      
      // In Web Worker, we need to set up import map differently
      // Workers don't have document, so we can't use <script type="importmap">
      // Instead, we need to patch the module before import or use import.meta.resolve
      
      // CRITICAL: Web Workers don't support import maps via <script> tags
      // We need to use a workaround: patch the module's import statement
      // or use import.meta.resolve() if available
      
      console.log('[ClipAIble TTS Worker] Setting up import resolution for onnxruntime-web', {
        moduleUrl,
        onnxRuntimeUrl
      });
      
      // For Chrome Extensions in Web Workers, we can use import.meta.resolve() if available
      // Otherwise, we need to patch the module or use a wrapper
      // Since piper-tts-web uses dynamic import('onnxruntime-web'), we need to intercept it
      
      // Try to set up a global import map resolver for the worker
      if (onnxRuntimeUrl && typeof import.meta !== 'undefined' && typeof import.meta.resolve === 'function') {
        // Use import.meta.resolve if available (Chrome 126+)
        try {
          // This won't work directly, but we can try to patch the module
          console.log('[ClipAIble TTS Worker] import.meta.resolve available, but cannot patch dynamic imports');
        } catch (e) {
          console.warn('[ClipAIble TTS Worker] import.meta.resolve not working', e);
        }
      }
      
      // CRITICAL: Web Workers don't support import maps via <script type="importmap">
      // piper-tts-web uses dynamic import('onnxruntime-web'), which requires import map
      // Since we can't create import map in worker, we need to patch the import
      // 
      // Solution: Use import.meta.resolve() if available (Chrome 126+)
      // Or patch the module's import statement before loading
      
      console.log('[ClipAIble TTS Worker] Importing piper-tts-web module from', moduleUrl);
      
      // CRITICAL: This will fail because piper-tts-web tries to import('onnxruntime-web')
      // and workers don't support import maps. We need to either:
      // 1. Patch piper-tts-web to use direct URL import
      // 2. Use a wrapper that intercepts the import
      // 3. Disable Web Worker and use direct execution
      //
      // For now, try to import and catch the error - we'll fall back to direct execution
      let module;
      try {
        module = await import(moduleUrl);
      } catch (importError) {
        // Check if error is about onnxruntime-web import
        if (importError.message && importError.message.includes('onnxruntime-web')) {
          console.error('[ClipAIble TTS Worker] Failed to import piper-tts-web due to onnxruntime-web import issue', {
            error: importError.message,
            note: 'Web Workers don\'t support import maps. Falling back to direct execution in main thread.'
          });
          throw new Error('Web Worker cannot resolve onnxruntime-web import. Import maps are not supported in Web Workers. This is a limitation of the Web Worker API.');
        }
        throw importError;
      }
      
      console.log('[ClipAIble TTS Worker] Module loaded', {
        hasPredict: typeof module.predict === 'function',
        hasVoices: typeof module.voices === 'function',
        hasDownload: typeof module.download === 'function',
        hasStored: typeof module.stored === 'function',
        moduleKeys: Object.keys(module)
      });
      
      ttsModule = module;
      isInitializing = false;
      return module;
    } catch (error) {
      console.error('[ClipAIble TTS Worker] Failed to initialize', {
        error: error.message,
        stack: error.stack,
        moduleUrl
      });
      isInitializing = false;
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
}

/**
 * Handle messages from main thread
 */
self.addEventListener('message', async (event) => {
  const { type, id, data, moduleUrl } = event.data;
  
  console.log('[ClipAIble TTS Worker] Message received', {
    type,
    id,
    timestamp: Date.now(),
    hasData: !!data,
    hasModuleUrl: !!moduleUrl
  });
  
  try {
    switch (type) {
      case 'INIT': {
        // Get module URL and ONNX Runtime URL from message data (sent from main thread)
        // It can be at top level (moduleUrl) or nested (data.moduleUrl)
        const finalModuleUrl = moduleUrl || data?.moduleUrl || event.data.moduleUrl;
        const onnxRuntimeUrl = data?.onnxRuntimeUrl || event.data.onnxRuntimeUrl;
        
        if (!finalModuleUrl) {
          throw new Error('Module URL not provided');
        }
        
        console.log('[ClipAIble TTS Worker] Initializing with module URL', {
          moduleUrl: finalModuleUrl,
          onnxRuntimeUrl
        });
        
        const module = await initTTS(finalModuleUrl, onnxRuntimeUrl);
        
        self.postMessage({
          type: 'INIT_RESPONSE',
          id,
          success: true,
          hasModule: !!module
        });
        break;
      }
      
      case 'PREDICT': {
        if (!ttsModule) {
          // Should not happen if INIT was called first, but handle gracefully
          throw new Error('TTS module not initialized. Call INIT first.');
        }
        
        const { text, voiceId } = data;
        if (!text || !voiceId) {
          throw new Error('Text and voiceId are required for PREDICT');
        }
        
        console.log('[ClipAIble TTS Worker] Starting predict', {
          id,
          textLength: text?.length,
          voiceId,
          textPreview: text?.substring(0, 50)
        });
        
        const startTime = Date.now();
        
        try {
          // Execute predict in worker thread - this should not block main thread
          const blob = await ttsModule.predict({
            text,
            voiceId
          });
          
          const duration = Date.now() - startTime;
          
          console.log('[ClipAIble TTS Worker] Predict completed', {
            id,
            duration,
            blobSize: blob?.size,
            blobType: blob?.type
          });
          
          // Convert Blob to ArrayBuffer for transfer
          const arrayBuffer = await blob.arrayBuffer();
          
          // Worker.postMessage accepts transfer array as second parameter
          // @ts-expect-error - TypeScript doesn't recognize Worker postMessage signature
          self.postMessage({
            type: 'PREDICT_RESPONSE',
            id,
            success: true,
            audioData: arrayBuffer,
            duration,
            blobSize: blob?.size
          }, [arrayBuffer]); // Transfer ownership to avoid copying
        } catch (predictError) {
          console.error('[ClipAIble TTS Worker] Predict failed', {
            id,
            error: predictError.message,
            stack: predictError.stack,
            voiceId,
            textLength: text?.length
          });
          throw predictError;
        }
        break;
      }
      
      case 'VOICES': {
        if (!ttsModule) {
          await initTTS();
        }
        
        const voices = await ttsModule.voices();
        self.postMessage({
          type: 'VOICES_RESPONSE',
          id,
          success: true,
          voices
        });
        break;
      }
      
      default:
        self.postMessage({
          type: 'ERROR',
          id,
          error: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    console.error('[ClipAIble TTS Worker] Error processing message', {
      type,
      id,
      error: error.message,
      stack: error.stack
    });
    
    self.postMessage({
      type: 'ERROR',
      id,
      error: error.message,
      stack: error.stack
    });
  }
});

console.log('[ClipAIble TTS Worker] Worker ready', {
  timestamp: Date.now()
});


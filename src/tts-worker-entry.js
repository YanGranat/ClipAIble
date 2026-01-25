// @ts-check
// TTS Worker Entry Point for esbuild bundle
// This file will be bundled by esbuild to create a self-contained worker
// that includes piper-tts-web, but NOT onnxruntime-web (loaded via importScripts)

// CRITICAL: Import piper-tts-web statically so esbuild bundles it
import * as piperTTSModule from '@mintplex-labs/piper-tts-web';

const LOG_PREFIX = '[ClipAIble TTS Worker]';

// Worker logging function - CRITICAL: ALWAYS log to console AND send to offscreen
// Console logs are visible in Chrome DevTools offscreen document console
function workerLog(message, data = null) {
  // CRITICAL: Log to console FIRST (visible in DevTools offscreen console)
  console.log(LOG_PREFIX, message, data);

  // Also send to offscreen document via postMessage (for background log collection)
  try {
    self.postMessage({
      type: 'WORKER_LOG',
      message: LOG_PREFIX + ' ' + message,
      data: data,
      timestamp: Date.now()
    });
  } catch (e) {
    // postMessage failed, but console.log above already worked
  }
}

// Worker error logging function - CRITICAL: ALWAYS log to console AND send to offscreen
function workerLogError(message, data = null) {
  // CRITICAL: Log to console FIRST (visible in DevTools offscreen console)
  console.error(LOG_PREFIX, message, data);

  // Also send to offscreen document via postMessage (for background log collection)
  try {
    self.postMessage({
      type: 'WORKER_LOG_ERROR',
      message: LOG_PREFIX + ' ' + message,
      data: data,
      timestamp: Date.now()
    });
  } catch (e) {
    // postMessage failed, but console.error above already worked
  }
}

// CRITICAL: Check for piper file caching issues
workerLog('=== PIPER FILE CACHE CHECK ===', {
  timestamp: Date.now(),
  workerUrl: self.location?.href || 'unknown',
  piperWasmBase: self.location.origin + '/lib/piper-wasm/',
  expectedPiperDataUrl: self.location.origin + '/lib/piper-wasm/piper_phonemize.data',
  expectedPiperWasmUrl: self.location.origin + '/lib/piper-wasm/piper_phonemize.wasm',
  expectedPiperJsUrl: self.location.origin + '/lib/piper-wasm/piper_phonemize.js',
  cacheBuster: Date.now(),
  manifestVersion: typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getManifest?.()?.version : 'unknown'
});

// CRITICAL: Test postMessage immediately
try {
  self.postMessage({
    type: 'WORKER_STARTUP_TEST',
    message: 'Worker is starting up',
    timestamp: Date.now()
  });
  workerLog('WORKER_STARTUP_TEST message sent successfully');
} catch (e) {
  workerLogError('Failed to send WORKER_STARTUP_TEST message', { error: e.message });
}

workerLog('Worker entry point loaded', {
  timestamp: Date.now(),
  workerLocation: self.location?.href,
  hasSelfOrt: !!self.ort,
  hasSelfOnnxruntime: !!self.onnxruntime,
  ortVersion: self.ort?.version || 'unknown'
});

// CRITICAL: Load ONNX Runtime 1.19.0 on top level using importScripts()
// Version 1.19.0 fixes blob URL issues and supports multithreading in Chrome Extensions
// Using ort.all.min.js which may include WASM inline and avoid blob URL issues
// Calculate ortUrl from self.location.href (Worker script location)
const workerUrl = new URL(self.location.href);
// Worker is at: chrome-extension://<EXT_ID>/dist/tts-worker-bundle.js
const origin = workerUrl.origin;

// CRITICAL: Support both development (node_modules) and production (lib) paths
// Try node_modules first (for development), fallback to lib (for production archive)
const ortUrlDev = origin + '/node_modules/onnxruntime-web/dist/ort.all.min.js';
const ortUrlProd = origin + '/lib/ort.all.min.js';

workerLog('Worker location:', { href: workerUrl.href });
workerLog('Will try to load ONNX Runtime 1.19.0 from:', {
  devPath: ortUrlDev,
  prodPath: ortUrlProd
});

// Load ONNX Runtime synchronously on top level
// importScripts() works with chrome-extension:// URLs if file is in web_accessible_resources
// Using ort.all.min.js which includes all backends and may avoid blob URL issues
let loadedFromProd = false; // Track which path was successful

workerLog('========== ONNX RUNTIME LOADING START ==========', {
  ortUrlDev,
  ortUrlProd,
  timestamp: Date.now()
});

try {
  // Try development path first (node_modules)
  try {
    workerLog('ATTEMPT 1: Trying to load ONNX Runtime from development path (node_modules)...', {
      url: ortUrlDev,
      timestamp: Date.now()
    });
    importScripts(ortUrlDev);
    workerLog('✅ ATTEMPT 1 SUCCESS: Loaded ONNX Runtime from development path', {
      loadedFromProd: false,
      timestamp: Date.now()
    });
    loadedFromProd = false;
  } catch (devError) {
    // If dev path fails, try production path (lib)
    workerLog('❌ ATTEMPT 1 FAILED: Dev path error', {
      error: devError.message,
      stack: devError.stack,
      name: devError.name,
      attemptedUrl: ortUrlDev,
      timestamp: Date.now()
    });

    workerLog('ATTEMPT 2: Trying to load ONNX Runtime from production path (lib)...', {
      url: ortUrlProd,
      timestamp: Date.now()
    });

    try {
      importScripts(ortUrlProd);
      workerLog('✅ ATTEMPT 2 SUCCESS: Loaded ONNX Runtime from production path', {
        loadedFromProd: true,
        timestamp: Date.now()
      });
      loadedFromProd = true;
    } catch (prodError) {
      workerLogError('❌ ATTEMPT 2 FAILED: Production path error', {
        error: prodError.message,
        stack: prodError.stack,
        name: prodError.name,
        attemptedUrl: ortUrlProd,
        timestamp: Date.now(),
        '== BOTH PATHS FAILED ==': 'This is a critical error - cannot load ONNX Runtime'
      });
      throw prodError;
    }
  }

  // CRITICAL: Check that ONNX Runtime loaded correctly
  if (!self.ort || !self.ort.env) {
    throw new Error('ONNX Runtime not loaded - ort or ort.env is undefined');
  }

  // Make it available globally for piper-tts-web
  self.onnxruntime = self.ort;

  // CRITICAL: Configure WASM paths IMMEDIATELY after loading ONNX Runtime
  // Version 1.19.0 supports wasmPaths configuration and multithreading
  // This must be done BEFORE any InferenceSession is created
  // Use the same path where ONNX Runtime was successfully loaded
  workerLog('========== CONFIGURING WASM PATHS ==========', {
    loadedFromProd,
    origin,
    timestamp: Date.now()
  });

  const wasmBasePath = loadedFromProd
    ? origin + '/lib/'
    : origin + '/node_modules/onnxruntime-web/dist/';

  workerLog('WASM paths calculated', {
    loadedFromProd,
    wasmBasePath,
    isLibPath: wasmBasePath.includes('/lib/'),
    isNodeModulesPath: wasmBasePath.includes('/node_modules/'),
    timestamp: Date.now()
  });
  
  // Initialize wasm config if not exists
  self.ort.env.wasm = self.ort.env.wasm || {};
  
  // CRITICAL: Set wasmPaths as STRING (works in 1.19.0)
  // This tells ONNX Runtime where to find WASM files
  // CRITICAL: wasmPaths works ONLY with numThreads=1
  // numThreads > 1 forces ONNX Runtime to create blob URLs for WebWorker threads
  // This violates Chrome Extension CSP which doesn't allow blob: in extension_pages
  self.ort.env.wasm.wasmPaths = wasmBasePath;
  
  // Also set in env directly (some versions use this)
  if (self.ort.env) {
    self.ort.env.wasmPaths = wasmBasePath;
  }
  
  // CRITICAL: numThreads=1 avoids blob URL creation in Chrome Extension
  // numThreads > 1 requires blob URLs for WebWorker threads, which CSP blocks
  // Worker context already isolates WASM from main thread, so numThreads=1 is sufficient
  // Performance: Slightly slower than numThreads=2, but works without blob URL issues
  self.ort.env.wasm.numThreads = 1;
  
  // CRITICAL: Explicitly disable JSEP (JavaScript Execution Provider) to prevent threaded WASM
  // JSEP is used for multithreading and requires blob URLs, which CSP blocks
  // Setting numThreads=1 should disable JSEP, but we explicitly disable it to be sure
  if (self.ort.env.wasm.setNumThreads) {
    self.ort.env.wasm.setNumThreads(1);
  }
  
  // Enable SIMD for better performance (works with numThreads=1)
  self.ort.env.wasm.simd = true;
  
  // Disable proxy (not needed in Worker)
  self.ort.env.wasm.proxy = false;
  
  // CRITICAL: Explicitly set executionProviders to only use WASM (not JSEP)
  // This prevents ONNX Runtime from trying to use multithreading
  if (self.ort.env && typeof self.ort.env.setExecutionProviders === 'function') {
    try {
      self.ort.env.setExecutionProviders(['wasm']);
  workerLog('Execution providers set to WASM only', {
    executionProviders: self.ort.env.executionProviders || ['wasm']
  });
    } catch (e) {
      console.warn(LOG_PREFIX, 'Could not set execution providers', {
        error: e.message
      });
    }
  }
  
  workerLog('ONNX Runtime 1.19.0 configured for Chrome Extension', {
    wasmPaths: self.ort.env.wasm.wasmPaths,
    numThreads: self.ort.env.wasm.numThreads, // Must be 1 to avoid blob URL
    simd: self.ort.env.wasm.simd,
    proxy: self.ort.env.wasm.proxy,
    hasInferenceSession: !!self.ort.InferenceSession,
    version: self.ort.version || 'unknown',
    note: 'numThreads=1 avoids blob URL creation (required for Chrome Extension CSP)'
  });

  workerLog('ONNX Runtime 1.19.0 loaded successfully', {
    hasOrt: typeof self.ort !== 'undefined',
    hasEnv: !!self.ort.env,
    hasWasm: !!self.ort.env.wasm,
    timestamp: Date.now()
  });
} catch (error) {
  workerLogError('Failed to load ONNX Runtime 1.19.0', {
    error: error.message,
    stack: error.stack,
    triedPaths: {
      dev: ortUrlDev,
      prod: ortUrlProd
    },
    timestamp: Date.now()
  });
  // Re-throw - Worker cannot work without ONNX Runtime
  throw new Error(`Failed to load ONNX Runtime 1.19.0: ${error.message}`);
}

  // CRITICAL: Intercept fetch to block CDN requests from piper-tts-web
  // piper-tts-web 1.0.4 has hardcoded CDN URLs for ONNX Runtime 1.18.0
  // We must block these to prevent CSP violations
  // IMPORTANT: Only block REAL CDN requests (http/https), NOT local extension files (chrome-extension://)
  const originalFetch = self.fetch;
  self.fetch = function(url, options) {
    // Convert URL to string if it's a Request object
    const urlString = typeof url === 'string' ? url : url.url || String(url);

    workerLog('=== FETCH INTERCEPTED ===', {
      urlString,
      isRequestObject: typeof url !== 'string',
      hasOptions: !!options,
      timestamp: Date.now()
    });

    // CRITICAL: Only block REAL CDN requests (http/https), NOT local extension files
    // Local extension files use chrome-extension:// protocol and should be allowed
    const isExternalCDN = urlString.startsWith('http://') || urlString.startsWith('https://');

    // CRITICAL: Allow piper-wasm files from CDN (they're not available locally)
    // piper-wasm files are required for phonemization and are safe to load from CDN
    const isPiperWasmFile = urlString.includes('piper-wasm') ||
                            urlString.includes('piper_phonemize') ||
                            urlString.endsWith('.data') ||
                            (urlString.includes('jsdelivr.net') && urlString.includes('piper'));

    workerLog('Fetch analysis', {
      urlString,
      isExternalCDN,
      isPiperWasmFile,
      isChromeExtension: urlString.startsWith('chrome-extension://'),
      isPiperPhonemizeFile: urlString.includes('piper_phonemize'),
      endsWithData: urlString.endsWith('.data'),
      endsWithWasm: urlString.endsWith('.wasm'),
      endsWithJs: urlString.endsWith('.js'),
      timestamp: Date.now()
    });

    // Block only external CDN requests for ONNX Runtime (NOT piper-wasm)
    if (isExternalCDN && !isPiperWasmFile && (
        urlString.includes('cdnjs.cloudflare.com') ||
        urlString.includes('unpkg.com') ||
        (urlString.includes('jsdelivr.net') && !urlString.includes('piper')) ||
        urlString.includes('ort-wasm') ||
        urlString.includes('onnxruntime-web'))) {
      workerLog('BLOCKED CDN request', {
        urlString,
        reason: 'CDN requests are blocked in Chrome Extension CSP',
        note: 'ONNX Runtime must be loaded from local extension files',
        isExternalCDN,
        isPiperWasmFile,
        timestamp: Date.now()
      });
      throw new Error(`CDN request blocked: ${urlString}. Chrome Extension CSP does not allow external CDN requests. Use local ONNX Runtime files instead.`);
    }

    // CRITICAL: Log ALL piper file requests to detect caching issues
    if (urlString.includes('piper-wasm') || urlString.includes('piper_phonemize') ||
        urlString.includes('ort-wasm') || urlString.includes('onnxruntime')) {
      workerLog('=== PIPER/ORT FILE FETCH ===', {
        urlString,
        isExternalCDN,
        isChromeExtension: urlString.startsWith('chrome-extension://'),
        isPiperWasm: urlString.includes('piper-wasm'),
        isPiperPhonemize: urlString.includes('piper_phonemize'),
        isPiperData: urlString.endsWith('.data'),
        isPiperWasmFile: urlString.endsWith('.wasm'),
        isPiperJsFile: urlString.endsWith('.js'),
        fullUrl: urlString,
        expectedPiperWasmPath: urlString.includes('/lib/piper-wasm/'),
        cacheBuster: Date.now(),
        timestamp: Date.now()
      });
    }

    workerLog('Proceeding with fetch', {
      urlString,
      willCallOriginalFetch: true,
      timestamp: Date.now()
    });

    try {
      const result = originalFetch.call(this, url, options);

      // CRITICAL: Log piper file fetch results
      if (urlString.includes('piper-wasm') || urlString.includes('piper_phonemize')) {
        workerLog('=== PIPER FILE FETCH SUCCESS ===', {
          urlString,
          hasResult: !!result,
          resultType: result?.constructor?.name || 'unknown',
          isResponse: result instanceof Response,
          status: result?.status,
          statusText: result?.statusText,
          headers: result?.headers ? Object.fromEntries(result.headers.entries()) : null,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (fetchError) {
      // CRITICAL: Log piper file fetch failures
      if (urlString.includes('piper-wasm') || urlString.includes('piper_phonemize')) {
        workerLog('=== PIPER FILE FETCH FAILED ===', {
          urlString,
          error: fetchError.message,
          errorName: fetchError.name,
          stack: fetchError.stack,
          isNetworkError: fetchError.message.includes('NetworkError'),
          timestamp: Date.now()
        });
      }

      workerLog('Fetch failed', {
        urlString,
        error: fetchError.message,
        stack: fetchError.stack,
        timestamp: Date.now()
      });
      throw fetchError;
    }
  };

workerLog('CDN fetch interceptor installed', {
  note: 'All CDN requests for ONNX Runtime will be blocked',
  timestamp: Date.now()
});

// Lazy import piper-tts-web
let piperTTS = null;
let isInitialized = false;

workerLog('Piper TTS variables initialized', {
  piperTTS: piperTTS,
  isInitialized: isInitialized,
  timestamp: Date.now()
});

async function initPiperTTS() {
  workerLog('=== initPiperTTS FUNCTION CALLED ===', {
    timestamp: Date.now(),
    alreadyHasPiperTTS: !!piperTTS,
    alreadyInitialized: isInitialized,
    hasSelfOrt: !!self.ort,
    hasSelfOrtEnv: !!(self.ort && self.ort.env),
    hasSelfOrtEnvWasm: !!(self.ort && self.ort.env && self.ort.env.wasm),
    ortVersion: self.ort?.version || 'unknown'
  });

  if (piperTTS) {
    workerLog('initPiperTTS: piperTTS already loaded, returning cached instance', {
      timestamp: Date.now(),
      hasPredict: typeof piperTTS.predict === 'function',
      hasVoices: typeof piperTTS.voices === 'function',
      hasDownload: typeof piperTTS.download === 'function',
      hasStored: typeof piperTTS.stored === 'function'
    });
    return piperTTS;
  }

  if (!self.ort) {
    workerLogError('initPiperTTS: ONNX Runtime not loaded - cannot initialize piper-tts-web', {
      timestamp: Date.now(),
      hasSelfOrt: !!self.ort,
      hasSelfOnnxruntime: !!self.onnxruntime
    });
    throw new Error('ONNX Runtime not loaded - cannot initialize piper-tts-web');
  }

  workerLog('initPiperTTS: Starting piper-tts-web import', {
    timestamp: Date.now(),
    ortVersion: self.ort.version || 'unknown',
    ortEnvWasmNumThreads: self.ort?.env?.wasm?.numThreads,
    ortEnvWasmSimd: self.ort?.env?.wasm?.simd,
    ortEnvWasmProxy: self.ort?.env?.wasm?.proxy,
    piperWasmBasePath: self.location.origin + '/lib/piper-wasm/',
    expectedPiperDataPath: self.location.origin + '/lib/piper-wasm/piper_phonemize.data',
    expectedPiperWasmPath: self.location.origin + '/lib/piper-wasm/piper_phonemize.wasm'
  });

  try {
    // CRITICAL: Use statically imported module (not dynamic import)
    // Dynamic import doesn't work in production because it tries to load from node_modules
    // Static import is bundled by esbuild into the worker bundle
    workerLog('initPiperTTS: Using statically imported piper-tts-web module', {
      timestamp: Date.now()
    });
    const importStartTime = Date.now();
    const module = piperTTSModule; // Use the statically imported module
    const importDuration = Date.now() - importStartTime;

    workerLog('initPiperTTS: piper-tts-web import completed', {
      timestamp: Date.now(),
      importDuration,
      moduleType: typeof module,
      moduleKeys: Object.keys(module),
      moduleKeysCount: Object.keys(module).length,
      hasPredict: typeof module.predict === 'function',
      hasVoices: typeof module.voices === 'function',
      hasDownload: typeof module.download === 'function',
      hasStored: typeof module.stored === 'function',
      hasTtsSession: typeof module.TtsSession === 'function',
      ttsSessionKeys: module.TtsSession ? Object.keys(module.TtsSession) : [],
      ttsSessionHasInstance: !!(module.TtsSession && module.TtsSession._instance),
      wasmLocations: module.TtsSession?.WASM_LOCATIONS || 'not available',
      defaultWasmPaths: module.TtsSession?.WASM_LOCATIONS ? {
        onnxWasm: module.TtsSession.WASM_LOCATIONS.onnxWasm,
        piperData: module.TtsSession.WASM_LOCATIONS.piperData,
        piperWasm: module.TtsSession.WASM_LOCATIONS.piperWasm
      } : 'not available'
    });

    piperTTS = module;

    // CRITICAL: Re-enforce numThreads=1 after piper-tts-web initialization
    // piper-tts-web may set numThreads in its init() method, we must override it
    workerLog('initPiperTTS: Checking numThreads before re-enforcement', {
      timestamp: Date.now(),
      currentNumThreads: self.ort?.env?.wasm?.numThreads,
      hasOrt: !!self.ort,
      hasOrtEnv: !!self.ort.env,
      hasOrtEnvWasm: !!self.ort.env.wasm
    });

    if (self.ort && self.ort.env && self.ort.env.wasm) {
      const oldNumThreads = self.ort.env.wasm.numThreads;
      self.ort.env.wasm.numThreads = 1;
      workerLog('initPiperTTS: Re-enforced numThreads=1 after piper-tts-web load', {
        timestamp: Date.now(),
        oldNumThreads,
        newNumThreads: self.ort.env.wasm.numThreads,
        note: 'This ensures numThreads stays 1 even if piper-tts-web tries to change it',
        numThreadsChanged: oldNumThreads !== 1
      });
    } else {
      console.warn(LOG_PREFIX, 'initPiperTTS: Cannot access ort.env.wasm to check numThreads', {
        timestamp: Date.now(),
        hasOrt: !!self.ort,
        hasOrtEnv: !!self.ort?.env,
        hasOrtEnvWasm: !!self.ort?.env?.wasm
      });
    }

    console.log(LOG_PREFIX, 'initPiperTTS: Piper TTS module assigned and configured', {
      timestamp: Date.now(),
      hasPredict: typeof module.predict === 'function',
      hasVoices: typeof module.voices === 'function',
      hasDownload: typeof module.download === 'function',
      hasStored: typeof module.stored === 'function',
      moduleKeys: Object.keys(module),
      numThreadsAfterLoad: self.ort?.env?.wasm?.numThreads,
      ortVersion: self.ort?.version || 'unknown'
    });

    return piperTTS;
  } catch (error) {
    console.error(LOG_PREFIX, 'initPiperTTS: Failed to import piper-tts-web', {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      errorName: error.name,
      errorType: typeof error
    });
    throw new Error(`Failed to load piper-tts-web: ${error.message}`);
  }
}

console.log(LOG_PREFIX, 'initPiperTTS function defined', {
  timestamp: Date.now(),
  functionExists: typeof initPiperTTS === 'function'
});

// Message handler
workerLog('Message event listener registered', {
  timestamp: Date.now(),
  hasSelfAddEventListener: typeof self.addEventListener === 'function'
});

// Add error handler for worker
self.addEventListener('error', (error) => {
  workerLogError('=== WORKER ERROR EVENT ===', {
    timestamp: Date.now(),
    message: error.message,
    filename: error.filename,
    lineno: error.lineno,
    colno: error.colno,
    error: error.error
  });
});

// Add unhandled rejection handler
self.addEventListener('unhandledrejection', (event) => {
  workerLogError('=== WORKER UNHANDLED REJECTION ===', {
    timestamp: Date.now(),
    reason: event.reason,
    reasonType: typeof event.reason,
    reasonMessage: event.reason?.message,
    reasonStack: event.reason?.stack
  });
  event.preventDefault(); // Prevent default handling
});

self.addEventListener('message', async (event) => {
  const messageStartTime = Date.now();
  const { type, id, data } = event.data || {};

  workerLog('=== WORKER MESSAGE RECEIVED ===', {
    timestamp: messageStartTime,
    type,
    id,
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    dataKeysCount: data ? Object.keys(data).length : 0,
    eventDataKeys: event.data ? Object.keys(event.data) : [],
    isInitialized,
    hasPiperTTS: !!piperTTS,
    hasSelfOrt: !!self.ort,
    ortVersion: self.ort?.version || 'unknown'
  });

  // Removed excessive "Message received" logging - too noisy for production
  // Only critical errors and important state changes are logged now

  try {
    switch (type) {
      case 'INIT': {
        console.log(LOG_PREFIX, '=== INIT MESSAGE HANDLER STARTED ===', {
          timestamp: Date.now(),
          id,
          wasInitialized: isInitialized,
          hasPiperTTS: !!piperTTS,
          hasSelfOrt: !!self.ort,
          ortVersion: self.ort?.version || 'unknown',
          ortEnvWasmNumThreads: self.ort?.env?.wasm?.numThreads
        });

        // ONNX Runtime is already loaded on top level
        // Just need to load piper-tts-web
        console.log(LOG_PREFIX, 'INIT: Starting piper-tts-web initialization', {
          timestamp: Date.now(),
          id
        });

        const initStartTime = Date.now();
        await initPiperTTS();
        const initDuration = Date.now() - initStartTime;

        isInitialized = true;
        console.log(LOG_PREFIX, 'INIT: TTS initialization completed', {
          timestamp: Date.now(),
          id,
          initDuration,
          isInitialized,
          hasPiperTTS: !!piperTTS,
          piperTTSKeys: piperTTS ? Object.keys(piperTTS) : []
        });

        console.log(LOG_PREFIX, 'INIT: Sending INIT_SUCCESS response', {
          timestamp: Date.now(),
          id,
          messageDuration: Date.now() - messageStartTime
        });

        self.postMessage({
          type: 'INIT_SUCCESS',
          id
        });

        console.log(LOG_PREFIX, '=== INIT MESSAGE HANDLER COMPLETED ===', {
          timestamp: Date.now(),
          id,
          totalDuration: Date.now() - messageStartTime
        });
        break;
      }
      
      case 'PREDICT': {
        const { text, voiceId } = data || {};
        if (!text || !voiceId) {
          throw new Error('Text and voiceId are required for PREDICT');
        }
        
        // CRITICAL: Log voice received in Worker
        console.log(LOG_PREFIX, '===== VOICE RECEIVED IN WORKER (PREDICT) =====', {
          id,
          voiceId,
          voiceIdType: typeof voiceId,
          voiceIdString: String(voiceId || ''),
          isNumeric: /^\d+$/.test(String(voiceId || '')),
          hasUnderscore: voiceId && String(voiceId).includes('_'),
          hasDash: voiceId && String(voiceId).includes('-'),
          isValidFormat: voiceId && (String(voiceId).includes('_') || String(voiceId).includes('-')),
          VOICE_STRING: `VOICE="${String(voiceId || '')}"`, // Explicit string for visibility
          textLength: text?.length,
          timestamp: Date.now()
        });
        
        // CRITICAL: Re-enforce numThreads=1 before each predict call
        // This ensures numThreads stays 1 even if piper-tts-web changes it during init()
        if (self.ort && self.ort.env && self.ort.env.wasm) {
          if (self.ort.env.wasm.numThreads !== 1) {
            console.warn(LOG_PREFIX, 'numThreads was changed, re-enforcing to 1', {
              previousValue: self.ort.env.wasm.numThreads,
              id
            });
            self.ort.env.wasm.numThreads = 1;
          }
        }
        
        console.log(LOG_PREFIX, 'Starting predict', {
          id,
          textLength: text?.length,
          voiceId,
          textPreview: text?.substring(0, 50),
          isInitialized,
          hasPiperTTS: !!piperTTS,
          hasOnnxRuntime: typeof self.ort !== 'undefined',
          numThreads: self.ort?.env?.wasm?.numThreads
        });
        
        if (!piperTTS || !isInitialized) {
          throw new Error('TTS not initialized - call INIT first');
        }
        
        // CRITICAL: Ensure onnxruntime is available
        if (!self.ort && !self.onnxruntime) {
          throw new Error('onnxruntime is not available in Worker. ONNX Runtime should be loaded on top level.');
        }
        
        const startTime = Date.now();
        
        // CRITICAL: Check if TtsSession._instance exists and what voiceId it has
        // This helps diagnose voice switching issues
        if (piperTTS && piperTTS.TtsSession) {
          const hasInstance = piperTTS.TtsSession._instance !== null && piperTTS.TtsSession._instance !== undefined;
          const instanceVoiceId = piperTTS.TtsSession._instance?.voiceId;
          workerLog('===== TtsSession state before predict() =====', {
            id,
            requestedVoiceId: voiceId,
            requestedVoiceIdType: typeof voiceId,
            requestedVoiceIdString: String(voiceId || ''),
            hasInstance,
            instanceVoiceId,
            instanceVoiceIdType: typeof instanceVoiceId,
            instanceVoiceIdString: String(instanceVoiceId || ''),
            voiceMatches: instanceVoiceId === voiceId,
            willReuseSession: hasInstance && instanceVoiceId === voiceId,
            willCreateNewSession: !hasInstance || instanceVoiceId !== voiceId,
            VOICE_REQUESTED: `VOICE="${String(voiceId || '')}"`,
            VOICE_INSTANCE: `VOICE="${String(instanceVoiceId || '')}"`,
            PROBLEM_DETECTED: hasInstance && instanceVoiceId !== voiceId ? 'WILL REUSE WRONG VOICE!' : 'OK',
            timestamp: Date.now()
          });
          
          // CRITICAL: Warn if instance exists with different voice
          if (hasInstance && instanceVoiceId !== voiceId) {
            workerLogError('🚨 CRITICAL: TtsSession._instance has DIFFERENT voice!', {
              id,
              requestedVoice: voiceId,
              instanceVoice: instanceVoiceId,
              PROBLEM: 'Library will reuse session with wrong voice!',
              ACTION_NEEDED: 'CLEAR_CACHE should have been called before PREDICT',
              timestamp: Date.now()
            });
          }
        } else {
          workerLog('TtsSession not available for checking', {
            id,
            hasPiperTTS: !!piperTTS,
            hasTtsSession: !!(piperTTS && piperTTS.TtsSession)
          });
        }
        
        workerLog('Calling piperTTS.predict()', {
          id,
          textLength: text?.length,
          voiceId,
          textPreview: text?.substring(0, 100),
          hasPiperTTS: !!piperTTS,
          hasPredict: typeof piperTTS.predict === 'function',
          hasOnnxRuntime: typeof self.ort !== 'undefined',
          numThreads: self.ort?.env?.wasm?.numThreads,
          timestamp: startTime
        });
        
        // Call predict - this should use self.onnxruntime instead of importing
        const predictStart = Date.now();
        const result = await piperTTS.predict({
          text,
          voiceId
        });
        const predictDuration = Date.now() - predictStart;
        
        const duration = Date.now() - startTime;
        
        workerLog('Predict complete', {
          id,
          textLength: text?.length,
          voiceId,
          duration,
          predictDuration,
          resultType: result?.constructor?.name,
          resultSize: result?.size || result?.byteLength,
          hasResult: !!result,
          timestamp: Date.now()
        });
        
        // Convert Blob to ArrayBuffer for transfer
        const convertStart = Date.now();
        const arrayBuffer = await result.arrayBuffer();
        const convertDuration = Date.now() - convertStart;
        
        console.log(LOG_PREFIX, 'Blob converted to ArrayBuffer', {
          id,
          arrayBufferSize: arrayBuffer.byteLength,
          convertDuration,
          timestamp: Date.now()
        });
        
        self.postMessage({ 
          type: 'PREDICT_SUCCESS', 
          id, 
          data: arrayBuffer,
          duration,
          blobSize: result?.size
        }, [arrayBuffer]); // Transfer ownership to avoid copying
        break;
      }
      
      case 'VOICES': {
        console.log(LOG_PREFIX, 'VOICES request started', {
          id,
          isInitialized,
          hasPiperTTS: !!piperTTS,
          timestamp: Date.now()
        });
        
        if (!piperTTS || !isInitialized) {
          throw new Error('TTS not initialized');
        }
        
        const startTime = Date.now();
        const voicesList = await piperTTS.voices();
        const duration = Date.now() - startTime;
        
        console.log(LOG_PREFIX, 'VOICES request completed', {
          id,
          duration,
          voicesCount: Array.isArray(voicesList) ? voicesList.length : 0,
          isArray: Array.isArray(voicesList),
          firstFewVoices: Array.isArray(voicesList) ? voicesList.slice(0, 3).map(v => ({
            key: v?.key,
            name: v?.name,
            language: v?.language?.code
          })) : null
        });
        
        self.postMessage({ 
          type: 'VOICES_SUCCESS', 
          id, 
          data: voicesList 
        });
        break;
      }
      
      case 'CLEAR_CACHE': {
        console.log(LOG_PREFIX, '===== CLEAR_CACHE REQUEST RECEIVED IN WORKER =====', {
          id,
          timestamp: Date.now(),
          hasPiperTTS: !!piperTTS,
          hasTtsSession: !!(piperTTS && piperTTS.TtsSession),
          isInitialized,
          CRITICAL: 'Worker must clear TtsSession._instance to allow new voice'
        });
        
        // CRITICAL: Clear TtsSession singleton instance in Worker
        // The library uses TtsSession._instance singleton which caches the ONNX Runtime InferenceSession
        // When voice changes, we must clear _instance to force creation of new session with new voice model
        if (piperTTS && piperTTS.TtsSession) {
          try {
            const hadInstance = piperTTS.TtsSession._instance !== null && piperTTS.TtsSession._instance !== undefined;
            const instanceVoiceId = piperTTS.TtsSession._instance?.voiceId;
            
            console.log(LOG_PREFIX, '===== TtsSession STATE BEFORE CLEAR =====', {
              id,
              hadInstance,
              instanceVoiceId,
              instanceVoiceIdType: typeof instanceVoiceId,
              instanceVoiceIdString: String(instanceVoiceId || ''),
              VOICE_IN_INSTANCE: `VOICE="${String(instanceVoiceId || '')}"`,
              action: 'About to clear _instance to force new session creation'
            });
            
            // CRITICAL: Try to release ONNX Runtime InferenceSession before clearing _instance
            // This frees WASM memory and ensures old session is not reused
            // Note: _ortSession is private, but setting _instance to null should allow GC to clean it up
            // However, we can't directly access private fields, so we rely on clearing _instance
            if (hadInstance && piperTTS.TtsSession._instance) {
              // Try to access session through instance if possible
              // The session is stored in private field _ortSession, but we can't access it directly
              // Setting _instance to null will allow GC to clean up the old session
              console.log(LOG_PREFIX, '===== ATTEMPTING TO RELEASE ONNX SESSION =====', {
                id,
                instanceVoiceId,
                hadInstance,
                hasOrtSession: !!(piperTTS.TtsSession._instance && piperTTS.TtsSession._instance._ortSession),
                action: 'Trying to release _ortSession if accessible'
              });
              
              // Attempt to release ONNX Runtime session if accessible
              if (piperTTS.TtsSession._instance && piperTTS.TtsSession._instance._ortSession && typeof piperTTS.TtsSession._instance._ortSession.release === 'function') {
                console.log(LOG_PREFIX, '===== RELEASING _ortSession =====', {
                  id,
                  instanceVoiceId,
                  action: 'Calling _ortSession.release()'
                });
                piperTTS.TtsSession._instance._ortSession.release();
                console.log(LOG_PREFIX, '✅ _ortSession released successfully', {
                  id,
                  instanceVoiceId
                });
              } else {
                console.log(LOG_PREFIX, '⚠️ _ortSession not accessible or no release() method', {
                  id,
                  instanceVoiceId,
                  hasOrtSession: !!(piperTTS.TtsSession._instance && piperTTS.TtsSession._instance._ortSession),
                  hasRelease: !!(piperTTS.TtsSession._instance && piperTTS.TtsSession._instance._ortSession && typeof piperTTS.TtsSession._instance._ortSession.release === 'function'),
                  action: 'Will rely on GC to clean up old session'
                });
              }
            }
            
            // Clear the singleton instance - this forces library to create new session on next predict()
            console.log(LOG_PREFIX, '===== CLEARING TtsSession._instance =====', {
              id,
              instanceVoiceId,
              hadInstance,
              action: 'Setting _instance to null - next PREDICT will create new session'
            });
            
            piperTTS.TtsSession._instance = null;
            
            console.log(LOG_PREFIX, '✅ Worker cache cleared successfully', {
              id,
              hadInstance,
              instanceVoiceId,
              instanceVoiceIdString: String(instanceVoiceId || ''),
              VOICE_CLEARED: `VOICE="${String(instanceVoiceId || '')}"`,
              instanceIsNull: piperTTS.TtsSession._instance === null,
              timestamp: Date.now(),
              note: 'TtsSession._instance cleared - next PREDICT will create new session with new voice',
              CRITICAL: 'Cache cleared - ready for new voice'
            });
            
            // Send confirmation back to offscreen
            console.log(LOG_PREFIX, '===== SENDING CLEAR_CACHE_SUCCESS =====', {
              id,
              timestamp: Date.now(),
              action: 'postMessage({ type: "CLEAR_CACHE_SUCCESS", id })'
            });
            
            self.postMessage({
              type: 'CLEAR_CACHE_SUCCESS',
              id: id
            });
            
            console.log(LOG_PREFIX, '✅ CLEAR_CACHE_SUCCESS sent to offscreen', {
              id,
              timestamp: Date.now(),
              action: 'Worker cache clear complete'
            });
          } catch (clearError) {
            console.error(LOG_PREFIX, '❌ Failed to clear Worker cache', {
              id,
              error: clearError.message,
              stack: clearError.stack,
              CRITICAL: 'Cache clear failed - wrong voice may be used!'
            });
            
            // Send error response
            self.postMessage({
              type: 'CLEAR_CACHE_ERROR',
              id: id,
              error: clearError.message
            });
          }
        } else {
          // No piperTTS or TtsSession available - still send success to avoid blocking
          console.warn(LOG_PREFIX, '⚠️ No TtsSession to clear in Worker', {
            id,
            hasPiperTTS: !!piperTTS,
            hasTtsSession: !!(piperTTS && piperTTS.TtsSession),
            CRITICAL: 'TtsSession not available - cache may not be cleared'
          });
          
          console.log(LOG_PREFIX, '===== SENDING CLEAR_CACHE_SUCCESS (no session to clear) =====', {
            id,
            timestamp: Date.now(),
            action: 'postMessage({ type: "CLEAR_CACHE_SUCCESS", id })'
          });
          
          self.postMessage({
            type: 'CLEAR_CACHE_SUCCESS',
            id: id
          });
        }
        break;
      }
      
      case 'STORED': {
        console.log(LOG_PREFIX, 'STORED request started', {
          id,
          isInitialized,
          hasPiperTTS: !!piperTTS,
          timestamp: Date.now()
        });
        
        if (!piperTTS || !isInitialized) {
          throw new Error('TTS not initialized');
        }
        
        const startTime = Date.now();
        const storedList = await piperTTS.stored();
        const duration = Date.now() - startTime;
        
        console.log(LOG_PREFIX, 'STORED request completed', {
          id,
          duration,
          storedCount: Array.isArray(storedList) ? storedList.length : 0,
          isArray: Array.isArray(storedList),
          storedVoices: Array.isArray(storedList) ? storedList : null
        });
        
        self.postMessage({ 
          type: 'STORED_SUCCESS', 
          id, 
          data: storedList 
        });
        break;
      }
      
      case 'DOWNLOAD': {
        const { voiceId, progressCallback } = data || {};
        if (!voiceId) {
          throw new Error('voiceId is required for DOWNLOAD');
        }
        
        if (!piperTTS || !isInitialized) {
          throw new Error('TTS not initialized');
        }
        
        console.log(LOG_PREFIX, 'Starting download', {
          id,
          voiceId
        });
        
        const startTime = Date.now();
        
        // Download with progress callback
        // Note: progress callback in Worker cannot directly update UI
        // but we can forward progress messages to main thread
        let lastProgressPercent = -1;
        await piperTTS.download(voiceId, (progress) => {
          // Calculate progress percentage
          const percent = progress.total > 0 
            ? Math.round((progress.loaded * 100) / progress.total)
            : 0;
          
          // Log progress every 10% or on completion
          if (percent >= lastProgressPercent + 10 || percent === 100) {
            console.log(LOG_PREFIX, 'Download progress', {
              id,
              voiceId,
              percent,
              loaded: progress.loaded,
              total: progress.total,
              timestamp: Date.now()
            });
            lastProgressPercent = percent;
          }
          
          // Forward progress to main thread
          self.postMessage({
            type: 'DOWNLOAD_PROGRESS',
            id,
            data: progress
          });
        });
        
        const duration = Date.now() - startTime;
        
        console.log(LOG_PREFIX, 'Download complete', {
          id,
          voiceId,
          duration
        });
        
        self.postMessage({ 
          type: 'DOWNLOAD_SUCCESS', 
          id,
          data: { voiceId, duration }
        });
        break;
      }
      
      case 'REMOVE': {
        const { voiceId } = data || {};
        if (!voiceId) {
          throw new Error('voiceId is required for REMOVE');
        }
        
        if (!piperTTS || !isInitialized) {
          throw new Error('TTS not initialized');
        }
        
        console.log(LOG_PREFIX, 'REMOVE request started', {
          id,
          voiceId,
          isInitialized,
          hasPiperTTS: !!piperTTS,
          hasRemoveMethod: typeof piperTTS.remove === 'function',
          timestamp: Date.now()
        });
        
        const startTime = Date.now();
        
        // Check stored voices before removal
        let storedBefore = [];
        try {
          if (typeof piperTTS.stored === 'function') {
            storedBefore = await piperTTS.stored();
            console.log(LOG_PREFIX, 'Stored voices before removal', {
              id,
              voiceId,
              storedCount: storedBefore.length,
              isVoiceStored: storedBefore.includes(voiceId)
            });
          }
        } catch (e) {
          console.warn(LOG_PREFIX, 'Failed to get stored voices before removal', {
            id,
            voiceId,
            error: e.message
          });
        }
        
        // Remove voice model
        if (typeof piperTTS.remove === 'function') {
          await piperTTS.remove(voiceId);
        } else {
          throw new Error('remove() method not available in piper-tts-web');
        }
        
        const duration = Date.now() - startTime;
        
        // Check stored voices after removal
        let storedAfter = [];
        try {
          if (typeof piperTTS.stored === 'function') {
            storedAfter = await piperTTS.stored();
            console.log(LOG_PREFIX, 'Stored voices after removal', {
              id,
              voiceId,
              storedCount: storedAfter.length,
              isVoiceStored: storedAfter.includes(voiceId),
              wasRemoved: storedBefore.includes(voiceId) && !storedAfter.includes(voiceId)
            });
          }
        } catch (e) {
          console.warn(LOG_PREFIX, 'Failed to get stored voices after removal', {
            id,
            voiceId,
            error: e.message
          });
        }
        
        console.log(LOG_PREFIX, 'REMOVE request completed', {
          id,
          voiceId,
          duration,
          wasRemoved: storedBefore.includes(voiceId) && !storedAfter.includes(voiceId)
        });
        
        self.postMessage({ 
          type: 'REMOVE_SUCCESS', 
          id,
          data: { voiceId, duration }
        });
        break;
      }
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error(LOG_PREFIX, '=== MESSAGE HANDLER ERROR ===', {
      timestamp: Date.now(),
      type,
      id,
      messageDuration: Date.now() - messageStartTime,
      error: error.message,
      errorName: error.name,
      errorType: typeof error,
      hasStack: !!error.stack,
      stackPreview: error.stack?.substring(0, 300),
      isInitialized,
      hasPiperTTS: !!piperTTS,
      hasSelfOrt: !!self.ort
    });

    workerLogError('Error processing message - sending ERROR response', {
      timestamp: Date.now(),
      type,
      id,
      errorMessage: error.message || String(error),
      hasStack: !!error.stack
    });

    try {
      self.postMessage({
        type: 'ERROR',
        id,
        error: error.message || String(error),
        stack: error.stack
      });

      workerLogError('=== MESSAGE HANDLER ERROR RESPONSE SENT ===', {
        timestamp: Date.now(),
        type,
        id,
        totalDuration: Date.now() - messageStartTime
      });
    } catch (postError) {
      workerLogError('=== FAILED TO SEND ERROR RESPONSE ===', {
        timestamp: Date.now(),
        type,
        id,
        postError: postError.message,
        originalError: error.message
      });
    }
  }
});

/**
 * Cleanup function to release WASM resources
 * Should be called when worker is terminating or before switching voices
 */
function cleanupWASMResources() {
  try {
    // Cleanup Piper TTS ONNX Runtime sessions
    if (piperTTS && piperTTS.TtsSession && piperTTS.TtsSession._instance) {
      const instance = piperTTS.TtsSession._instance;
      
      // Try to release ONNX Runtime session
      if (instance._ortSession && typeof instance._ortSession.release === 'function') {
        try {
          instance._ortSession.release();
          console.log(LOG_PREFIX, 'Worker: ONNX Runtime session released during cleanup');
        } catch (releaseError) {
          console.warn(LOG_PREFIX, 'Worker: Failed to release ONNX Runtime session', {
            error: releaseError.message
          });
        }
      }
      
      // Clear singleton instance
      piperTTS.TtsSession._instance = null;
    }
    
    // Clear module reference
    piperTTS = null;
    
    console.log(LOG_PREFIX, 'Worker: WASM resources cleaned up');
  } catch (error) {
    console.error(LOG_PREFIX, 'Worker: Failed to cleanup WASM resources', {
      error: error.message
    });
    // Clear reference anyway
    piperTTS = null;
  }
}

// Register cleanup on worker termination
self.addEventListener('beforeunload', () => {
  cleanupWASMResources();
});

// Signal that worker is ready
console.log(LOG_PREFIX, '=== WORKER INITIALIZATION COMPLETED ===', {
  timestamp: Date.now(),
  isInitialized,
  hasPiperTTS: !!piperTTS,
  hasSelfOrt: !!self.ort,
  ortVersion: self.ort?.version || 'unknown',
  ortEnvWasmNumThreads: self.ort?.env?.wasm?.numThreads,
  hasSelfOnnxruntime: !!self.onnxruntime,
  hasFetchInterceptor: typeof self.fetch === 'function',
  workerUrl: self.location?.href || 'unknown'
});

console.log(LOG_PREFIX, 'Worker ready - sending WORKER_READY message', {
  timestamp: Date.now()
});

self.postMessage({ type: 'WORKER_READY' });

console.log(LOG_PREFIX, 'WORKER_READY message sent - worker is fully operational', {
  timestamp: Date.now(),
  finalState: {
    isInitialized,
    hasPiperTTS: !!piperTTS,
    hasSelfOrt: !!self.ort,
    ortVersion: self.ort?.version || 'unknown'
  }
});

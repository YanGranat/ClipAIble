// @ts-check
// Offline TTS using Offscreen Document API
// This is the proper way to use WASM TTS in Manifest V3
// Offscreen document has full DOM and WASM support

import { log, logError, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { ttsQueue } from './tts-queue.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';

logDebug('[ClipAIble Offline TTS Offscreen] === MODULE LOADING ===', {
  timestamp: Date.now(),
  modulePath: 'scripts/api/offline-tts-offscreen.js'
});

logDebug('[ClipAIble Offline TTS Offscreen] === MODULE LOADED ===', {
  timestamp: Date.now(),
  hasLog: typeof log === 'function',
  hasLogError: typeof logError === 'function'
});

/**
 * Configuration for offline Piper TTS
 */
export const OFFLINE_TTS_CONFIG = {
  DEFAULT_VOICES: {
    'en': 'en_US-lessac-medium',      // Medium quality for English (verified: exists in library)
    'ru': 'ru_RU-dmitri-medium',      // Medium quality for Russian (verified: exists in library)
    'uk': null,                        // Ukrainian not available - quality too poor, use Respeecher instead
    'de': 'de_DE-thorsten-medium',     // Medium quality for German (verified: exists in library)
    'fr': 'fr_FR-siwis-medium',        // Medium quality for French (verified: exists in library)
    'es': 'es_ES-sharvard-medium',      // Medium quality for Spanish (verified: exists in library)
    'it': 'it_IT-paola-medium',        // Medium quality for Italian (verified: exists in library) - NOTE: riccardo only has x_low which is filtered
    'pt': 'pt_BR-faber-medium',        // Medium quality for Portuguese (verified: exists in library)
    'zh': 'zh_CN-huayan-medium',       // Medium quality for Chinese (verified: exists in library)
    'ja': null,                         // Japanese not available in library
    'ko': null                          // Korean not available in library
  },
  DEFAULT_SPEED: 1.0,
  DEFAULT_PITCH: 1.0,
  DEFAULT_VOLUME: 1.0,
  MAX_INPUT: 50000,
  SAMPLE_RATE: 22050,
  CHANNELS: 1
};

log('[ClipAIble Offline TTS Offscreen] Module initialized', {
  timestamp: Date.now(),
  config: {
    maxInput: OFFLINE_TTS_CONFIG.MAX_INPUT,
    defaultVoicesCount: Object.keys(OFFLINE_TTS_CONFIG.DEFAULT_VOICES).length
  }
});

let creating = null;
let offscreenReady = false;

// Map for tracking pending cleanup timers
// Key: storageKey, Value: timeout ID
const pendingCleanup = new Map();

log('[ClipAIble Offline TTS Offscreen] Module state initialized', {
  creating: null,
  offscreenReady: false,
  timestamp: Date.now()
});

/**
 * Create offscreen document for Piper TTS
 * This document runs in a hidden context with full DOM and WASM support
 */
async function setupOffscreenDocument() {
  const startTime = Date.now();
  log('[ClipAIble Offscreen Setup] === START ===', { timestamp: startTime });
  
  // Defer heavy operations to avoid blocking main thread
  await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_NEXT_TICK_DELAY));
  
  // Check if offscreen API is available
  if (!chrome.offscreen) {
    logError('[ClipAIble Offscreen Setup] Offscreen API not available');
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorOffscreenApiNotAvailable', uiLang));
  }
  log('[ClipAIble Offscreen Setup] Offscreen API available');
  
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  log('[ClipAIble Offscreen Setup] Offscreen URL:', { offscreenUrl });
  
  // Check if offscreen document already exists - defer to avoid blocking
  await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_NEXT_TICK_DELAY));
  log('[ClipAIble Offscreen Setup] Checking for existing offscreen document...');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  
  log('[ClipAIble Offscreen Setup] Existing contexts check result:', {
    count: existingContexts.length,
    contexts: existingContexts.map(ctx => ({
      contextType: ctx.contextType,
      documentUrl: ctx.documentUrl,
      documentId: ctx.documentId
    }))
  });

  if (existingContexts.length > 0) {
    log('[ClipAIble Offscreen Setup] Offscreen document already exists, skipping creation', {
      documentId: existingContexts[0].documentId,
      duration: Date.now() - startTime
    });
    offscreenReady = true;
    return;
  }

  // Create offscreen document if not already creating
  if (creating) {
    log('[ClipAIble Offscreen Setup] Document creation already in progress, waiting...');
    await creating;
    log('[ClipAIble Offscreen Setup] Waited for existing creation, done', {
      duration: Date.now() - startTime
    });
  } else {
    log('[ClipAIble Offscreen Setup] Starting new offscreen document creation...');
    creating = (async () => {
      const creationStartTime = Date.now();
      try {
        log('[ClipAIble Offscreen Setup] Calling chrome.offscreen.createDocument...', {
          url: offscreenUrl,
          reasons: ['BLOBS']
        });
        
        await chrome.offscreen.createDocument({
          url: offscreenUrl,
          reasons: ['BLOBS'],
          justification: 'Piper TTS requires WASM and DOM access for offline speech generation'
        });
        
        const createDuration = Date.now() - creationStartTime;
        log('[ClipAIble Offscreen Setup] chrome.offscreen.createDocument completed', {
          duration: createDuration
        });
        
        // Wait for offscreen document to initialize
        log('[ClipAIble Offscreen Setup] Waiting for document initialization...');
        await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_SETUP_DELAY));
        
        // Verify document is actually ready by checking if it exists
        log('[ClipAIble Offscreen Setup] Starting verification loop...');
        let verified = false;
        let verificationAttempt = 0;
        for (let i = 0; i < 5; i++) {
          verificationAttempt = i + 1;
          log(`[ClipAIble Offscreen Setup] Verification attempt ${verificationAttempt}/5...`);
          
          try {
            let checkResult = false;
            if (chrome.offscreen && typeof chrome.offscreen.hasDocument === 'function') {
              log('[ClipAIble Offscreen Setup] Using chrome.offscreen.hasDocument()');
              checkResult = await chrome.offscreen.hasDocument();
              log('[ClipAIble Offscreen Setup] hasDocument() result:', { checkResult });
            } else {
              log('[ClipAIble Offscreen Setup] Using getContexts() fallback');
              const contexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT'],
                documentUrls: [offscreenUrl]
              });
              checkResult = contexts.length > 0;
              log('[ClipAIble Offscreen Setup] getContexts() result:', {
                checkResult,
                contextCount: contexts.length
              });
            }
            
            if (checkResult) {
              verified = true;
              log('[ClipAIble Offscreen Setup] Verification successful!', {
                attempt: verificationAttempt,
                totalDuration: Date.now() - creationStartTime
              });
              break;
            } else {
              log(`[ClipAIble Offscreen Setup] Verification attempt ${verificationAttempt} failed, waiting 100ms...`);
            }
          } catch (error) {
            logError(`[ClipAIble Offscreen Setup] Verification attempt ${verificationAttempt} error:`, error);
          }
          
          if (i < 4) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        if (!verified) {
          log('[ClipAIble Offscreen Setup] WARNING: Document created but verification failed after all attempts', {
            attempts: verificationAttempt,
            totalDuration: Date.now() - creationStartTime
          });
        }
        
        log('[ClipAIble Offscreen Setup] === COMPLETE ===', {
          verified,
          attempts: verificationAttempt,
          totalDuration: Date.now() - creationStartTime,
          timestamp: Date.now()
        });
        offscreenReady = true;
      } catch (error) {
        logError('[ClipAIble Offscreen Setup] === FAILED ===', {
          error: error.message,
          stack: error.stack,
          duration: Date.now() - creationStartTime
        });
        throw error;
      } finally {
        creating = null;
        log('[ClipAIble Offscreen Setup] Creation promise cleared');
      }
    })();
    
    log('[ClipAIble Offscreen Setup] Waiting for creation promise...');
    await creating;
    log('[ClipAIble Offscreen Setup] === SETUP DONE ===', {
      totalDuration: Date.now() - startTime
    });
  }
}

/**
 * Send message to offscreen document and wait for response
 */
/**
 * Send message to offscreen document with retry logic
 * @param {string} type - Message type
 * @param {Object} data - Message data
 * @param {number} retryCount - Current retry attempt (internal)
 * @returns {Promise} Response from offscreen document
 */
async function sendToOffscreen(type, data = {}, retryCount = 0) {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = CONFIG.OFFLINE_TTS_SETUP_DELAY; // Use centralized constant
  const sendStartTime = Date.now();
  
  log('[ClipAIble SendToOffscreen] === START ===', {
    type,
    dataSize: JSON.stringify(data).length,
    retryCount,
    timestamp: sendStartTime
  });
  
  // Defer setup to avoid blocking main thread
  // Use setTimeout to yield to main thread before heavy operations
  await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_NEXT_TICK_DELAY));
  await setupOffscreenDocument();
  log('[ClipAIble SendToOffscreen] Setup complete, checking document existence...');
  
  // Check if offscreen document exists using the most reliable method
  let documentExists = false;
  let checkMethod = 'unknown';
  try {
    // Try hasDocument first (if available)
    if (chrome.offscreen && typeof chrome.offscreen.hasDocument === 'function') {
      checkMethod = 'hasDocument';
      log('[ClipAIble SendToOffscreen] Using chrome.offscreen.hasDocument()');
      documentExists = await chrome.offscreen.hasDocument();
      log('[ClipAIble SendToOffscreen] hasDocument() result:', { documentExists });
    } else {
      // Fallback to getContexts
      checkMethod = 'getContexts';
      log('[ClipAIble SendToOffscreen] Using getContexts() fallback');
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')]
      });
      documentExists = existingContexts.length > 0;
      log('[ClipAIble SendToOffscreen] getContexts() result:', {
        documentExists,
        contextCount: existingContexts.length,
        contexts: existingContexts.map(ctx => ({
          contextType: ctx.contextType,
          documentUrl: ctx.documentUrl,
          documentId: ctx.documentId
        }))
      });
    }
  } catch (error) {
    logError('[ClipAIble SendToOffscreen] Failed to check offscreen document existence', {
      error: error.message,
      stack: error.stack,
      checkMethod
    });
  }
  
  if (!documentExists) {
    log('[ClipAIble SendToOffscreen] Document does not exist!', {
      retryCount,
      maxRetries: MAX_RETRIES
    });
    
    // Try to recreate if we haven't exceeded retries
    if (retryCount < MAX_RETRIES) {
      log('[ClipAIble SendToOffscreen] Attempting to recreate document...', {
        retryCount: retryCount + 1,
        maxRetries: MAX_RETRIES
      });
      offscreenReady = false;
      creating = null;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return sendToOffscreen(type, data, retryCount + 1);
    }
    
    logError('[ClipAIble SendToOffscreen] === FAILED ===', {
      reason: 'Document not found after setup and retries',
      retryCount,
      maxRetries: MAX_RETRIES,
      duration: Date.now() - sendStartTime
    });
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorOffscreenDocumentNotFound', uiLang));
  }
  
  // Check for unlimitedStorage permission in service worker (where getManifest is available)
  // Pass this to offscreen document to avoid calling getManifest there (it's not available in offscreen)
  const manifest = chrome.runtime.getManifest();
  const hasUnlimitedStorage = manifest.permissions?.includes('unlimitedStorage') || false;
  
  // Add permission info to data so offscreen document can use it
  const dataWithPermissions = {
    ...data,
    hasUnlimitedStorage
  };
  
  log('[ClipAIble SendToOffscreen] Document exists, sending message...', {
    type,
    messageSize: JSON.stringify({ target: 'offscreen', type, data: dataWithPermissions }).length,
    hasUnlimitedStorage
  });
  
  return new Promise((resolve, reject) => {
    const messageId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    log(`[ClipAIble SendToOffscreen] Message ID: ${messageId}`, {
      type,
      retryCount
    });
    
    // Dynamic timeout based on text length
    // Estimate: ~1-2 seconds per sentence for low quality models
    // Formula: textLength * 100ms per character + base 60 seconds
    // Maximum: 5 hours (18000000ms) for very long operations (2-5 hour articles)
    const textLength = data.text?.length || 0;
    const estimatedDuration = Math.max(
      CONFIG.OFFScreen_TTS_TIMEOUT_BASE * 2, // Minimum 2 minutes
      Math.min(
        CONFIG.OFFScreen_TTS_TIMEOUT_MAX, // Maximum 5 hours
        CONFIG.OFFScreen_TTS_TIMEOUT_BASE + (textLength * CONFIG.OFFScreen_TTS_TIMEOUT_PER_CHAR)
      )
    );
    const timeoutDuration = type === 'PIPER_TTS' ? estimatedDuration : 30000;
    
    log(`[ClipAIble SendToOffscreen] Setting timeout for ${messageId}`, {
      messageId,
      type,
      timeoutDuration,
      timeoutSeconds: Math.round(timeoutDuration / 1000),
      timeoutMinutes: Math.round(timeoutDuration / 60000),
      timeoutHours: Math.round(timeoutDuration / 3600000 * 10) / 10,
      textLength: data.text?.length || 0,
      estimatedDuration
    });
    
    // Heartbeat mechanism: extend timeout indefinitely as long as operation is active
    // No hard limit - timeout extends automatically while operation progresses
    let lastHeartbeat = Date.now();
    let timeoutId = null;
    let heartbeatInterval = null;
    let currentTimeoutDuration = timeoutDuration; // Track current timeout (can be extended)
    
    const resetTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      const elapsed = Date.now() - sendStartTime;
      const remainingTime = currentTimeoutDuration - elapsed;
      
      // Check absolute maximum limit (24 hours) - safety limit for stuck operations
      if (elapsed >= CONFIG.ABSOLUTE_MAX_OPERATION_TIMEOUT_MS) {
        logError(`[ClipAIble SendToOffscreen] === ABSOLUTE TIMEOUT (24 hours) ===`, {
          messageId,
          type,
          retryCount,
          duration: elapsed,
          durationHours: Math.round(elapsed / 3600000 * 10) / 10,
          absoluteMax: CONFIG.ABSOLUTE_MAX_OPERATION_TIMEOUT_MS
        });
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        reject(new Error(`Offscreen message timeout after absolute maximum (24 hours)`));
        return;
      }
      
      // Only set timeout if we have time remaining
      if (remainingTime > 0) {
        timeoutId = setTimeout(() => {
          logError(`[ClipAIble SendToOffscreen] === TIMEOUT ===`, {
            messageId,
            type,
            retryCount,
            duration: Date.now() - sendStartTime,
            currentTimeoutDuration,
            timeoutSeconds: Math.round(currentTimeoutDuration / 1000),
            timeoutMinutes: Math.round(currentTimeoutDuration / 60000),
            timeoutHours: Math.round(currentTimeoutDuration / 3600000 * 10) / 10,
            lastHeartbeat: Date.now() - lastHeartbeat
          });
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          reject(new Error(`Offscreen message timeout (${Math.round(currentTimeoutDuration / 1000)}s)`));
        }, remainingTime);
      } else {
        // Timeout already exceeded - this shouldn't happen if heartbeat is working
        logError(`[ClipAIble SendToOffscreen] === TIMEOUT EXCEEDED ===`, {
          messageId,
          elapsed,
          currentTimeoutDuration,
          remainingTime
        });
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        reject(new Error(`Offscreen message timeout exceeded`));
      }
    };
    
    // Initial timeout
    resetTimeout();
    
    // Heartbeat: extend timeout indefinitely as long as operation is active
    // This allows operations to continue beyond initial 5-hour estimate
    // Only absolute maximum (24 hours) limits operation duration
    if (type === 'PIPER_TTS') {
      heartbeatInterval = setInterval(() => {
        const elapsed = Date.now() - sendStartTime;
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
        
        // Check absolute maximum first (24 hours safety limit)
        if (elapsed >= CONFIG.ABSOLUTE_MAX_OPERATION_TIMEOUT_MS) {
          log(`[ClipAIble SendToOffscreen] Heartbeat: absolute maximum reached (24 hours), stopping`, {
            messageId,
            elapsed,
            elapsedHours: Math.round(elapsed / 3600000 * 10) / 10,
            absoluteMax: CONFIG.ABSOLUTE_MAX_OPERATION_TIMEOUT_MS
          });
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          return;
        }
        
        // If operation is still running (elapsed time is increasing), extend timeout
        // Extend when we're within 30 minutes of current timeout
        const extensionThreshold = currentTimeoutDuration - CONFIG.OFFScreen_TTS_HEARTBEAT_EXTENSION;
        const shouldExtend = elapsed >= extensionThreshold;
        
        if (shouldExtend) {
          // Extend timeout by 30 minutes (or until absolute max)
          const newTimeoutDuration = Math.min(
            elapsed + CONFIG.OFFScreen_TTS_HEARTBEAT_EXTENSION,
            CONFIG.ABSOLUTE_MAX_OPERATION_TIMEOUT_MS
          );
          
          log(`[ClipAIble SendToOffscreen] Heartbeat: extending timeout (operation still active)`, {
            messageId,
            elapsed,
            elapsedMinutes: Math.round(elapsed / 60000),
            elapsedHours: Math.round(elapsed / 3600000 * 10) / 10,
            oldTimeoutDuration: currentTimeoutDuration,
            oldTimeoutHours: Math.round(currentTimeoutDuration / 3600000 * 10) / 10,
            newTimeoutDuration,
            newTimeoutHours: Math.round(newTimeoutDuration / 3600000 * 10) / 10,
            extension: CONFIG.OFFScreen_TTS_HEARTBEAT_EXTENSION,
            extensionMinutes: Math.round(CONFIG.OFFScreen_TTS_HEARTBEAT_EXTENSION / 60000),
            timeSinceLastHeartbeat,
            remainingTime: newTimeoutDuration - elapsed,
            remainingMinutes: Math.round((newTimeoutDuration - elapsed) / 60000),
            remainingHours: Math.round((newTimeoutDuration - elapsed) / 3600000 * 10) / 10
          });
          
          currentTimeoutDuration = newTimeoutDuration;
          lastHeartbeat = Date.now();
          resetTimeout();
        }
      }, CONFIG.OFFScreen_TTS_HEARTBEAT_INTERVAL);
    }
    
    try {
      log(`[ClipAIble SendToOffscreen] Calling chrome.runtime.sendMessage...`, {
        messageId,
        type,
        hasData: !!dataWithPermissions,
        dataKeys: dataWithPermissions ? Object.keys(dataWithPermissions) : [],
        hasUnlimitedStorage
      });
      
      chrome.runtime.sendMessage(
        {
          target: 'offscreen',
          type,
          data: dataWithPermissions
        },
        (response) => {
          const responseTime = Date.now();
          const responseDuration = responseTime - sendStartTime;
          
          // Clear timeout and heartbeat
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          
          log(`[ClipAIble SendToOffscreen] Response received`, {
            messageId,
            type,
            retryCount,
            duration: responseDuration,
            hasResponse: !!response,
            hasLastError: !!chrome.runtime.lastError,
            lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
            responseKeys: response ? Object.keys(response) : []
          });
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            log(`[ClipAIble SendToOffscreen] chrome.runtime.lastError detected`, {
              messageId,
              errorMsg,
              retryCount,
              maxRetries: MAX_RETRIES
            });
            
            // Handle "Receiving end does not exist" with retry
            if (errorMsg.includes('Receiving end does not exist') || 
                errorMsg.includes('Could not establish connection')) {
              
              if (retryCount < MAX_RETRIES) {
                log(`[ClipAIble SendToOffscreen] Retrying due to connection error...`, {
                  messageId,
                  retryCount: retryCount + 1,
                  maxRetries: MAX_RETRIES,
                  delay: RETRY_DELAY
                });
                setTimeout(() => {
                  sendToOffscreen(type, data, retryCount + 1).then(resolve).catch(reject);
                }, RETRY_DELAY);
                return;
              } else {
                logError(`[ClipAIble SendToOffscreen] === FAILED ===`, {
                  messageId,
                  reason: 'Max retries exceeded',
                  errorMsg,
                  retryCount,
                  maxRetries: MAX_RETRIES,
                  duration: responseDuration
                });
                reject(new Error(`Offscreen document not responding after ${MAX_RETRIES + 1} attempts: ${errorMsg}`));
                return;
              }
            }
            
            logError(`[ClipAIble SendToOffscreen] === FAILED ===`, {
              messageId,
              reason: 'Non-retryable error',
              errorMsg,
              duration: responseDuration
            });
            reject(new Error(errorMsg));
          } else if (!response) {
            log(`[ClipAIble SendToOffscreen] No response received`, {
              messageId,
              retryCount,
              maxRetries: MAX_RETRIES
            });
            
            // No response - might be timing issue, retry once
            if (retryCount < MAX_RETRIES) {
              log(`[ClipAIble SendToOffscreen] Retrying due to no response...`, {
                messageId,
                retryCount: retryCount + 1,
                maxRetries: MAX_RETRIES,
                delay: RETRY_DELAY
              });
              setTimeout(() => {
                sendToOffscreen(type, data, retryCount + 1).then(resolve).catch(reject);
              }, RETRY_DELAY);
              return;
            }
            
            logError(`[ClipAIble SendToOffscreen] === FAILED ===`, {
              messageId,
              reason: 'No response after max retries',
              retryCount,
              maxRetries: MAX_RETRIES,
              duration: responseDuration
            });
            reject(new Error('No response from offscreen document'));
          } else if (typeof response !== 'object' || response === null) {
            // Response is not an object (might be a string or other type)
            logError(`[ClipAIble SendToOffscreen] === FAILED ===`, {
              messageId,
              reason: 'Response is not an object',
              responseType: typeof response,
              responseValue: String(response).substring(0, 200),
              duration: responseDuration
            });
            reject(new Error(`Invalid response from offscreen document: ${String(response)}`));
          } else if (!response.success) {
            logError(`[ClipAIble SendToOffscreen] === FAILED ===`, {
              messageId,
              reason: 'Response indicates failure',
              responseError: response.error,
              responseKeys: Object.keys(response),
              duration: responseDuration
            });
            reject(new Error(response.error || 'Offscreen operation failed'));
          } else {
            log(`[ClipAIble SendToOffscreen] === SUCCESS ===`, {
              messageId,
              type,
              retryCount,
              responseSize: JSON.stringify(response).length,
              responseKeys: Object.keys(response),
              duration: responseDuration,
              timestamp: responseTime
            });
            resolve(response);
          }
        }
      );
      
      log(`[ClipAIble SendToOffscreen] chrome.runtime.sendMessage called`, {
        messageId,
        type
      });
    } catch (error) {
      // Clear timeout and heartbeat on error
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      logError(`[ClipAIble SendToOffscreen] === EXCEPTION ===`, {
        messageId,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - sendStartTime
      });
      reject(error);
    }
  });
}

/**
 * Get available voices from Piper TTS
 */
export async function getAvailableVoices() {
  try {
    const response = await sendToOffscreen('GET_VOICES');
    
    // CRITICAL: Log the exact structure received
    log('[ClipAIble Offline TTS Offscreen] ===== getAvailableVoices: RESPONSE RECEIVED =====', {
      timestamp: Date.now(),
      hasResponse: !!response,
      hasVoices: !!(response && response.voices),
      voicesType: response?.voices ? (Array.isArray(response.voices) ? 'array' : typeof response.voices) : 'null',
      voicesCount: response?.voices ? (Array.isArray(response.voices) ? response.voices.length : Object.keys(response.voices || {}).length) : 0,
      sampleVoices: response?.voices ? (Array.isArray(response.voices) ? response.voices.slice(0, 3) : Object.values(response.voices).slice(0, 3)) : [],
      firstVoice: response?.voices && Array.isArray(response.voices) && response.voices.length > 0 ? {
        id: response.voices[0].id,
        idType: typeof response.voices[0].id,
        name: response.voices[0].name,
        keys: Object.keys(response.voices[0]),
        fullObj: JSON.stringify(response.voices[0])
      } : null,
      fullResponse: JSON.stringify(response).substring(0, 500)
    });
    
    const voices = response?.voices || [];
    
    // CRITICAL: Validate and log each voice structure
    if (Array.isArray(voices) && voices.length > 0) {
      log('[ClipAIble Offline TTS Offscreen] ===== VALIDATING VOICES STRUCTURE =====', {
        timestamp: Date.now(),
        voicesCount: voices.length,
        voicesWithId: voices.filter(v => v && v.id).length,
        voicesWithValue: voices.filter(v => v && v.value).length,
        voicesWithKey: voices.filter(v => v && v.key).length,
        sampleValidations: voices.slice(0, 5).map((v, i) => ({
          index: i,
          hasId: !!(v && v.id),
          id: v?.id,
          idType: typeof v?.id,
          hasValue: !!(v && v.value),
          value: v?.value,
          hasKey: !!(v && v.key),
          key: v?.key,
          keys: v ? Object.keys(v) : [],
          isIdValid: v?.id && typeof v.id === 'string' && v.id.includes('_') && v.id.includes('-'),
          fullObj: JSON.stringify(v)
        }))
      });
    }
    
    return voices;
  } catch (error) {
    logError('[ClipAIble] Failed to get voices from offscreen', error);
    return [];
  }
}

/**
 * Get stored (downloaded) voice IDs
 */
export async function getStoredVoices() {
  try {
    const response = await sendToOffscreen('GET_STORED_VOICES');
    return response.voices || [];
  } catch (error) {
    logError('[ClipAIble] Failed to get stored voices from offscreen', error);
    return [];
  }
}

/**
 * Check if voice is already downloaded
 */
export async function isVoiceDownloaded(voiceId) {
  try {
    const stored = await getStoredVoices();
    return stored.includes(voiceId);
  } catch (error) {
    logError('[ClipAIble] Failed to check if voice is downloaded', error);
    return false;
  }
}

/**
 * Find voice by name or language
 */
export async function findVoice(voiceName = null, language = null) {
  const voices = await getAvailableVoices();
  
  if (voiceName && voiceName !== '0' && voiceName !== '') {
    let voice = voices.find(v => v.id === voiceName || v.name === voiceName);
    if (voice) return voice;
    
    voice = voices.find(v => 
      v.id.toLowerCase().includes(voiceName.toLowerCase()) ||
      v.name.toLowerCase().includes(voiceName.toLowerCase())
    );
    if (voice) return voice;
  }
  
  if (language && language !== 'auto') {
    const langPrefix = language.split('-')[0].toLowerCase();
    let voice = voices.find(v => {
      const voiceLang = v.language?.toLowerCase() || '';
      const voiceId = v.id?.toLowerCase() || '';
      return voiceLang.startsWith(langPrefix) || voiceId.startsWith(langPrefix);
    });
    if (voice) return voice;
  }
  
  if (language && language !== 'auto') {
    const recommendedId = OFFLINE_TTS_CONFIG.DEFAULT_VOICES[language.split('-')[0].toLowerCase()] || OFFLINE_TTS_CONFIG.DEFAULT_VOICES['en'];
    const voice = voices.find(v => v.id === recommendedId);
    if (voice) return voice;
  }
  
  return voices.length > 0 ? voices[0] : null;
}

/**
 * Manually cleanup stored audio (call after audio is used)
 * @param {string} storageKey - Storage key to cleanup
 */
export async function cleanupStoredAudio(storageKey) {
  const cleanupId = pendingCleanup.get(storageKey);
  if (cleanupId) {
    clearTimeout(cleanupId);
    pendingCleanup.delete(storageKey);
    log('[ClipAIble Offscreen TTS] Cancelled scheduled cleanup', {
      storageKey
    });
  }
  
  try {
    // Remove both audio data and metadata
    await chrome.storage.local.remove([
      storageKey,
      `${storageKey}_meta`
    ]);
    log('[ClipAIble Offscreen TTS] Manual cleanup completed', {
      storageKey
    });
  } catch (error) {
    logError('[ClipAIble Offscreen TTS] Manual cleanup failed', {
      storageKey,
      error: error.message
    });
    throw error;
  }
}

/**
 * Convert text to speech using Piper TTS in offscreen document
 * 
 * @param {string} text - Text to convert
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID (optional, auto-select by language)
 * @param {string} options.language - Language code (e.g., 'en', 'ru') (optional)
 * @param {number} options.speed - Speech speed (not directly supported, but kept for compatibility)
 * @param {Function} options.onProgress - Progress callback (optional)
 * @returns {Promise<ArrayBuffer>} Audio data as WAV ArrayBuffer
 */
/**
 * Convert text to speech using Piper TTS in offscreen document
 * 
 * @param {string} text - Text to convert
 * @param {Object} [options={}] - TTS options
 * @param {string} [options.voice] - Voice ID (optional, auto-select by language)
 * @param {string} [options.language] - Language code (e.g., 'en', 'ru') (optional)
 * @param {number} [options.speed] - Speech speed (not directly supported, but kept for compatibility)
 * @param {Function} [options.onProgress] - Progress callback (optional)
 * @returns {Promise<ArrayBuffer>} Audio data as WAV ArrayBuffer
 */
/**
 * Close offscreen document to force recreation (for voice switching)
 * This ensures complete cache clearing when voice changes
 */
export async function closeOffscreenForVoiceSwitch() {
  log('[ClipAIble Offscreen] === CLOSING OFFScreen DOCUMENT FOR VOICE SWITCH ===', {
    timestamp: Date.now()
  });
  
  try {
    // Send cleanup message to offscreen document before closing
    // This ensures WASM resources are released before document is destroyed
    try {
      await sendToOffscreen('CLEANUP_RESOURCES', {});
      log('[ClipAIble Offscreen] Cleanup message sent to offscreen document', {
        timestamp: Date.now()
      });
    } catch (cleanupError) {
      logWarn('[ClipAIble Offscreen] Failed to send cleanup message (non-critical)', {
        error: cleanupError.message
      });
      // Continue with closing even if cleanup message fails
    }
    
    if (chrome.offscreen && typeof chrome.offscreen.closeDocument === 'function') {
      const hasDocument = await chrome.offscreen.hasDocument();
      if (hasDocument) {
        await chrome.offscreen.closeDocument();
        log('[ClipAIble Offscreen] Offscreen document closed successfully for voice switch', {
          timestamp: Date.now()
        });
        offscreenReady = false; // Reset ready flag
        creating = null; // Reset creating flag
        return true;
      } else {
        log('[ClipAIble Offscreen] No offscreen document to close', {
          timestamp: Date.now()
        });
        return false;
      }
    } else {
      logError('[ClipAIble Offscreen] chrome.offscreen.closeDocument not available', {
        timestamp: Date.now()
      });
      return false;
    }
  } catch (error) {
    logError('[ClipAIble Offscreen] Failed to close offscreen document for voice switch', {
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
    return false;
  }
}

export async function textToSpeech(text, options = {}) {
  // Log all TTS settings at entry point
  const entrySettings = {
    timestamp: Date.now(),
    // Text Settings
    textLength: text?.length || 0,
    // Options
    options: options || {},
    optionsKeys: Object.keys(options || {}),
    // Config
    config: {
      maxInput: OFFLINE_TTS_CONFIG.MAX_INPUT,
      defaultSpeed: OFFLINE_TTS_CONFIG.DEFAULT_SPEED,
      defaultPitch: OFFLINE_TTS_CONFIG.DEFAULT_PITCH,
      defaultVolume: OFFLINE_TTS_CONFIG.DEFAULT_VOLUME,
      sampleRate: OFFLINE_TTS_CONFIG.SAMPLE_RATE,
      channels: OFFLINE_TTS_CONFIG.CHANNELS,
      defaultVoices: OFFLINE_TTS_CONFIG.DEFAULT_VOICES
    },
    // Extracted options
    voice: options.voice || null,
    language: options.language || 'auto',
    speed: typeof options.speed === 'number' ? options.speed : OFFLINE_TTS_CONFIG.DEFAULT_SPEED,
    pitch: (options && 'pitch' in options && typeof options.pitch === 'number') ? options.pitch : OFFLINE_TTS_CONFIG.DEFAULT_PITCH,
    volume: (options && 'volume' in options && typeof options.volume === 'number') ? options.volume : OFFLINE_TTS_CONFIG.DEFAULT_VOLUME
  };
  
  log('[ClipAIble Offscreen TTS] === textToSpeech START with all settings ===', entrySettings);
  // Use queue to ensure sequential processing and avoid memory pressure
  return ttsQueue.add(async () => {
    const ttsStartTime = Date.now();
    const opts = options || {};
    const voiceName = opts.voice || null;
    const language = opts.language || null;
    const speed = typeof opts.speed === 'number' ? opts.speed : OFFLINE_TTS_CONFIG.DEFAULT_SPEED;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    log('[ClipAIble Offscreen TTS] === textToSpeech START ===', { 
      textLength: text?.length, 
      voiceName, 
      language,
      speed,
      hasOnProgress: typeof onProgress === 'function',
      optionsKeys: Object.keys(options),
      timestamp: ttsStartTime,
      queueStatus: ttsQueue.getStatus()
    });

    if (!text || text.length === 0) {
      logError('[ClipAIble Offscreen TTS] No text provided');
      const uiLang = await getUILanguageCached();
      throw new Error(tSync('errorTtsNoText', uiLang));
    }

    if (text.length > OFFLINE_TTS_CONFIG.MAX_INPUT) {
      logError('[ClipAIble Offscreen TTS] Text too long', {
        textLength: text.length,
        maxInput: OFFLINE_TTS_CONFIG.MAX_INPUT
      });
      const uiLang = await getUILanguageCached();
      throw new Error(tSync('errorTtsTextTooLong', uiLang).replace('{length}', String(text.length)).replace('{max}', String(OFFLINE_TTS_CONFIG.MAX_INPUT)));
    }

    try {
      // Send request to offscreen document
      log('[ClipAIble Offscreen TTS] Preparing to send TTS request to offscreen document...', {
        textLength: text.length,
        language,
        voiceName
      });
      
      const sendStartTime = Date.now();
      const response = await sendToOffscreen('PIPER_TTS', {
        text,
        options: {
          language,
          voice: voiceName,
          speed
        }
      });
      const sendDuration = Date.now() - sendStartTime;
      
      log('[ClipAIble Offscreen TTS] Response received from offscreen document', {
        duration: sendDuration,
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : [],
        method: response?.method,
        hasAudioData: !!response?.audioData,
        hasStorageKey: !!response?.storageKey,
        audioDataLength: response?.audioData?.length,
        responseSize: response?.size
      });
      
      let arrayBuffer;
      
      if (response.method === 'storage') {
        // Large audio - retrieve from chrome.storage.local
        log('[ClipAIble Offscreen TTS] Reading audio from storage...', {
          storageKey: response.storageKey,
          size: response.size
        });
        
        // Check storage quota before reading (monitoring)
        if (navigator.storage && navigator.storage.estimate) {
          try {
            const estimate = await navigator.storage.estimate();
            const percentUsed = estimate.quota > 0 
              ? (estimate.usage / estimate.quota) * 100 
              : 0;
            
            log('[ClipAIble Offscreen TTS] Storage quota check', {
              usage: estimate.usage,
              quota: estimate.quota,
              percentUsed: percentUsed.toFixed(2),
              available: estimate.quota - estimate.usage
            });
            
            if (percentUsed > 90) {
              logError('[ClipAIble Offscreen TTS] WARNING: Storage quota critical', {
                percentUsed: percentUsed.toFixed(2),
                usage: estimate.usage,
                quota: estimate.quota
              });
            }
          } catch (quotaError) {
            logError('[ClipAIble Offscreen TTS] Failed to check storage quota', {
              error: quotaError.message
            });
            // Don't throw - quota check is optional
          }
        }
        
        const storageStart = Date.now();
        // Get both audio data and metadata
        const data = await chrome.storage.local.get([
          response.storageKey,
          `${response.storageKey}_meta`
        ]);
        const storageDuration = Date.now() - storageStart;
        
        const audioArray = data[response.storageKey];
        const metadata = data[`${response.storageKey}_meta`];
        
        if (!audioArray) {
          logError('[ClipAIble Offscreen TTS] Audio data not found in storage', {
            storageKey: response.storageKey,
            availableKeys: Object.keys(data),
            hasMetadata: !!metadata
          });
          const uiLang = await getUILanguageCached();
          throw new Error(tSync('errorAudioDataNotFound', uiLang));
        }
        
        // Log metadata if available
        if (metadata && typeof metadata === 'object' && 'timestamp' in metadata) {
          const meta = metadata;
          log('[ClipAIble Offscreen TTS] Audio metadata found', {
            storageKey: response.storageKey,
            timestamp: typeof meta.timestamp === 'number' ? meta.timestamp : undefined,
            age: typeof meta.timestamp === 'number' ? Date.now() - meta.timestamp : undefined,
            size: 'size' in meta && typeof meta.size === 'number' ? meta.size : undefined
          });
        }
        
        // Type check for audioArray
        if (!Array.isArray(audioArray)) {
          logError('[ClipAIble Offscreen TTS] Invalid audioArray format from storage', {
            type: typeof audioArray,
            isArray: Array.isArray(audioArray),
            storageKey: response.storageKey
          });
          const uiLang = await getUILanguageCached();
          throw new Error(tSync('errorInvalidAudioArrayFormat', uiLang));
        }
        
        log('[ClipAIble Offscreen TTS] Audio retrieved from storage', {
          storageKey: response.storageKey,
          arrayLength: audioArray.length,
          storageDuration
        });
        
        // Convert to ArrayBuffer
        const convertStart = Date.now();
        const uint8Array = new Uint8Array(audioArray);
        arrayBuffer = uint8Array.buffer;
        const convertDuration = Date.now() - convertStart;
        
        log('[ClipAIble Offscreen TTS] Audio converted from storage', {
          bufferSize: arrayBuffer.byteLength,
          convertDuration
        });
        
        // CRITICAL: Schedule cleanup in service worker (not in offscreen)
        // Offscreen document can be closed, setTimeout will be lost
        // Use delayed cleanup to avoid race condition with data usage
        // Also cleanup metadata key
        const cleanupId = setTimeout(async () => {
          try {
            await chrome.storage.local.remove([
              response.storageKey,
              `${response.storageKey}_meta`
            ]);
            pendingCleanup.delete(response.storageKey);
            log('[ClipAIble Offscreen TTS] Auto-cleanup completed', {
              storageKey: response.storageKey
            });
          } catch (cleanupError) {
            logError('[ClipAIble Offscreen TTS] Auto-cleanup failed', {
              storageKey: response.storageKey,
              error: cleanupError.message
            });
          }
        }, 5 * 60 * 1000); // 5 minutes - enough time for audio to be used
        
        pendingCleanup.set(response.storageKey, cleanupId);
        
        log('[ClipAIble Offscreen TTS] Cleanup scheduled in service worker', {
          storageKey: response.storageKey,
          cleanupIn: '5 minutes'
        });
        
      } else if (response.method === 'indexeddb') {
        // Large audio - retrieve from IndexedDB (fallback when chrome.storage unavailable)
        log('[ClipAIble Offscreen TTS] Reading audio from IndexedDB...', {
          storageKey: response.storageKey,
          size: response.size
        });
        
        const indexedDBStart = Date.now();
        
        try {
          const dbName = 'ClipAIbleAudioStorage';
          const storeName = 'audioFiles';
          
          // Open IndexedDB
          const dbRequest = indexedDB.open(dbName, 1);
          
          const db = await new Promise((resolve, reject) => {
            dbRequest.onerror = () => reject(new Error('Failed to open IndexedDB'));
            dbRequest.onsuccess = () => resolve(dbRequest.result);
            dbRequest.onupgradeneeded = (event) => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
              }
            };
          });
          
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          
          // Get audio data from IndexedDB
          arrayBuffer = await new Promise((resolve, reject) => {
            const getRequest = store.get(response.storageKey);
            getRequest.onsuccess = () => {
              if (!getRequest.result) {
                reject(new Error('Audio data not found in IndexedDB'));
              } else {
                resolve(getRequest.result);
              }
            };
            getRequest.onerror = () => reject(new Error('Failed to read from IndexedDB'));
          });
          
          db.close();
          
          const indexedDBDuration = Date.now() - indexedDBStart;
          
          log('[ClipAIble Offscreen TTS] Audio retrieved from IndexedDB', {
            storageKey: response.storageKey,
            bufferSize: arrayBuffer.byteLength,
            indexedDBDuration
          });
          
          // Schedule cleanup
          const cleanupId = setTimeout(async () => {
            try {
              const cleanupDbRequest = indexedDB.open(dbName, 1);
              const cleanupDb = await new Promise((resolve, reject) => {
                cleanupDbRequest.onerror = () => reject(new Error('Failed to open IndexedDB for cleanup'));
                cleanupDbRequest.onsuccess = () => resolve(cleanupDbRequest.result);
                cleanupDbRequest.onupgradeneeded = (event) => {
                  const db = event.target.result;
                  if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                  }
                };
              });
              
              const cleanupTransaction = cleanupDb.transaction([storeName], 'readwrite');
              const cleanupStore = cleanupTransaction.objectStore(storeName);
              cleanupStore.delete(response.storageKey);
              
              await new Promise((resolve, reject) => {
                cleanupTransaction.oncomplete = () => {
                  cleanupDb.close();
                  resolve();
                };
                cleanupTransaction.onerror = () => reject(new Error('Cleanup transaction failed'));
              });
              
              pendingCleanup.delete(response.storageKey);
              log('[ClipAIble Offscreen TTS] IndexedDB cleanup completed', {
                storageKey: response.storageKey
              });
            } catch (cleanupError) {
              logError('[ClipAIble Offscreen TTS] IndexedDB cleanup failed', {
                storageKey: response.storageKey,
                error: cleanupError.message
              });
            }
          }, 5 * 60 * 1000); // 5 minutes
          
          pendingCleanup.set(response.storageKey, cleanupId);
          
          log('[ClipAIble Offscreen TTS] IndexedDB cleanup scheduled', {
            storageKey: response.storageKey,
            cleanupIn: '5 minutes'
          });
          
        } catch (indexedDBError) {
          logError('[ClipAIble Offscreen TTS] Failed to read from IndexedDB', {
            storageKey: response.storageKey,
            error: indexedDBError.message
          });
          const uiLang = await getUILanguageCached();
          const errorMsg = indexedDBError instanceof Error ? indexedDBError.message : 'Unknown error';
          throw new Error(tSync('errorFailedToReadAudioFromIndexedDB', uiLang).replace('{error}', errorMsg));
        }
        
      } else if (response.method === 'inline') {
        // Small audio - data in message (inline)
        if (!response.audioData) {
          logError('[ClipAIble Offscreen TTS] No audio data in response', {
            responseKeys: Object.keys(response || {}),
            response: response
          });
          const uiLang = await getUILanguageCached();
          throw new Error(tSync('errorNoAudioDataReturned', uiLang));
        }
        
        // Validate inline size (safety check)
        const MAX_INLINE_SIZE = 10 * 1024 * 1024; // 10 MB max for inline transfer
        
        // Type check and validation
        if (!Array.isArray(response.audioData)) {
          logError('[ClipAIble Offscreen TTS] Invalid audioData format', {
            type: typeof response.audioData,
            isArray: Array.isArray(response.audioData),
            responseKeys: Object.keys(response || {})
          });
          const uiLang = await getUILanguageCached();
          throw new Error(tSync('errorInvalidAudioDataFormat', uiLang));
        }
        
        const audioDataArray = response.audioData;
        const audioDataLength = audioDataArray.length;
        
        if (audioDataLength > MAX_INLINE_SIZE) {
          logError('[ClipAIble Offscreen TTS] Audio too large for inline transfer (should not happen with new logic)', {
            size: audioDataLength,
            maxSize: MAX_INLINE_SIZE,
            method: response.method,
            isArray: Array.isArray(response.audioData),
            note: 'Offscreen should use storage method for files >= 5 MB or when serialized size >= 10 MB'
          });
          const uiLang = await getUILanguageCached();
          const sizeMB = (audioDataLength / 1024 / 1024).toFixed(2);
          const maxMB = (MAX_INLINE_SIZE / 1024 / 1024).toFixed(2);
          throw new Error(tSync('errorAudioTooLargeForInline', uiLang).replace('{size}', sizeMB).replace('{max}', maxMB));
        }
        
        log('[ClipAIble Offscreen TTS] Converting inline audio data to ArrayBuffer...', {
          arrayLength: audioDataLength,
          size: response.size,
          maxInlineSize: MAX_INLINE_SIZE,
          withinLimit: audioDataLength <= MAX_INLINE_SIZE
        });
        
        // Convert array back to ArrayBuffer
        const convertStart = Date.now();
        const uint8Array = new Uint8Array(audioDataArray);
        arrayBuffer = uint8Array.buffer;
        const convertDuration = Date.now() - convertStart;
        
        log('[ClipAIble Offscreen TTS] Audio converted from inline', {
          bufferSize: arrayBuffer.byteLength,
          convertDuration
        });
      } else {
        // Unknown method or error response
        if (!response.success) {
          logError('[ClipAIble Offscreen TTS] TTS generation failed', {
            error: response.error,
            code: response.code,
            audioSize: response.audioSize,
            threshold: response.threshold
          });
          const uiLang = await getUILanguageCached();
          const errorMsg = response.error || tSync('errorTtsGenerationFailed', uiLang);
          throw new Error(errorMsg);
        }
        const uiLang = await getUILanguageCached();
        throw new Error(tSync('errorUnknownResponseMethod', uiLang).replace('{method}', response.method || 'undefined'));
      }
      
      log('[ClipAIble Offscreen TTS] === textToSpeech SUCCESS ===', {
        bufferSize: arrayBuffer.byteLength,
        method: response.method,
        totalDuration: Date.now() - ttsStartTime,
        timestamp: Date.now()
      });
      
      return arrayBuffer;
      
    } catch (error) {
      const errorTime = Date.now();
      logError('[ClipAIble Offscreen TTS] === textToSpeech FAILED ===', {
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        duration: errorTime - ttsStartTime,
        timestamp: errorTime
      });
      const uiLang = await getUILanguageCached();
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(tSync('errorOffscreenTtsFailed', uiLang).replace('{error}', errorMsg));
    }
  });
}

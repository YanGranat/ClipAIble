// @ts-check
// TTS Request Queue for safe parallel request handling
// Ensures TTS requests are processed sequentially to avoid memory pressure

import { log, logError } from '../utils/logging.js';

class TTSQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.activeRequests = 0;
  }

  /**
   * Add a request to the queue
   * @param {import('../types.js').AsyncFunction} fn - Async function to execute
   * @returns {Promise} Result of the function
   */
  async add(fn) {
    const requestId = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueStartTime = Date.now();
    
    log('[ClipAIble TTS Queue] Adding request to queue', {
      requestId,
      queueLength: this.queue.length,
      processing: this.processing,
      activeRequests: this.activeRequests
    });
    
    return new Promise((resolve, reject) => {
      this.queue.push({ 
        fn, 
        resolve, 
        reject,
        requestId,
        queueStartTime
      });
      this.process();
    });
  }

  /**
   * Process the queue sequentially
   */
  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    log('[ClipAIble TTS Queue] Starting queue processing', {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests
    });
    
    while (this.queue.length > 0) {
      const { fn, resolve, reject, requestId, queueStartTime } = this.queue.shift();
      
      const waitTime = Date.now() - queueStartTime;
      if (waitTime > 0) {
        log('[ClipAIble TTS Queue] Request waited in queue', {
          requestId,
          waitTime
        });
      }
      
      this.activeRequests++;
      const processStartTime = Date.now();
      
      try {
        log('[ClipAIble TTS Queue] Processing request', {
          requestId,
          queueLength: this.queue.length,
          activeRequests: this.activeRequests
        });
        
        const result = await fn();
        
        const processDuration = Date.now() - processStartTime;
        log('[ClipAIble TTS Queue] Request completed', {
          requestId,
          processDuration,
          totalTime: Date.now() - queueStartTime
        });
        
        resolve(result);
      } catch (error) {
        const processDuration = Date.now() - processStartTime;
        logError('[ClipAIble TTS Queue] Request failed', {
          requestId,
          error: error.message,
          processDuration,
          totalTime: Date.now() - queueStartTime
        });
        
        reject(error);
      } finally {
        this.activeRequests--;
      }
    }
    
    this.processing = false;
    
    log('[ClipAIble TTS Queue] Queue processing complete', {
      remainingQueueLength: this.queue.length,
      activeRequests: this.activeRequests
    });
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      activeRequests: this.activeRequests
    };
  }
}

// Export singleton instance
export const ttsQueue = new TTSQueue();





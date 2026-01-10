// @ts-check
// DeepSeek API module for ClipAIble extension
// DeepSeek API is compatible with OpenAI API format

import { log, logError, logDebug, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Call DeepSeek API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - DeepSeek API key
 * @param {string} model - Model name (e.g., 'deepseek-chat', 'deepseek-reasoner')
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callDeepSeekAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  const functionStartTime = Date.now();
  log('=== callDeepSeekAPI: FUNCTION ENTRY ===', {
    timestamp: functionStartTime,
    model: model || 'deepseek-chat',
    jsonResponse: jsonResponse,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    totalPromptLength: systemPrompt.length + userPrompt.length,
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey ? apiKey.length : 0,
    apiKeyPreview: apiKey ? (apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4)) : null
  });
  
  // Default to deepseek-chat if model not specified
  const modelName = model || 'deepseek-chat';
  log('callDeepSeekAPI: Model determined', { modelName, originalModel: model, isDefault: !model });
  
  // Internal function to make the actual API call
  async function makeRequest(withResponseFormat) {
    const makeRequestStartTime = Date.now();
    log('=== makeRequest: FUNCTION ENTRY ===', {
      timestamp: makeRequestStartTime,
      modelName: modelName,
      withResponseFormat: withResponseFormat,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length
    });
    
    const requestBody = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      // CRITICAL: Use streaming to avoid Chrome's 30-second timeout on large Brotli responses
      // Streaming allows response to be decoded incrementally, avoiding the timeout
      stream: true
    };
    
    if (withResponseFormat) {
      requestBody.response_format = { type: 'json_object' };
      log('makeRequest: Added response_format', { responseFormat: requestBody.response_format });
    }
    
    log('makeRequest: Using streaming mode', {
      stream: requestBody.stream,
      note: 'Streaming mode avoids Chrome 30-second timeout on large Brotli-compressed responses by decoding incrementally'
    });
    
    // Log system and user prompts separately before creating request body
    log('makeRequest: System and user prompts (BEFORE request body creation)', {
      timestamp: Date.now(),
      systemPromptLength: systemPrompt.length,
      systemPromptSizeKB: (systemPrompt.length / 1024).toFixed(2),
      systemPromptSizeMB: (systemPrompt.length / (1024 * 1024)).toFixed(2),
      systemPromptFull: systemPrompt, // Full system prompt for debugging
      systemPromptPreview: systemPrompt.substring(0, 500),
      userPromptLength: userPrompt.length,
      userPromptSizeKB: (userPrompt.length / 1024).toFixed(2),
      userPromptSizeMB: (userPrompt.length / (1024 * 1024)).toFixed(2),
      userPromptFull: userPrompt, // Full user prompt (HTML page) for debugging
      userPromptPreview: userPrompt.substring(0, 1000),
      totalPromptLength: systemPrompt.length + userPrompt.length,
      totalPromptSizeKB: ((systemPrompt.length + userPrompt.length) / 1024).toFixed(2),
      totalPromptSizeMB: ((systemPrompt.length + userPrompt.length) / (1024 * 1024)).toFixed(2)
    });
    
    const requestBodyJson = JSON.stringify(requestBody);
    log('makeRequest: Request body prepared', {
      model: requestBody.model,
      messagesCount: requestBody.messages.length,
      hasResponseFormat: !!requestBody.response_format,
      requestBodySize: requestBodyJson.length,
      requestBodySizeKB: (requestBodyJson.length / 1024).toFixed(2),
      requestBodySizeMB: (requestBodyJson.length / (1024 * 1024)).toFixed(2),
      requestBodyPreview: requestBodyJson.substring(0, 500),
      requestBodyFull: requestBodyJson, // Full request body for debugging
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      note: 'System and user prompts logged separately above'
    });
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
    const fetchStartTime = Date.now();
    
    log('makeRequest: Starting fetch', {
      url: 'https://api.deepseek.com/v1/chat/completions',
      method: 'POST',
      hasController: !!controller,
      hasSignal: !!controller.signal,
      timeoutMs: CONFIG.API_TIMEOUT_MS,
      timestamp: fetchStartTime
    });
    
    try {
      const fetchResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          // CRITICAL: Disable compression completely to avoid Chrome's 30-second timeout on large Brotli responses
          // Get response as-is without compression - no decoding needed, no timeout issues
          'Accept-Encoding': 'identity'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      const fetchTime = Date.now() - fetchStartTime;
      log('makeRequest: Fetch completed', {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        ok: fetchResponse.ok,
        fetchTimeMs: fetchTime,
        fetchTimeSeconds: Math.round(fetchTime / 1000),
        headers: (() => {
          const headersObj = {};
          /** @type {any} */
          const headers = fetchResponse.headers;
          if (headers && typeof headers.forEach === 'function') {
            headers.forEach((value, key) => {
              headersObj[key] = value;
            });
          }
          return headersObj;
        })(),
        responseType: fetchResponse.type,
        responseUrl: fetchResponse.url,
        responseBodyUsed: fetchResponse.bodyUsed
      });
      
      // If not ok and retryable, throw error for retry logic
      if (!fetchResponse.ok) {
        log('makeRequest: Response not OK', {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          retryableCodes: CONFIG.RETRYABLE_STATUS_CODES
        });
        
        const retryableCodes = CONFIG.RETRYABLE_STATUS_CODES;
        if (retryableCodes.includes(fetchResponse.status)) {
          log('makeRequest: Error is retryable, throwing for retry logic', {
            status: fetchResponse.status
          });
          /** @type {Error & {status?: number, response?: Response}} */
          const error = new Error(`HTTP ${fetchResponse.status}`);
          error.status = fetchResponse.status;
          error.response = fetchResponse;
          throw error;
        }
        // Non-retryable error - get error details
        log('makeRequest: Error is not retryable, getting error details', {
          status: fetchResponse.status
        });
        let errorData;
        try {
          errorData = await fetchResponse.json();
          log('makeRequest: Error data parsed', {
            errorData: errorData,
            errorMessage: errorData.error?.message
          });
        } catch (e) {
          log('makeRequest: Failed to parse error data', {
            parseError: e.message
          });
          errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
        }
        /** @type {Error & {status?: number}} */
        const error = new Error(errorData.error?.message || `API error: ${fetchResponse.status}`);
        error.status = fetchResponse.status;
        log('makeRequest: Throwing non-retryable error', {
          errorMessage: error.message,
          status: error.status
        });
        throw error;
      }
      
      const makeRequestTime = Date.now() - makeRequestStartTime;
      log('=== makeRequest: FUNCTION EXIT (SUCCESS) ===', {
        timestamp: Date.now(),
        duration: makeRequestTime,
        responseStatus: fetchResponse.status,
        responseOk: fetchResponse.ok
      });
      
      return fetchResponse;
    } catch (e) {
      throw e;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
  
  // Try with response_format first if jsonResponse is requested
  // DeepSeek supports it, but may sometimes return invalid JSON, so we'll fallback without it
  let useResponseFormat = jsonResponse;
  let response;
  const requestStartTime = Date.now();
  
  log('=== callDeepSeekAPI: Starting API request ===', {
    timestamp: requestStartTime,
    modelName: modelName,
    useResponseFormat: useResponseFormat,
    jsonResponse: jsonResponse,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length
  });
  
  try {
    log('Sending request to DeepSeek API...', { 
      model: modelName, 
      promptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      useResponseFormat,
      timestamp: requestStartTime
    });
    
    // Log periodic updates for long-running requests
    let progressInterval = setInterval(() => {
      const elapsed = Date.now() - requestStartTime;
      const elapsedSeconds = Math.round(elapsed / 1000);
      logDebug('DeepSeek API request still processing...', {
        elapsedSeconds,
        elapsedMinutes: Math.round(elapsedSeconds / 60 * 10) / 10,
        model: modelName
      });
    }, 30000); // Log every 30 seconds
    
    try {
      log('=== callDeepSeekAPI: Calling makeRequest with retry ===', {
        timestamp: Date.now(),
        useResponseFormat: useResponseFormat
      });
      
      // Use retry wrapper for fetch
      response = await callWithRetry(
        async () => {
          log('callWithRetry: Calling makeRequest', {
            timestamp: Date.now(),
            useResponseFormat: useResponseFormat
          });
          const result = await makeRequest(useResponseFormat);
          log('callWithRetry: makeRequest completed', {
            timestamp: Date.now(),
            responseStatus: result.status,
            responseOk: result.ok
          });
          return result;
        },
        {
          onRetry: (attempt, delay) => {
            log(`DeepSeek API retry attempt ${attempt}, waiting ${delay}ms...`, {
              attempt: attempt,
              delay: delay,
              timestamp: Date.now()
            });
          }
        }
      );
      
      log('=== callDeepSeekAPI: callWithRetry completed ===', {
        timestamp: Date.now(),
        responseStatus: response?.status,
        responseOk: response?.ok,
        responseBodyUsed: response?.bodyUsed
      });
    } finally {
      // CRITICAL: Always clear timers in finally to prevent memory leaks
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
        log('callDeepSeekAPI: Progress interval cleared', { timestamp: Date.now() });
      }
    }
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      // Normalize timeout error with context
      const normalized = await handleError(fetchError, {
        source: 'deepseek',
        errorType: 'timeoutError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'fetchRequest',
          model: modelName,
          errorName: 'AbortError'
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorTimeout', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code; // Will be TIMEOUT
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    if (fetchError.status) {
      // Error from retry logic - already has status
      let errorData;
      try {
        errorData = await fetchError.response?.json();
      } catch (e) {
        errorData = { error: { message: `HTTP ${fetchError.status}` } };
      }
      
      // Provide more helpful error messages for common errors
      let errorMessage = errorData?.error?.message || `API error: ${fetchError.status}`;
      if (fetchError.status === 404) {
        errorMessage = `Model "${modelName}" not found. The model may not be available yet or the name may be incorrect. Please try a different model (e.g., deepseek-chat or deepseek-reasoner).`;
      } else if (fetchError.status === 401) {
        errorMessage = 'DeepSeek API key is invalid or missing. Please check your API key in settings.';
      } else if (fetchError.status === 403) {
        errorMessage = 'DeepSeek API access forbidden. Please check your API key permissions.';
      } else if (fetchError.status === 429) {
        errorMessage = 'DeepSeek API rate limit exceeded. Please try again later.';
      } else if (fetchError.status === 400) {
        // Check if it's a prompt length issue
        const errorText = errorData?.error?.message || '';
        if (errorText.toLowerCase().includes('length') || errorText.toLowerCase().includes('size') || errorText.toLowerCase().includes('token') || errorText.toLowerCase().includes('limit')) {
          errorMessage = `DeepSeek API: Prompt too long (${(systemPrompt.length + userPrompt.length).toLocaleString()} chars). The page is too large for analysis. Try a smaller page or use extract mode instead of selector mode.`;
        } else {
          errorMessage = `DeepSeek API error: ${errorText || '400 Bad Request'}. The request may be too large or invalid.`;
        }
      }
      
      // Normalize HTTP error with context (createUserMessage will handle status-specific messages)
      /** @type {import('../types.js').ExtendedError} */
      const httpError = new Error(`HTTP ${fetchError.status}`);
      httpError.status = fetchError.status;
      const normalized = await handleError(httpError, {
        source: 'deepseek',
        errorType: 'httpError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message with status handling
        context: {
          operation: 'fetchRequest',
          model: modelName,
          statusCode: fetchError.status,
          errorData: errorData?.error
        }
      });
      
      // Use centralized user message with fallback
      const uiLang = await getUILanguageCached();
      let finalErrorMessage = normalized.userMessage;
      if (!finalErrorMessage) {
        // Fallback to manual messages if createUserMessage failed
        finalErrorMessage = errorData?.error?.message || tSync('errorApiError', uiLang).replace('{status}', String(fetchError.status));
        if (fetchError.status === 401) {
          finalErrorMessage = tSync('errorApiKeyInvalid', uiLang);
        } else if (fetchError.status === 403) {
          finalErrorMessage = tSync('errorApiAccessForbidden', uiLang);
        } else if (fetchError.status === 429) {
          finalErrorMessage = tSync('errorRateLimit', uiLang);
        }
      }
      
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(finalErrorMessage);
      error.code = normalized.code; // Will be AUTH_ERROR, RATE_LIMIT, or PROVIDER_ERROR
      error.status = fetchError.status;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    // Network error (no status, not AbortError)
    const normalized = await handleError(fetchError, {
      source: 'deepseek',
      errorType: 'networkError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'fetchRequest',
        model: modelName,
        errorName: fetchError.name
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorNetwork', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code; // Will be NETWORK_ERROR
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }

  const responseTime = Date.now() - requestStartTime;
  log('=== callDeepSeekAPI: Response received ===', { 
    timestamp: Date.now(),
    status: response.status, 
    ok: response.ok,
    responseTimeMs: responseTime,
    responseTimeSeconds: Math.round(responseTime / 1000),
    responseType: response.type,
    responseUrl: response.url,
    responseBodyUsed: response.bodyUsed,
    responseHeaders: (() => {
      const headersObj = {};
      /** @type {any} */
      const headers = response.headers;
      if (headers && typeof headers.forEach === 'function') {
        headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      }
      return headersObj;
    })()
  });

  let result;
  /** @type {string|undefined} */
  let responseText;
  const readStartTime = Date.now();
  
  // Log ALL response headers and metadata before reading
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  
  const contentLength = response.headers.get('content-length');
  const contentEncoding = response.headers.get('content-encoding');
  const contentType = response.headers.get('content-type');
  
  log('=== callDeepSeekAPI: Starting response body reading ===', {
    timestamp: readStartTime,
    responseBodyUsed: response.bodyUsed,
    responseStatus: response.status,
    responseOk: response.ok,
    responseType: response.type,
    responseUrl: response.url,
    contentType: contentType,
    contentEncoding: contentEncoding,
    contentLength: contentLength,
    contentLengthBytes: contentLength ? parseInt(contentLength, 10) : null,
    contentLengthKB: contentLength ? (parseInt(contentLength, 10) / 1024).toFixed(2) : null,
    contentLengthMB: contentLength ? (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(2) : null,
    allHeaders: responseHeaders,
    note: 'Full response metadata before reading body'
  });
  
  // CRITICAL: Check if response body was already consumed
  if (response.bodyUsed) {
    logError('DeepSeek response body already consumed - cannot read again', {
      model: modelName,
      responseStatus: response?.status,
      responseOk: response?.ok,
      responseType: response?.type,
      responseUrl: response?.url,
      note: 'Response body was read elsewhere or already consumed'
    });
    throw new Error('Response body already consumed');
  }
  
  log('callDeepSeekAPI: Response body not consumed, proceeding to read', {
    timestamp: Date.now(),
    note: 'Using SSE streaming to read response incrementally - avoids Chrome 30-second timeout on large Brotli responses'
  });
  
  try {
    // CRITICAL: Use streaming (SSE) to avoid Chrome's 30-second timeout on large Brotli responses
    // Streaming allows response to be decoded incrementally as chunks arrive, avoiding the timeout
    // deepseek-reasoner can generate very large responses with reasoning tokens - needs longer timeout
    const readTimeout = modelName.includes('reasoner') ? 600000 : 180000; // 10 minutes for reasoner, 3 minutes for others
    let readTimeoutId = null;
    let readCompleted = false;
    
    const jsonStartTime = Date.now();
    const compressedSize = contentLength ? parseInt(contentLength, 10) : null;
    
    log('callDeepSeekAPI: Starting SSE stream reading', {
      timestamp: jsonStartTime,
      readTimeout: readTimeout,
      readTimeoutSeconds: Math.round(readTimeout / 1000),
      contentEncoding: contentEncoding,
      compressedSizeBytes: compressedSize,
      compressedSizeKB: compressedSize ? (compressedSize / 1024).toFixed(2) : null,
      compressedSizeMB: compressedSize ? (compressedSize / (1024 * 1024)).toFixed(2) : null,
      note: 'Using SSE streaming - response decoded incrementally as chunks arrive, avoiding Chrome 30-second timeout on large Brotli responses'
    });
    
    // CRITICAL: Use SSE streaming to read response incrementally
    // This avoids Chrome's 30-second timeout on large Brotli responses by decoding chunks as they arrive
    let progressInterval = null;
    const progressLogInterval = 10000; // Log progress every 10 seconds
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - jsonStartTime;
      if (!readCompleted) {
        log('callDeepSeekAPI: Still reading SSE stream (incremental decoding in progress)', {
          elapsedMs: elapsed,
          elapsedSeconds: Math.round(elapsed / 1000),
          elapsedMinutes: Math.round(elapsed / 60000 * 10) / 10,
          model: modelName,
          contentEncoding: contentEncoding,
          note: 'Using SSE streaming - decoding incrementally, avoiding 30-second timeout'
        });
      }
    }, progressLogInterval);
    
    // Read SSE stream and accumulate content from delta chunks
    const readPromise = (async () => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullContent = '';
      let chunkCount = 0;
      let totalBytesRead = 0;
      let responseId = null;
      let responseModel = null;
      let usageTokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          
          chunkCount++;
          totalBytesRead += value.length;
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines (SSE format: "data: {...}\n\n")
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === 'data: [DONE]') {
              continue;
            }
            
            if (trimmedLine.startsWith('data: ')) {
              const jsonStr = trimmedLine.substring(6); // Remove "data: " prefix
              try {
                const chunk = JSON.parse(jsonStr);
                
                // Extract response metadata from first chunk
                if (!responseId && chunk.id) {
                  responseId = chunk.id;
                }
                if (!responseModel && chunk.model) {
                  responseModel = chunk.model;
                }
                
                // Accumulate content from delta chunks
                if (chunk.choices?.[0]?.delta?.content) {
                  fullContent += chunk.choices[0].delta.content;
                }
                
                // Accumulate usage tokens if available
                if (chunk.usage) {
                  usageTokens.prompt_tokens = chunk.usage.prompt_tokens || usageTokens.prompt_tokens;
                  usageTokens.completion_tokens = chunk.usage.completion_tokens || usageTokens.completion_tokens;
                  usageTokens.total_tokens = chunk.usage.total_tokens || usageTokens.total_tokens;
                }
              } catch (parseError) {
                // Skip invalid JSON chunks
                logDebug('callDeepSeekAPI: Failed to parse SSE chunk', {
                  chunk: jsonStr.substring(0, 200),
                  error: parseError.message
                });
              }
            }
          }
          
          // Log progress every 50 chunks or 500KB
          if (chunkCount % 50 === 0 || totalBytesRead % (500 * 1024) < value.length) {
            log('callDeepSeekAPI: SSE stream progress', {
              chunkCount: chunkCount,
              totalBytesRead: totalBytesRead,
              totalBytesReadKB: (totalBytesRead / 1024).toFixed(2),
              contentLength: fullContent.length,
              contentLengthKB: (fullContent.length / 1024).toFixed(2),
              elapsedMs: Date.now() - jsonStartTime
            });
          }
        }
        
        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
            const jsonStr = trimmedLine.substring(6);
            try {
              const chunk = JSON.parse(jsonStr);
              if (chunk.choices?.[0]?.delta?.content) {
                fullContent += chunk.choices[0].delta.content;
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
        
        // Decode any remaining buffered data
        if (buffer) {
          fullContent += decoder.decode();
        }
        
        readCompleted = true;
        if (readTimeoutId) clearTimeout(readTimeoutId);
        if (progressInterval) clearInterval(progressInterval);
        
        const streamReadTime = Date.now() - jsonStartTime;
        log('callDeepSeekAPI: SSE stream reading completed', {
          timestamp: Date.now(),
          streamReadTimeMs: streamReadTime,
          streamReadTimeSeconds: Math.round(streamReadTime / 1000),
          chunkCount: chunkCount,
          totalBytesRead: totalBytesRead,
          totalBytesReadKB: (totalBytesRead / 1024).toFixed(2),
          totalBytesReadMB: (totalBytesRead / (1024 * 1024)).toFixed(2),
          contentLength: fullContent.length,
          contentLengthKB: (fullContent.length / 1024).toFixed(2),
          contentLengthMB: (fullContent.length / (1024 * 1024)).toFixed(2),
          compressionRatio: compressedSize ? (fullContent.length / compressedSize).toFixed(2) : null,
          responseTextFull: fullContent, // Full response text for debugging
          responseTextPreview: fullContent.substring(0, 1000),
          note: 'SSE stream decoded incrementally - avoided Chrome 30-second timeout'
        });
        
        // Construct final response object from accumulated content
        // DeepSeek streaming format: we need to reconstruct the full response
        const finalResult = {
          id: responseId || 'stream-complete',
          model: responseModel || modelName,
          choices: [{
            message: {
              role: 'assistant',
              content: fullContent
            },
            finish_reason: 'stop'
          }],
          usage: usageTokens
        };
        
        return { result: finalResult, responseText: fullContent };
      } catch (streamError) {
        if (progressInterval) clearInterval(progressInterval);
        
        // If network error occurred but we have partial content, try to use it
        if (streamError.name === 'TypeError' && streamError.message === 'network error' && fullContent && fullContent.length > 0) {
          logWarn('DeepSeek SSE stream network error - attempting to use partial content', {
            partialContentLength: fullContent.length,
            partialContentLengthKB: (fullContent.length / 1024).toFixed(2),
            chunkCount: chunkCount,
            totalBytesRead: totalBytesRead,
            totalBytesReadKB: (totalBytesRead / 1024).toFixed(2),
            elapsedMs: Date.now() - jsonStartTime,
            model: modelName,
            note: 'Network connection lost during SSE stream reading, but partial content available - attempting to use it'
          });
          
          // Process any remaining buffer before using partial content
          if (buffer.trim()) {
            const trimmedLine = buffer.trim();
            if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
              const jsonStr = trimmedLine.substring(6);
              try {
                const chunk = JSON.parse(jsonStr);
                if (chunk.choices?.[0]?.delta?.content) {
                  fullContent += chunk.choices[0].delta.content;
                }
              } catch (parseError) {
                // Skip invalid JSON
              }
            }
          }
          
          // Decode any remaining buffered data
          if (buffer) {
            try {
              fullContent += decoder.decode();
            } catch (decodeError) {
              // Ignore decode errors for remaining buffer
            }
          }
          
          // If we have meaningful content, construct partial result
          if (fullContent.length > 100) { // At least 100 characters
            const partialResult = {
              id: responseId || 'stream-partial',
              model: responseModel || modelName,
              choices: [{
                message: {
                  role: 'assistant',
                  content: fullContent
                },
                finish_reason: 'length' // Indicates partial/incomplete response
              }],
              usage: usageTokens
            };
            
            log('DeepSeek SSE stream: Using partial content after network error', {
              partialContentLength: fullContent.length,
              partialContentLengthKB: (fullContent.length / 1024).toFixed(2),
              chunkCount: chunkCount,
              note: 'Returning partial response due to network error - content may be incomplete'
            });
            
            return { result: partialResult, responseText: fullContent };
          }
        }
        
        throw streamError;
      }
    })().then(({ result: streamResult, responseText: streamText }) => {
      result = streamResult;
      responseText = streamText;
      return streamResult;
    }).catch(error => {
      if (progressInterval) clearInterval(progressInterval);
      throw error;
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      readTimeoutId = setTimeout(() => {
        if (!readCompleted) {
          logError('DeepSeek response SSE stream timeout - taking too long to read response body', {
            elapsedMs: Date.now() - readStartTime,
            model: modelName,
            responseStatus: response?.status,
            responseOk: response?.ok,
            responseType: response?.type,
            responseBodyUsed: response?.bodyUsed,
            contentEncoding: response?.headers?.get('content-encoding'),
            note: `Response body reading exceeded ${Math.round(readTimeout / 60000)} minute timeout - may be very large response with reasoning tokens`
          });
          reject(new Error(`Response body read timeout after ${Math.round(readTimeout / 60000)} minutes`));
        }
      }, readTimeout);
    });
    
    try {
      result = await Promise.race([readPromise, timeoutPromise]);
      
      const jsonEndTime = Date.now();
      const jsonParseTime = jsonEndTime - jsonStartTime;
      const totalReadTime = jsonEndTime - readStartTime;
      
      const decompressedSize = responseText ? responseText.length : 0;
      const compressionRatio = compressedSize ? (decompressedSize / compressedSize).toFixed(2) : null;
      
      log('callDeepSeekAPI: response.text() and JSON.parse completed', {
        timestamp: jsonEndTime,
        jsonParseTimeMs: jsonParseTime,
        jsonParseTimeSeconds: Math.round(jsonParseTime / 1000),
        totalReadTimeMs: totalReadTime,
        totalReadTimeSeconds: Math.round(totalReadTime / 1000),
        hasResult: !!result,
        resultId: result?.id,
        resultModel: result?.model,
        responseBodyUsed: response?.bodyUsed,
        compressedSizeBytes: compressedSize,
        compressedSizeKB: compressedSize ? (compressedSize / 1024).toFixed(2) : null,
        compressedSizeMB: compressedSize ? (compressedSize / (1024 * 1024)).toFixed(2) : null,
        decompressedSizeBytes: decompressedSize,
        decompressedSizeKB: (decompressedSize / 1024).toFixed(2),
        decompressedSizeMB: (decompressedSize / (1024 * 1024)).toFixed(2),
        compressionRatio: compressionRatio,
        decompressionSpeedMBps: compressedSize && jsonParseTime > 0 
          ? ((compressedSize / (1024 * 1024)) / (jsonParseTime / 1000)).toFixed(2)
          : null,
        note: 'Response read via SSE streaming (decoded incrementally) and content accumulated successfully'
      });
    } catch (readError) {
      if (readTimeoutId) clearTimeout(readTimeoutId);
      if (progressInterval) clearInterval(progressInterval);
      const readTime = Date.now() - readStartTime;
      // Check if body was consumed during the read attempt
      logError('DeepSeek response SSE stream read failed', {
        error: readError.message,
        errorName: readError.name,
        errorStack: readError.stack,
        responseBodyUsed: response?.bodyUsed,
        elapsedMs: readTime,
        elapsedSeconds: Math.round(readTime / 1000),
        elapsedMinutes: Math.round(readTime / 60000 * 10) / 10,
        model: modelName,
        contentEncoding: response?.headers?.get('content-encoding'),
        compressedSizeBytes: compressedSize,
        timestamp: Date.now()
      });
      throw readError;
    }
    
    // Result already parsed from response.json(), so we can skip JSON.parse
    // Log the parsed result with full size information
    const totalTime = Date.now() - requestStartTime;
    const responseTextLength = responseText ? responseText.length : 0;
    const choicesContentLength = result?.choices?.[0]?.message?.content ? result.choices[0].message.content.length : 0;
    
    log('=== callDeepSeekAPI: Response parsed successfully ===', {
      timestamp: Date.now(),
      id: result.id, 
      model: result.model,
      usage: result.usage,
      hasChoices: !!result.choices,
      choicesCount: result.choices ? result.choices.length : 0,
      choicesContentLength: choicesContentLength,
      choicesContentLengthKB: (choicesContentLength / 1024).toFixed(2),
      choicesContentLengthMB: (choicesContentLength / (1024 * 1024)).toFixed(2),
      totalTimeMs: totalTime,
      totalTimeSeconds: Math.round(totalTime / 1000),
      responseTextLength: responseTextLength,
      responseTextLengthKB: (responseTextLength / 1024).toFixed(2),
      responseTextLengthMB: (responseTextLength / (1024 * 1024)).toFixed(2),
      responseTextPreview: responseText ? responseText.substring(0, 500) : null,
      note: 'Full response size and content information'
    });
  } catch (parseError) {
    // Log the response text we tried to parse if available
    if (responseText) {
      logError('DeepSeek response parse failed - response text', {
        textLength: responseText.length,
        fullText: responseText,
        parseError: parseError.message,
        parseErrorStack: parseError.stack,
        model: modelName,
        responseStatus: response?.status,
        responseOk: response?.ok,
        responseType: response?.type,
        responseUrl: response?.url
      });
    } else {
      // If responseText is not available, it means response.text() failed
      // This could be because response was already consumed or network error
      // Try fallback: use response.json() if body is not yet consumed
      if (!response.bodyUsed) {
        logWarn('DeepSeek response.text() failed, trying response.json() as fallback', {
          parseError: parseError.message,
          model: modelName,
          responseStatus: response?.status
        });
        try {
          result = await response.json();
          const totalTime = Date.now() - requestStartTime;
          log('DeepSeek response parsed via json() fallback', { 
            id: result.id, 
            model: result.model,
            usage: result.usage,
            totalTimeMs: totalTime,
            totalTimeSeconds: Math.round(totalTime / 1000)
          });
          // Successfully parsed via json() fallback - continue processing
          responseText = JSON.stringify(result);
        } catch (jsonError) {
          logError('DeepSeek response.json() fallback also failed', {
            jsonError: jsonError.message,
            parseError: parseError.message,
            model: modelName
          });
          // Both text() and json() failed - log and rethrow
          logError('DeepSeek response parse failed - could not read response text or json', {
            parseError: parseError.message,
            parseErrorStack: parseError.stack,
            parseErrorName: parseError.name,
            jsonError: jsonError.message,
            model: modelName,
            responseStatus: response?.status,
            responseOk: response?.ok,
            responseType: response?.type,
            responseUrl: response?.url,
            responseBodyUsed: response?.bodyUsed,
            note: 'Both response.text() and response.json() failed - response body may be corrupted or network error occurred'
          });
        }
      } else {
        logError('DeepSeek response parse failed - could not read response text', {
          parseError: parseError.message,
          parseErrorStack: parseError.stack,
          parseErrorName: parseError.name,
          model: modelName,
          responseStatus: response?.status,
          responseOk: response?.ok,
          responseType: response?.type,
          responseUrl: response?.url,
          responseBodyUsed: response?.bodyUsed,
          note: 'Response body already consumed - cannot retry with json()'
        });
      }
    }
    
    // If we successfully parsed via json() fallback, continue processing (don't throw error)
    if (result) {
      // Successfully parsed via json() fallback - continue to JSON content extraction below
      log('DeepSeek response successfully parsed via json() fallback, continuing processing');
    } else {
      // Both text() and json() failed - throw error
      const normalized = await handleError(parseError, {
        source: 'deepseek',
        errorType: 'parseError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'parseResponse',
          model: modelName,
          responseStatus: response?.status,
          parseError: parseError.message,
          parseErrorStack: parseError.stack,
          hasResponseText: !!responseText,
          responseTextLength: responseText?.length || 0,
          responseBodyUsed: response?.bodyUsed
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorFailedToParseResponse', uiLang);
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(userMessage);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
    }
  }
  
  // If we have result but no responseText (parsed via json() fallback), extract content from result
  if (result && !responseText) {
    // responseText was set to JSON.stringify(result) in fallback, so we can continue
    responseText = JSON.stringify(result);
  }

  log('=== callDeepSeekAPI: Extracting content from result ===', {
    timestamp: Date.now(),
    hasResult: !!result,
    hasChoices: !!result?.choices,
    choicesCount: result?.choices?.length || 0,
    hasFirstChoice: !!result?.choices?.[0],
    hasMessage: !!result?.choices?.[0]?.message,
    hasContent: !!result?.choices?.[0]?.message?.content
  });
  
  let content = result.choices?.[0]?.message?.content;
  
  // CRITICAL: When response_format is used, content might already be an object, not a string
  // If it's already an object, return it immediately for JSON responses
  if (jsonResponse && content && typeof content === 'object' && !Array.isArray(content) && content.constructor === Object) {
    log('callDeepSeekAPI: Content is already an object (response_format worked correctly)', {
      timestamp: Date.now(),
      contentType: typeof content,
      isObject: true,
      keys: Object.keys(content).slice(0, 10)
    });
    return content;
  }
  
  // Convert content to string if it's not already
  if (content && typeof content !== 'string') {
    content = String(content);
  }
  
  log('callDeepSeekAPI: Content extracted', {
    timestamp: Date.now(),
    contentLength: content ? content.length : 0,
    contentPreview: content ? (typeof content === 'string' ? content.substring(0, 200) : String(content).substring(0, 200)) : null,
    hasContent: !!content,
    contentType: typeof content
  });

  if (!content) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content in response');
    const normalized = await handleError(noContentError, {
      source: 'deepseek',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateContent',
        model: modelName,
        hasResult: !!result,
        hasChoices: !!result?.choices,
        choicesCount: result?.choices?.length || 0
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorNoContentReceived', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
  }

  log('=== callDeepSeekAPI: Response content extracted ===', {
    timestamp: Date.now(),
    length: typeof content === 'string' ? content.length : String(content).length,
    preview: typeof content === 'string' ? content.substring(0, 100) : String(content).substring(0, 100),
    jsonResponse: jsonResponse
  });

  if (!jsonResponse) {
    const functionTime = Date.now() - functionStartTime;
    log('=== callDeepSeekAPI: FUNCTION EXIT (text response) ===', {
      timestamp: Date.now(),
      totalDuration: functionTime,
      contentLength: typeof content === 'string' ? content.length : String(content).length
    });
    return content;
  }
  
  log('callDeepSeekAPI: Processing JSON response', {
    timestamp: Date.now(),
    contentLength: typeof content === 'string' ? content.length : String(content).length
  });

  // Extract JSON from markdown code blocks if present
  // Some models return JSON wrapped in ```json ... ``` even with response_format
  let jsonContent = (typeof content === 'string' ? content : String(content)).trim();
  if (jsonContent.startsWith('```')) {
    // Extract content from markdown code block
    const lines = jsonContent.split('\n');
    // Remove first line (```json or ```)
    lines.shift();
    // Remove last line (```)
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    jsonContent = lines.join('\n').trim();
    log('Extracted JSON from markdown code block', { 
      originalLength: content.length, 
      extractedLength: jsonContent.length,
      model: modelName 
    });
  }

  // Try to parse the JSON content
  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
    log('JSON.parse succeeded on first attempt', {
      model: modelName,
      contentLength: jsonContent.length,
      parsedKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 10) : null
    });
  } catch (jsonError) {
    log('Initial JSON parse failed, attempting extraction', {
      model: modelName,
      contentLength: jsonContent.length,
      startsWithBrace: jsonContent.startsWith('{'),
      startsWithBracket: jsonContent.startsWith('['),
      firstChars: jsonContent.substring(0, 200),
      lastChars: jsonContent.length > 200 ? jsonContent.substring(jsonContent.length - 200) : jsonContent,
      errorMessage: jsonError.message,
      errorName: jsonError.name
    });
    
    // If parsing fails, try to extract JSON from the beginning of the response
    // This handles cases where model returns JSON followed by additional text (e.g., reasoning tokens)
    if (jsonContent.startsWith('{') || jsonContent.startsWith('[')) {
      // Try to find the end of the first valid JSON object/array
      let jsonEnd = -1;
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      const isObject = jsonContent.startsWith('{');
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (inString) {
          continue;
        }
        
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && isObject) {
            jsonEnd = i + 1;
            break;
          }
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0 && !isObject) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      logDebug('JSON extraction attempt', {
        model: modelName,
        foundEnd: jsonEnd > 0,
        jsonEnd,
        originalLength: jsonContent.length,
        isObject,
        inStringAtEnd: inString,
        braceCount,
        bracketCount
      });
      
      // If JSON ended while still in a string (unterminated string), try to find last valid position
      if (jsonEnd <= 0 && inString) {
        // JSON was truncated in the middle of a string - try to find last valid position before the string
        // Go backwards from the end, find where the string started, and close it
        let lastValidPos = -1;
        let tempBraceCount = 0;
        let tempBracketCount = 0;
        let tempInString = false;
        let tempEscapeNext = false;
        
        // Find the last position where all brackets/braces are balanced and we're not in a string
        for (let i = jsonContent.length - 1; i >= 0 && lastValidPos < 0; i--) {
          const char = jsonContent[i];
          
          if (tempEscapeNext) {
            tempEscapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            tempEscapeNext = true;
            continue;
          }
          
          if (char === '"' && !tempEscapeNext) {
            tempInString = !tempInString;
            continue;
          }
          
          if (tempInString) {
            continue;
          }
          
          if (char === '}') {
            tempBraceCount++;
          } else if (char === '{') {
            tempBraceCount--;
            if (tempBraceCount === 0 && isObject) {
              lastValidPos = i;
              break;
            }
          } else if (char === ']') {
            tempBracketCount++;
          } else if (char === '[') {
            tempBracketCount--;
            if (tempBracketCount === 0 && !isObject) {
              lastValidPos = i;
              break;
            }
          }
        }
        
        if (lastValidPos > 0) {
          jsonEnd = lastValidPos + 1;
          logDebug('Found last valid position before unterminated string', {
            model: modelName,
            lastValidPos,
            jsonEnd,
            originalLength: jsonContent.length
          });
        }
      }
      
      if (jsonEnd > 0) {
        const extractedJson = jsonContent.substring(0, jsonEnd);
        try {
          parsed = JSON.parse(extractedJson);
          log('Extracted JSON from beginning of response (additional text after JSON)', {
            originalLength: jsonContent.length,
            extractedLength: extractedJson.length,
            model: modelName,
            note: 'Response contained JSON followed by additional text (possibly reasoning tokens)'
          });
          // Successfully parsed - return it immediately
          return parsed;
        } catch (extractError) {
          logDebug('Extracted JSON still invalid', {
            model: modelName,
            extractedLength: extractedJson.length,
            extractedPreview: extractedJson.substring(0, 500),
            extractError: extractError.message
          });
          // Try alternative: find JSON by trying to parse progressively larger substrings
          for (let tryEnd = jsonEnd; tryEnd > 100 && !parsed; tryEnd -= 10) {
            try {
              const tryJson = jsonContent.substring(0, tryEnd);
              parsed = JSON.parse(tryJson);
              log('Extracted JSON using progressive parsing', {
                originalLength: jsonContent.length,
                extractedLength: tryJson.length,
                model: modelName,
                note: 'Found valid JSON by trying progressively smaller substrings'
              });
              break;
            } catch (e) {
              // Continue trying
            }
          }
        }
      } else if (inString && jsonError.message.includes('Unterminated string')) {
        // If JSON is truncated in the middle of a string, try to close the string and object manually
        // Find the last comma or colon before the unterminated string, then close everything
        let lastCommaOrColon = -1;
        let searchBraceCount = 0;
        let searchBracketCount = 0;
        let searchInString = false;
        let searchEscapeNext = false;
        
        for (let i = jsonContent.length - 1; i >= 0; i--) {
          const char = jsonContent[i];
          
          if (searchEscapeNext) {
            searchEscapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            searchEscapeNext = true;
            continue;
          }
          
          if (char === '"' && !searchEscapeNext) {
            searchInString = !searchInString;
            continue;
          }
          
          if (searchInString) {
            continue;
          }
          
          if (char === '}') {
            searchBraceCount++;
          } else if (char === '{') {
            searchBraceCount--;
          } else if (char === ']') {
            searchBracketCount++;
          } else if (char === '[') {
            searchBracketCount--;
          } else if ((char === ',' || char === ':') && searchBraceCount === 1 && searchBracketCount === 0 && isObject) {
            lastCommaOrColon = i;
            break;
          }
        }
        
        if (lastCommaOrColon > 0) {
          // Try to construct valid JSON by closing the string and object
          const beforeString = jsonContent.substring(0, lastCommaOrColon + 1);
          // Remove the incomplete key/value pair and close the object
          const lastKeyStart = beforeString.lastIndexOf('"');
          if (lastKeyStart > 0) {
            const reconstructed = jsonContent.substring(0, lastKeyStart) + '}';
            try {
              parsed = JSON.parse(reconstructed);
              log('Extracted JSON by closing unterminated string', {
                originalLength: jsonContent.length,
                extractedLength: reconstructed.length,
                model: modelName,
                note: 'JSON was truncated in middle of string - closed it manually'
              });
              return parsed;
            } catch (e) {
              // Failed to reconstruct
            }
          }
        }
      }
    }
    
    // If we still don't have parsed JSON and we used response_format, try retry without it
    if (!parsed && useResponseFormat && jsonResponse) {
      logWarn('DeepSeek returned invalid JSON with response_format - retrying without it', {
        model: modelName,
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
        note: 'DeepSeek API may sometimes return invalid JSON even with response_format'
      });
      
      try {
        // Retry the request without response_format
        const retryResponse = await callWithRetry(
          async () => makeRequest(false),
          {
            onRetry: (attempt, delay) => {
              log(`DeepSeek API retry attempt ${attempt}, waiting ${delay}ms...`);
            }
          }
        );
        
        const retryResult = await retryResponse.json();
        const retryContent = retryResult.choices?.[0]?.message?.content;
        
        if (retryContent) {
          // Extract JSON from markdown if present
          let retryJsonContent = retryContent.trim();
          if (retryJsonContent.startsWith('```')) {
            const lines = retryJsonContent.split('\n');
            lines.shift();
            if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
              lines.pop();
            }
            retryJsonContent = lines.join('\n').trim();
          }
          
          // Try to extract JSON from beginning if needed
          if ((retryJsonContent.startsWith('{') || retryJsonContent.startsWith('[')) && retryJsonContent.length > 100) {
            let jsonEnd = -1;
            let braceCount = 0;
            let bracketCount = 0;
            let inString = false;
            let escapeNext = false;
            const isObject = retryJsonContent.startsWith('{');
            
            for (let i = 0; i < retryJsonContent.length; i++) {
              const char = retryJsonContent[i];
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              if (char === '\\') {
                escapeNext = true;
                continue;
              }
              if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
              }
              if (inString) continue;
              if (char === '{') braceCount++;
              else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && isObject) {
                  jsonEnd = i + 1;
                  break;
                }
              } else if (char === '[') bracketCount++;
              else if (char === ']') {
                bracketCount--;
                if (bracketCount === 0 && !isObject) {
                  jsonEnd = i + 1;
                  break;
                }
              }
            }
            
            if (jsonEnd > 0) {
              retryJsonContent = retryJsonContent.substring(0, jsonEnd);
            }
          }
          
          // Try to parse retry content as JSON
          try {
            parsed = JSON.parse(retryJsonContent);
            log('DeepSeek retry without response_format succeeded', {
              model: modelName,
              originalLength: content.length,
              retryLength: retryJsonContent.length
            });
          } catch (retryJsonError) {
            // Still not JSON - fall through to original error
          }
        }
      } catch (retryError) {
        // Retry failed - fall through to original error
        logDebug('DeepSeek retry without response_format failed', {
          model: modelName,
          retryError: retryError.message
        });
      }
    }
    
    // If we still don't have parsed JSON, throw the original error
    if (!parsed) {
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(jsonError, {
        source: 'deepseek',
        errorType: 'jsonParseError',
        logError: true,
        createUserMessage: false, // Keep existing localized message
        context: {
          operation: 'parseJsonResponse',
          model: modelName,
          contentLength: content.length,
          contentPreview: content.substring(0, 500),
          usedResponseFormat: useResponseFormat,
          triedRetry: useResponseFormat && jsonResponse
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = tSync('errorAiResponseNotValidJson', uiLang);
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(userMessage);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
    }
  }

  const functionTime = Date.now() - functionStartTime;
  log('=== callDeepSeekAPI: FUNCTION EXIT (JSON response) ===', {
    timestamp: Date.now(),
    totalDuration: functionTime,
    totalDurationSeconds: Math.round(functionTime / 1000),
    parsedType: typeof parsed,
    parsedKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : null,
    model: modelName,
    jsonResponse: jsonResponse
  });
  
  return parsed;
}

/**
 * Call DeepSeek API with image support
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {string} apiKey - DeepSeek API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callDeepSeekAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true) {
  log('callDeepSeekAPIWithImage', { model, imageSize: imageData.length });
  
  const modelName = model || 'deepseek-chat';
  
  // Extract base64 data (remove data:image/png;base64, prefix)
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  const requestBody = {
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  let response;
  const requestStartTime = Date.now();
  
  try {
    logDebug('Sending request to DeepSeek API with image...', { 
      model: modelName, 
      promptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      imageSize: base64Image.length
    });
    
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            const retryableCodes = CONFIG.RETRYABLE_STATUS_CODES;
            if (retryableCodes.includes(fetchResponse.status)) {
              /** @type {Error & {status?: number, response?: Response}} */
              const error = new Error(`HTTP ${fetchResponse.status}`);
              error.status = fetchResponse.status;
              error.response = fetchResponse;
              clearTimeout(timeout);
              throw error;
            }
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            /** @type {Error & {status?: number}} */
            const error = new Error(errorData.error?.message || `API error: ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            clearTimeout(timeout);
            throw error;
          }
          
          clearTimeout(timeout);
          return fetchResponse;
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      logError('DeepSeek API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    if (jsonResponse) {
      // Extract JSON from markdown code blocks if present
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        const lines = jsonContent.split('\n');
        lines.shift();
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
          lines.pop();
        }
        jsonContent = lines.join('\n').trim();
        log('Extracted JSON from markdown code block', { 
          originalLength: content.length, 
          extractedLength: jsonContent.length,
          model: modelName 
        });
      }
      
      // Try to parse JSON, with fallback to extract from beginning if needed
      try {
        return JSON.parse(jsonContent);
      } catch (parseError) {
        // Try to extract JSON from beginning if response starts with JSON
        if (jsonContent.startsWith('{') || jsonContent.startsWith('[')) {
          let jsonEnd = -1;
          let braceCount = 0;
          let bracketCount = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < jsonContent.length; i++) {
            const char = jsonContent[i];
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }
            if (inString) continue;
            if (char === '{') braceCount++;
            else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && jsonContent.startsWith('{')) {
                jsonEnd = i + 1;
                break;
              }
            } else if (char === '[') bracketCount++;
            else if (char === ']') {
              bracketCount--;
              if (bracketCount === 0 && jsonContent.startsWith('[')) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          
          if (jsonEnd > 0) {
            try {
              const extractedJson = jsonContent.substring(0, jsonEnd);
              log('Extracted JSON from beginning of response (additional text after JSON)', {
                originalLength: jsonContent.length,
                extractedLength: extractedJson.length,
                model: modelName
              });
              return JSON.parse(extractedJson);
            } catch (extractError) {
              // Fall through to original error
            }
          }
        }
        
        logError('Failed to parse DeepSeek response as JSON', { content, parseError });
        throw new Error(`Invalid JSON response from DeepSeek: ${parseError.message}`);
      }
    }
    
    return content;
  } catch (error) {
    logError('DeepSeek API call with image failed', error);
    throw error;
  }
}

/**
 * Call DeepSeek API with image and conversation history
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {Array<Object>} messageHistory - Previous messages [{role: 'user'|'assistant', content: string}]
 * @param {string} apiKey - DeepSeek API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<{result: Object|string, assistantMessage: string, userMessage: Object}>}
 */
export async function callDeepSeekAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true) {
  log('callDeepSeekAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const modelName = model || 'deepseek-chat';
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  // Calculate image hash for verification (first 100 chars of base64)
  const imageHashStart = base64Image.substring(0, 100);
  const imageHashEnd = base64Image.substring(Math.max(0, base64Image.length - 100));
  
  // Build current user message with image
  const currentUserMessage = {
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${base64Image}` }
      }
    ]
  };
  
  // Build messages array with history
  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory, // Previous messages (with images from previous pages)
    currentUserMessage // Current page with image
  ];
  
  log('[ClipAIble DeepSeek] === BUILDING CHAT MESSAGES ===', {
    systemPromptLength: systemPrompt.length,
    historyLength: messageHistory.length,
    historyMessages: messageHistory.map((msg, idx) => {
      const hasImage = Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url' || c.image_url || c.inline_data);
      let imageHashInfo = null;
      if (hasImage && Array.isArray(msg.content)) {
        const imageContent = msg.content.find(c => c.type === 'image_url' || c.image_url || c.inline_data);
        if (imageContent) {
          const imgData = imageContent.image_url?.url || imageContent.inline_data?.data || '';
          const base64Img = imgData.includes(',') ? imgData.split(',')[1] : imgData;
          imageHashInfo = {
            hashStart: base64Img.substring(0, 50),
            hashEnd: base64Img.substring(Math.max(0, base64Img.length - 50))
          };
        }
      }
      return {
        index: idx,
        role: msg.role,
        hasImage,
        imageHashInfo,
        contentLength: typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length
      };
    }),
    currentMessage: {
      role: currentUserMessage.role,
      hasImage: true,
      imageSize: base64Image.length,
      imageHashStart: imageHashStart,
      imageHashEnd: imageHashEnd,
      textLength: userPrompt.length
    },
    totalMessages: messages.length
  });
  
  const requestBody = {
    model: modelName,
    messages: messages
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  let response;
  const requestStartTime = Date.now();
  
  try {
    logDebug('Sending request to DeepSeek API with image and history...', { 
      model: modelName, 
      messagesCount: messages.length,
      imageSize: base64Image.length
    });
    
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            const retryableCodes = CONFIG.RETRYABLE_STATUS_CODES;
            if (retryableCodes.includes(fetchResponse.status)) {
              /** @type {Error & {status?: number, response?: Response}} */
              const error = new Error(`HTTP ${fetchResponse.status}`);
              error.status = fetchResponse.status;
              error.response = fetchResponse;
              clearTimeout(timeout);
              throw error;
            }
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            /** @type {Error & {status?: number}} */
            const error = new Error(errorData.error?.message || `API error: ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            clearTimeout(timeout);
            throw error;
          }
          
          clearTimeout(timeout);
          return fetchResponse;
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      logError('DeepSeek API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    let result;
    if (jsonResponse) {
      // Extract JSON from markdown code blocks if present
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        const lines = jsonContent.split('\n');
        lines.shift();
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
          lines.pop();
        }
        jsonContent = lines.join('\n').trim();
        log('Extracted JSON from markdown code block', { 
          originalLength: content.length, 
          extractedLength: jsonContent.length,
          model: modelName 
        });
      }
      
      // Try to parse JSON, with fallback to extract from beginning if needed
      try {
        result = JSON.parse(jsonContent);
      } catch (parseError) {
        // Try to extract JSON from beginning if response starts with JSON
        if (jsonContent.startsWith('{') || jsonContent.startsWith('[')) {
          let jsonEnd = -1;
          let braceCount = 0;
          let bracketCount = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < jsonContent.length; i++) {
            const char = jsonContent[i];
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }
            if (inString) continue;
            if (char === '{') braceCount++;
            else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && jsonContent.startsWith('{')) {
                jsonEnd = i + 1;
                break;
              }
            } else if (char === '[') bracketCount++;
            else if (char === ']') {
              bracketCount--;
              if (bracketCount === 0 && jsonContent.startsWith('[')) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          
          if (jsonEnd > 0) {
            try {
              const extractedJson = jsonContent.substring(0, jsonEnd);
              log('Extracted JSON from beginning of response (additional text after JSON)', {
                originalLength: jsonContent.length,
                extractedLength: extractedJson.length,
                model: modelName
              });
              result = JSON.parse(extractedJson);
            } catch (extractError) {
              // Fall through to original error
              logError('Failed to parse DeepSeek response as JSON', { content, parseError });
              throw new Error(`Invalid JSON response from DeepSeek: ${parseError.message}`);
            }
          } else {
            logError('Failed to parse DeepSeek response as JSON', { content, parseError });
            throw new Error(`Invalid JSON response from DeepSeek: ${parseError.message}`);
          }
        } else {
          logError('Failed to parse DeepSeek response as JSON', { content, parseError });
          throw new Error(`Invalid JSON response from DeepSeek: ${parseError.message}`);
        }
      }
    } else {
      result = content;
    }
    
    const responseData = {
      result,
      assistantMessage: content, // Store for history
      userMessage: currentUserMessage // Store full user message with image for history
    };
    
    log('[ClipAIble DeepSeek] === CHAT RESPONSE RECEIVED ===', {
      input: {
        historyLength: messageHistory.length,
        currentImageSize: base64Image.length
      },
      output: {
        resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length,
        resultPreview: typeof result === 'string' ? result.substring(0, 200) + '...' : JSON.stringify(result).substring(0, 200) + '...',
        assistantMessageLength: content.length,
        userMessageHasImage: true
      },
      newHistoryLength: messageHistory.length + 2, // userMessage + assistantMessage will be added
      duration: Date.now() - requestStartTime
    });
    
    return responseData;
  } catch (error) {
    logError('DeepSeek API call with image and history failed', error);
    throw error;
  }
}


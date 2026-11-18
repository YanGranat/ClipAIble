// @ts-check
// API router for ClipAIble extension

/**
 * @typedef {import('../types.js').AIProvider} AIProvider
 * @typedef {import('../types.js').AIResponse} AIResponse
 */

import { log, logWarn } from '../utils/logging.js';
import { getModelProvider } from '../utils/model-catalog.js';
import { getDecryptedKeyCached } from '../utils/encryption.js';
import { callOpenAI, parseModelConfig, callOpenAIWithImage, callOpenAIWithImageAndHistory } from './openai.js';
import { callClaudeAPI, callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory } from './claude.js';
import { callGeminiAPI, translateImageWithGemini, callGeminiAPIWithImage, callGeminiAPIWithImageAndHistory } from './gemini.js';
import { callGrokAPI, callGrokAPIWithImage, callGrokAPIWithImageAndHistory } from './grok.js';
import { callOpenRouterAPI, callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory } from './openrouter.js';
import { callDeepSeekAPI, callDeepSeekAPIWithImage, callDeepSeekAPIWithImageAndHistory } from './deepseek.js';

// Re-export for convenience
export { callOpenAI, parseModelConfig, callOpenAIWithImage, callOpenAIWithImageAndHistory } from './openai.js';
export { callClaudeAPI, callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory } from './claude.js';
export { callGeminiAPI, translateImageWithGemini, callGeminiAPIWithImage, callGeminiAPIWithImageAndHistory } from './gemini.js';
export { callGrokAPI, callGrokAPIWithImage, callGrokAPIWithImageAndHistory } from './grok.js';
export { callOpenRouterAPI, callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory } from './openrouter.js';
export { callDeepSeekAPI, callDeepSeekAPIWithImage, callDeepSeekAPIWithImageAndHistory } from './deepseek.js';

/**
 * Provider name mapping
 * @type {Record<import('../types.js').AIProvider, string>}
 */
const PROVIDER_NAMES = {
  'openai': 'OpenAI',
  'claude': 'Claude',
  'gemini': 'Gemini',
  'grok': 'Grok',
  'openrouter': 'OpenRouter',
  'deepseek': 'DeepSeek'
};

/**
 * Get provider display name
 * @param {import('../types.js').AIProvider} provider - Provider code
 * @returns {string} Provider display name
 */
function getProviderName(provider) {
  return PROVIDER_NAMES[provider] || 'AI';
}

/**
 * Get AI provider from model name
 * @param {string} model - Model name
 * @returns {import('../types.js').AIProvider} Provider name
 */
export function getProviderFromModel(model) {
  return getModelProvider(model);
}

/** Select the explicitly configured provider before interpreting model names. */
export function resolveAIProvider(model, provider) {
  if (provider === undefined) return getProviderFromModel(model);
  if (typeof provider !== 'string' || !Object.hasOwn(PROVIDER_NAMES, provider)) {
    throw new Error('Unsupported AI provider');
  }
  return provider;
}

/**
 * Validate API key is provided
 * @param {string} apiKey - API key to validate
 * @param {import('../types.js').AIProvider} provider - Provider code
 * @param {string} model - Model name (for error messages)
 * @param {boolean} [checkModelProviderMatch=false] - Whether to check if model provider matches selected provider
 * @throws {Error} If API key is missing
 */
function validateApiKey(apiKey, provider, model, checkModelProviderMatch = false) {
  if (!apiKey || apiKey.trim() === '') {
    const providerName = getProviderName(provider);
    
    // Special check for callAI: verify model provider matches selected provider
    if (checkModelProviderMatch) {
      const modelProvider = getProviderFromModel(model);
      const modelProviderName = getProviderName(modelProvider);
      if (modelProvider !== provider) {
        throw new Error(`Model ${model} requires ${modelProviderName} API key, but ${providerName} provider is selected. Please select the correct provider or change the model in settings.`);
      }
    }
    
    throw new Error(`${providerName} API key is required for model ${model}. Please add it in settings.`);
  }
}

/**
 * Decrypt a provider key before admitting a request.
 * @param {string} apiKey - API key (encrypted or plain)
 * @param {import('../types.js').AIProvider} provider - Provider code
 * @returns {Promise<string>} Decrypted key
 */
async function getDecryptedKeySafe(apiKey, provider) {
  return getDecryptedKeyCached(apiKey, provider);
}

/**
 * Validate decrypted API key is not empty
 * @param {string} decryptedKey - Decrypted API key
 * @param {import('../types.js').AIProvider} provider - Provider code
 * @param {boolean} [includeSettingsHint=true] - Whether to include "Please check your settings" hint
 * @throws {Error} If decrypted key is empty or invalid
 */
function validateDecryptedKey(decryptedKey, provider, includeSettingsHint = true) {
  if (!decryptedKey || decryptedKey.trim() === '') {
    const providerName = getProviderName(provider);
    const hint = includeSettingsHint ? ' Please check your settings.' : '';
    throw new Error(`${providerName} API key is empty or invalid.${hint}`);
  }
}

/**
 * Universal AI caller - routes to appropriate provider
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - API key for the provider (encrypted or plain)
 * @param {string} model - Model name (determines provider)
 * @param {boolean} [jsonResponse=true] - Whether to expect JSON response
 * @returns {Promise<import('../types.js').AIResponse|string>} Parsed JSON response if jsonResponse is true, text response if jsonResponse is false
 * @throws {Error} If API key is missing
 * @throws {Error} If API key decryption fails
 * @throws {Error} If AI provider API request fails
 * @throws {Error} If network error occurs
 * @throws {Error} If model provider doesn't match selected provider
 * @see {@link callAIWithImage} For AI calls with image support
 * @see {@link callAIWithImageAndHistory} For AI calls with image and conversation history
 * @see {@link callOpenAI} For direct OpenAI API calls
 * @example
 * // Call AI with JSON response (default)
 * const response = await callAI(
 *   'You are a helpful assistant.',
 *   'Extract the main content from this article.',
 *   'sk-...',
 *   'gpt-4o',
 *   true
 * );
 * console.log('AI response:', response.content);
 * @example
 * // Call AI with text response
 * const text = await callAI(
 *   'You are a translator.',
 *   'Translate this text to Russian.',
 *   'sk-...',
 *   'gpt-4o',
 *   false
 * );
 * console.log('Translation:', text);
 */
export async function callAI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true, options = {}) {
  const aiCallStartTime = Date.now();
  const provider = resolveAIProvider(model, options.provider);
  await options.checkCancelled?.();
  const promptSize = systemPrompt.length + userPrompt.length;
  const estimatedTokens = Math.ceil(promptSize / 4); // Rough estimate: ~4 chars per token
  
  log('🤖 Calling AI', { 
    provider, 
    model,
    promptSize: `${(promptSize / 1024).toFixed(1)} KB`,
    estimatedTokens: estimatedTokens,
    systemPromptSize: `${(systemPrompt.length / 1024).toFixed(1)} KB`,
    userPromptSize: `${(userPrompt.length / 1024).toFixed(1)} KB`
  });
  
  // Validate API key is provided (with model provider match check)
  validateApiKey(apiKey, provider, model, true);
  
  // Decrypt API key before use (with caching for performance)
  const decryptedKey = await getDecryptedKeySafe(apiKey, provider);
  await options.checkCancelled?.();
  
  // Validate decrypted key is not empty
  validateDecryptedKey(decryptedKey, provider, true);
  
  let result;
  switch (provider) {
    case 'claude':
      result = await callClaudeAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse, options);
      break;
    case 'gemini':
      result = await callGeminiAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse, options);
      break;
    case 'grok':
      result = await callGrokAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse, options);
      break;
    case 'openrouter':
      result = await callOpenRouterAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse, options);
      break;
    case 'deepseek':
      result = await callDeepSeekAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse, options);
      break;
    case 'openai':
    default:
      result = await callOpenAI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse, options);
      break;
  }
  
  const aiCallDuration = Date.now() - aiCallStartTime;
  
  log('✅ AI call complete', {
    provider,
    model,
    duration: `${aiCallDuration}ms (${(aiCallDuration / 1000).toFixed(1)}s)`,
    responseCharacters: typeof result === 'string' ? result.length : undefined,
    contentItems: Array.isArray(result?.content) ? result.content.length : undefined,
    tokensPerSecond: estimatedTokens > 0 ? `${(estimatedTokens / (aiCallDuration / 1000)).toFixed(1)} tokens/sec (estimated)` : 'N/A'
  });
  
  return result;
}

/**
 * Universal AI caller with image support - routes to appropriate provider
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL (data:image/png;base64,...)
 * @param {string} apiKey - API key for the provider (encrypted or plain)
 * @param {string} model - Model name (determines provider)
 * @param {boolean} [jsonResponse=true] - Whether to expect JSON response
 * @returns {Promise<import('../types.js').AIResponse|string>} Parsed JSON response if jsonResponse is true, text response if jsonResponse is false
 * @throws {Error} If API key is missing
 * @throws {Error} If API key decryption fails
 * @throws {Error} If AI provider API request fails
 * @throws {Error} If network error occurs
 * @throws {Error} If image data is invalid
 * @see {@link callAI} For text-only AI calls
 * @see {@link callAIWithImageAndHistory} For AI calls with image and conversation history
 * @example
 * // Analyze image with AI
 * const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANS...';
 * const response = await callAIWithImage(
 *   'You are an image analyzer.',
 *   'Describe what you see in this image.',
 *   imageDataUrl,
 *   'sk-...',
 *   'gpt-4o',
 *   false
 * );
 * console.log('Image description:', response);
 */
export async function callAIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true, options = {}) {
  const provider = resolveAIProvider(model, options.provider);
  await options.checkCancelled?.();
  
  log('callAIWithImage', { provider, model, imageSize: imageData.length });
  
  // Validate API key is provided
  validateApiKey(apiKey, provider, model, false);
  
  // Decrypt API key before use (with caching for performance)
  const decryptedKey = await getDecryptedKeySafe(apiKey, provider);
  await options.checkCancelled?.();
  
  // Validate decrypted key is not empty
  validateDecryptedKey(decryptedKey, provider, true);
  
  switch (provider) {
    case 'claude':
      return callClaudeAPIWithImage(systemPrompt, userPrompt, imageData, decryptedKey, model, jsonResponse, options);
    case 'gemini':
      return callGeminiAPIWithImage(systemPrompt, userPrompt, imageData, decryptedKey, model, jsonResponse, options);
    case 'openrouter':
      return callOpenRouterAPIWithImage(systemPrompt, userPrompt, imageData, decryptedKey, model, jsonResponse, options);
    case 'deepseek':
      return callDeepSeekAPIWithImage(systemPrompt, userPrompt, imageData, decryptedKey, model, jsonResponse, options);
    case 'grok':
      return callGrokAPIWithImage(systemPrompt, userPrompt, imageData, decryptedKey, model, jsonResponse, options);
    case 'openai':
    default:
      return callOpenAIWithImage(systemPrompt, userPrompt, imageData, decryptedKey, model, jsonResponse, options);
  }
}

/**
 * Universal AI caller with image support and conversation history
 * Maintains context across multiple pages for consistent heading hierarchy
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {Array<{role: 'user'|'assistant', content: string|Object}>} messageHistory - Previous messages
 * @param {string} apiKey - API key for the provider
 * @param {string} model - Model name
 * @param {boolean} [jsonResponse=true] - Whether to expect JSON response
 * @returns {Promise<{result: import('../types.js').AIResponse|string, assistantMessage: string|Array<Object>, userMessage: {role: string, content: string|Array<Object>}}>} Result and messages for history
 * @throws {Error} If API key is missing
 * @throws {Error} If API key decryption fails
 * @throws {Error} If AI provider API request fails
 * @throws {Error} If network error occurs
 * @throws {Error} If image data is invalid
 * @throws {Error} If message history format is invalid
 * @see {@link callAI} For text-only AI calls
 * @see {@link callAIWithImage} For AI calls with image (without history)
 * @example
 * // Analyze multiple images with conversation history
 * const history = [
 *   { role: 'user', content: 'First image analysis' },
 *   { role: 'assistant', content: 'I see a cat in the first image.' }
 * ];
 * const result = await callAIWithImageAndHistory(
 *   'You are an image analyzer.',
 *   'Compare this image with the previous one.',
 *   'data:image/png;base64,...',
 *   history,
 *   'sk-...',
 *   'gpt-4o',
 *   false
 * );
 * console.log('Comparison:', result.result);
 */
export async function callAIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true, options = {}) {
  const provider = resolveAIProvider(model, options.provider);
  await options.checkCancelled?.();
  
  log('callAIWithImageAndHistory', { provider, model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  // Validate API key is provided
  validateApiKey(apiKey, provider, model, false);
  
  // Decrypt API key
  const decryptedKey = await getDecryptedKeySafe(apiKey, provider);
  await options.checkCancelled?.();
  
  // Validate decrypted key is not empty (without settings hint for consistency with original)
  validateDecryptedKey(decryptedKey, provider, false);
  
  switch (provider) {
    case 'claude':
      return callClaudeAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, decryptedKey, model, jsonResponse, options);
    case 'gemini':
      return callGeminiAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, decryptedKey, model, jsonResponse, options);
    case 'openrouter':
      return callOpenRouterAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, decryptedKey, model, jsonResponse, options);
    case 'deepseek':
      return callDeepSeekAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, decryptedKey, model, jsonResponse, options);
    case 'grok':
      return callGrokAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, decryptedKey, model, jsonResponse, options);
    case 'openai':
    default:
      return callOpenAIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, decryptedKey, model, jsonResponse, options);
  }
}


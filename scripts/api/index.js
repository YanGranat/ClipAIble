// API router for ClipAIble extension

import { log } from '../utils/logging.js';
import { getDecryptedKeyCached } from '../utils/encryption.js';
import { callOpenAI, parseModelConfig } from './openai.js';
import { callClaudeAPI } from './claude.js';
import { callGeminiAPI } from './gemini.js';
import { callGrokAPI } from './grok.js';
import { callOpenRouterAPI } from './openrouter.js';

// Re-export for convenience
export { callOpenAI, parseModelConfig } from './openai.js';
export { callClaudeAPI } from './claude.js';
export { callGeminiAPI, translateImageWithGemini } from './gemini.js';
export { callGrokAPI } from './grok.js';
export { callOpenRouterAPI } from './openrouter.js';

/**
 * Get AI provider from model name
 * @param {string} model - Model name
 * @returns {string} Provider name: 'openai', 'claude', 'gemini', 'grok', or 'openrouter'
 */
export function getProviderFromModel(model) {
  if (!model) return 'openai';
  // OpenRouter models are in format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-opus-4.5)
  if (model.includes('/')) return 'openrouter';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'claude';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('grok-')) return 'grok';
  return 'openai';
}

/**
 * Universal AI caller - routes to appropriate provider
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - API key for the provider (encrypted or plain)
 * @param {string} model - Model name (determines provider)
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callAI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  const provider = getProviderFromModel(model);
  
  log('callAI', { provider, model });
  
  // Check if API key is provided
  if (!apiKey || apiKey.trim() === '') {
    const providerNames = {
      'openai': 'OpenAI',
      'claude': 'Claude',
      'gemini': 'Gemini',
      'grok': 'Grok',
      'openrouter': 'OpenRouter'
    };
    const providerName = providerNames[provider] || 'AI';
    const modelProvider = getProviderFromModel(model);
    const modelProviderName = providerNames[modelProvider] || 'AI';
    if (modelProvider !== provider) {
      throw new Error(`Model ${model} requires ${modelProviderName} API key, but ${providerName} provider is selected. Please select the correct provider or change the model in settings.`);
    }
    throw new Error(`${providerName} API key is required for model ${model}. Please add it in settings.`);
  }
  
  // Decrypt API key before use (with caching for performance)
  let decryptedKey = apiKey;
  try {
    decryptedKey = await getDecryptedKeyCached(apiKey, provider);
  } catch (error) {
    log('Failed to decrypt/cache API key, using as-is (may be plain text)', error);
    // Continue with original key (for backward compatibility)
  }
  
  // Validate decrypted key is not empty
  if (!decryptedKey || decryptedKey.trim() === '') {
    const providerNames = {
      'openai': 'OpenAI',
      'claude': 'Claude',
      'gemini': 'Gemini',
      'grok': 'Grok',
      'openrouter': 'OpenRouter'
    };
    const providerName = providerNames[provider] || 'AI';
    throw new Error(`${providerName} API key is empty or invalid. Please check your settings.`);
  }
  
  switch (provider) {
    case 'claude':
      return callClaudeAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
    case 'gemini':
      return callGeminiAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
    case 'grok':
      return callGrokAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
    case 'openrouter':
      return callOpenRouterAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
    case 'openai':
    default:
      return callOpenAI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
  }
}



// API router for ClipAIble extension

import { log } from '../utils/logging.js';
import { decryptApiKey } from '../utils/encryption.js';
import { callOpenAI, parseModelConfig } from './openai.js';
import { callClaudeAPI } from './claude.js';
import { callGeminiAPI } from './gemini.js';

// Re-export for convenience
export { callOpenAI, parseModelConfig } from './openai.js';
export { callClaudeAPI } from './claude.js';
export { callGeminiAPI, translateImageWithGemini } from './gemini.js';

/**
 * Get AI provider from model name
 * @param {string} model - Model name
 * @returns {string} Provider name: 'openai', 'claude', or 'gemini'
 */
export function getProviderFromModel(model) {
  if (!model) return 'openai';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'claude';
  if (model.startsWith('gemini-')) return 'gemini';
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
  
  // Decrypt API key before use
  let decryptedKey = apiKey;
  try {
    decryptedKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('Failed to decrypt API key, using as-is (may be plain text)', error);
    // Continue with original key (for backward compatibility)
  }
  
  switch (provider) {
    case 'claude':
      return callClaudeAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
    case 'gemini':
      return callGeminiAPI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
    case 'openai':
    default:
      return callOpenAI(systemPrompt, userPrompt, decryptedKey, model, jsonResponse);
  }
}



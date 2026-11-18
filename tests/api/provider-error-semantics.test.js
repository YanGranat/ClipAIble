import { afterEach, describe, expect, it, vi } from 'vitest';
import { callOpenAI } from '../../scripts/api/openai.js';
import { callClaudeAPI } from '../../scripts/api/claude.js';
import { callGeminiAPI } from '../../scripts/api/gemini.js';
import { callGrokAPI } from '../../scripts/api/grok.js';
import { callDeepSeekAPI } from '../../scripts/api/deepseek.js';
import { callOpenRouterAPI } from '../../scripts/api/openrouter.js';
import { createApiError } from '../../scripts/api/http-errors.js';
import { getUserFriendlyErrorDescriptor } from '../../scripts/utils/error-messages.js';
import { handleError } from '../../scripts/utils/error-handler.js';
import { getDeepSeekRequestConfig } from '../../scripts/api/deepseek.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: async value => value }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const providers = [
  ['openai', callOpenAI, 'gpt-6.1-sol-low'], ['claude', callClaudeAPI, 'claude-sonnet-4-6'],
  ['gemini', callGeminiAPI, 'gemini-3.1-flash-lite-preview'], ['grok', callGrokAPI, 'grok-4.20-reasoning'],
  ['deepseek', callDeepSeekAPI, 'deepseek-flash'], ['openrouter', callOpenRouterAPI, 'vendor/sample']
];

describe('provider error identity', () => {
  it.each(providers)('%s retains non-English HTTP authentication failures', async (provider, request, model) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Accès refusé' } }), { status: 401 })));
    await expect(request('', 'Sample', 'synthetic-key', model, false)).rejects.toMatchObject({ status: 401, code: 'auth_error', translationKey: 'errorApiKeyInvalid' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(providers)('%s does not repeat billing quota failures', async (provider, request, model) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 429 })));
    await expect(request('', 'Sample', 'synthetic-key', model, false)).rejects.toMatchObject({ status: 429, retryable: false, translationKey: 'errorApiQuotaExceeded' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(providers)('%s keeps allowlisted request diagnostics without echoing the response body', async (provider, request, model) => {
    const privateDetail = 'opaque-remote-diagnostic';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'unsupported_parameter', param: 'temperature', message: privateDetail } }), { status: 400 })));
    let failure;
    try { await request('', 'Sample', 'synthetic-key', model, false); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ status: 400, providerCode: 'unsupported_parameter', parameter: 'temperature', translationParams: { status: 400, reason: 'unsupported_parameter: temperature' } });
    expect(failure.message).not.toContain(privateDetail);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([['grok', callGrokAPI, 'grok-4.20-reasoning'], ['openrouter', callOpenRouterAPI, 'vendor/sample']])('%s keeps refusal distinct from parsing failure', async (provider, request, model) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter', message: { refusal: 'Declined' } }] }))));
    await expect(request('', 'Sample', 'synthetic-key', model, true)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED', retryable: false, translationKey: 'errorAiResponseRefused' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not infer a response-format fallback from an unrelated 400', async () => {
    expect(await createApiError(new Response(JSON.stringify({ error: { message: 'Bad request' } }), { status: 400 }), 'openrouter')).toMatchObject({ retryWithoutResponseFormat: false });
    expect(await createApiError(new Response(JSON.stringify({ error: { code: 'unsupported_parameter', param: 'response_format' } }), { status: 400 }), 'openrouter')).toMatchObject({ retryWithoutResponseFormat: true });
  });
  it.each([[401, 'errorApiKeyInvalid'], [403, 'errorApiAccessForbidden'], [429, 'errorRateLimit']])('retains HTTP%s when the caller supplies an extraction context', (status, key) => {
    expect(getUserFriendlyErrorDescriptor('contentExtractionFailed', { error: Object.assign(new Error('Unavailable'), { status }) })).toEqual({ key, params: {} });
  });
  it.each([[401, 'auth_error', 'errorApiKeyInvalid'], [429, 'rate_limit', 'errorRateLimit']])('retains HTTP%s through the complete error boundary', async (status, code, key) => {
    const error = Object.assign(new Error('Servicio no disponible'), { status });
    expect(await handleError(error, { errorType: 'contentExtractionFailed', logError: false, createUserMessage: true })).toMatchObject({ code, userCode: code, translationKey: key });
  });
  it('sets a complete-output budget only for managed DeepSeek models', () => {
    expect(getDeepSeekRequestConfig('deepseek-flash-no-thinking').max_tokens).toBe(65536);
    expect(getDeepSeekRequestConfig('deepseek-flash').max_tokens).toBe(65536);
    expect(getDeepSeekRequestConfig('deepseek-v4-pro').max_tokens).toBe(65536);
    expect(getDeepSeekRequestConfig('deepseek-custom-model')).not.toHaveProperty('max_tokens');
  });
});

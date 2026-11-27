import { beforeEach, expect, it, vi } from 'vitest';
import { MODEL_CATALOG, parseModelSelection, normalizeModelSelection, getModelMetadata, formatModelLabel, resolveStoredModelSelection } from '../../scripts/utils/model-catalog.js';
import { parseModelConfig, getOpenAIRequestConfig, callOpenAI, callOpenAIWithImage, callOpenAIWithImageAndHistory } from '../../scripts/api/openai.js';
import { getOpenRouterRequestConfig, callOpenRouterAPI, callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory } from '../../scripts/api/openrouter.js';
import { getClaudeRequestConfig, callClaudeAPI } from '../../scripts/api/claude.js';
import { getGeminiModelName, getGeminiGenerationConfig, callGeminiAPI } from '../../scripts/api/gemini.js';
import { getGrokRequestConfig, callGrokAPI } from '../../scripts/api/grok.js';
import { getDeepSeekRequestConfig, assertDeepSeekVisionModel, callDeepSeekAPI } from '../../scripts/api/deepseek.js';
import { detectImageText } from '../../scripts/translation/images.js';
import { detectContentLanguage } from '../../scripts/translation/detection.js';
import { translateText } from '../../scripts/translation/text.js';
import { callWithRetry } from '../../scripts/utils/retry.js';

beforeEach(() => vi.restoreAllMocks());

it.each(['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-astra'])
  ('exposes an xhigh preset for %s and sends the base API model with the selected effort', model => {
    const preset = MODEL_CATALOG.openai.find(entry => entry.apiModel === model && entry.reasoningEffort === 'xhigh');
    expect(preset?.id).toBe(model + '-xhigh');
    expect(formatModelLabel('openai', preset.id)).toBe(model + ' (reasoning: xhigh)');
    expect(normalizeModelSelection('openai', model + ' (reasoning: XHIGH)')).toBe(preset.id);
    expect(getOpenAIRequestConfig(preset.id, { temperature: 0 })).toEqual({ model, reasoning_effort: 'xhigh' });
  });

it('sends the built-in xhigh option on an OpenAI text request', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'Example output' }, finish_reason: 'stop' }]
  })));
  await expect(callOpenAI('', 'Example article', 'synthetic-key', 'gpt-6.2-sol-xhigh', false)).resolves.toBe('Example output');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: 'gpt-6.2-sol', reasoning_effort: 'xhigh' });
});

it('parses an explicit effort without predicting a model family or changing model case', () => {
  expect(parseModelSelection('Vendor/ExampleModel(reasoning: XHIGH )')).toEqual({ apiModel: 'Vendor/ExampleModel', reasoningEffort: 'xhigh' });
  expect(normalizeModelSelection('openrouter', 'Vendor/ExampleModel ( reasoning : XHIGH )')).toBe('Vendor/ExampleModel (reasoning: xhigh)');
  for (const model of ['sample-model-high', 'Vendor/ExampleModel:free', 'sample-model (variant)']) {
    expect(parseModelSelection(model)).toEqual({ apiModel: model, reasoningEffort: null });
    expect(parseModelConfig(model)).toEqual({ modelName: model, reasoningEffort: null });
  }
});

it.each(['sample-model (reasoning: fast)', 'sample-model (reasoning:)', 'sample-model (reasoning: high',
  'sample-model (reasoning: high) extra', '(reasoning: high)', 'sample-model (reasoning: high) (reasoning: low)'])('rejects malformed reserved annotations before HTTP: %s', async value => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('Unexpected network request.'), { retryable: false }));
  expect(() => parseModelSelection(value)).toThrow();
  expect(() => normalizeModelSelection('openai', value)).toThrow();
  expect(getModelMetadata('openai', value)).toBeNull();
  expect(formatModelLabel('openai', value)).toBe(value);
  await expect(callOpenAI('', 'Sample request', 'synthetic-key', value, false)).rejects.toMatchObject({ code: 'AI_MODEL_INVALID_REASONING', retryable: false });
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps an invalid reasoning selection terminal across the retry owner', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request.'));
  const attempt = vi.fn(() => callOpenAI('', 'Sample request', 'synthetic-key', 'sample-model (reasoning: fast)', false));
  await expect(callWithRetry(attempt, { maxRetries: 2, delays: [0], shouldRetry: () => true })).rejects.toMatchObject({
    code: 'AI_MODEL_INVALID_REASONING', translationKey: 'errorModelReasoningInvalid', retryable: false
  });
  expect(attempt).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

it('roundtrips every managed display label and keeps reasoning in English', () => {
  const translate = (key, params) => {
    expect(key).toBe('modelTextOnly');
    return `${params.model} (text only)`;
  };
  for (const [provider, entries] of Object.entries(MODEL_CATALOG)) for (const entry of entries) {
    const label = formatModelLabel(provider, entry.id, translate);
    expect(normalizeModelSelection(provider, label, translate)).toBe(entry.id);
    if (entry.reasoningEffort || entry.reasoningEnabled === false) expect(label).toContain(`(reasoning: ${entry.reasoningEnabled === false ? 'none' : entry.reasoningEffort})`);
  }
});

it('offers Gemini 4 Neon on both providers with the supported reasoning levels', () => {
  const direct = 'gemini-4-neon';
  const routed = 'google/gemini-4-neon';
  for (const [provider, model] of [['gemini', direct], ['openrouter', routed]]) {
    expect(MODEL_CATALOG[provider].find(entry => entry.id === model)?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(() => getModelMetadata(provider, `${model} (reasoning: max)`, { strict: true })).toThrow();
  }
  expect(getGeminiModelName(`${direct} (reasoning: xhigh)`)).toBe(direct);
  expect(getGeminiGenerationConfig(`${direct} (reasoning: xhigh)`)).toMatchObject({
    thinkingConfig: { thinkingLevel: 'xhigh' }
  });
  expect(getOpenRouterRequestConfig(`${routed} (reasoning: xhigh)`)).toMatchObject({
    model: routed, reasoning: { effort: 'xhigh' }
  });
});

it('distinguishes a server default from an explicitly fixed effort', () => {
  expect(normalizeModelSelection('openai', 'gpt-6.2-astra (reasoning: medium)')).toBe('gpt-6.2-astra (reasoning: medium)');
  expect(normalizeModelSelection('openai', 'gpt-6.2-sol (reasoning: MEDIUM)')).toBe('gpt-6.2-sol');
  expect(normalizeModelSelection('openai', 'gpt-6.2-sol (reasoning: high)')).toBe('gpt-6.2-sol-high');
});

it('roundtrips an annotated text-only model through its localized capability label', () => {
  const selected = 'deepseek-v4-pro (reasoning: high)';
  const translate = (_key, params) => `${params.model} (Nur Text)`;
  const label = formatModelLabel('deepseek', selected, translate);
  expect(label).toBe('DeepSeek V4 Pro (Nur Text) (reasoning: high)');
  expect(normalizeModelSelection('deepseek', label, translate)).toBe(selected);
});

it('keeps annotated custom selections and historical custom choices across storage resolution', () => {
  const model = normalizeModelSelection('openai', 'sample-model (reasoning: xhigh)');
  const settings = { api_provider: 'openai', custom_models: { openai: [model] }, model_by_provider: { openai: model } };
  expect(resolveStoredModelSelection(JSON.parse(JSON.stringify(settings)))).toEqual({ provider: 'openai', model });
  expect(parseModelConfig(model)).toEqual({ modelName: 'sample-model', reasoningEffort: 'xhigh' });
  expect(resolveStoredModelSelection({ api_provider: 'openai', openai_model: 'gpt-5.2', custom_models: { openai: ['gpt-5.2'] } }).model).toBe('gpt-5.2');
  expect(resolveStoredModelSelection({ api_provider: 'openai', openai_model: 'gpt-5.2 (reasoning: high)' }).model).toBe('gpt-5.2 (reasoning: high)');
});

it('preserves known capabilities and reconciles explicit overrides of a disabled preset', () => {
  expect(getDeepSeekRequestConfig('deepseek-flash-no-thinking (reasoning: high)')).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'enabled' }, reasoning_effort: 'high' });
  expect(getDeepSeekRequestConfig('deepseek-flash (reasoning: none)')).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'disabled' } });
  expect(getDeepSeekRequestConfig('deepseek-flash (reasoning: none)')).not.toHaveProperty('reasoning_effort');
  expect(getOpenRouterRequestConfig('deepseek/deepseek-v4.1-flash-no-thinking (reasoning: high)')).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash', reasoning: { effort: 'high' } });
  expect(() => assertDeepSeekVisionModel('deepseek-v4-pro (reasoning: high)')).toThrow();
  expect(() => getDeepSeekRequestConfig('deepseek-flash (reasoning: xhigh)')).toThrow();
  expect(() => getOpenAIRequestConfig('gpt-6.2-sol (reasoning: none)')).toThrow();
  expect(() => getGrokRequestConfig('grok-4.7 (reasoning: none)')).toThrow();
  const metadata = getModelMetadata('openai', 'sample-model (reasoning: high)');
  expect(metadata).not.toHaveProperty('inputModalities');
  expect(metadata).not.toHaveProperty('reasoningEfforts');
});

it('serializes provider-specific controls for arbitrary annotated IDs', () => {
  expect(getOpenAIRequestConfig('sample-model (reasoning: xhigh)')).toEqual({ model: 'sample-model', reasoning_effort: 'xhigh' });
  expect(getOpenRouterRequestConfig('Vendor/ExampleModel (reasoning: xhigh)')).toEqual({ model: 'Vendor/ExampleModel', reasoning: { effort: 'xhigh' }, provider: { require_parameters: true } });
  expect(getClaudeRequestConfig('sample-model (reasoning: high)')).toMatchObject({ model: 'sample-model', output_config: { effort: 'high' }, thinking: { type: 'adaptive' } });
  expect(getClaudeRequestConfig('claude-haiku-5-5 (reasoning: none)')).toMatchObject({ thinking: { type: 'disabled' } });
  expect(getClaudeRequestConfig('claude-haiku-5-5 (reasoning: xhigh)', { maxTokens: 10, shortResponse: true })).toMatchObject({ max_tokens: 50000, thinking: { type: 'adaptive' }, output_config: { effort: 'xhigh' } });
  expect(getGeminiModelName('sample-model (reasoning: low)')).toBe('sample-model');
  expect(getGeminiGenerationConfig('sample-model (reasoning: low)')).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
  expect(getGrokRequestConfig('sample-model (reasoning: xhigh)', { temperature: 0.3 })).toEqual({ model: 'sample-model', reasoning_effort: 'xhigh' });
  expect(getDeepSeekRequestConfig('sample-model (reasoning: max)')).toEqual({ model: 'sample-model', thinking: { type: 'enabled' }, reasoning_effort: 'max' });
});

it('keeps explicit unknown-model effort in short responses without inventing disable support', () => {
  const model = 'sample-model (reasoning: xhigh)';
  const options = { shortResponse: true, maxTokens: 10, temperature: 0 };
  expect(getOpenAIRequestConfig(model, options)).toEqual({ model: 'sample-model', reasoning_effort: 'xhigh' });
  expect(getOpenRouterRequestConfig(model, options)).toEqual({ model: 'sample-model', reasoning: { effort: 'xhigh' }, provider: { require_parameters: true } });
  expect(getGrokRequestConfig(model, options)).toEqual({ model: 'sample-model', reasoning_effort: 'xhigh' });
});

it.each([
  ['openai', callOpenAI, 'sample-model (reasoning: xhigh)', { choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }, { model: 'sample-model', reasoning_effort: 'xhigh' }],
  ['openrouter', callOpenRouterAPI, 'Vendor/ExampleModel (reasoning: high)', { choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }, { model: 'Vendor/ExampleModel', reasoning: { effort: 'high' } }],
  ['claude', callClaudeAPI, 'sample-model (reasoning: high)', { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }, { model: 'sample-model', output_config: { effort: 'high' } }],
  ['gemini', callGeminiAPI, 'sample-model (reasoning: low)', { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] }, { generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } }],
  ['grok', callGrokAPI, 'sample-model (reasoning: high)', { choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }, { model: 'sample-model', reasoning_effort: 'high' }],
  ['deepseek', callDeepSeekAPI, 'sample-model (reasoning: high)', { choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }, { model: 'sample-model', thinking: { type: 'enabled' }, reasoning_effort: 'high' }]
])('sends the actual %s HTTP wire without an annotation in the API model', async (provider, call, model, response, expected) => {
  const payload = provider === 'deepseek' ? 'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' : JSON.stringify(response);
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(payload, { status: 200, headers: { 'Content-Type': provider === 'deepseek' ? 'text/event-stream' : 'application/json' } }));
  expect(await call('', 'Sample request', 'synthetic-key', model, false)).toBe('done');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject(expected);
  if (provider === 'gemini') expect(fetch.mock.calls[0][0]).toContain('/sample-model:generateContent');
});

it.each([
  ['openai image', callOpenAIWithImage, false], ['openai history', callOpenAIWithImageAndHistory, true],
  ['router image', callOpenRouterAPIWithImage, false], ['router history', callOpenRouterAPIWithImageAndHistory, true]
])('preserves annotations in the actual %s request', async (name, call, history) => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] })));
  const image = 'data:image/png;base64,c2FtcGxl';
  const args = ['', 'Sample request', image, ...(history ? [[]] : []), 'synthetic-key', 'sample-model (reasoning: xhigh)', false];
  const result = await call(...args);
  expect(history ? result.result : result).toBe('done');
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.model).toBe('sample-model');
  expect(name.startsWith('openai') ? body.reasoning_effort : body.reasoning.effort).toBe('xhigh');
});

it('validates classifier models against their selected provider rather than the OpenAI catalog', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => new Response(JSON.stringify(url.includes('anthropic')
    ? { content: [{ type: 'text', text: 'fr' }], stop_reason: 'end_turn' }
    : { choices: [{ message: { content: 'yes' }, finish_reason: 'stop' }] })));
  const model = 'gpt-6.2-sol (reasoning: none)';
  expect(await detectImageText('data:image/png;base64,c2FtcGxl', 'French', 'synthetic-key', model, { provider: 'openrouter' })).toBe(true);
  expect(await detectContentLanguage([{ type: 'paragraph', text: 'Sample source content.' }], 'synthetic-key', model, { provider: 'claude' })).toBe('fr');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toContain('openrouter.ai/');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: 'gpt-6.2-sol', reasoning: { effort: 'none' } });
  expect(fetch.mock.calls[1][0]).toContain('anthropic.com/');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ model: 'gpt-6.2-sol', thinking: { type: 'disabled' } });
});

it('preserves an explicit custom effort in text translation', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Translated paragraph.' }, finish_reason: 'stop' }] })));
  expect(await translateText('Source paragraph.', 'French', 'synthetic-key', 'sample-model (reasoning: high)', { provider: 'openai' })).toBe('Translated paragraph.');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: 'sample-model', reasoning_effort: 'high' });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateBatch, translateMetadata, translateText } from '../../scripts/translation/text.js';
import { detectContentLanguage } from '../../scripts/translation/detection.js';
import { detectImageText } from '../../scripts/translation/images.js';
import { CONFIG } from '../../scripts/utils/config.js';

vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: async key => key, getDecryptedKeyCached: async key => key }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async (error, options) => ({ message: error.message, code: error.code, context: options?.context || {} }) }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: () => false }));
afterEach(() => vi.unstubAllGlobals());

const key = 'synthetic-key';
const image = 'data:image/png;base64,c2FtcGxl';
function response(provider, value) {
  const payload = provider === 'claude'
    ? { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'synthetic-signature' }, { type: 'text', text: value.slice(0, 1) }, { type: 'text', text: value.slice(1) }] }
    : provider === 'gemini'
      ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Internal summary' }, { text: value.slice(0, 1) }, { text: value.slice(1) }] } }] }
      : { choices: [{ finish_reason: 'stop', message: { content: value } }] };
  return new Response(JSON.stringify(payload));
}

describe('translation model request compatibility', () => {
  it.each([
    ['claude', 'claude-sonnet-5-5'],
    ['gemini', 'gemini-4-carbon'],
    ['deepseek', 'deepseek-flash-no-thinking'],
    ['grok', 'grok-4.7'],
    ['openrouter', 'openai/gpt-6.1-terra-none']
  ])('uses the same selected %s configuration for text, batch, and metadata', async (provider, model) => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      return response(provider, requests.length === 2 ? '{"translations":["First translated","Second translated"]}' : 'Translated');
    }));
    const options = { provider };
    expect(await translateText('Original paragraph.', 'French', key, model, options)).toBe('Translated');
    expect(await translateBatch(['First original', 'Second original'], 'French', key, model, options)).toEqual(['First translated', 'Second translated']);
    expect(await translateMetadata('Original title', 'French', key, model, 'title', options)).toBe('Translated');
    expect(requests).toHaveLength(3);
    if (provider === 'claude') {
      expect(requests.map(({ body }) => body.model)).toEqual([model, model, model]);
      expect(requests.map(({ body }) => body.max_tokens)).toEqual([32000, 32000, 256]);
      expect(requests[2].body.thinking).toEqual({ type: 'between_tools' });
    } else if (provider === 'gemini') {
      for (const request of requests) expect(request.url).toContain('/gemini-4-carbon:generateContent');
      expect(requests[1].body.generationConfig.responseMimeType).toBe('application/json');
    } else if (provider === 'deepseek') {
      for (const { body } of requests) {
        expect(body.model).toBe('deepseek-flash');
        expect(body.thinking).toEqual({ type: 'disabled' });
      }
    } else if (provider === 'grok') {
      for (const { url, body } of requests) {
        expect(url).toContain('api.x.ai/v1/chat/completions');
        expect(body.model).toBe(model);
      }
    } else {
      for (const { body } of requests) {
        expect(body.model).toBe('openai/gpt-6.1-terra');
        expect(body.reasoning).toEqual({ effort: 'none' });
        expect(body.provider).toMatchObject({ require_parameters: true });
      }
      expect(requests.map(({ body }) => body.max_tokens)).toEqual([CONFIG.MAX_TOKENS_OPENROUTER, undefined, CONFIG.MAX_TOKENS_OPENROUTER]);
    }
  });

  it.each([
    ['claude-sonnet-5-5', 'between_tools', 10],
    ['claude-haiku-5-5', 'disabled', 10],
    ['claude-opus-5-5', undefined, 50000]
  ])('uses supported short-language detection settings for %s', async (model, thinkingType, maxTokens) => {
    const fetchMock = vi.fn(async () => response('claude', 'fr'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await detectContentLanguage([{ type: 'paragraph', text: 'The source paragraph contains ordinary English text.' }], key, model)).toBe('fr');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(model);
    expect(body.max_tokens).toBe(maxTokens);
    expect(body).not.toHaveProperty('temperature');
    if (thinkingType) expect(body.thinking.type).toBe(thinkingType);
    else expect(['disabled', 'between_tools']).not.toContain(body.thinking?.type);
  });

  it('reads all Gemini language-detection answer parts', async () => {
    const fetchMock = vi.fn(async () => response('gemini', 'fr'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await detectContentLanguage([{ text: 'The source paragraph is in English.' }], key, 'gemini-4-hydrogen')).toBe('fr');
    expect(fetchMock.mock.calls[0][0]).toContain('/gemini-4-hydrogen:generateContent');
  });

  it('uses the short Claude image classifier without upfront thinking', async () => {
    const fetchMock = vi.fn(async () => response('claude', 'yes'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await detectImageText(image, 'French', key, 'claude-sonnet-5-5')).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 100, thinking: { type: 'between_tools' } });
  });

  it('does not turn a text-only selection into a different image model', async () => {
    const fetchMock = vi.fn(async () => response('deepseek', 'yes'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(detectImageText(image, 'French', key, 'deepseek-v4-pro')).rejects.toMatchObject({ code: 'AI_MODEL_UNSUPPORTED_IMAGE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['grok', 'grok-4.3', 'grok-4.3'],
    ['openrouter', 'deepseek/deepseek-v4.1-flash-no-thinking', 'deepseek/deepseek-v4.1-flash']
  ])('preserves %s short-image classification settings on the wire', async (provider, model, apiModel) => {
    const fetchMock = vi.fn(async () => response(provider, 'yes'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await detectImageText(image, 'French', key, model, { provider })).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(apiModel);
    if (provider === 'grok') expect(body.reasoning_effort).toBe('none');
    else {
      expect(body.reasoning).toEqual({ enabled: false });
      expect(body.provider).toMatchObject({ require_parameters: true });
    }
    expect(body.messages[0].content[1].image_url.url).toBe(image);
  });

  it('propagates a Claude refusal through every document translation entry point', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [{ type: 'text', text: 'Partial answer' }] }))));
    const options = { provider: 'claude' };
    await expect(translateText('Original paragraph.', 'French', key, 'claude-sonnet-5-5', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
    await expect(translateBatch(['First paragraph', 'Second paragraph'], 'French', key, 'claude-sonnet-5-5', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
    await expect(translateMetadata('Original title', 'French', key, 'claude-sonnet-5-5', 'title', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
  });

  it.each([
    ['gpt-6.1-sol', false], ['gpt-6.1-terra', true], ['gpt-6-luna', true], ['gpt-6-astra', false]
  ])('uses a supported short OpenAI classification budget for %s', async (model, optionalReasoning) => {
    const fetchMock = vi.fn(async () => response('openai', 'fr'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await detectContentLanguage([{ text: 'The source paragraph is in English.' }], key, model)).toBe('fr');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(model);
    expect(body).not.toHaveProperty('max_tokens');
    if (optionalReasoning) {
      expect(body.reasoning_effort).toBe('none');
      expect(body.max_completion_tokens).toBe(10);
      expect(body.temperature).toBe(0);
    } else {
      expect(body).not.toHaveProperty('max_completion_tokens');
      expect(body).not.toHaveProperty('temperature');
      expect(body.reasoning_effort).not.toBe('none');
    }
  });

  it('preserves the selected translation effort on supported current OpenAI models', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return response('openai', requests.length === 1 ? 'Translated' : '{"translations":["First translated","Second translated"]}');
    }));
    expect(await translateText('Original paragraph.', 'French', key, 'gpt-6.1-sol-low')).toBe('Translated');
    expect(await translateBatch(['First paragraph', 'Second paragraph'], 'French', key, 'gpt-6.1-sol-low')).toEqual(['First translated', 'Second translated']);
    for (const body of requests) {
      expect(body.model).toBe('gpt-6.1-sol');
      expect(body.reasoning_effort).toBe('low');
    }
  });

  it('does not strip custom model suffixes or invent unsupported reasoning parameters', async () => {
    const fetchMock = vi.fn(async () => response('openai', 'Translated'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await translateText('Original paragraph.', 'French', key, 'example-model-high', { provider: 'openai' })).toBe('Translated');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('example-model-high');
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it.each([
    ['gemini', 'gemini-4-hydrogen', { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Partial answer' }] } }] }, 'AI_RESPONSE_REFUSED'],
    ['deepseek', 'deepseek-flash', { choices: [{ finish_reason: 'aborted', message: { content: 'Partial answer' } }] }, 'AI_RESPONSE_INCOMPLETE'],
    ['openai', 'gpt-6.1-sol', { choices: [{ finish_reason: 'content_filter', message: { content: 'Partial answer' } }] }, 'AI_RESPONSE_REFUSED']
  ])('does not silently restore original text after a reported %s failure', async (provider, model, payload, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload))));
    await expect(translateText('Original paragraph.', 'French', key, model, { provider })).rejects.toMatchObject({ code });
    await expect(translateMetadata('Original title', 'French', key, model, 'title', { provider })).rejects.toMatchObject({ code });
  });
  it('rejects a Gemini prompt block through text, batch, and metadata translation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }))));
    const options = { provider: 'gemini' };
    await expect(translateText('Original paragraph.', 'French', key, 'gemini-4-carbon', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
    await expect(translateBatch(['First paragraph', 'Second paragraph'], 'French', key, 'gemini-4-carbon', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
    await expect(translateMetadata('Original title', 'French', key, 'gemini-4-carbon', 'title', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
  });
});

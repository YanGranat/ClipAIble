import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as grok from '../../scripts/api/grok.js';
import * as router from '../../scripts/api/openrouter.js';

vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));

const image = 'data:image/jpeg;base64,/9j/2Q==';
const history = [{ role: 'user', content: 'Previous page' }, { role: 'assistant', content: '{"page":1}' }];
const response = (finish = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: '{"success":true}' } }] }), { status: 200 });
const request = () => JSON.parse(fetch.mock.calls.at(-1)[1].body);
const paths = [
  ['text', (api, model, options) => api.text('System', 'Article', 'synthetic-key', model, true, options)],
  ['image', (api, model, options) => api.image('System', 'Page', image, 'synthetic-key', model, true, options)],
  ['history', (api, model, options) => api.history('System', 'Page', image, history, 'synthetic-key', model, true, options)]
];
const providers = {
  grok: { text: grok.callGrokAPI, image: grok.callGrokAPIWithImage, history: grok.callGrokAPIWithImageAndHistory },
  router: { text: router.callOpenRouterAPI, image: router.callOpenRouterAPIWithImage, history: router.callOpenRouterAPIWithImageAndHistory }
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => response()));
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
});

describe('current Grok and OpenRouter model requests', () => {
  it.each(paths)('uses the current Grok model for %s without unsupported sampling parameters', async (kind, invoke) => {
    const result = await invoke(providers.grok, undefined, {});
    expect(kind === 'history' ? result.result : result).toEqual({ success: true });
    expect(request().model).toBe('grok-4.7');
    for (const key of ['temperature', 'presence_penalty', 'frequency_penalty', 'stop']) expect(request()).not.toHaveProperty(key);
    expect(request()).not.toHaveProperty('reasoning_effort');
  });

  it.each(paths)('normalizes an OpenRouter no-thinking variant for %s', async (kind, invoke) => {
    const result = await invoke(providers.router, 'deepseek/deepseek-v4.1-flash-no-thinking', {});
    expect(kind === 'history' ? result.result : result).toEqual({ success: true });
    expect(request()).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash', reasoning: { enabled: false }, provider: { require_parameters: true } });
  });

  it('sends the managed OpenRouter none effort and preserves image history and MIME', async () => {
    await providers.router.history('System', 'Page', image, history, 'synthetic-key', 'openai/gpt-6.1-terra-none', true);
    expect(request()).toMatchObject({ model: 'openai/gpt-6.1-terra', reasoning: { effort: 'none' } });
    expect(request().messages.slice(1, 3)).toEqual(history);
    expect(request().messages.at(-1).content[1].image_url.url).toBe(image);
    await providers.grok.history('System', 'Page', image, history, 'synthetic-key', 'grok-4.7', true);
    expect(request().messages.slice(1, 3)).toEqual(history);
    expect(request().messages.at(-1).content[1].image_url.url).toBe(image);
  });

  it('preserves the no-thinking constraint when JSON mode is unsupported', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), { status: 400 }));
    await providers.router.text('System', 'Article', 'synthetic-key', 'qwen/qwen3.8-flash-no-thinking', true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(request()).toMatchObject({ model: 'qwen/qwen3.8-flash', reasoning: { enabled: false }, provider: { require_parameters: true } });
    expect(request()).not.toHaveProperty('response_format');
  });

  it.each(paths)('keeps arbitrary custom model IDs literal for %s', async (_, invoke) => {
    await invoke(providers.router, 'sample-vendor/custom-high', {});
    expect(request().model).toBe('sample-vendor/custom-high');
    expect(request()).not.toHaveProperty('reasoning');
    await invoke(providers.grok, 'grok-custom-high', {});
    expect(request().model).toBe('grok-custom-high');
  });

  it('rejects a known text-only model before an image request', async () => {
    await expect(providers.router.image('System', 'Page', image, 'synthetic-key', 'qwen/qwen3-235b-a22b-2507', true)).rejects.toThrow(/does not support image/i);
    await expect(providers.router.image('System', 'Page', image, 'synthetic-key', 'qwen/qwen3-235b-a22b-2507', true)).rejects.toMatchObject({ code: 'AI_MODEL_UNSUPPORTED_IMAGE' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves availability of a literal saved free model to the provider', async () => {
    await expect(providers.router.text('System', 'Article', 'synthetic-key', 'mistralai/devstral-2512:free', true)).resolves.toEqual({ success: true });
    expect(request().model).toBe('mistralai/devstral-2512:free');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Model not found' } }), { status: 404 }));
    await expect(providers.router.text('System', 'Article', 'synthetic-key', 'mistralai/devstral-2512:free', true)).rejects.toThrow();
    expect(fetch.mock.calls.every(([, options]) => JSON.parse(options.body).model === 'mistralai/devstral-2512:free')).toBe(true);
  });

  it('avoids tiny visible-output caps on mandatory reasoning classifiers', () => {
    expect(grok.getGrokRequestConfig('grok-4.7', { shortResponse: true, maxTokens: 10, temperature: 0 })).toEqual({ model: 'grok-4.7', reasoning_effort: 'low' });
    const sol = router.getOpenRouterRequestConfig('openai/gpt-6.1-sol', { shortResponse: true, maxTokens: 10, temperature: 0 });
    expect(sol).toMatchObject({ model: 'openai/gpt-6.1-sol', reasoning: { effort: 'low' } });
    expect(sol).not.toHaveProperty('max_tokens');
    expect(sol).not.toHaveProperty('temperature');
    const terra = router.getOpenRouterRequestConfig('openai/gpt-6.1-terra-none', { shortResponse: true, maxTokens: 10, temperature: 0 });
    expect(terra).toMatchObject({ model: 'openai/gpt-6.1-terra', reasoning: { effort: 'none' }, max_tokens: 10, temperature: 0 });
  });

  it.each(paths)('propagates caller cancellation for %s', async (_, invoke) => {
    let cancelled = false;
    fetch.mockImplementationOnce(async () => { cancelled = true; return response(); });
    const checkCancelled = () => { if (cancelled) throw new Error('Cancelled'); };
    await expect(invoke(providers.router, 'openai/gpt-6.1-sol', { checkCancelled })).rejects.toThrow(/cancel/i);
    cancelled = false;
    fetch.mockImplementationOnce(async () => { cancelled = true; return response(); });
    await expect(invoke(providers.grok, 'grok-4.7', { checkCancelled })).rejects.toThrow(/cancel/i);
  });

  it.each(paths)('rejects truncated completion content for %s', async (_, invoke) => {
    fetch.mockResolvedValueOnce(response('length'));
    await expect(invoke(providers.router, 'openai/gpt-6.1-sol', {})).rejects.toMatchObject({ code: 'AI_RESPONSE_TRUNCATED' });
    fetch.mockResolvedValueOnce(response('length'));
    await expect(invoke(providers.grok, 'grok-4.7', {})).rejects.toMatchObject({ code: 'AI_RESPONSE_TRUNCATED' });
  });
});

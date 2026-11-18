import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseModelConfig, getOpenAIRequestConfig,
  callOpenAI, callOpenAIWithImage, callOpenAIWithImageAndHistory
} from '../../scripts/api/openai.js';
import { callAI } from '../../scripts/api/index.js';
import * as encryption from '../../scripts/utils/encryption.js';

afterEach(() => vi.restoreAllMocks());

describe('OpenAI model request compatibility', () => {
  it('keeps credentials and fetch pending until asynchronous admission completes', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const decrypt = vi.spyOn(encryption, 'getDecryptedKeyCached').mockResolvedValue('synthetic-key');
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Complete' }, finish_reason: 'stop' }]
    })));
    const operation = callAI('System', 'Content', 'synthetic-key', 'gpt-6.1-sol', false, {
      provider: 'openai', checkCancelled: () => gate
    });
    await new Promise(resolve => setImmediate(resolve));
    try {
      expect(decrypt).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      release();
      await operation;
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['text', 'image', 'history'])('checks ownership after the %s response JSON finishes parsing', async kind => {
    const error = new Error('Processing cancelled');
    let cancelled = false;
    let release;
    let entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const original = Response.prototype.json;
    vi.spyOn(Response.prototype, 'json').mockImplementation(async function () {
      const value = await original.call(this);
      entered();
      await gate;
      return value;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Complete' }, finish_reason: 'stop' }]
    })));
    const options = { checkCancelled: async () => { if (cancelled) throw error; } };
    const image = 'data:image/png;base64,c2FtcGxl';
    const operation = kind === 'text'
      ? callOpenAI('System', 'Content', 'test-key', 'gpt-6.1-sol', false, options)
      : kind === 'image'
        ? callOpenAIWithImage('System', 'Content', image, 'test-key', 'gpt-6.1-sol', false, options)
        : callOpenAIWithImageAndHistory('System', 'Content', image, [], 'test-key', 'gpt-6.1-sol', false, options);
    await started;
    cancelled = true;
    release();
    await expect(operation).rejects.toBe(error);
  });

  it('awaits asynchronous ownership checks before accessing credentials or the network', async () => {
    const error = new Error('Processing cancelled');
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(callAI('System', 'Content', 'synthetic-key', 'gpt-6.1-sol', false, {
      provider: 'openai', checkCancelled: async () => { throw error; }
    })).rejects.toBe(error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['text', 'image', 'history'])('preserves scoped cancellation after the %s request starts', async kind => {
    const error = new Error('Processing cancelled');
    let cancelled = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      cancelled = true;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Complete' }, finish_reason: 'stop' }] }));
    });
    const options = { checkCancelled: async () => { if (cancelled) throw error; } };
    const image = 'data:image/png;base64,c2FtcGxl';
    const operation = kind === 'text'
      ? callOpenAI('System', 'Content', 'test-key', 'gpt-6.1-sol', false, options)
      : kind === 'image'
        ? callOpenAIWithImage('System', 'Content', image, 'test-key', 'gpt-6.1-sol', false, options)
        : callOpenAIWithImageAndHistory('System', 'Content', image, [], 'test-key', 'gpt-6.1-sol', false, options);
    await expect(operation).rejects.toBe(error);
  });

  it('uses the current balanced default and its configured reasoning effort', () => {
    expect(parseModelConfig()).toEqual({ modelName: 'gpt-6.2-sol', reasoningEffort: 'medium' });
  });

  it.each([
    ['gpt-6.2-sol-low', 'gpt-6.2-sol', 'low'],
    ['gpt-6.2-astra-high', 'gpt-6.2-astra', 'high'],
    ['gpt-6.1-sol-low', 'gpt-6.1-sol', 'low'],
    ['gpt-6-astra-high', 'gpt-6-astra', 'high'],
    ['gpt-6.1-terra-high', 'gpt-6.1-terra', 'high'],
    ['gpt-6-luna-low', 'gpt-6-luna', 'low'],
    ['gpt-5.2-high', 'gpt-5.2', 'high']
  ])('normalizes the managed preset %s without migrating an explicit API selection', (id, modelName, reasoningEffort) => {
    expect(parseModelConfig(id)).toEqual({ modelName, reasoningEffort });
  });

  it('preserves an arbitrary custom ID ending in a reasoning-like suffix', () => {
    expect(parseModelConfig('private-model-high')).toEqual({ modelName: 'private-model-high', reasoningEffort: null });
    expect(getOpenAIRequestConfig('private-model-high', { reasoningEffort: 'high', maxTokens: 10, temperature: 0 }))
      .toEqual({ model: 'private-model-high', max_tokens: 10, temperature: 0 });
  });

  it('preserves the translation high-effort policy without unsupported sampling parameters', () => {
    expect(getOpenAIRequestConfig('gpt-6.1-sol', { maxTokens: 8000, temperature: 0.3, reasoningEffort: 'high' }))
      .toEqual({ model: 'gpt-6.1-sol', reasoning_effort: 'high', max_completion_tokens: 8000 });
  });

  it.each(['gpt-6.1-terra', 'gpt-6-luna'])('uses non-reasoning classification with the original short output budget for %s', model => {
    expect(getOpenAIRequestConfig(model, { maxTokens: 10, temperature: 0, shortResponse: true }))
      .toEqual({ model, reasoning_effort: 'none', max_completion_tokens: 10, temperature: 0 });
  });

  it.each(['gpt-6.1-sol', 'gpt-6-astra'])('avoids truncating mandatory reasoning to a classification-sized budget for %s', model => {
    const request = getOpenAIRequestConfig(model, { maxTokens: 10, temperature: 0, shortResponse: true });
    expect(request.model).toBe(model);
    expect(request.reasoning_effort).not.toBe('none');
    expect(request).not.toHaveProperty('max_tokens');
    expect(request).not.toHaveProperty('max_completion_tokens');
    expect(request).not.toHaveProperty('temperature');
  });

  it.each(['text', 'image', 'history'])('sends the managed model and effort on the actual %s request', async kind => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"text":"Complete"}' }, finish_reason: 'stop' }]
    }), { headers: { 'Content-Type': 'application/json' } }));
    const image = 'data:image/jpeg;base64,/9j/AA==';
    if (kind === 'text') await callOpenAI('Return JSON.', 'Read the text.', 'test-key', 'gpt-6.1-sol-high');
    else if (kind === 'image') await callOpenAIWithImage('Return JSON.', 'Read the image.', image, 'test-key', 'gpt-6.1-sol-high');
    else await callOpenAIWithImageAndHistory('Return JSON.', 'Read the next image.', image, [
      { role: 'user', content: 'Earlier page.' }, { role: 'assistant', content: 'Earlier response.' }
    ], 'test-key', 'gpt-6.1-sol-high');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body.model).toBe('gpt-6.1-sol');
    expect(body.reasoning_effort).toBe('high');
    expect(body.response_format).toEqual({ type: 'json_object' });
    if (kind !== 'text') expect(JSON.stringify(body.messages)).toContain(image);
    if (kind === 'history') expect(body.messages.slice(1, 3)).toEqual([
      { role: 'user', content: 'Earlier page.' }, { role: 'assistant', content: 'Earlier response.' }
    ]);
  });
});

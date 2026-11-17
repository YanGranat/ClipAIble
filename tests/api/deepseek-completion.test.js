import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeekAPI, callDeepSeekAPIWithImage, callDeepSeekAPIWithImageAndHistory } from '../../scripts/api/deepseek.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: fn => fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
vi.mock('../../scripts/locales.js', () => ({ tSync: key => key }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async error => ({ message: error.message, userMessage: error.message }) }));

afterEach(() => vi.unstubAllGlobals());
const event = value => `data: ${JSON.stringify(value)}\n\n`;
const delta = content => event({ choices: [{ delta: { content } }] });
const finish = reason => event({ choices: [{ delta: {}, finish_reason: reason }] });
const textCall = (json = false, options) => callDeepSeekAPI('System', 'Article', 'synthetic-key', 'deepseek-chat', json, options);
const reply = (content, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }));

describe('DeepSeek response completion', () => {
  it.each([false, true])('accepts a complete stream with JSON mode %s', async json => {
    const content = json ? '{"title":"Article"}' : 'Complete response.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(delta(content) + finish('stop') + 'data: [DONE]\n\n')));
    await expect(textCall(json)).resolves.toEqual(json ? { title: 'Article' } : content);
  });

  it.each([false, true])('rejects a parseable stream reported as truncated with JSON mode %s', async json => {
    const content = json ? '{"title":"Partial"}' : 'Partial response.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(delta(content) + finish('length') + 'data: [DONE]\n\n')));
    await expect(textCall(json)).rejects.toThrow('truncated');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects EOF without a terminal event even when accumulated text is valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(delta('{"title":"Partial"}'))));
    await expect(textCall(true)).rejects.toThrow('before completion');
  });

  it('rejects malformed SSE data instead of exporting text with a missing fragment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(delta('First ') + 'data: {invalid-json}\n\n' + delta('last.') + finish('stop') + 'data: [DONE]\n\n')));
    await expect(textCall()).rejects.toThrow();
  });

  it('rejects a network failure after more than 100 characters of valid JSON', async () => {
    const content = JSON.stringify({ title: 'Partial', text: 'Long response. '.repeat(20) });
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(new TextEncoder().encode(delta(content)));
        else controller.error(new TypeError('network error'));
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));
    await expect(textCall(true)).rejects.toThrow('network error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('finishes at the DONE event and cancels an otherwise open body', async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(delta('Complete.') + finish('stop') + 'data: [DONE]\n\n')); },
      cancel: cancelled
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));
    await expect(textCall()).resolves.toBe('Complete.');
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('rejects a truncated nonstreaming JSON retry', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(delta('invalid-json') + finish('stop') + 'data: [DONE]\n\n'))
      .mockResolvedValueOnce(reply('{"title":"Partial"}', 'length')));
    await expect(textCall(true)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['image', () => callDeepSeekAPIWithImage('System', 'Article', 'data:image/jpeg;base64,YQ==', 'synthetic-key', 'deepseek-chat', false)],
    ['history', () => callDeepSeekAPIWithImageAndHistory('System', 'Article', 'data:image/webp;base64,YQ==', [], 'synthetic-key', 'deepseek-chat', false)]
  ])('rejects a truncated %s response', async (_kind, call) => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('Partial response.', 'length')));
    await expect(call()).rejects.toThrow('truncated');
  });
});

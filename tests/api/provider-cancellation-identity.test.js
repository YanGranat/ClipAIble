import { afterEach, describe, expect, it, vi } from 'vitest';
import { callClaudeAPI, callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory } from '../../scripts/api/claude.js';
import { callGeminiAPI, callGeminiAPIWithImage, callGeminiAPIWithImageAndHistory, translateImageWithGemini } from '../../scripts/api/gemini.js';
import { callDeepSeekAPI, callDeepSeekAPIWithImage, callDeepSeekAPIWithImageAndHistory } from '../../scripts/api/deepseek.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: vi.fn(async () => 'en') }));
vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: vi.fn(async value => value) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const image = 'data:image/png;base64,c2FtcGxl';
const key = 'synthetic-key';
describe('scoped provider cancellation', () => {
  const calls = [
    ['Claude text', options => callClaudeAPI('System', 'Article', key, 'claude-sonnet-5-5', false, options)],
    ['Claude image', options => callClaudeAPIWithImage('System', 'Article', image, key, 'claude-sonnet-5-5', false, options)],
    ['Claude history', options => callClaudeAPIWithImageAndHistory('System', 'Article', image, [], key, 'claude-sonnet-5-5', false, options)],
    ['Gemini text', options => callGeminiAPI('System', 'Article', key, 'gemini-4-hydrogen', false, options)],
    ['Gemini image', options => callGeminiAPIWithImage('System', 'Article', image, key, 'gemini-4-hydrogen', false, options)],
    ['Gemini history', options => callGeminiAPIWithImageAndHistory('System', 'Article', image, [], key, 'gemini-4-hydrogen', false, options)],
    ['Gemini image edit', options => translateImageWithGemini(image, 'French', key, options)],
    ['DeepSeek text', options => callDeepSeekAPI('System', 'Article', key, 'deepseek-flash', false, options)],
    ['DeepSeek image', options => callDeepSeekAPIWithImage('System', 'Article', image, key, 'deepseek-flash', false, options)],
    ['DeepSeek history', options => callDeepSeekAPIWithImageAndHistory('System', 'Article', image, [], key, 'deepseek-flash', false, options)]
  ];
  it.each(calls)('%s preserves the owner cancellation instead of normalizing it as a network failure', async (_name, request) => {
    let active = true;
    const cancellation = new Error('The processing owner was cancelled.');
    const options = { checkCancelled() { if (!active) throw cancellation; } };
    const fetchMock = vi.fn(async () => { active = false; throw new TypeError('Synthetic transport failure'); });
    vi.stubGlobal('fetch', fetchMock);
    await expect(request(options)).rejects.toBe(cancellation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves cancellation during a DeepSeek response stream', async () => {
    let active = true;
    const cancellation = new Error('The processing owner was cancelled.');
    vi.stubGlobal('fetch', vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"First fragment"}}]}\n\n')); },
        pull(controller) { active = false; controller.close(); }
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }));
    await expect(callDeepSeekAPI('System', 'Article', key, 'deepseek-flash', false, {
      checkCancelled() { if (!active) throw cancellation; }
    })).rejects.toBe(cancellation);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(calls.filter(([name]) => name !== 'DeepSeek text'))('%s discards a buffered body if the owner changes while JSON parsing is pending', async (_name, request) => {
    let active = true, parsing = false, release;
    const parked = new Promise(resolve => { release = resolve; });
    const cancellation = new Error('The processing owner was cancelled.');
    const originalJson = Response.prototype.json;
    vi.spyOn(Response.prototype, 'json').mockImplementation(async function () {
      parsing = true;
      await parked;
      return originalJson.call(this);
    });
    const payload = {
      stop_reason: 'end_turn', content: [{ type: 'text', text: 'Translated article' }],
      choices: [{ finish_reason: 'stop', message: { content: 'Translated article' } }],
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Translated article' }, { inlineData: { mimeType: 'image/png', data: 'c2FtcGxl' } }] } }]
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })));
    const pending = request({ checkCancelled() { if (!active) throw cancellation; } });
    try {
      await vi.waitFor(() => expect(parsing).toBe(true));
      active = false;
      release();
      await expect(pending).rejects.toBe(cancellation);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  });
});

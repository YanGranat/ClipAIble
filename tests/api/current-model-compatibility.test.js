import { afterEach, describe, expect, it, vi } from 'vitest';
import { callClaudeAPI, callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory, getClaudeRequestConfig } from '../../scripts/api/claude.js';
import { callGeminiAPI, callGeminiAPIWithImage, callGeminiAPIWithImageAndHistory, translateImageWithGemini } from '../../scripts/api/gemini.js';
import { callDeepSeekAPI, callDeepSeekAPIWithImage, callDeepSeekAPIWithImageAndHistory } from '../../scripts/api/deepseek.js';
import { GEMINI_IMAGE_MODEL, resolveSavedModel } from '../../scripts/utils/model-catalog.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: vi.fn(async () => 'en') }));
vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: vi.fn(async value => value) }));

const image = 'data:image/png;base64,c2FtcGxl';
const key = 'synthetic-key';
const jsonResponse = payload => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('current first-party model requests', () => {
  it.each([
    ['text', () => callClaudeAPI('System', 'Article', key, 'claude-fable-5-2')],
    ['image', () => callClaudeAPIWithImage('System', 'Article', image, key, 'claude-fable-5-2')],
    ['history', () => callClaudeAPIWithImageAndHistory('System', 'Article', image, [], key, 'claude-fable-5-2')]
  ])('sends Claude Fable adaptive thinking for %s', async (_name, request) => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: '{"title":"Translated"}' }], stop_reason: 'end_turn' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request();
    expect(result.result || result).toEqual({ title: 'Translated' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'claude-fable-5-2', thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, max_tokens: 50000 });
    expect(body).not.toHaveProperty('temperature');
    expect(getClaudeRequestConfig('claude-fable-5-2', { maxTokens: 100, shortResponse: true })).toMatchObject({ thinking: { type: 'adaptive' }, max_tokens: 50000 });
  });

  it.each([
    ['text', () => callClaudeAPI('System', 'Article', key)],
    ['image', () => callClaudeAPIWithImage('System', 'Article', image, key)],
    ['history', () => callClaudeAPIWithImageAndHistory('System', 'Article', image, [], key)]
  ])('reads all Claude %s text blocks after thinking', async (_name, request) => {
    const content = [{ type: 'thinking', thinking: '', signature: 'synthetic-signature' }, { type: 'text', text: '{"title":' }, { type: 'text', text: '"Translated"}' }];
    const fetchMock = vi.fn(async () => jsonResponse({ content, stop_reason: 'end_turn' }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await request();
    expect(response.result || response).toEqual({ title: 'Translated' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBe(50000);
    expect(body).not.toHaveProperty('temperature');
    if (_name === 'history') expect(response.assistantMessage).toEqual(content);
  });

  it.each([10, 100, 256])('leaves room for a short Claude answer with the existing %s-token role', maxTokens => {
    expect(getClaudeRequestConfig('claude-sonnet-5-5', { maxTokens, shortResponse: true })).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: maxTokens, thinking: { type: 'between_tools' } });
    expect(getClaudeRequestConfig('claude-haiku-5-5', { maxTokens, shortResponse: true })).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: maxTokens, thinking: { type: 'disabled' } });
    const opus = getClaudeRequestConfig('claude-opus-5-5', { maxTokens, shortResponse: true });
    expect(opus.max_tokens).toBe(50000);
    expect(opus.thinking?.type).not.toBe('disabled');
    expect(opus.thinking?.type).not.toBe('between_tools');
  });

  it.each([
    ['text', () => callGeminiAPI('System', 'Article', key)],
    ['image', () => callGeminiAPIWithImage('System', 'Article', image, key)]
  ])('uses the current Gemini model for %s without returning thought summaries', async (_name, request) => {
    const fetchMock = vi.fn(async () => jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Internal summary' }, { text: '{"title":' }, { text: '"Translated"}' }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await request()).toEqual({ title: 'Translated' });
    expect(fetchMock.mock.calls[0][0]).toContain('/gemini-4-hydrogen:generateContent');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('replays Gemini signed parts and the exact original user parts on the next page', async () => {
    const parts = [{ text: '{"title":"Translated"}', thoughtSignature: 'synthetic-signature' }, { thoughtSignature: 'synthetic-empty-part' }];
    const fetchMock = vi.fn(async () => jsonResponse({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await callGeminiAPIWithImageAndHistory('System', 'First page', image, [], key, 'gemini-4-carbon');
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const history = [first.userMessage, { role: 'assistant', content: first.assistantMessage }];
    await callGeminiAPIWithImageAndHistory('System', 'Second page', image, history, key, 'gemini-4-carbon');
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.assistantMessage).toEqual(parts);
    expect(secondBody.contents[0].parts).toEqual(firstBody.contents[0].parts);
    expect(secondBody.contents[1]).toEqual({ role: 'model', parts });
    expect(history[1].content).toEqual(parts);
  });

  it('uses the stable Pro image editor and selects the final image', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, inlineData: { mimeType: 'image/png', data: 'aW50ZXJuYWw=' } },
      { inlineData: { mimeType: 'image/png', data: 'ZmluYWw=' } }
    ] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await translateImageWithGemini(image, 'French', key)).toBe('data:image/png;base64,ZmluYWw=');
    expect(GEMINI_IMAGE_MODEL).toBe('gemini-3-pro-image');
    expect(fetchMock.mock.calls[0][0]).toContain('/gemini-3-pro-image:generateContent');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
  });

  it.each([
    ['deepseek-chat', false],
    ['deepseek-reasoner', true]
  ])('preserves the migrated %s reasoning mode through a real streaming request', async (savedModel, thinking) => {
    const stream = 'data: {"choices":[{"delta":{"reasoning_content":"Internal reasoning"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"Translated article"},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n';
    const fetchMock = vi.fn(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await callDeepSeekAPI('System', 'Article', key, resolveSavedModel('deepseek', savedModel), false)).toBe('Translated article');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('deepseek-flash');
    expect(body.thinking.type).toBe(thinking ? 'enabled' : 'disabled');
    if (!thinking) expect(body).not.toHaveProperty('reasoning_effort');
  });

  it.each([
    ['image', () => callDeepSeekAPIWithImage('System', 'Article', image, key, 'deepseek-v4-pro')],
    ['history', () => callDeepSeekAPIWithImageAndHistory('System', 'Article', image, [], key, 'deepseek-v4-pro')]
  ])('rejects a known text-only DeepSeek selection before sending %s data', async (_name, request) => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request()).rejects.toMatchObject({ code: 'AI_MODEL_UNSUPPORTED_IMAGE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends native Flash vision without changing the selected reasoning variant', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: 'Image text' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await callDeepSeekAPIWithImage('System', 'Read image', image, key, 'deepseek-flash-no-thinking', false)).toBe('Image text');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('deepseek-flash');
    expect(body.thinking.type).toBe('disabled');
    expect(body.messages[1].content[1].image_url.url).toBe(image);
  });

  it.each([
    ['deepseek-flash', 600000], ['deepseek-flash-no-thinking', 180000]
  ])('keeps the existing stream deadline for the %s reasoning mode', async (model, deadline) => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const stream = new ReadableStream({ cancel: cancelled });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })));
    let settled = false;
    const result = callDeepSeekAPI('System', 'Article', key, model, false).then(value => {
      settled = true;
      return value;
    }, error => {
      settled = true;
      return error;
    });
    await vi.advanceTimersByTimeAsync(deadline - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true);
    expect(await result).toBeInstanceOf(Error);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['content_filter', 'aborted', 'insufficient_system_resource'])('rejects DeepSeek %s even after a parseable streamed response', async finishReason => {
    const stream = `data: ${JSON.stringify({ choices: [{ delta: { content: '{"title":"Partial"}' }, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })));
    await expect(callDeepSeekAPI('System', 'Article', key, 'deepseek-flash', true)).rejects.toMatchObject({ code: finishReason === 'content_filter' ? 'AI_RESPONSE_REFUSED' : 'AI_RESPONSE_INCOMPLETE' });
  });

  it('replays Claude thinking signatures and exact user content on the next page', async () => {
    const content = [{ type: 'thinking', thinking: '', signature: 'synthetic-signature' }, { type: 'text', text: '{"title":"Translated"}' }];
    const fetchMock = vi.fn(async () => jsonResponse({ content, stop_reason: 'end_turn' }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await callClaudeAPIWithImageAndHistory('System', 'First page', image, [], key, 'claude-sonnet-5-5');
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    await callClaudeAPIWithImageAndHistory('System', 'Second page', image, [first.userMessage, { role: 'assistant', content: first.assistantMessage }], key, 'claude-sonnet-5-5');
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.system).toBe(firstBody.system);
    expect(secondBody.messages[0]).toEqual(firstBody.messages[0]);
    expect(secondBody.messages[1]).toEqual({ role: 'assistant', content });
  });
  it.each([
    ['text', () => callGeminiAPI('System', 'Article', key)],
    ['image', () => callGeminiAPIWithImage('System', 'Article', image, key)],
    ['history', () => callGeminiAPIWithImageAndHistory('System', 'Article', image, [], key)]
  ])('rejects a prompt-level Gemini block on the %s route', async (_name, request) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] })));
    await expect(request()).rejects.toMatchObject({ code: 'AI_RESPONSE_REFUSED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

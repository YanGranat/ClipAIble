import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../../scripts/content.js', import.meta.url), 'utf8');
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

describe('YouTube content bridge request ownership', () => {
  let dom;
  let listener;
  let cache;
  let sent;
  let chrome;
  let respond;

  const trustedSender = { id: 'test-extension-id' };
  function register(requestId) { listener({ action: 'ping', subtitleRequestId: requestId }, trustedSender, vi.fn()); }
  function clear(requestId) { listener({ action: 'clearSubtitleRequest', requestId }, trustedSender, vi.fn()); }
  function dispatch(requestId) {
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('ClipAIbleSubtitleMessage', { detail: {
      type: 'ClipAIbleYouTubeSubtitles', action: 'youtubeSubtitlesResult', requestId,
      result: { requestId, subtitles: [{ start: 0, duration: 1, text: 'Same caption' }], metadata: { title: 'Sample video' } }
    } }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    cache = {};
    sent = [];
    respond = true;
    dom = new JSDOM('<body></body>', { url: 'https://www.youtube.com/watch?v=sample-video', runScripts: 'outside-only' });
    dom.window.setTimeout = globalThis.setTimeout;
    dom.window.clearTimeout = globalThis.clearTimeout;
    chrome = {
      runtime: { id: 'test-extension-id',
        onMessage: { addListener: value => { listener = value; }, removeListener: vi.fn() },
        sendMessage: vi.fn((message, callback) => {
          if (message.action === 'logError') { callback?.({}); return; }
          sent.push(message);
          if (respond) callback?.({ success: true });
        })
      },
      storage: { local: {
        set: vi.fn(async data => { Object.assign(cache, data); }),
        remove: vi.fn(async key => { delete cache[key]; })
      } }
    };
    dom.window.chrome = chrome;
    dom.window.eval(source);
  });
  afterEach(async () => {
    dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
    await Promise.resolve();
    dom.window.close();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('ignores page events for requests the extension has not registered', async () => {
    dispatch(firstId);
    await vi.advanceTimersByTimeAsync(3000);
    expect(sent).toEqual([]);
    expect(cache).toEqual({});
    expect(dom.window.document.querySelector('[data-subtitles]')).toBeNull();
  });

  it('forwards identical captions for two distinct requests', () => {
    register(firstId);
    register(secondId);
    dispatch(firstId);
    dispatch(firstId);
    dispatch(secondId);
    expect(sent.map(message => message.requestId)).toEqual([firstId, secondId]);
  });

  it('forwards only the subtitle message shape even when a page supplies another action', () => {
    register(firstId);
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('ClipAIbleSubtitleMessage', { detail: {
      type: 'ClipAIbleYouTubeSubtitles', action: 'clearStats', data: { clear: true }, requestId: firstId,
      result: { requestId: firstId, subtitles: [{ start: 0, duration: 2, text: 'A caption' }], metadata: { title: 'A video', privateField: 'unused' } }
    } }));
    expect(sent).toHaveLength(1);
    expect(sent[0].action).toBe('youtubeSubtitlesResult');
    expect(sent[0]).not.toHaveProperty('data');
    expect(sent[0].result.metadata).toEqual({ title: 'A video' });
  });

  it('does not register requests from a web sender', () => {
    listener({ action: 'ping', subtitleRequestId: firstId }, { id: 'test-extension-id', url: 'https://www.youtube.com/', tab: { id: 1 } }, vi.fn());
    dispatch(firstId);
    expect(sent).toEqual([]);
  });

  it('does not expose page-requested network access', () => {
    dom.window.fetch = vi.fn();
    const detail = { type: 'ClipAIbleSubtitleFetchRequest', requestId: firstId, url: 'https://example.org/resource' };
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('ClipAIbleSubtitleFetchRequest', { detail }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: detail, source: dom.window, origin: dom.window.location.origin }));
    expect(dom.window.fetch).not.toHaveBeenCalled();
  });

  it('ignores postMessages with a foreign source or origin', () => {
    register(firstId);
    const data = { type: 'ClipAIbleYouTubeSubtitles', requestId: firstId, result: { requestId: firstId, subtitles: [{ start: 0, duration: 1, text: 'Sample' }] } };
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: dom.window, origin: 'https://example.org' }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: null, origin: dom.window.location.origin }));
    expect(sent).toEqual([]);
  });

  it('uses the owned DOM fallback when content storage is restricted', async () => {
    respond = false;
    chrome.storage.local.set.mockRejectedValue(new Error('Access denied'));
    register(firstId);
    dispatch(firstId);
    await vi.advanceTimersByTimeAsync(3000);
    expect(dom.window.document.getElementById(`ClipAIblePendingSubtitles-${firstId}`)).not.toBeNull();
    clear(firstId);
    expect(dom.window.document.querySelector('[data-subtitles]')).toBeNull();
  });

  it('stores independent fallback records and removes only the completed request', async () => {
    respond = false;
    register(firstId);
    register(secondId);
    dispatch(firstId);
    dispatch(secondId);
    await vi.advanceTimersByTimeAsync(3000);
    expect(cache[`pendingSubtitles-${firstId}`]).toEqual(expect.objectContaining({ requestId: firstId }));
    expect(cache[`pendingSubtitles-${secondId}`]).toEqual(expect.objectContaining({ requestId: secondId }));
    clear(firstId);
    expect(cache[`pendingSubtitles-${firstId}`]).toBeUndefined();
    expect(cache[`pendingSubtitles-${secondId}`]).toBeDefined();
    await vi.advanceTimersByTimeAsync(57000);
    expect(cache).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes a late storage write after its owner is cleared', async () => {
    respond = false;
    let finishWrite;
    chrome.storage.local.set.mockImplementationOnce(data => new Promise(resolve => {
      finishWrite = () => { Object.assign(cache, data); resolve(); };
    }));
    register(firstId);
    dispatch(firstId);
    await vi.advanceTimersByTimeAsync(3000);
    clear(firstId);
    register(secondId);
    dispatch(secondId);
    await vi.advanceTimersByTimeAsync(3000);
    finishWrite();
    await vi.advanceTimersByTimeAsync(0);
    expect(cache[`pendingSubtitles-${firstId}`]).toBeUndefined();
    expect(cache[`pendingSubtitles-${secondId}`]).toBeDefined();
  });

  it('keeps DOM fallbacks separate and clears them on page unload', () => {
    register(firstId);
    register(secondId);
    delete chrome.runtime.id;
    dispatch(firstId);
    dispatch(secondId);
    const document = dom.window.document;
    expect(document.getElementById(`ClipAIblePendingSubtitles-${firstId}`)).not.toBeNull();
    expect(document.getElementById(`ClipAIblePendingSubtitles-${secondId}`)).not.toBeNull();
    clear(firstId);
    expect(document.getElementById(`ClipAIblePendingSubtitles-${firstId}`)).toBeNull();
    expect(document.getElementById(`ClipAIblePendingSubtitles-${secondId}`)).not.toBeNull();
    dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
    expect(document.querySelector('[data-subtitles]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

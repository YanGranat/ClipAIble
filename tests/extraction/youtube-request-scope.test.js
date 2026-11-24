import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: {
  VIDEO_SUBTITLES_TIMEOUT: 60000, VIDEO_SUBTITLES_CHECK_INTERVAL: 200,
  VIDEO_SUBTITLES_WAIT_INTERVAL: 100, VIDEO_SUBTITLES_RETRY_DELAY_1: 100,
  VIDEO_SUBTITLES_RETRY_DELAY_2: 100
} }));

import { extractYouTubeSubtitles } from '../../scripts/extraction/video-subtitles.js';

describe('YouTube subtitle request ownership', () => {
  let listeners;
  let requests;
  let storage;
  let dom;

  function respond(request, text, senderTab = request.target.tabId, requestId = request.args[6]) {
    const result = { requestId, subtitles: [{ start: 0, duration: 1, text }], metadata: { title: 'Sample video' } };
    for (const listener of [...listeners]) {
      listener({ type: 'ClipAIbleYouTubeSubtitles', action: 'youtubeSubtitlesResult', requestId, result }, { id: 'test-extension-id', url: 'https://www.youtube.com/watch?v=sample-video', tab: { id: senderTab } }, vi.fn());
    }
  }

  async function start(tabId) {
    const promise = extractYouTubeSubtitles(tabId);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    return { promise, request: requests.at(-1) };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Set();
    requests = [];
    storage = {};
    dom = new JSDOM('<body></body>', { url: 'https://www.youtube.com/watch?v=sample-video', runScripts: 'outside-only' });
    vi.stubGlobal('chrome', {
      runtime: { id: 'test-extension-id', onMessage: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } },
      tabs: { sendMessage: vi.fn(async () => ({ success: true })) },
      storage: { local: {
        get: vi.fn(async keys => Object.fromEntries(keys.filter(key => key in storage).map(key => [key, storage[key]]))),
        remove: vi.fn(async key => { delete storage[key]; })
      } },
      scripting: { executeScript: vi.fn(async options => {
        if (options.func.name === 'extractYouTubeSubtitlesInlined') {
          requests.push(options);
          return new Promise(() => {});
        }
        const result = new Function('document', 'args', `return (${options.func.toString()})(...args);`)(dom.window.document, options.args || []);
        return [{ result }];
      }) }
    });
  });
  afterEach(async () => {
    for (const request of requests) respond(request, 'Cleanup reply');
    await Promise.resolve();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    dom.window.close();
  });

  it('accepts each tab response only for its own pending request', async () => {
    const first = await start(1);
    const second = await start(2);
    let firstResolved = false;
    first.promise.then(() => { firstResolved = true; });
    respond(second.request, 'Second tab transcript');
    await expect(second.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'Second tab transcript' })] }));
    expect(firstResolved).toBe(false);
    respond(first.request, 'First tab transcript');
    await expect(first.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'First tab transcript' })] }));
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('distinguishes overlapping requests in the same tab', async () => {
    const first = await start(1);
    const second = await start(1);
    expect(first.request.args[6]).toEqual(expect.any(String));
    expect(first.request.args[6]).not.toBe(second.request.args[6]);
    let secondResolved = false;
    second.promise.then(() => { secondResolved = true; });
    respond(first.request, 'Earlier transcript');
    await first.promise;
    expect(secondResolved).toBe(false);
    respond(second.request, 'Current transcript');
    await expect(second.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'Current transcript' })] }));
  });

  it('ignores a different tab even when the request ID matches', async () => {
    const current = await start(1);
    let settled = false;
    current.promise.then(() => { settled = true; });
    respond(current.request, 'Foreign tab transcript', 2);
    await Promise.resolve();
    expect(settled).toBe(false);
    respond(current.request, 'Owned transcript');
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'Owned transcript' })] }));
  });

  it('ignores an untrusted sender with the correct tab and request ID', async () => {
    const current = await start(1);
    let settled = false;
    current.promise.then(() => { settled = true; });
    const message = { action: 'youtubeSubtitlesResult', requestId: current.request.args[6],
      result: { requestId: current.request.args[6], subtitles: [{ text: 'Foreign transcript' }] } };
    const acknowledge = vi.fn();
    for (const listener of [...listeners]) listener(message, { id: 'other-extension', tab: { id: 1 }, url: 'https://www.youtube.com/watch?v=sample-video' }, acknowledge);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(acknowledge).not.toHaveBeenCalled();
    respond(current.request, 'Owned transcript');
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'Owned transcript' })] }));
  });

  it('leaves an unrelated DOM payload intact', async () => {
    const element = dom.window.document.createElement('div');
    element.id = 'ClipAIblePendingSubtitles-other-request';
    element.setAttribute('data-subtitles', JSON.stringify({ requestId: 'other-request', timestamp: Date.now(), subtitles: [{ text: 'Foreign transcript' }] }));
    dom.window.document.body.append(element);
    const current = await start(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(element.isConnected).toBe(true);
    respond(current.request, 'Owned transcript');
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'Owned transcript' })] }));
  });

  it('ignores unrelated storage records', async () => {
    storage.pendingSubtitles = { requestId: 'other-request', timestamp: Date.now(), subtitles: [{ text: 'Foreign transcript' }] };
    const current = await start(1);
    respond(current.request, 'Owned transcript');
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'Owned transcript' })] }));
    expect(storage.pendingSubtitles).toEqual(expect.objectContaining({ requestId: 'other-request' }));
  });

  it('checks ownership before consuming a DOM record and accepts its own fallback', async () => {
    const current = await start(1);
    const requestId = current.request.args[6];
    const element = dom.window.document.createElement('div');
    element.id = `ClipAIblePendingSubtitles-${requestId}`;
    element.setAttribute('data-subtitles', JSON.stringify({ requestId: 'other-request', timestamp: Date.now(), subtitles: [{ text: 'Foreign transcript' }] }));
    dom.window.document.body.append(element);
    let settled = false;
    current.promise.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(false);
    expect(element.isConnected).toBe(true);
    element.setAttribute('data-subtitles', JSON.stringify({ requestId, timestamp: Date.now(), subtitles: [{ text: 'Owned fallback' }] }));
    await vi.advanceTimersByTimeAsync(200);
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [{ text: 'Owned fallback' }] }));
    expect(element.isConnected).toBe(false);
  });

  it('accepts and deletes only its own storage fallback', async () => {
    const current = await start(1);
    const requestId = current.request.args[6];
    storage[`pendingSubtitles-${requestId}`] = { requestId, timestamp: Date.now(), subtitles: [{ text: 'Stored fallback' }] };
    storage['pendingSubtitles-other-request'] = { requestId: 'other-request', timestamp: Date.now() };
    await vi.advanceTimersByTimeAsync(200);
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [{ text: 'Stored fallback' }] }));
    expect(storage[`pendingSubtitles-${requestId}`]).toBeUndefined();
    expect(storage['pendingSubtitles-other-request']).toBeDefined();
  });

  it.each([false, true])('settles a native injection error with or without an owned fallback: %s', async hasFallback => {
    const before = chrome.scripting.executeScript.getMockImplementation();
    let report;
    chrome.scripting.executeScript.mockImplementation(options => {
      if (options.func.name !== 'extractYouTubeSubtitlesInlined') return before(options);
      requests.push(options);
      return new Promise(resolve => { report = resolve; });
    });
    const current = await start(1);
    const requestId = current.request.args[6];
    if (hasFallback) {
      const element = dom.window.document.createElement('div');
      element.id = `ClipAIblePendingSubtitles-${requestId}`;
      element.setAttribute('data-subtitles', JSON.stringify({
        requestId, timestamp: Date.now(), subtitles: [{ text: 'Owned fallback' }]
      }));
      dom.window.document.body.append(element);
    }
    report([{ error: { message: 'Invocation could not complete' } }]);
    if (hasFallback) await expect(current.promise).resolves.toMatchObject({ subtitles: [{ text: 'Owned fallback' }] });
    else await expect(current.promise).rejects.toThrow('Subtitle extraction failed: Invocation could not complete');
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serializes the MAIN producer and delivers through the actual content bridge', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    dom.window.setTimeout = globalThis.setTimeout;
    dom.window.clearTimeout = globalThis.clearTimeout;
    dom.window.chrome = chrome;
    chrome.storage.local.set = vi.fn(async data => Object.assign(storage, data));
    chrome.runtime.id = 'test-extension-id';
    chrome.runtime.sendMessage = vi.fn((message, callback) => {
      for (const listener of [...listeners]) listener(message, { id: 'test-extension-id', url: 'https://www.youtube.com/watch?v=sample-video', tab: { id: 1 } }, callback || (() => {}));
    });
    dom.window.eval(readFileSync(new URL('../../scripts/content.js', import.meta.url), 'utf8'));
    chrome.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
      let reply;
      for (const listener of [...listeners]) listener(message, { id: 'test-extension-id' }, value => { reply = value; });
      return reply;
    });
    dom.window.yt = { config_: { INNERTUBE_API_KEY: 'test-api-key' } };
    Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' });
    const pageFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ captions: { playerCaptionsTracklistRenderer: {
        captionTracks: [{ languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=sample-video' }]
      } } }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'A complete transcript' }] }
      ] }) });
    chrome.scripting.executeScript.mockImplementation(async options => {
      if (options.func.name === 'extractYouTubeSubtitlesInlined') {
        requests.push(options);
        const invoke = new Function('window', 'document', 'navigator', 'fetch', 'CustomEvent', 'chrome', 'args',
          `return (${options.func.toString()})(...args);`);
        const result = await invoke(dom.window, dom.window.document, dom.window.navigator, pageFetch, dom.window.CustomEvent, undefined, options.args);
        return [{ result }];
      }
      const result = new Function('document', 'args', `return (${options.func.toString()})(...args);`)(dom.window.document, options.args || []);
      return [{ result }];
    });
    const current = await start(1);
    await expect(current.promise).resolves.toEqual(expect.objectContaining({ subtitles: [expect.objectContaining({ text: 'A complete transcript' })] }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: current.request.args[6] }), expect.any(Function));
    expect(pageFetch).toHaveBeenCalledTimes(2);
  });
});

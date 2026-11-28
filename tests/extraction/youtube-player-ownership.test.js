import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: {
  VIDEO_SUBTITLES_TIMEOUT: 60000, VIDEO_SUBTITLES_CHECK_INTERVAL: 200,
  VIDEO_SUBTITLES_WAIT_INTERVAL: 100, VIDEO_SUBTITLES_RETRY_DELAY_1: 100, VIDEO_SUBTITLES_RETRY_DELAY_2: 100
} }));
import { extractYouTubeSubtitles } from '../../scripts/extraction/video-subtitles.js';

describe('YouTube player response ownership', () => {
  let dom, pageFetch, messages;
  const player = videoId => ({ videoDetails: { videoId }, captions: { playerCaptionsTracklistRenderer: {
    captionTracks: [{ languageCode: 'en', baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&source=cached` }]
  } } });
  const transcript = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Current transcript' }] }] });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dom = new JSDOM('<title>Sample video</title><body></body>', { url: 'https://www.youtube.com/watch?v=current-video' });
    Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' });
    dom.window.yt = { config_: { INNERTUBE_API_KEY: 'example-public-player-key' } };
    messages = [];
    dom.window.document.addEventListener('ClipAIbleSubtitleMessage', event => messages.push(event.detail));
    pageFetch = vi.fn(async url => String(url).includes('source=cached')
      ? { ok: true, text: async () => transcript }
      : { ok: false, status: 503, text: async () => '' });
    vi.stubGlobal('chrome', {
      runtime: { id: 'test-extension-id', onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
      tabs: { sendMessage: vi.fn(async () => ({ success: true })) },
      storage: { local: { get: vi.fn(async () => ({})), remove: vi.fn(async () => {}) } },
      scripting: { executeScript: vi.fn(async options => {
        if (options.func.name !== 'extractYouTubeSubtitlesInlined') return [{ result: null }];
        const invoke = new Function('window', 'document', 'navigator', 'fetch', 'CustomEvent', 'chrome', 'args',
          `return (${options.func.toString()})(...args);`);
        return [{ result: await invoke(dom.window, dom.window.document, dom.window.navigator, pageFetch, dom.window.CustomEvent, undefined, options.args) }];
      }) }
    });
  });
  afterEach(() => {
    vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); dom.window.close();
  });
  async function settle(targetLanguage, sourceLanguage) {
    let settled = false;
    const result = extractYouTubeSubtitles(7, targetLanguage, sourceLanguage).then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
    await vi.advanceTimersByTimeAsync(10000);
    expect(settled).toBe(true);
    return result;
  }

  it('rejects stale cached captions instead of exporting the preceding video', async () => {
    dom.window.ytInitialPlayerResponse = player('previous-video');
    expect((await settle()).error).toBeInstanceOf(Error);
    expect(pageFetch.mock.calls.some(([url]) => String(url).includes('v=previous-video'))).toBe(false);
    expect(messages.some(message => message.result)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a matching player transcript and timing', async () => {
    dom.window.ytInitialPlayerResponse = player('current-video');
    expect((await settle()).value).toMatchObject({ subtitles: [{ start: 1, duration: 2, text: 'Current transcript' }] });
    expect(pageFetch.mock.calls.some(([url]) => String(url).includes('v=current-video&source=cached'))).toBe(true);
  });

  it.each([
    [undefined, false, 'ja-asr'],
    ['fr', false, 'fr-manual'],
    [undefined, true, 'fr-manual']
  ])('selects the requested or best supported caption track (%s, second ASR=%s)', async (language, secondAutomaticTrack, expected) => {
    const response = player('current-video');
    const captions = response.captions.playerCaptionsTracklistRenderer.captionTracks;
    const track = (languageCode, name, kind) => ({ languageCode, kind, baseUrl: `https://www.youtube.com/api/timedtext?v=current-video&source=cached&track=${name}` });
    captions.splice(0, captions.length, track('fr', 'fr-manual'), track('ja', 'ja-asr', 'asr'));
    if (secondAutomaticTrack) captions.push(track('en', 'en-asr', 'asr'));
    dom.window.ytInitialPlayerResponse = response;

    expect((await settle(language)).value?.subtitles).toEqual([{ start: 1, duration: 2, text: 'Current transcript' }]);
    const captionRequest = pageFetch.mock.calls.find(([url]) => String(url).includes('source=cached'))?.[0];
    expect(new URL(captionRequest).searchParams.get('track')).toBe(expected);
  });

  it('waits for the current player response after a navigation', async () => {
    dom.window.ytInitialPlayerResponse = player('previous-video');
    setTimeout(() => { dom.window.ytInitialPlayerResponse = player('current-video'); }, 200);
    expect((await settle()).value?.subtitles[0].text).toBe('Current transcript');
    expect(pageFetch.mock.calls.some(([url]) => String(url).includes('v=previous-video'))).toBe(false);
  });

  it('does not publish an old request after the tab changes video during fetch', async () => {
    dom.window.ytInitialPlayerResponse = player('current-video');
    pageFetch.mockImplementation(async url => {
      if (!String(url).includes('source=cached')) return { ok: false, status: 503 };
      dom.reconfigure({ url: 'https://www.youtube.com/watch?v=replacement-video' });
      return { ok: true, text: async () => transcript };
    });
    expect((await settle()).error).toBeInstanceOf(Error);
    expect(messages.some(message => message.result)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractVimeoSubtitles } from '../../scripts/extraction/video-subtitles.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
let dom, fetchTrack;
const cue = text => [{ startTime: 1, endTime: 3, text }];
beforeEach(() => {
  dom = new JSDOM('<h1>Sample video</h1><video></video>', { url: 'https://vimeo.com/12345', runScripts: 'outside-only' });
  fetchTrack = vi.fn(async url => ({ ok: true, text: async () => `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n${url.includes('preferred') ? 'Preferred caption' : 'Fallback caption'}\n` }));
  dom.window.fetch = fetchTrack;
  vi.stubGlobal('chrome', { scripting: { executeScript: vi.fn(async ({ func, args }) => [{
    documentId: 'video-document', result: await dom.window.eval(`(${func.toString()})(...${JSON.stringify(args)})`)
  }]) } });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('Vimeo caption language preference', () => {
  it('reads captions published in the embedded player configuration', async () => {
    dom.window.vimeoPlayerConfig = { request: {} };
    dom.window.playerConfig = { request: { text_tracks: [
      { kind: 'captions', lang: 'en-x-autogen', url: 'https://example.org/fallback.vtt' },
      { kind: 'subtitles', lang: 'fr', url: 'https://example.org/preferred.vtt' }
    ] } };

    expect((await extractVimeoSubtitles(7, 'fr')).subtitles).toEqual([{ start: 1, duration: 2, text: 'Preferred caption' }]);
    expect(fetchTrack).toHaveBeenCalledOnce();
  });

  it('reads a populated declaration when the same player config starts with an empty track list', async () => {
    dom.window.playerConfig = { video: { textTracks: [] }, request: { text_tracks: [
      { kind: 'subtitles', lang: 'fr', url: 'https://example.org/preferred.vtt' }
    ] } };

    expect((await extractVimeoSubtitles(7, 'fr')).subtitles[0].text).toBe('Preferred caption');
    expect(fetchTrack).toHaveBeenCalledOnce();
  });

  it('reads the declared public CDN WebVTT with extension permissions and no credentials', async () => {
    const url = 'https://captions.vimeo.com/example.vtt';
    dom.window.playerConfig = { request: { text_tracks: [{ kind: 'captions', lang: 'en', url }] } };
    dom.window.player = { textTracks: [{ kind: 'captions', language: 'en', mode: 'showing', cues: cue('Loaded caption') }] };
    const extensionFetch = vi.fn(async () => new Response('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nPublished caption\n', {
      headers: { 'Content-Type': 'text/vtt; charset=utf-8' }
    }));
    vi.stubGlobal('fetch', extensionFetch);

    expect((await extractVimeoSubtitles(7)).subtitles).toEqual([{ start: 1, duration: 2, text: 'Published caption' }]);
    expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({
      target: {tabId: 7, documentIds: ['video-document']}
    }));
    expect(fetchTrack).not.toHaveBeenCalled();
    expect(extensionFetch).toHaveBeenCalledExactlyOnceWith(url, expect.objectContaining({ credentials: 'omit', redirect: 'error' }));
  });

  it.each(['unavailable', 'empty'])('uses loaded captions if the declared CDN track is %s', async failure => {
    const url = 'https://captions.vimeo.com/preferred.vtt';
    dom.window.playerConfig = { request: { text_tracks: [{ kind: 'subtitles', lang: 'fr', url }] } };
    dom.window.player = { textTracks: [
      { kind: 'subtitles', language: 'fr', mode: 'showing', cues: cue('Loaded caption') }
    ] };
    const extensionFetch = vi.fn(async () => new Response('WEBVTT\n\n', {
      status: failure === 'unavailable' ? 404 : 200,
      headers: { 'Content-Type': 'text/vtt' }
    }));
    vi.stubGlobal('fetch', extensionFetch);

    expect((await extractVimeoSubtitles(7, 'fr')).subtitles).toEqual([{ start: 1, duration: 2, text: 'Loaded caption' }]);
    expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({
      target: {tabId: 7, documentIds: ['video-document']}
    }));
    expect(extensionFetch).toHaveBeenCalledOnce();
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it('ignores a late caption response after its owner is cancelled', async () => {
    const url = 'https://captions.vimeo.com/late.vtt';
    dom.window.playerConfig = { request: { text_tracks: [{ kind: 'captions', lang: 'en', url }] } };
    let deliver;
    let begin;
    const requested = new Promise(resolve => { begin = resolve; });
    const extensionFetch = vi.fn((_url, { signal }) => new Promise(resolve => { deliver = resolve; begin(signal); }));
    vi.stubGlobal('fetch', extensionFetch);

    const controller = new AbortController();
    const reason = new DOMException('Cancelled', 'AbortError');
    const extraction = extractVimeoSubtitles(7, 'auto', controller.signal);
    const rejected = expect(extraction).rejects.toBe(reason);
    const requestSignal = await requested;
    controller.abort(reason);
    await rejected;
    expect(requestSignal.aborted).toBe(true);
    deliver(new Response('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nLate caption', {
      headers: { 'Content-Type': 'text/vtt' }
    }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
    expect(extensionFetch).toHaveBeenCalledOnce();
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it.each(['config', 'state'])('selects the requested language from %s instead of an earlier manual track', async source => {
    const video = { textTracks: [
      { kind: 'captions', language: 'en', auto: false, src: 'https://example.org/fallback.vtt' },
      { kind: 'captions', language: 'fr', auto: true, src: 'https://example.org/preferred.vtt' }
    ] };
    if (source === 'config') dom.window.vimeoPlayerConfig = { video };
    else dom.window.__INITIAL_STATE__ = { video };
    expect((await extractVimeoSubtitles(7, 'fr')).subtitles).toEqual([{ start: 1, duration: 2, text: 'Preferred caption' }]);
    expect(fetchTrack).toHaveBeenCalledOnce();
    expect(fetchTrack).toHaveBeenCalledWith('https://example.org/preferred.vtt', expect.objectContaining({ signal: expect.anything() }));
  });

  it.each([['ua', 'uk'], ['pt-BR', 'pt'], ['fr', 'fr-CA']])('matches %s to the available %s caption locale', async (target, available) => {
    dom.window.vimeoPlayerConfig = { video: { textTracks: [
      { kind: 'captions', language: 'en', src: 'https://example.org/fallback.vtt' },
      { kind: 'captions', language: available, src: 'https://example.org/preferred.vtt' }
    ] } };
    expect((await extractVimeoSubtitles(7, target)).subtitles[0].text).toBe('Preferred caption');
  });

  it.each(['player', 'video'])('selects preferred %s cues while keeping timing', async source => {
    const tracks = [
      { kind: 'subtitles', language: 'en', mode: 'showing', cues: cue('Fallback caption') },
      { kind: 'subtitles', language: 'fr', mode: 'hidden', cues: cue('Preferred caption') }
    ];
    if (source === 'player') dom.window.player = { textTracks: tracks };
    else Object.defineProperty(dom.window.document.querySelector('video'), 'textTracks', { value: tracks });
    expect((await extractVimeoSubtitles(7, 'fr')).subtitles).toEqual([{ start: 1, duration: 2, text: 'Preferred caption' }]);
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it('uses the next loaded player track when the preferred language has no cues', async () => {
    dom.window.player = { textTracks: [
      { kind: 'subtitles', language: 'fr', mode: 'hidden', cues: [] },
      { kind: 'subtitles', language: 'en', mode: 'showing', cues: cue('Fallback caption') }
    ] };

    expect((await extractVimeoSubtitles(7, 'fr')).subtitles[0].text).toBe('Fallback caption');
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it.each(['auto', 'de'])('preserves manual fallback when preference is %s', async target => {
    dom.window.vimeoPlayerConfig = { video: { textTracks: [
      { kind: 'captions', language: 'fr', auto: true, src: 'https://example.org/automatic.vtt' },
      { kind: 'captions', language: 'en', auto: false, src: 'https://example.org/fallback.vtt' }
    ] } };
    expect((await extractVimeoSubtitles(7, target)).subtitles[0].text).toBe('Fallback caption');
    expect(fetchTrack).toHaveBeenCalledOnce();
  });

  it.each(['auto', 'de'])('preserves the showing player track when preference is %s', async target => {
    dom.window.player = { textTracks: [
      { kind: 'subtitles', language: 'fr', mode: 'hidden', cues: cue('Other caption') },
      { kind: 'subtitles', language: 'en', mode: 'showing', cues: cue('Fallback caption') }
    ] };
    expect((await extractVimeoSubtitles(7, target)).subtitles[0].text).toBe('Fallback caption');
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it('reads preferred native cues without leaving the matching track enabled', async () => {
    let mode = 'disabled';
    const preferred = { kind: 'subtitles', language: 'fr',
      get mode() { return mode; }, set mode(value) { mode = value; },
      get cues() { return mode === 'disabled' ? null : cue('Preferred caption'); } };
    Object.defineProperty(dom.window.document.querySelector('video'), 'textTracks', { value: [
      { kind: 'subtitles', language: 'en', mode: 'showing', cues: cue('Fallback caption') }, preferred
    ] });
    expect((await extractVimeoSubtitles(7, 'fr')).subtitles[0].text).toBe('Preferred caption');
    expect(mode).toBe('disabled');
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it('prefers an exact regional match over the first base-language track', async () => {
    dom.window.vimeoPlayerConfig = { video: { textTracks: [
      { kind: 'captions', language: 'pt-PT', src: 'https://example.org/fallback.vtt' },
      { kind: 'captions', language: 'pt-BR', src: 'https://example.org/preferred.vtt' }
    ] } };
    expect((await extractVimeoSubtitles(7, 'pt-BR')).subtitles[0].text).toBe('Preferred caption');
  });
});

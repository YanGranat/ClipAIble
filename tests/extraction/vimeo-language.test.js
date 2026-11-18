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
  vi.stubGlobal('chrome', { scripting: { executeScript: vi.fn(async ({ func, args }) => [{ result: await dom.window.eval(`(${func.toString()})(...${JSON.stringify(args)})`) }]) } });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('Vimeo caption language preference', () => {
  it.each(['config', 'state'])('selects the requested language from %s instead of an earlier manual track', async source => {
    const video = { textTracks: [
      { kind: 'captions', language: 'en', auto: false, src: 'https://example.org/fallback.vtt' },
      { kind: 'captions', language: 'fr', auto: true, src: 'https://example.org/preferred.vtt' }
    ] };
    if (source === 'config') dom.window.vimeoPlayerConfig = { video };
    else dom.window.__INITIAL_STATE__ = { video };
    expect((await extractVimeoSubtitles(7, 'fr')).subtitles).toEqual([{ start: 1, duration: 2, text: 'Preferred caption' }]);
    expect(fetchTrack).toHaveBeenCalledOnce();
    expect(fetchTrack).toHaveBeenCalledWith('https://example.org/preferred.vtt');
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

  it('loads preferred native cues when the matching track was disabled', async () => {
    let mode = 'disabled';
    const preferred = { kind: 'subtitles', language: 'fr',
      get mode() { return mode; }, set mode(value) { mode = value; },
      get cues() { return mode === 'showing' ? cue('Preferred caption') : null; } };
    Object.defineProperty(dom.window.document.querySelector('video'), 'textTracks', { value: [
      { kind: 'subtitles', language: 'en', mode: 'showing', cues: cue('Fallback caption') }, preferred
    ] });
    dom.window.setTimeout = callback => { callback(); return 0; };
    expect((await extractVimeoSubtitles(7, 'fr')).subtitles[0].text).toBe('Preferred caption');
    expect(mode).toBe('showing');
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractVimeoSubtitles } from '../../scripts/extraction/video-subtitles.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));

let dom;
let fetchTrack;

beforeEach(() => {
  dom = new JSDOM('<h1>Sample video</h1>', { url: 'https://vimeo.com/12345', runScripts: 'outside-only' });
  fetchTrack = vi.fn();
  dom.window.fetch = fetchTrack;
  dom.window.vimeoPlayerConfig = { video: { textTracks: [{ kind: 'captions', src: 'https://example.com/captions.vtt' }] } };
  vi.spyOn(dom.window.console, 'error').mockImplementation(() => {});
  vi.stubGlobal('chrome', { scripting: { executeScript: vi.fn(async ({ func, args }) => {
    const result = await dom.window.eval(`(${func.toString()})(...${JSON.stringify(args)})`);
    return [{ result }];
  }) } });
});

afterEach(() => { dom.window.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function track(text) {
  fetchTrack.mockResolvedValue({ ok: true, text: async () => text });
  return extractVimeoSubtitles(7);
}

describe('Vimeo MAIN-world subtitle extraction', () => {
  it('executes the serialized production function and keeps cue text and timing', async () => {
    const result = await track('WEBVTT\n\n00:00:01.250 --> 00:00:03.500 align:start\n<v Narrator>First line\n<b>Second line</b>\n');
    expect(result.subtitles).toEqual([{ start: 1.25, duration: 2.25, text: 'First line Second line' }]);
    expect(result.metadata.title).toBe('Sample video');
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 }, world: 'MAIN' }));
  });

  it('supports minute timestamps, CRLF, a byte-order mark, and cue settings', async () => {
    const result = await track('\uFEFFWEBVTT\r\n\r\nintro\r\n00:01.250 --> 00:03.500 position:10%\r\nA short caption.\r\n');
    expect(result.subtitles).toEqual([{ start: 1.25, duration: 2.25, text: 'A short caption.' }]);
  });

  it('keeps cue identifiers, comments, and style blocks out of subtitle text', async () => {
    const result = await track('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst caption.\n\nNOTE editorial annotation\nThis is a comment.\n\nSTYLE\n::cue { color: lime; }\n\nREGION\nid:example\n\nsecond-cue\n00:00:03.000 --> 00:00:04.000\nSecond caption.\n');
    expect(result.subtitles).toEqual([
      { start: 1, duration: 1, text: 'First caption.' },
      { start: 3, duration: 1, text: 'Second caption.' }
    ]);
  });

  it('skips invalid timestamps and non-positive cue durations', async () => {
    const result = await track('WEBVTT\n\n00:00:03.000 --> 00:00:02.000\nBackwards.\n\n00:61:00.000 --> 00:62:00.000\nInvalid minutes.\n\n00:00:02.000 --> 00:00:02.000\nEmpty interval.\n\n00:00:04.000 --> 00:00:05.000\nValid caption.\n');
    expect(result.subtitles).toEqual([{ start: 4, duration: 1, text: 'Valid caption.' }]);
  });

  it('accepts an hours component with more than two digits', async () => {
    const result = await track('WEBVTT\n\n100:00:01.000 --> 100:00:02.500\nA late caption.\n');
    expect(result.subtitles).toEqual([{ start: 360001, duration: 1.5, text: 'A late caption.' }]);
  });

  it('accepts cue identifiers that also name metadata blocks', async () => {
    const result = await track('WEBVTT\n\nSTYLE\n00:00:01.000 --> 00:00:02.000\nFirst caption.\n\nREGION\n00:00:03.000 --> 00:00:04.000\nSecond caption.\n\nNOTE\n00:00:05.000 --> 00:00:06.000\nThird caption.\n\nWEBVTT\n00:00:07.000 --> 00:00:08.000\nFourth caption.\n');
    expect(result.subtitles.map(cue => cue.text)).toEqual(['First caption.', 'Second caption.', 'Third caption.', 'Fourth caption.']);
  });

  it('preserves the manual-track preference', async () => {
    dom.window.vimeoPlayerConfig.video.textTracks = [
      { kind: 'captions', auto: true, src: 'https://example.com/automatic.vtt' },
      { kind: 'captions', auto: false, src: 'https://example.com/manual.vtt' }
    ];
    await track('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA caption.\n');
    expect(fetchTrack).toHaveBeenCalledOnce();
    expect(fetchTrack).toHaveBeenCalledWith('https://example.com/manual.vtt');
  });

  it('continues to the player cue fallback when a track fetch fails', async () => {
    fetchTrack.mockRejectedValue(new Error('Track unavailable'));
    dom.window.player = { textTracks: [{ kind: 'subtitles', mode: 'showing', cues: [{ startTime: 1, endTime: 3, text: 'Player caption.' }] }] };
    expect((await extractVimeoSubtitles(7)).subtitles).toEqual([{ start: 1, duration: 2, text: 'Player caption.' }]);
  });

  it('preserves the original failure when metadata access throws in MAIN world', async () => {
    Object.defineProperty(dom.window.document, 'title', { get: () => { throw new Error('Metadata unavailable'); } });
    await expect(extractVimeoSubtitles(7)).rejects.toThrow('Metadata unavailable');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ youtube: vi.fn(), vimeo: vi.fn(), detect: vi.fn(), process: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: vi.fn(), updateProgress: vi.fn(), getUILanguageCached: async () => 'en',
  getAIRequestOptions: data => data.signal ? { signal: data.signal } : {}
}));
vi.mock('../../scripts/state/processing.js', async importOriginal => ({ ...await importOriginal(), getScopedUpdateState: () => vi.fn() }));
vi.mock('../../scripts/extraction/video-subtitles.js', () => ({ extractYouTubeSubtitles: deps.youtube, extractVimeoSubtitles: deps.vimeo }));
vi.mock('../../scripts/extraction/video-processor.js', () => ({ processSubtitlesWithAI: deps.process }));
vi.mock('../../scripts/translation/detection.js', () => ({ detectContentLanguage: deps.detect, detectSourceLanguage: () => 'en' }));
import { processVideoPage } from '../../scripts/processing/video.js';

describe('Video caption language selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.scripting.executeScript.mockResolvedValue([{ result: { title: 'Sample video', description: '' } }]);
    deps.detect.mockResolvedValue('de');
    const result = { subtitles: [{ text: 'Sample transcript' }], metadata: { title: 'Sample video' } };
    deps.youtube.mockResolvedValue(result);
    deps.vimeo.mockResolvedValue(result);
    deps.process.mockResolvedValue([{ type: 'paragraph', text: 'Sample transcript' }]);
  });

  it('passes the selected target and detected source languages to YouTube', async () => {
    await processVideoPage({ language: 'fr', tabId: 7, model: 'sample-model', apiKey: 'placeholder' }, { platform: 'youtube', videoId: 'sample-video' });
    expect(deps.youtube).toHaveBeenCalledWith(7, 'fr', 'de');
  });

  it('passes the selected target to Vimeo without sending video metadata for unused source-language inference', async () => {
    const signal = new AbortController().signal;
    await processVideoPage({ language: 'ua', tabId: 7, model: 'sample-model', apiKey: 'placeholder', signal }, { platform: 'vimeo', videoId: 'sample-video' });
    expect(deps.vimeo).toHaveBeenCalledWith(7, 'uk', signal);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(deps.detect).not.toHaveBeenCalled();
    expect(deps.process).toHaveBeenCalledTimes(1);
  });

  it('preserves cancellation when a Vimeo caption request is interrupted', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Cancelled', 'AbortError');
    deps.vimeo.mockImplementationOnce(async () => { controller.abort(reason); throw reason; });
    await expect(processVideoPage({ tabId: 7, apiKey: 'placeholder', signal: controller.signal }, { platform: 'vimeo', videoId: 'sample-video' }))
      .rejects.toBe(reason);
    expect(deps.process).not.toHaveBeenCalled();
  });

  it('takes the YouTube metadata snapshot even when a resource parks the load event', async () => {
    const win = { addEventListener: vi.fn() };
    const doc = { title: 'YouTube', readyState: 'interactive', querySelector: selector =>
      selector === '#description yt-formatted-string' ? { textContent: 'An independently observed demonstration.' } : null };
    let captured;
    chrome.scripting.executeScript.mockImplementationOnce(async ({ func, args }) => {
      // Evaluate the actual serialized function without waiting for a load event.
      captured = Function('document', 'window', 'args', `return (${func.toString()})(...args);`)(doc, win, args || []);
      return [{ result: captured instanceof Promise ? null : captured }];
    });
    await processVideoPage({ tabId: 7, title: 'Captured video title', model: 'sample-model', apiKey: 'placeholder' },
      { platform: 'youtube', videoId: 'sample-video' });
    expect(captured).toEqual({ title: 'Captured video title', description: 'An independently observed demonstration.' });
    expect(win.addEventListener).not.toHaveBeenCalled();
    expect(deps.detect).toHaveBeenCalledWith([{ type: 'text', text: 'Captured video title\nAn independently observed demonstration.' }],
      'placeholder', 'sample-model', {});
    expect(deps.youtube).toHaveBeenCalledWith(7, 'auto', 'de');
  });

  it('normalizes the supported Ukrainian locale for caption tracks', async () => {
    deps.detect.mockResolvedValue('ua');
    await processVideoPage({ language: 'ua', tabId: 7, apiKey: 'placeholder' }, { platform: 'youtube', videoId: 'sample-video' });
    expect(deps.youtube).toHaveBeenCalledWith(7, 'uk', 'uk');
  });

  it('keeps automatic caption selection when no translation is requested', async () => {
    await processVideoPage({ language: 'auto', tabId: 7, apiKey: 'placeholder' }, { platform: 'youtube', videoId: 'sample-video' });
    expect(deps.youtube).toHaveBeenCalledWith(7, 'auto', 'de');
  });

  it('leaves the audio language unknown when the early metadata snapshot contains no title', async () => {
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { title: '', description: '' } }]);
    await processVideoPage({ language: 'auto', tabId: 7, apiKey: 'placeholder' }, { platform: 'youtube', videoId: 'sample-video' });
    expect(deps.detect).not.toHaveBeenCalled();
    expect(deps.youtube).toHaveBeenCalledWith(7, 'auto', 'unknown');
  });

  it('keeps missing subtitles independent from missing provider credentials', async () => {
    deps.youtube.mockResolvedValueOnce({ subtitles: [], metadata: {} });
    const source = { platform: 'youtube', videoId: 'sample-video' };
    await expect(processVideoPage({ tabId: 7 }, source)).rejects.toMatchObject({
      code: 'validation_error', translationKey: 'errorNoSubtitles'
    });
    await expect(processVideoPage({ tabId: 7 }, source)).rejects.toMatchObject({
      code: 'auth_error', translationKey: 'errorNoApiKey'
    });
    expect(deps.process).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth_error', 'errorApiKeyInvalid'],
    [403, 'auth_error', 'errorApiAccessForbidden'],
    [429, 'rate_limit', 'errorRateLimit']
  ])('retains the provider error identity for HTTP %s after subtitles were found', async (status, code, translationKey) => {
    const cause = Object.assign(new Error('Provider declined the request.'), { status });
    deps.process.mockRejectedValueOnce(cause);
    await expect(processVideoPage({ tabId: 7, apiKey: 'placeholder' }, { platform: 'youtube', videoId: 'sample-video' }))
      .rejects.toMatchObject({ cause, code, translationKey });
  });

  it('reports malformed provider output as a response error after subtitles were found', async () => {
    const cause = new SyntaxError('Unexpected token in JSON response.');
    deps.process.mockRejectedValueOnce(cause);
    await expect(processVideoPage({ tabId: 7, apiKey: 'placeholder' }, { platform: 'youtube', videoId: 'sample-video' }))
      .rejects.toMatchObject({ cause, code: 'parse_error', translationKey: 'errorFailedToParseResponse' });
  });
});

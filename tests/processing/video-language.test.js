import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ youtube: vi.fn(), vimeo: vi.fn(), detect: vi.fn(), process: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: vi.fn(), updateProgress: vi.fn(), getUILanguageCached: async () => 'en', getAIRequestOptions: () => ({})
}));
vi.mock('../../scripts/state/processing.js', () => ({ PROCESSING_STAGES: { EXTRACTING: 'extracting' }, getScopedUpdateState: () => vi.fn() }));
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

  it.each(['youtube', 'vimeo'])('passes the selected target language to %s', async platform => {
    await processVideoPage({ language: 'fr', tabId: 7, model: 'sample-model', apiKey: 'placeholder' }, { platform, videoId: 'sample-video' });
    expect(deps[platform]).toHaveBeenCalledWith(7, 'fr', 'de');
  });

  it('normalizes the supported Ukrainian locale for caption tracks', async () => {
    deps.detect.mockResolvedValue('ua');
    await processVideoPage({ language: 'ua', tabId: 7 }, { platform: 'youtube', videoId: 'sample-video' });
    expect(deps.youtube).toHaveBeenCalledWith(7, 'uk', 'uk');
  });

  it('keeps automatic caption selection when no translation is requested', async () => {
    await processVideoPage({ language: 'auto', tabId: 7 }, { platform: 'youtube', videoId: 'sample-video' });
    expect(deps.youtube).toHaveBeenCalledWith(7, 'auto', 'de');
  });
});

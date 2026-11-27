import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateImages } from '../../scripts/translation/images.js';
import { decryptApiKey } from '../../scripts/utils/encryption.js';
import { handleTranslation } from '../../scripts/utils/processing/pipeline-helpers.js';

vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: vi.fn(async key => key === 'ENC:fixture-router' ? 'fixture-router-key' : key) }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: vi.fn(async () => ({})) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ checkCancellation: vi.fn(async () => {}) }));

const original = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGOQUNBYtXEHA4QCAB0DBOeTusFWAAAAAElFTkSuQmCC';
const edited = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGOw8YjSNrFlgFAAFSAC9eX0/AUAAAAASUVORK5CYII=';
const dataUrl = encoded => `data:image/png;base64,${encoded}`;
const source = () => [{ type: 'paragraph', text: 'Recorded readings' }, { type: 'image', src: dataUrl(original), caption: 'Cycle results' }];
const response = answer => Response.json({ choices: [{ finish_reason: 'stop', message: { content: answer } }] });
const options = () => ({
  provider: 'deepseek', imageTranslationProvider: 'openrouter', imageApiKey: 'ENC:fixture-router',
  openrouterImageModel: 'openai/gpt-image-2.6-flare', outputFormat: 'pdf', checkCancelled: async () => {}
});
const run = (items, opts = options(), status) => translateImages(items, 'en', 'fr', 'separate-text-key', 'no-google-use', 'deepseek-v4-pro', status, opts);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close() {} })));
  vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('/images') ? Response.json({ data: [{ b64_json: edited }] }) : response('yes')));
});
afterEach(() => vi.unstubAllGlobals());

describe('OpenRouter image routing in documents', () => {
  it('uses the independent OpenRouter key, read-only detector, then selected editor without using the article provider', async () => {
    const items = source();
    expect(await run(items)).toBe(items);
    expect(items[1]).toEqual({ type: 'image', caption: 'Cycle results', src: dataUrl(edited), translated: true });
    expect(decryptApiKey).toHaveBeenCalledExactlyOnceWith('ENC:fixture-router');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://openrouter.ai/api/v1/chat/completions', 'https://openrouter.ai/api/v1/images'
    ]);
    for (const [, request] of fetch.mock.calls) expect(request.headers.Authorization).toBe('Bearer fixture-router-key');
    const [detection, edit] = fetch.mock.calls.map(([, request]) => JSON.parse(request.body));
    expect(detection).toMatchObject({ model: 'google/gemini-3.1-flash-lite', max_tokens: 32, reasoning: { enabled: false } });
    expect(detection.messages[0].content[1].image_url.url).toBe(dataUrl(original));
    expect(edit.model).toBe('openai/gpt-image-2.6-flare');
    expect(edit.input_references[0].image_url.url).toBe(dataUrl(original));
  });

  it('does not edit images that the detector reports do not need translation', async () => {
    fetch.mockResolvedValueOnce(response('no'));
    const status = vi.fn();
    expect(await run(source(), options(), status)).toEqual(source());
    expect(fetch).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(status.mock.calls.some(([update]) => update.imageTranslationFailureCount)).toBe(false);
  });

  it.each([undefined, '', '****known', 'ENC:unreadable'])('does not use an unrelated provider credential when the OpenRouter key is unavailable', async imageApiKey => {
    await expect(run(source(), { ...options(), imageApiKey })).rejects.toMatchObject({
      translationKey: 'errorImageKeyRequired', translationParams: { provider: 'OpenRouter' }
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains original content after a billed response with no image and records the failure without retrying', async () => {
    const status = vi.fn();
    fetch.mockResolvedValueOnce(response('yes')).mockResolvedValueOnce(Response.json({ data: [{ revised_prompt: 'No image' }] }));
    expect(await run(source(), options(), status)).toEqual(source());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenLastCalledWith({ imageTranslationFailureCount: 1 });
  });

  it('avoids both OpenRouter calls for an unsupported image transport', async () => {
    const input = [{ type: 'image', src: 'data:image/svg+xml;base64,PHN2Zy8+' }];
    expect(await run(input)).toEqual([{ type: 'image', src: 'data:image/svg+xml;base64,PHN2Zy8+' }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['markdown', 'audio'])('does not use an editor for the %s format', async outputFormat => {
    expect(await run(source(), { ...options(), outputFormat })).toEqual(source());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes the image model and provider credential separately through the document translation stage', async () => {
    const opts = options();
    const images = vi.fn(async content => content);
    const text = vi.fn(async content => ({ content }));
    const content = source();
    await handleTranslation({ ...opts, language: 'fr', translateImages: true, apiKey: 'separate-text-key', model: 'deepseek-v4-pro' },
      { content, detectedLanguage: 'en' }, text, images, () => 'en', vi.fn());
    expect(images).toHaveBeenCalledWith(content, 'en', 'fr', 'separate-text-key', undefined, 'deepseek-v4-pro', expect.any(Function),
      expect.objectContaining({ imageTranslationProvider: 'openrouter', openrouterImageModel: opts.openrouterImageModel, imageApiKey: opts.imageApiKey }));
  });
});

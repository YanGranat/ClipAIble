import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateImageWithOpenRouter } from '../../scripts/api/openrouter-images.js';
import { createImageTranslationPrompt } from '../../scripts/api/image-data.js';
import {
  DEFAULT_OPENROUTER_IMAGE_MODEL, OPENROUTER_IMAGE_MODELS, getImageTranslationApiKey,
  getImageTranslationModel, isOpenRouterImageModel, readOpenRouterImageModel
} from '../../scripts/api/image-translation-catalog.js';

vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { API_TIMEOUT_MS: 2000 } }));

const original = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGOQUNBYtXEHA4QCAB0DBOeTusFWAAAAAElFTkSuQmCC';
const edited = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGOw8YjSNrFlgFAAFSAC9eX0/AUAAAAASUVORK5CYII=';
const webp = 'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAIAAUAmJZACdLoAA5gA/vSIh/VcnYnxw/ubHOLZDAAA';
const source = `data:image/png;base64,${original}`;
const answer = (data = edited) => Response.json({ data: [{ b64_json: data }] });
const key = 'synthetic-router-key';
const bitmapClose = vi.fn();
const oversized = () => {
  const bytes = Buffer.from(edited, 'base64');
  bytes.writeUInt32BE(32768, 16);
  return bytes.toString('base64');
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => answer()));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: bitmapClose })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('OpenRouter image editor', () => {
  it('keeps editor models distinct from OpenRouter chat models and does not fall back to a Google credential', () => {
    expect(getImageTranslationModel('openrouter')).toBe(DEFAULT_OPENROUTER_IMAGE_MODEL);
    expect(readOpenRouterImageModel()).toBe(DEFAULT_OPENROUTER_IMAGE_MODEL);
    expect(readOpenRouterImageModel('google/gemini-3-pro-image')).toBe('google/gemini-3-pro-image');
    expect(isOpenRouterImageModel('google/gemini-3.1-flash-lite')).toBe(false);
    expect(isOpenRouterImageModel('constructor')).toBe(false);
    expect(getImageTranslationApiKey({ imageTranslationProvider: 'openrouter', googleApiKey: 'other-provider' })).toBeUndefined();
  });

  it.each(Object.keys(OPENROUTER_IMAGE_MODELS))('edits one existing image using %s via the Images API', async openrouterImageModel => {
    const onRequestStart = vi.fn();
    await expect(translateImageWithOpenRouter(source, 'French', key, { openrouterImageModel, onRequestStart }))
      .resolves.toBe(`data:image/png;base64,${edited}`);
    expect(fetch).toHaveBeenCalledOnce();
    const [endpoint, request] = fetch.mock.calls[0];
    expect(endpoint).toBe('https://openrouter.ai/api/v1/images');
    expect(request).toMatchObject({ method: 'POST', headers: { Authorization: `Bearer ${key}` } });
    const body = JSON.parse(request.body);
    expect(body).toEqual({
      model: openrouterImageModel, prompt: createImageTranslationPrompt('French'), n: 1, response_format: 'b64_json',
      input_references: [{ type: 'image_url', image_url: { url: source } }],
      ...(openrouterImageModel.startsWith('openai/') ? { output_format: 'png', quality: 'medium', aspect_ratio: 'auto' } : {})
    });
    expect(onRequestStart).toHaveBeenCalledOnce();
    expect(createImageBitmap.mock.calls[0][0]).toMatchObject({ type: 'image/png' });
    expect(bitmapClose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the actual output format for an editor that does not expose PNG selection', async () => {
    fetch.mockResolvedValueOnce(answer(webp));
    await expect(translateImageWithOpenRouter(source, 'French', key)).resolves.toBe(`data:image/webp;base64,${webp}`);
    expect(createImageBitmap.mock.calls[0][0]).toMatchObject({ type: 'image/webp' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('output_format');
  });

  it('does not report an unchanged source as a successful edit', async () => {
    fetch.mockResolvedValueOnce(answer(original));
    await expect(translateImageWithOpenRouter(source, 'French', key)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it.each([
    {}, { choices: [{ message: { content: 'I cannot edit this image.' } }] },
    { data: [{ url: 'https://example.test/edited.png' }] }, { data: [{ b64_json: 'invalid!' }] },
    { data: [{ b64_json: edited }, { b64_json: edited }] }, { error: { message: 'a private diagnostic' }, data: [{ b64_json: edited }] },
    { output_format: 'jpeg', data: [{ b64_json: edited }] }, { data: [{ b64_json: oversized() }] }
  ])('accepts only one valid inline raster from the selected editor', async payload => {
    fetch.mockResolvedValueOnce(Response.json(payload));
    await expect(translateImageWithOpenRouter(source, 'French', key)).rejects.toMatchObject({
      message: 'OpenRouter image translation failed', translationKey: 'errorImageTranslationFailed', retryable: false
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects returned bytes that the browser cannot decode', async () => {
    createImageBitmap.mockRejectedValueOnce(new Error('private decoder diagnostic'));
    const error = await translateImageWithOpenRouter(source, 'French', key).catch(error => error);
    expect(error).toMatchObject({ message: 'OpenRouter image translation failed', retryable: false });
    expect(error).not.toHaveProperty('cause');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 429, 502, 503])('does not retry an edit or expose a provider payload on HTTP %s', async status => {
    fetch.mockResolvedValueOnce(Response.json({ error: { message: 'a private diagnostic' } }, { status }));
    const error = await translateImageWithOpenRouter(source, 'French', key).catch(error => error);
    expect(error).toMatchObject({ status, message: 'OpenRouter image translation failed', retryable: false });
    expect(error).not.toHaveProperty('response');
    expect(error).not.toHaveProperty('cause');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects an unsupported model or MIME type without a provider request', async () => {
    await expect(translateImageWithOpenRouter(source, 'French', key, { openrouterImageModel: 'google/gemini-3.1-flash-lite' })).rejects.toThrow();
    await expect(translateImageWithOpenRouter(source.replace('image/png', 'image/svg+xml'), 'French', key)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aborts a parked response body and preserves cancellation identity', async () => {
    const owner = new AbortController(), reason = new Error('The export was cancelled');
    const body = new ReadableStream();
    fetch.mockResolvedValueOnce(new Response(body));
    const pending = translateImageWithOpenRouter(source, 'French', key, { signal: owner.signal });
    const rejected = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    owner.abort(reason);
    await rejected;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes the decoded bitmap but does not return it to a cancelled export', async () => {
    const owner = new AbortController(), reason = new Error('The export was cancelled');
    createImageBitmap.mockImplementationOnce(async () => { owner.abort(reason); return { close: bitmapClose }; });
    await expect(translateImageWithOpenRouter(source, 'French', key, { signal: owner.signal })).rejects.toBe(reason);
    expect(bitmapClose).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateImageWithOpenAI } from '../../scripts/api/openai-images.js';
import { OPENAI_IMAGE_TRANSLATION_MODEL } from '../../scripts/api/image-translation-catalog.js';
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { API_TIMEOUT_MS: 2000 } }));

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPUCKhgYGBgYgADAAsaAPSWyA61AAAAAElFTkSuQmCC';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiKKKK9g8s/9k=';
const WEBP = 'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAIAAUAmJZACdLoAA5gA/vSIh/VcnYnxw/ubHOLZDAAA';
const image = (mime = 'png', value = PNG) => `data:image/${mime};base64,${value}`;
const response = (value = PNG) => new Response(JSON.stringify({ data: [{ b64_json: value }], output_format: 'png' }), { headers: { 'Content-Type': 'application/json' } });
const mutatePng = change => { const bytes = Buffer.from(PNG, 'base64'); change(bytes); return bytes.toString('base64'); };
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(async () => response())); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('OpenAI image text translation', () => {
  it('sends one edit with the supplied image, target language and credential', async () => {
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).resolves.toBe(image());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(request).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-key' } });
    const body = JSON.parse(request.body);
    expect(body).toEqual({ model: OPENAI_IMAGE_TRANSLATION_MODEL, prompt: expect.any(String), images: [{ image_url: image() }], n: 1, output_format: 'png', size: 'auto', quality: 'medium', complexity: 'medium' });
    expect(OPENAI_IMAGE_TRANSLATION_MODEL).toBe('gpt-image-2.6-sunburst');
    expect(body.prompt).toContain('"French"');
    for (const contract of ['readable text', 'layout', 'aspect ratio', 'colors', 'arrows', 'formulas', 'numbers', 'credits', 'background', 'established technical terminology', 'without adding gradients or texture', 'Make no other changes']) expect(body.prompt).toContain(contract);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([['png', PNG], ['jpeg', JPEG], ['webp', WEBP]])('retains an accepted %s input MIME type', async (mime, value) => {
    const source = image(mime, value);
    await expect(translateImageWithOpenAI(source, 'Japanese', 'synthetic-key')).resolves.toBe(image());
    expect(JSON.parse(fetch.mock.calls[0][1].body).images).toEqual([{ image_url: source }]);
  });

  it.each([null, '', PNG, 'https://example.org/image.png', image('svg+xml'), image('gif'), image('png', '!!!!'), image('png', PNG.slice(0, -1)), image('png', PNG + '\n'), image('jpeg', PNG), image('webp', PNG)])('rejects malformed or unsupported input before sending HTTP: %s', async source => {
    await expect(translateImageWithOpenAI(source, 'German', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed', retryable: false });
    expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([['', 'synthetic-key'], ['French', ''], [null, 'synthetic-key']])('requires a target language and API credential', async (language, key) => {
    await expect(translateImageWithOpenAI(image(), language, key)).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500, 503])('returns a safe typed HTTP %s error without retrying or retaining the service body', async status => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'synthetic-secret-echo' } }), { status }));
    const error = await translateImageWithOpenAI(image(), 'French', 'synthetic-key').catch(error => error);
    expect(error).toMatchObject({ status, translationKey: 'errorImageTranslationFailed', translationParams: {}, retryable: false });
    expect(JSON.stringify({ ...error, message: error.message, stack: error.stack })).not.toContain('synthetic-secret-echo');
    expect(error).not.toHaveProperty('response'); expect(error).not.toHaveProperty('cause');
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{}, { data: [] }, { data: [{ b64_json: PNG }, { b64_json: PNG }] }, { data: [{ url: 'https://example.org/image.png' }] }, { data: [{ b64_json: JPEG }] }, { data: [{ b64_json: PNG }], output_format: 'jpeg' }])('rejects missing, multiple or mismatched output images', async payload => {
    fetch.mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed' });
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['!!!!', PNG.slice(0, -1), Buffer.from(PNG, 'base64').subarray(0, 30).toString('base64'), Buffer.from(PNG, 'base64').subarray(0, -5).toString('base64'), mutatePng(bytes => bytes.writeUInt32BE(0, 16)), mutatePng(bytes => bytes.writeUInt32BE(0x80000000, 20)), mutatePng(bytes => bytes[0] = 0), mutatePng(bytes => bytes.writeUInt32BE(0xffffffff, 8))])('rejects invalid or truncated returned PNG data', async value => {
    fetch.mockResolvedValue(response(value));
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed', retryable: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not retain raw invalid JSON or network diagnostics', async () => {
    fetch.mockResolvedValueOnce(new Response('synthetic-secret-echo'));
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).rejects.toMatchObject({ message: 'OpenAI image translation failed' });
    fetch.mockRejectedValueOnce(new TypeError('synthetic-secret-echo'));
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).rejects.toMatchObject({ message: 'OpenAI image translation failed' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('normalizes an empty network rejection into a typed failure', async () => {
    fetch.mockRejectedValueOnce(undefined);
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed', retryable: false });
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[32768, 2], [2, 32768], [8192, 4097]])('rejects an output that exceeds the raster export budget: %s x %s', async (width, height) => {
    const value = mutatePng(bytes => { bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); });
    fetch.mockResolvedValue(response(value));
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects cancellation before admission with its original identity', async () => {
    const reason = new Error('Owner cancelled');
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key', { checkCancelled: () => { throw reason; } })).rejects.toBe(reason);
    expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('actively aborts a stalled request when its callback owner is cancelled', async () => {
    const reason = new Error('Owner cancelled'); let cancelled = false, settled = false;
    fetch.mockImplementation(() => new Promise(() => {}));
    const pending = translateImageWithOpenAI(image(), 'French', 'synthetic-key', { checkCancelled: () => { if (cancelled) throw reason; } });
    const rejected = expect(pending).rejects.toBe(reason); pending.catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0); expect(fetch).toHaveBeenCalledOnce();
    cancelled = true; await vi.advanceTimersByTimeAsync(100);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true); expect(settled).toBe(true);
    await rejected; expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates a parent AbortSignal while the response body is stalled', async () => {
    const owner = new AbortController(), reason = new Error('Owner cancelled'); let body, settled = false;
    fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { body = controller; } })));
    const pending = translateImageWithOpenAI(image(), 'French', 'synthetic-key', { signal: owner.signal });
    const rejected = expect(pending).rejects.toBe(reason); pending.catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0); owner.abort(reason); await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await rejected; body.error(reason); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not publish an image after a late cancellation boundary', async () => {
    const reason = new Error('Owner cancelled'); let checks = 0;
    await expect(translateImageWithOpenAI(image(), 'French', 'synthetic-key', { checkCancelled: () => { if (++checks === 6) throw reason; } })).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['headers', 'body'])('enforces the request deadline while %s are stalled without a retry', async phase => {
    let body, settled = false;
    if (phase === 'headers') fetch.mockImplementation(() => new Promise(() => {}));
    else fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { body = controller; } })));
    const pending = translateImageWithOpenAI(image(), 'French', 'synthetic-key');
    const rejected = expect(pending).rejects.toMatchObject({ translationKey: 'errorImageTranslationFailed', retryable: false });
    pending.catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(2000); expect(settled).toBe(true);
    expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await rejected; body?.error(new Error('Stopped')); expect(vi.getTimerCount()).toBe(0);
  });
});

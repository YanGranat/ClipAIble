import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { imageToBase64, embedImages } from '../../scripts/utils/html/images.js';
import { escapeAttr } from '../../scripts/utils/html/html.js';
import { normalizeImageBlob } from '../../scripts/api/image-rasterization.js';
import { getProcessingSignal } from '../../scripts/state/processing.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', formatStatusUpdate: () => ({ status: 'Loading' }) }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { API_TIMEOUT_MS: 1000 } }));
vi.mock('../../scripts/api/image-rasterization.js', () => ({ normalizeImageBlob: vi.fn(async blob => blob) }));
vi.mock('../../scripts/state/processing.js', () => ({ getProcessingSignal: vi.fn(() => new AbortController().signal) }));

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pngBytes = () => Uint8Array.from(atob(png.split(',')[1]), char => char.charCodeAt(0));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); normalizeImageBlob.mockImplementation(async blob => blob); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('validates data images through the same decoder as downloaded images', async () => {
  expect(await imageToBase64(png)).toBe(png);
  expect(normalizeImageBlob).toHaveBeenCalledOnce();
  expect(normalizeImageBlob.mock.calls[0][0].type).toBe('image/png');
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('embeds normalized SVG bytes instead of bypassing the decoder for data URLs', async () => {
  const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
  normalizeImageBlob.mockResolvedValueOnce(new Blob([pngBytes()], { type: 'image/png' }));
  const html = await embedImages(`<img src="${svg}" data-original-src="${svg}">`, [{ type: 'image', src: svg }], null, escapeAttr);
  expect(html).toContain(`src="${png}"`);
  expect(normalizeImageBlob).toHaveBeenCalledOnce();
});

it('rejects typed image validation failures without retaining unsafe input markup', async () => {
  await expect(embedImages('<img src="data:text/html,example">', [{ type: 'image', src: 'data:text/html,example' }], null, escapeAttr)).rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED_TYPE' });
});

it('keeps an ordinary unavailable image as a link without retrying it in the print document', async () => {
  fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
  const source = 'https://example.org/missing.png';
  const html = await embedImages(`<img src="${source}">`, [{ type: 'image', src: source, alt: 'Reference sample' }], null, escapeAttr);
  expect(html).toBe(`<a href="${source}">Reference sample</a>`);
  expect(fetch).toHaveBeenCalledOnce();
  await expect(imageToBase64('data:image/png;base64,invalid!')).rejects.toMatchObject({
    code: 'IMAGE_INVALID_DATA', message: 'The image could not be read.', translationKey: 'errorImageUnavailable'
  });
});

it('does not lose an article when a remote image redirects to an unobservable destination', async () => {
  const source = 'https://example.org/plot.png';
  fetch.mockResolvedValueOnce({ type: 'opaqueredirect' });
  const html = await embedImages(`<figure><img src="${source}" data-original-src="${source}"><figcaption>Control plot</figcaption></figure><p>Independent observations</p>`,
    [{ type: 'image', src: source, alt: 'Observation plot' }], null, escapeAttr);
  expect(html).toBe(`<figure><a href="${source}">Observation plot</a><figcaption>Control plot</figcaption></figure><p>Independent observations</p>`);
  expect(fetch).toHaveBeenCalledOnce();
  expect(normalizeImageBlob).not.toHaveBeenCalled();
});

it.each(['javascript:run()', 'http://127.0.0.1/image.png', 'file:///substackcdn.com/image/fetch/https%3A%2F%2Fexample.org%2Fplot.png'])('rejects an unsafe original URL before any network request %s', async url => {
  await expect(imageToBase64(url)).rejects.toMatchObject({ code: 'IMAGE_UNSAFE_URL' });
  expect(fetch).not.toHaveBeenCalled();
});

it('validates every redirect before following it', async () => {
  fetch.mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
  await expect(imageToBase64('https://example.org/plot')).rejects.toMatchObject({ code: 'IMAGE_UNSAFE_URL' });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'manual' });
});

it('rejects an opaque redirect and an unsafe reported final URL', async () => {
  fetch.mockResolvedValueOnce({ type: 'opaqueredirect' });
  await expect(imageToBase64('https://example.org/plot')).rejects.toMatchObject({ code: 'IMAGE_UNSAFE_REDIRECT' });
  const response = new Response(pngBytes());
  Object.defineProperty(response, 'url', { value: 'http://127.0.0.1/plot' });
  fetch.mockResolvedValueOnce(response);
  await expect(imageToBase64('https://example.org/plot')).rejects.toMatchObject({ code: 'IMAGE_UNSAFE_URL' });
});

it('uses actual image bytes rather than trusting a MIME header', async () => {
  fetch.mockResolvedValueOnce(new Response(pngBytes(), { headers: { 'content-type': 'text/html; title="unexpected"' } }));
  expect(await imageToBase64('https://example.org/plot')).toBe(png);
  expect(normalizeImageBlob.mock.calls[0][0].type).toBe('image/png');
  fetch.mockResolvedValueOnce(new Response('<html>Wrong content</html>', { headers: { 'content-type': 'image/png' } }));
  await expect(imageToBase64('https://example.org/plot')).rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED_TYPE' });
});

it('aborts a pending fetch when the captured processing owner stops', async () => {
  const owner = new AbortController();
  getProcessingSignal.mockReturnValueOnce(owner.signal);
  fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const pending = imageToBase64('https://example.org/plot', { processingRunId: 'synthetic-run' });
  let result;
  pending.then(value => { result = value; }, error => { result = error; });
  const reason = new DOMException('Stopped', 'AbortError');
  owner.abort(reason);
  await vi.advanceTimersByTimeAsync(0);
  expect(result).toBe(reason);
  expect(normalizeImageBlob).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds a pending image fetch by the operation deadline', async () => {
  fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const result = imageToBase64('https://example.org/plot').catch(error => error);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toMatchObject({ code: 'IMAGE_TIMEOUT' });
  expect(vi.getTimerCount()).toBe(0);
});

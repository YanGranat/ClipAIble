import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translateImages } from '../../scripts/translation/images.js';
import { decryptApiKey } from '../../scripts/utils/encryption.js';
import { translateImageWithGemini } from '../../scripts/api/gemini.js';

vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: vi.fn(async key => key === 'ENC:synthetic-image' ? 'synthetic-image-key' : key) }));
vi.mock('../../scripts/api/gemini.js', async original => ({ ...await original(), translateImageWithGemini: vi.fn(async () => 'data:image/png;base64,translated') }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: vi.fn(async () => ({})) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ checkCancellation: vi.fn(async () => {}) }));

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPUCKhgYGBgYgADAAsaAPSWyA61AAAAAElFTkSuQmCC';
const EDITED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGPUTVnAAAZMEIqBgQEAFTsBNZY2IyAAAAAASUVORK5CYII=';
const source = `data:image/png;base64,${PNG}`;
const content = () => [{ type: 'paragraph', text: 'Article text' }, { type: 'image', src: source }];
const options = () => ({ provider: 'deepseek', imageTranslationProvider: 'openai', imageApiKey: 'ENC:synthetic-image', checkCancelled: vi.fn(async () => {}) });
const run = (items, opts, status) => translateImages(items, 'en', 'fr', 'synthetic-article-key', 'synthetic-google-key', 'deepseek-v4-pro', status, opts);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('/images/edits')
    ? new Response(JSON.stringify({ data: [{ b64_json: EDITED_PNG }] }))
    : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'yes' } }] }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('uses the independent OpenAI key and dedicated high-detail classifier with a text-only article provider', async () => {
  const items = content();
  expect(await run(items, options())).toBe(items);
  expect(items[1]).toMatchObject({ src: `data:image/png;base64,${EDITED_PNG}`, translated: true });
  expect(decryptApiKey).toHaveBeenCalledExactlyOnceWith('ENC:synthetic-image');
  expect(fetch).toHaveBeenCalledTimes(2);
  const [detection, edit] = fetch.mock.calls;
  expect(detection[0]).toBe('https://api.openai.com/v1/chat/completions');
  expect(JSON.parse(detection[1].body)).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'none', max_completion_tokens: 16, messages: [{ content: [expect.anything(), { type: 'image_url', image_url: { url: source, detail: 'high' } }] }] });
  expect(edit[0]).toBe('https://api.openai.com/v1/images/edits');
  for (const [, request] of fetch.mock.calls) expect(request.headers.Authorization).toBe('Bearer synthetic-image-key');
  expect(translateImageWithGemini).not.toHaveBeenCalled();
});

it('does not decrypt a plaintext image key or touch the article key', async () => {
  await run(content(), { ...options(), imageApiKey: 'synthetic-image-key' });
  expect(decryptApiKey).not.toHaveBeenCalled();
  for (const [, request] of fetch.mock.calls) expect(request.headers.Authorization).toBe('Bearer synthetic-image-key');
});

it.each([undefined, '', '****abcd'])('rejects an absent or masked OpenAI image key without falling back to another key', async imageApiKey => {
  await expect(run(content(), { ...options(), imageApiKey })).rejects.toMatchObject({ translationKey: 'errorImageKeyRequired', translationParams: { provider: 'OpenAI' } });
  expect(fetch).not.toHaveBeenCalled(); expect(translateImageWithGemini).not.toHaveBeenCalled();
});

it('does not dispatch an encrypted value that failed to decrypt', async () => {
  await expect(run(content(), { ...options(), imageApiKey: 'ENC:unreadable' })).rejects.toMatchObject({ translationKey: 'errorImageKeyRequired' });
  expect(decryptApiKey).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
});

it('keeps the original image and does not retry or switch editors after an edit failure', async () => {
  fetch.mockImplementation(async url => url.endsWith('/images/edits') ? new Response('private service diagnostic', { status: 503 })
    : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'yes' } }] })));
  const items = content();
  expect(await run(items, options())).toEqual(content());
  expect(fetch).toHaveBeenCalledTimes(2); expect(translateImageWithGemini).not.toHaveBeenCalled();
});

it('does not send an edit when the classifier answers no', async () => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'no' } }] })));
  expect(await run(content(), options())).toEqual(content()); expect(fetch).toHaveBeenCalledOnce();
});

it('keeps the original when the bounded classifier response is incomplete', async () => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'yes' } }] })));
  expect(await run(content(), options())).toEqual(content());
  expect(fetch).toHaveBeenCalledOnce();
  expect(translateImageWithGemini).not.toHaveBeenCalled();
});

it('awaits owner cancellation after an edit and before changing any source image', async () => {
  const reason = new Error('Owner cancelled'), opts = options(), items = content(); let cancelled = false;
  opts.checkCancelled = vi.fn(async () => { if (cancelled) throw reason; });
  fetch.mockImplementation(async url => {
    if (url.endsWith('/images/edits')) { cancelled = true; return new Response(JSON.stringify({ data: [{ b64_json: PNG }] })); }
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'yes' } }] }));
  });
  await expect(run(items, opts)).rejects.toBe(reason);
  expect(items).toEqual(content()); expect(fetch).toHaveBeenCalledTimes(2);
});

it('awaits cancellation before any classifier or edit admission', async () => {
  const reason = new Error('Owner cancelled');
  await expect(run(content(), { ...options(), checkCancelled: async () => { throw reason; } })).rejects.toBe(reason);
  expect(fetch).not.toHaveBeenCalled(); expect(decryptApiKey).not.toHaveBeenCalled();
});

it('actively settles a stalled classifier when its asynchronous owner is cancelled', async () => {
  vi.useFakeTimers();
  const reason = new Error('Owner cancelled'), items = content(); let cancelled = false, settled = false;
  fetch.mockImplementation(() => new Promise(() => {}));
  const pending = run(items, { ...options(), checkCancelled: async () => { if (cancelled) throw reason; } });
  const rejected = expect(pending).rejects.toBe(reason); pending.catch(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0); expect(fetch).toHaveBeenCalledOnce();
  cancelled = true; await vi.advanceTimersByTimeAsync(100);
  expect(settled).toBe(true); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await rejected; expect(items).toEqual(content()); expect(vi.getTimerCount()).toBe(0);
});

it('checks cancellation after a localized progress await before publishing status or sending HTTP', async () => {
  const reason = new Error('Owner cancelled'), status = vi.fn(); let checks = 0;
  await expect(run(content(), { ...options(), checkCancelled: async () => { if (++checks === 4) throw reason; } }, status)).rejects.toBe(reason);
  expect(status).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it.each(['markdown', 'audio'])('does not admit paid image work in %s output', async outputFormat => {
  expect(await run(content(), { ...options(), outputFormat })).toEqual(content());
  expect(fetch).not.toHaveBeenCalled(); expect(decryptApiKey).not.toHaveBeenCalled();
});

it('preserves the legacy Gemini editor and article classifier configuration', async () => {
  const items = content();
  await translateImages(items, 'en', 'fr', 'synthetic-article-key', 'synthetic-google-key', 'gpt-6.1-sol', undefined, { provider: 'openai', checkCancelled: async () => {} });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-article-key');
  expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content[1].image_url.detail).toBe('low');
  expect(translateImageWithGemini).toHaveBeenCalledWith(source, 'French', 'synthetic-google-key', expect.any(Object));
  expect(items[1]).toMatchObject({ src: 'data:image/png;base64,translated', translated: true });
});

it('awaits the final owner guard before mutating a Gemini result', async () => {
  const items = content(), reason = new Error('Owner cancelled'); let cancelled = false;
  translateImageWithGemini.mockImplementationOnce(async () => { cancelled = true; return 'data:image/png;base64,translated'; });
  await expect(translateImages(items, 'en', 'fr', 'synthetic-article-key', 'synthetic-google-key', 'gpt-6.1-sol', undefined,
    { provider: 'openai', checkCancelled: async () => { if (cancelled) throw reason; } })).rejects.toBe(reason);
  expect(items).toEqual(content());
});

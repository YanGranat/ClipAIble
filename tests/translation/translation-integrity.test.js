import { afterEach, expect, it, vi } from 'vitest';
import { translateBatch, translateContent, translateText } from '../../scripts/translation/text.js';
import { detectLanguageByCharacters } from '../../scripts/translation/detection.js';
import { CONFIG } from '../../scripts/utils/config.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: async key => key, getDecryptedKeyCached: async key => key }));
vi.mock('../../scripts/locales.js', async original => ({ ...(await original()), getUILanguage: async () => 'ru' }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: () => false, PROCESSING_STAGES: { TRANSLATING: { id: 'translating' } }, updateState: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async (error, options) => ({ message: error.message, code: error.code, context: options?.context || {} }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const options = { provider: 'openai', checkCancelled() {} };
const reply = content => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }));
const batch = () => translateBatch(['First record', 'Second record'], 'French', 'synthetic-key', 'gpt-example', options);

it('rejects a failed requested translation instead of returning the source', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
  await expect(translateText('A complete source paragraph.', 'French', 'synthetic-key', 'gpt-example', options)).rejects.toMatchObject({ status: 400 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['claude', 'gemini', 'grok', 'deepseek', 'openrouter'])('retains numeric authentication status with a non-English UI for %s', async provider => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
  await expect(translateBatch(['First record', 'Second record'], 'French', 'synthetic-key', 'custom-model', { ...options, provider })).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  '', '{"translations":["One translated record"]}', '{"translations":["One",null]}',
  '{"translations":{"0":"One"}}', '{"other":["One","Two"]}'
])('rejects missing or ambiguous translation slots: %s', async content => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(content)));
  await expect(batch(content)).rejects.toMatchObject({ code: 'AI_TRANSLATION_INVALID', retryable: false });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('maps complete identified slots independently of object key order', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply('{"translations":{"1":"Deuxième","0":"Premier"}}')));
  expect(await batch()).toEqual(['Premier', 'Deuxième']);
});

it('parses complete JSON before interpreting literal code fences inside strings', async () => {
  const values = ['A ```token``` B', 'A second translated record'];
  vi.stubGlobal('fetch', vi.fn(async () => reply(JSON.stringify({ translations: values }))));
  expect(await batch()).toEqual(values);
});

it('preserves a complete translation whose script requires more characters', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply('Water level measurement')));
  expect(await translateText('\u6c34\u4f4d', 'English', 'synthetic-key', 'gpt-example', options)).toBe('Water level measurement');
});

it('keeps code text that resembles an HTML attribute in request and result', async () => {
  let prompt;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { prompt = JSON.parse(init.body).messages[1].content; return reply('Requ\u00eate <code>WHERE id = 7</code>'); }));
  const result = await translateText('Query <code>WHERE id = 7</code>', 'French', 'synthetic-key', 'gpt-example', options);
  expect(prompt).toContain('<code>WHERE id = 7</code>');
  expect(result).toContain('<code>WHERE id = 7</code>');
});

it('updates rich and plain text together and keeps the input intact', async () => {
  const input = { content: [{ type: 'paragraph', text: 'Original sentence', html: '<em>Original sentence</em>' }, { type: 'paragraph', text: 'Another source' }] };
  const before = structuredClone(input);
  vi.stubGlobal('fetch', vi.fn(async () => reply('{"translations":["<em>Phrase cible</em>","Autre texte"]}')));
  const result = await translateContent(input, 'fr', 'synthetic-key', 'gpt-example', undefined, options);
  expect(result.content[0]).toMatchObject({ text: 'Phrase cible', html: '<em>Phrase cible</em>' });
  expect(result.content[1].text).toBe('Autre texte');
  expect(input).toEqual(before);
});

it('bounds indexed batches and preserves source order across batch boundaries', async () => {
  const inputs = Array.from({ length: CONFIG.TRANSLATION_BATCH_MAX_FIELDS + 2 }, (_, i) => 'Record ' + i);
  const sizes = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    const values = JSON.parse(body.messages[1].content.split('\n').at(-1));
    sizes.push(values.length);
    return reply(JSON.stringify({ translations: values.map(value => 'Translated ' + value) }));
  }));
  const result = await translateContent({ content: inputs.map(text => ({ type: 'paragraph', text })) },
    'fr', 'synthetic-key', 'gpt-example', undefined, options);
  expect(sizes).toEqual([CONFIG.TRANSLATION_BATCH_MAX_FIELDS, 2]);
  expect(result.content.map(item => item.text)).toEqual(inputs.map(text => 'Translated ' + text));
});

it('retries an invalid response in two smaller batches without keeping any ambiguous slots', async () => {
  const source = { content: ['A', 'B', 'C', 'D'].map(text => ({ type: 'paragraph', text })) };
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(reply('{"translations":{"0":"Wrong","1":"Wrong","02":"Wrong","3":"Wrong"}}'))
    .mockResolvedValueOnce(reply('{"translations":["A translated","B translated"]}'))
    .mockResolvedValueOnce(reply('{"translations":["C translated","D translated"]}')));
  const result = await translateContent(source, 'fr', 'synthetic-key', 'gpt-example', undefined, options);
  expect(result.content.map(item => item.text)).toEqual(['A translated', 'B translated', 'C translated', 'D translated']);
  expect(source.content.map(item => item.text)).toEqual(['A', 'B', 'C', 'D']);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('preserves the selected reasoning effort for translation requests', async () => {
  let body;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { body = JSON.parse(init.body); return reply('Translated record'); }));
  await translateText('Original record', 'French', 'synthetic-key', 'gpt-6.1-sol-low', options);
  expect(body.reasoning_effort).toBe('low');
});

it('recognizes Japanese mixed kana and kanji before treating han characters as Chinese', () => {
  const text = '\u5ddd\u306e\u6c34\u4f4d\u3092\u8a18\u9332\u3059\u308b';
  expect(detectLanguageByCharacters(text)).toBe('ja');
  expect(detectLanguageByCharacters(text.repeat(15))).toBe('ja');
});

it('recognizes Ukrainian evidence without requiring a fixed number of distinctive letters', () => {
  expect(detectLanguageByCharacters('\u0456 ' + '\u0412\u043e\u0434\u0430 \u0442\u0430 \u043d\u043e\u0432\u0438\u0439 \u0437\u0430\u043f\u0438\u0441 '.repeat(8))).toBe('ua');
});

it('keeps an HTML-only nested list and translates its complete interleaved markup', async () => {
  const source = '<strong>Start</strong><ul><li>Inner</li></ul>End';
  const target = '<strong>Début</strong><ul><li>Intérieur</li></ul>Fin';
  let prompt;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { prompt = JSON.parse(init.body).messages[1].content; return reply(target); }));
  const input = { content: [{ type: 'list', items: [{ html: source }] }] };
  const result = await translateContent(input, 'fr', 'synthetic-key', 'gpt-example', undefined, options);
  expect(prompt).toContain(source);
  expect(result.content[0].items).toEqual([{ html: target }]);
  expect(input.content[0].items).toEqual([{ html: source }]);
});

it('preserves table cell formats and encoded literal markup through translation', async () => {
  const input = { content: [
    { type: 'table', cellFormat: 'html', headers: ['<strong>Type</strong>'], rows: [['Array&lt;T&gt; and <em>notes</em>']] },
    { type: 'table', cellFormat: 'text', headers: ['Type'], rows: [['Array<T> and notes']] },
    { type: 'table', headers: ['**Type**'], rows: [['Array<T> and notes']] }
  ] };
  const before = structuredClone(input);
  const targets = ['<strong>Genre</strong>', 'Array&lt;T&gt; et <em>notes</em>', 'Genre', 'Array<T> et notes', '**Genre**', 'Array<T> et notes'];
  let sources;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const prompt = JSON.parse(init.body).messages[1].content;
    sources = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
    return reply(JSON.stringify({ translations: targets }));
  }));
  const result = await translateContent(input, 'fr', 'synthetic-key', 'gpt-example', undefined, options);
  expect(sources).toEqual(['<strong>Type</strong>', 'Array&lt;T&gt; and <em>notes</em>', 'Type', 'Array<T> and notes', '**Type**', 'Array<T> and notes']);
  expect(result.content.map(item => item.cellFormat)).toEqual(['html', 'text', undefined]);
  expect(result.content[0]).toMatchObject({ headers: [targets[0]], rows: [[targets[1]]] });
  expect(result.content[1]).toMatchObject({ headers: [targets[2]], rows: [[targets[3]]] });
  expect(result.content[2]).toMatchObject({ headers: [targets[4]], rows: [[targets[5]]] });
  expect(input).toEqual(before);
});

it('does not publish an earlier translated chunk when a later chunk fails', async () => {
  const input = { content: [{ type: 'paragraph', text: 'First source '.repeat(1800) }, { type: 'paragraph', text: 'Second source' }] };
  const before = structuredClone(input), progress = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply('First translation')).mockResolvedValueOnce(new Response('{}', { status: 400 })));
  await expect(translateContent(input, 'fr', 'synthetic-key', 'gpt-example', progress, options)).rejects.toMatchObject({ status: 400 });
  expect(input).toEqual(before);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(progress.mock.calls.some(([value]) => value.statusTranslationKey === 'statusTranslationComplete')).toBe(false);
});

it('awaits owner cancellation before publishing translated content', async () => {
  const cancelled = new DOMException('Replaced', 'AbortError');
  let obsolete = false;
  const input = { content: [{ type: 'paragraph', text: 'Original reading' }] }, before = structuredClone(input), progress = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => { obsolete = true; return reply('Lecture traduite'); }));
  await expect(translateContent(input, 'fr', 'synthetic-key', 'gpt-example', progress, { ...options, async checkCancelled() { if (obsolete) throw cancelled; } })).rejects.toBe(cancelled);
  expect(input).toEqual(before);
  expect(progress.mock.calls.some(([value]) => value.statusTranslationKey === 'statusTranslationComplete')).toBe(false);
});

it('removes only actual id attributes while preserving quoted delimiters and code', async () => {
  let prompt;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { prompt = JSON.parse(init.body).messages[1].content; return reply('<span title="a > b">Texte</span><code>id = 7</code>'); }));
  await translateText('<span id="unit" title="a > b">Text</span><code>id = 7</code>', 'French', 'synthetic-key', 'gpt-example', options);
  expect(prompt).toContain('<span title="a > b">Text</span>');
  expect(prompt).toContain('<code>id = 7</code>');
  expect(prompt).not.toContain('id="unit"');
});

it('restores source IDs, legacy named targets and fragment destinations locally after translation', async () => {
  const input = '<span id="sample%26" title="a > b">Reading</span><a name="old-marker"></a><a href="#sample%2526">Return</a>';
  let prompt;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    prompt = JSON.parse(init.body).messages[1].content;
    return reply('<span title="a > b" id="invented">Lecture</span><a name="invented-name"></a><a href="#wrong">Retour</a>');
  }));
  const result = await translateText(input, 'French', 'synthetic-key', 'gpt-example', options);
  expect(prompt).not.toContain('id="sample%26"');
  expect(prompt).not.toContain('name="old-marker"');
  expect(result).toBe('<span title="a > b" id="sample%26">Lecture</span><a name="old-marker"></a><a href="#sample%2526">Retour</a>');
});

it('does not assign a source anchor to a different markup position when the provider changes structure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply('<em id="invented">Lecture</em><span id="also-invented">Retour</span>')));
  const result = await translateText('<span id="source">Reading</span><span>Return</span>', 'French', 'synthetic-key', 'gpt-example', options);
  expect(result).toBe('<em>Lecture</em><span>Retour</span>');
});

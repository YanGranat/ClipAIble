import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readZipEntries } from '../helpers/zip-entries.js';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';
import { translateContent } from '../../scripts/translation/text.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/images.js', () => ({ imageToBase64: vi.fn(async () => null), processImagesInBatches: vi.fn(async () => []), embedImages: vi.fn(async value => value) }));

const sourceUrl = 'https://example.org/guide?source=a%26b';
const base = { title: 'Reading guide', language: 'en', author: 'Example', sourceUrl };

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({});
  chrome.downloads.download = vi.fn(async () => 1);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function render(format, content, generateToc = false, titleFragmentIds = []) {
  const data = { ...base, content, generateToc, titleFragmentIds };
  if (format === 'markdown') return { markdown: await generateMarkdown(data) };
  let value, navigation = [];
  if (format === 'pdf') value = buildHtmlForPdf(content, base.title, base.author, '', sourceUrl, '', 'en', generateToc, false, '', titleFragmentIds);
  if (format === 'epub') {
    const blob = await generateEpub(data);
    const entries = readZipEntries(await blob.arrayBuffer());
    value = entries['OEBPS/content.xhtml'].toString('utf8');
    navigation = ['OEBPS/nav.xhtml', 'OEBPS/toc.ncx'].map(path => new JSDOM(entries[path].toString('utf8'), { contentType: 'application/xml' }).window.document);
  }
  if (format === 'fb2') value = await (await generateFb2(data)).text();
  return { document: new JSDOM(value, { contentType: format === 'pdf' ? 'text/html' : 'application/xml' }).window.document, navigation };
}

function hrefFor(output, label) {
  if (output.markdown !== undefined) {
    const prefix = `[${label}](`;
    const index = output.markdown.indexOf(prefix);
    expect(index).toBeGreaterThanOrEqual(0);
    return output.markdown.slice(index + prefix.length).split(')')[0];
  }
  const link = [...output.document.querySelectorAll('a')].find(node => node.textContent === label);
  expect(link).toBeTruthy();
  return link.getAttribute('href') || link.getAttribute('l:href');
}

function assertTarget(output, label, id, expectedText) {
  const href = hrefFor(output, label);
  expect(href.startsWith('#')).toBe(true);
  if (output.markdown !== undefined) {
    expect(decodeURIComponent(href.slice(1))).toBe(id);
    const anchors = new JSDOM(output.markdown).window.document.querySelectorAll('[id]');
    expect([...anchors].filter(node => node.id === id)).toHaveLength(1);
    expect(output.markdown).toContain(expectedText);
  } else {
    const target = [...output.document.querySelectorAll('[id]')].find(node => node.id === decodeURIComponent(href.slice(1)));
    expect(target).toBeTruthy();
    expect(target.textContent).toContain(expectedText);
  }
}

describe.each(['pdf', 'markdown', 'epub', 'fb2'])('%s document fragment references', format => {
  it('binds the source title and its inline targets to a single rendered title destination', async () => {
    const source = await generateExtractAutomaticallyInlined();
    const page = new JSDOM('<!doctype html><header><h1 id="guide-cover"><span id="guide%section">Reading guide</span><a name="legacy-cover"></a></h1></header><article><p>An independently authored reading passage remains intact.</p><p><a href="#guide-cover">Cover reference</a> <a href="#guide%25section">Inline reference</a> <a href="#legacy-cover">Legacy reference</a> <a href="#unavailable">Unavailable reference</a></p></article>', { url: sourceUrl, runScripts: 'outside-only' });
    try {
      page.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
      const result = await page.window.extract(sourceUrl, false, { content: 'article', title: 'header h1 span' });
      expect(result.error).toBeUndefined();
      expect(result.titleFragmentIds).toEqual(['guide-cover', 'guide%section', 'legacy-cover']);
      expect(result.content.some(item => item.type === 'heading')).toBe(false);
      const output = await render(format, result.content, false, result.titleFragmentIds);
      for (const label of ['Cover reference', 'Inline reference', 'Legacy reference']) assertTarget(output, label, 'guide-cover', base.title);
      expect(hrefFor(output, 'Unavailable reference')).toBe(sourceUrl + '#unavailable');
      const document = output.document || new JSDOM(output.markdown).window.document;
      expect([...document.querySelectorAll('[id]')].filter(node => node.id === 'guide-cover')).toHaveLength(1);
    } finally { page.window.close(); }
  });

  it('keeps the title target distinct from an identically named body identifier', async () => {
    const content = [{ type: 'paragraph', id: 'guide-cover', text: 'Separate body owner.', format: 'text' },
      { type: 'paragraph', html: '<a href="#guide-cover">Cover reference</a>' }];
    const output = await render(format, content, false, ['guide-cover']);
    assertTarget(output, 'Cover reference', 'guide-cover-2', base.title);
    const document = output.document || new JSDOM(output.markdown).window.document;
    expect([...document.querySelectorAll('[id]')].map(node => node.id)).toEqual(['guide-cover-2', 'guide-cover']);
  });

  it('retains the source cell reference to each extracted image occurrence', async () => {
    const source = await generateExtractAutomaticallyInlined();
    const page = new JSDOM('<!doctype html><article><h1>Reading guide</h1><table><caption>Field comparison.</caption><tr><th>Station</th><th>Plot</th></tr><tr><td>North</td><td><img src="/field.png" width="640" height="480" alt="Field plot"></td></tr></table><p>The final observation remains available.</p></article>', { url: sourceUrl, runScripts: 'outside-only' });
    try {
      page.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
      const result = await page.window.extract(sourceUrl, false, { content: 'article' });
      expect(result.error).toBeUndefined();
      const image = result.content.find(item => item.type === 'image');
      expect(image).toMatchObject({ src: 'https://example.org/field.png', alt: 'Field plot' });
      expect(result.content.find(item => item.type === 'table').rows[0][1]).toContain(`href="#${image.id}"`);
      const output = await render(format, result.content);
      assertTarget(output, 'Field plot', image.id, '');
      expect(format === 'markdown' ? output.markdown : output.document.documentElement.textContent).toContain('Field comparison.');
    } finally { page.window.close(); }
  });
  it('keeps generated navigation separate from original source references', async () => {
    const content = [
      { type: 'heading', level: 2, text: 'Generated body section', format: 'text' },
      { type: 'paragraph', html: '<a href="#heading-0">Omitted source title</a>' },
      { type: 'heading', level: 2, text: 'Another body section', format: 'text' }
    ];
    const output = await render(format, content, true);
    expect(hrefFor(output, 'Omitted source title')).toBe(sourceUrl + '#heading-0');
    if (format === 'pdf' || format === 'fb2') assertTarget(output, 'Generated body section', 'heading-0', 'Generated body section');
    if (format === 'markdown') expect([...new JSDOM(output.markdown).window.document.querySelectorAll('[id]')].some(node => node.id === 'heading-0')).toBe(true);
    for (const navigation of output.navigation || []) {
      const links = [...navigation.querySelectorAll('a,content')];
      expect(links).toHaveLength(2);
      for (const [index, entry] of links.entries()) {
        const href = entry.getAttribute('href') || entry.getAttribute('src');
        expect(output.document.getElementById(decodeURIComponent(href.split('#')[1])).textContent).toContain(index === 0 ? 'Generated body section' : 'Another body section');
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('localizes only retained targets and preserves resource query identity', async () => {
    const content = [
      { type: 'heading', level: 1, id: 'removed-heading', text: base.title, format: 'text' },
      { type: 'paragraph', html: '<a href="#p-target">Paragraph ref</a> <a href="https://example.org/guide?source=a%26b#section-%CE%B1">Section ref</a> <a href="./guide?source=a%26b#note">Note ref</a> <a href="#missing">Missing ref</a> <a href="#removed-heading">Filtered ref</a> <a href="https://example.org/guide?source=a&amp;b#p-target">Other query</a> <a href="https://example.net/other#:~:text=alpha,beta">External highlight</a> <a href="#:~:text=alpha,beta">Source highlight</a>' },
      { type: 'paragraph', id: 'p-target', text: 'Paragraph target.', format: 'text' },
      { type: 'heading', level: 2, id: 'section-α', text: 'Section target.', format: 'text' },
      { type: 'list', ordered: true, items: [{ id: 'note', html: 'Note target.' }] }
    ];
    const original = structuredClone(content);
    const output = await render(format, content);
    assertTarget(output, 'Paragraph ref', 'p-target', 'Paragraph target.');
    assertTarget(output, 'Section ref', 'section-α', 'Section target.');
    assertTarget(output, 'Note ref', 'note', 'Note target.');
    expect(hrefFor(output, 'Missing ref')).toBe(sourceUrl + '#missing');
    expect(hrefFor(output, 'Filtered ref')).toBe(sourceUrl + '#removed-heading');
    expect(hrefFor(output, 'Other query')).toBe('https://example.org/guide?source=a&b#p-target');
    expect(hrefFor(output, 'External highlight')).toBe('https://example.net/other#:~:text=alpha,beta');
    expect(hrefFor(output, 'Source highlight')).toBe(sourceUrl + '#:~:text=alpha,beta');
    expect(content).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes URI escaping from logical identifiers and avoids identifier collisions', async () => {
    const content = [
      { type: 'paragraph', html: '<a href="#x%26y">Amp ref</a> <a href="#x%2526y">Percent ref</a> <a href="#1">Digit ref</a> <a href="#id-31">Prefix ref</a>' },
      { type: 'paragraph', id: 'x&y', text: 'Amp target.', format: 'text' },
      { type: 'paragraph', id: 'x%26y', text: 'Percent target.', format: 'text' },
      { type: 'paragraph', id: '1', text: 'Digit target.', format: 'text' },
      { type: 'paragraph', id: 'id-31', text: 'Prefix target.', format: 'text' }
    ];
    const output = await render(format, content);
    for (const [label, id, expected] of [['Amp ref', 'x&y', 'Amp target.'], ['Percent ref', 'x%26y', 'Percent target.'], ['Digit ref', '1', 'Digit target.'], ['Prefix ref', 'id-31', 'Prefix target.']]) {
      assertTarget(output, label, id, expected);
    }
    if (output.document) {
      const ids = [...output.document.querySelectorAll('[id]')].map(node => node.id);
      expect(ids.length).toBe(new Set(ids).size);
    }
  });

  it('handles legacy Markdown in paragraphs, lists and table cells without changing literal code', async () => {
    const content = [
      { type: 'paragraph', text: 'Legacy [Paragraph ref](#p-target) and `literal [code](#missing)`.' },
      { type: 'list', items: ['Legacy [List ref](#p-target)'] },
      { type: 'table', cellFormat: 'markdown', hasHeaders: false, rows: [['Legacy [Cell ref](#p-target)']] },
      { type: 'paragraph', id: 'p-target', text: 'Paragraph target.', format: 'text' },
      { type: 'code', text: '[literal](#missing)', language: 'text' },
      { type: 'paragraph', text: 'Plain [literal](#missing).', format: 'text' }
    ];
    const original = structuredClone(content);
    const output = await render(format, content);
    for (const label of ['Paragraph ref', 'List ref', 'Cell ref']) assertTarget(output, label, 'p-target', 'Paragraph target.');
    const plain = output.markdown === undefined ? output.document.documentElement.textContent : output.markdown;
    expect(plain).toContain('[literal](#missing)');
    expect(content).toEqual(original);
  });

  it('keeps inline target positions where supported and uses source links otherwise', async () => {
    const content = [
      { type: 'paragraph', html: '<a href="#first">First ref</a> <a href="#second">Second ref</a> <a href="#owner">Owner ref</a>' },
      { type: 'paragraph', id: 'owner', html: '<sup id="first">First target</sup> between <span id="second">Second target</span>.<a id="empty-anchor"></a><a id="unlinked"> Unlinked words.</a>' }
    ];
    const original = structuredClone(content);
    const output = await render(format, content);
    assertTarget(output, 'Owner ref', 'owner', 'First target');
    for (const [label, id, text] of [['First ref', 'first', 'First target'], ['Second ref', 'second', 'Second target']]) {
      if (format === 'fb2') expect(hrefFor(output, label)).toBe(sourceUrl + '#' + id);
      else assertTarget(output, label, id, text);
    }
    if (format === 'fb2') {
      expect([...output.document.querySelectorAll('a')].every(node => node.getAttribute('l:href') !== '#')).toBe(true);
      expect(output.document.documentElement.textContent).toContain('Unlinked words.');
    }
    expect(content).toEqual(original);
  });

  it('retains nested-only list targets and decodes list attribute entities once', async () => {
    const content = [
      { type: 'paragraph', html: '<a href="#parent">Parent ref</a> <a href="#x%26y%22%CE%B1">Quoted ref</a> <a href="#x%2526y">Percent ref</a>' },
      { type: 'list', ordered: true, items: [
        { id: 'parent', html: '<ul><li id="child">Nested target.</li></ul>' },
        { id: 'x&y"α', html: 'Quoted target.' },
        { id: 'x%26y', html: 'Percent target.' }
      ] }
    ];
    const output = await render(format, content);
    assertTarget(output, 'Parent ref', 'parent', format === 'fb2' ? '' : 'Nested target.');
    assertTarget(output, 'Quoted ref', 'x&y"α', 'Quoted target.');
    assertTarget(output, 'Percent ref', 'x%26y', 'Percent target.');
    if (output.document) expect(output.document.querySelectorAll('[onmouseover]')).toHaveLength(0);
  });
});

it('resolves a translated EPUB reference to the translated title and preserves an inline body target', async () => {
  const input = { ...base, author: '', titleFragmentIds: ['guide-cover', 'cover-details'], content: [
    { type: 'paragraph', html: '<a href="#cover-details">Cover reference</a> <a href="#inline-reading">Inline reference</a>' },
    { type: 'paragraph', html: '<span id="inline-reading">Reading phrase</span>' }
  ] };
  vi.stubGlobal('fetch', vi.fn(async (_url, request) => {
    const prompt = JSON.parse(request.body).messages[1].content;
    const translated = prompt === base.title ? 'Guide de lecture' : JSON.stringify({ translations: [
      '<a href="#cover-details">Retour au titre</a> <a href="#inline-reading">Retour au texte</a>',
      '<span>Phrase de lecture</span>'
    ] });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: translated } }] }));
  }));
  const translated = await translateContent(input, 'fr', 'synthetic-key', 'gpt-example', undefined, { provider: 'openai' });
  expect(translated.title).toBe('Guide de lecture');
  const epub = await generateEpub({ ...translated, language: 'fr' });
  const entries = readZipEntries(await epub.arrayBuffer());
  const page = new JSDOM(entries['OEBPS/content.xhtml'].toString('utf8'), { contentType: 'application/xml' });
  try {
    const output = { document: page.window.document };
    assertTarget(output, 'Retour au titre', 'guide-cover', 'Guide de lecture');
    assertTarget(output, 'Retour au texte', 'inline-reading', 'Phrase de lecture');
    expect(output.document.querySelectorAll('h1')).toHaveLength(1);
  } finally { page.window.close(); }
});

describe.each(['pdf', 'epub', 'fb2'])('%s generated navigation', format => {
  it('links encoded heading identities to their actual serialized targets', async () => {
    const headings = [['x%26y', 'Percent heading'], ['x&y', 'Amp heading'], ['1', 'Digit heading'], ['id-31', 'Prefix heading']];
    const content = headings.flatMap(([id, text]) => [
      { type: 'heading', level: 2, id, text, format: 'text' },
      { type: 'paragraph', text: 'Section body.', format: 'text' }
    ]);
    const output = await render(format, content, true);
    if (format !== 'epub') for (const [id, text] of headings) assertTarget(output, text, id, text);
    for (const navigation of output.navigation) {
      const entries = navigation.querySelectorAll('a, content');
      expect(entries).toHaveLength(headings.length);
      for (const [index, entry] of [...entries].entries()) {
        const href = entry.getAttribute('href') || entry.getAttribute('src');
        expect(href.split('#')[0]).toBe('content.xhtml');
        const id = decodeURIComponent(href.split('#')[1]);
        const target = [...output.document.querySelectorAll('[id]')].find(node => node.id === id);
        expect(target?.textContent).toContain(headings[index][1]);
      }
    }
  });
});

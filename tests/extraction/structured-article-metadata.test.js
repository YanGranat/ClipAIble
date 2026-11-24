import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { extractMetadata } from '../../scripts/extraction/extractor/metadata.js';
import { normalizeCachedSelectors } from '../../scripts/cache/selectors.js';

const documents = [];
let serialized;
beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  serialized = execFileSync(process.execPath, ['--input-type=module', '-e', `import {generateExtractAutomaticallyInlined} from ${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
});
afterEach(() => { documents.splice(0).forEach(dom => dom.window.close()); vi.restoreAllMocks(); });

function page(data, { url = 'https://example.test/report', extra = '', heading = '<h1>Observation report</h1>' } = {}) {
  const dom = new JSDOM(`<!doctype html><title>Observation report</title>${extra}<script type="application/ld+json">${JSON.stringify(data)}</script><article>${heading}<p>The report describes independent observations and the complete survey procedure.</p></article>`, { url, runScripts: 'outside-only' });
  documents.push(dom);
  return dom;
}

function metadata(data, options) {
  const dom = page(data, options), before = dom.window.document.documentElement.outerHTML;
  const result = extractMetadata(dom.window.document, dom.window.location.href);
  expect(dom.window.document.documentElement.outerHTML).toBe(before);
  return result;
}

const current = { '@type': 'NewsArticle', mainEntityOfPage: 'https://example.test/report', author: { name: 'Morgan Example' }, datePublished: '2024-04-17T12:00:00Z', dateModified: '2024-08-20T14:00:00Z' };

describe('Current structured article metadata', () => {
  it('reads author and publication date from the same current article record', () => {
    expect(metadata(current)).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('keeps a media credit from becoming the article author', () => {
    const extra = `<meta property="article:author" content="https://example.test/author/morgan">
      <div itemtype="https://schema.org/ImageObject" itemscope>
        <span itemprop="author">Image Studio</span>
      </div>
      <figure><figcaption><a rel="author" href="/author/artist">Photo Contributor</a></figcaption></figure>`;
    expect(metadata(current, { extra }).author).toBe('Morgan Example');
  });

  it('retains scholarly author order without duplicate names or institutions', () => {
    const extra = '<meta name="citation_author" content="Morgan Example"><meta name="citation_author_institution" content="Survey Institute"><meta name="citation_author" content="Casey Example"><meta name="citation_author" content="  Morgan   Example ">';
    expect(metadata(current, { extra })).toMatchObject({ author: 'Morgan Example, Casey Example' });
  });

  it.each(['2024', '2024-04'])('preserves the supplied publication-date precision: %s', datePublished => {
    expect(metadata({ ...current, datePublished })).toMatchObject({ publishDate: datePublished });
  });

  it('resolves local and absolute graph identities before reading author and date', () => {
    expect(metadata({ '@graph': [
      { '@type': 'NewsArticle', '@id': '#story', mainEntityOfPage: { '@id': '#page' }, author: { '@id': '#writer' }, datePublished: '2024-04-17' },
      { '@type': 'WebPage', '@id': 'https://example.test/report#page', url: 'https://example.test/report' },
      { '@type': 'Person', '@id': 'https://example.test/report#writer', name: 'Morgan Example' }
    ] })).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('uses a relative canonical address, multiple types and a string author reference', () => {
    expect(metadata({ '@graph': [
      { '@type': ['https://schema.org/NewsArticle', 'Article'], url: '/canonical', author: '#writer', datePublished: '2024-04-17' },
      { '@type': 'Person', '@id': '#writer', name: 'Morgan Example' }
    ] }, { extra: '<link rel="canonical" href="/canonical">' })).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('rejects a foreign article identity even without a url field', () => {
    const foreign = { '@type': 'Article', '@id': 'https://example.test/other#story', author: { name: 'Other Example' }, datePublished: '2020-02-01' };
    expect(metadata([foreign, current])).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
    expect(metadata(foreign)).toMatchObject({ author: '', publishDate: '' });
  });

  it('prefers an explicit current identity over an earlier anonymous article', () => {
    expect(metadata([{ '@type': 'Article', headline: 'Observation report', author: { name: 'Other Example' }, datePublished: '2020-02-01' }, current])).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('uses an explicit page ownership relation independently of the entity resource URL', () => {
    expect(metadata({ ...current, '@id': 'https://identifiers.example/work/42', url: 'https://archive.example/papers/42.pdf' })).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('does not replace an explicit other-page owner with a matching generic item URL', () => {
    expect(metadata({ ...current, url: 'https://example.test/report', mainEntityOfPage: 'https://example.test/other' })).toMatchObject({ author: '', publishDate: '' });
  });

  it('does not choose a metadata version when duplicate graph identities conflict', () => {
    expect(metadata([
      { ...current, '@id': '#story' },
      { ...current, '@id': 'https://example.test/report#story', author: { name: 'Other Example' }, datePublished: '2020-02-01' }
    ])).toMatchObject({ author: '', publishDate: '' });
  });

  it('accepts equivalent duplicate identity and publication-date representations', () => {
    expect(metadata([
      { ...current, '@id': '#story', mainEntityOfPage: { '@id': '#page' }, author: { '@id': '#writer' } },
      { ...current, '@id': 'https://example.test/report#story', datePublished: '2024-04-17' },
      { '@type': 'WebPage', '@id': '#page', url: 'https://example.test/report' },
      { '@type': 'Person', '@id': '#writer', name: 'Morgan Example' }
    ])).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('accepts repeated identical anonymous metadata without mixing conflicting records', () => {
    const anonymous = { '@type': 'Article', author: { name: 'Morgan Example' }, datePublished: '2024-04-17' };
    expect(metadata([anonymous, anonymous])).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('requires page ownership for an opaque article identifier', () => {
    expect(metadata({ '@type': 'Article', '@id': 'urn:example:unassigned', author: { name: 'Other Example' }, datePublished: '2020-02-01' })).toMatchObject({ author: '', publishDate: '' });
  });

  it('follows the current WebPage mainEntity reference to its article', () => {
    expect(metadata({ '@graph': [
      { '@type': 'WebPage', url: 'https://example.test/report', mainEntity: { '@id': 'urn:example:observation' } },
      { '@type': 'ScholarlyArticle', '@id': 'urn:example:observation', author: { name: 'Morgan Example' }, datePublished: '2024-04-17' },
      { '@type': 'Article', author: { name: 'Other Example' }, datePublished: '2020-02-01' }
    ] })).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
  });

  it('keeps different article query identities separate', () => {
    expect(metadata([
      { ...current, mainEntityOfPage: 'https://example.test/report?entry=earlier', datePublished: '2020-02-01' },
      { ...current, mainEntityOfPage: 'https://example.test/report?entry=current' }
    ], { url: 'https://example.test/report?entry=current' })).toMatchObject({ publishDate: '2024-04-17' });
  });

  it('uses an unambiguous anonymous article and avoids choosing between unrelated anonymous records', () => {
    const first = { '@type': 'BlogPosting', author: { name: 'Morgan Example' }, datePublished: '2024-04-17' };
    expect(metadata(first)).toMatchObject({ author: 'Morgan Example', publishDate: '2024-04-17' });
    expect(metadata([first, { '@type': 'Article', author: { name: 'Other Example' }, datePublished: '2020-02-01' }])).toMatchObject({ author: '', publishDate: '' });
  });

  it('does not substitute another object date or a modification date for publication', () => {
    expect(metadata([
      { '@type': 'Organization', foundingDate: '1998-01-01' },
      { '@type': 'VideoObject', uploadDate: '2020-02-01' },
      { ...current, datePublished: undefined }
    ])).toMatchObject({ author: 'Morgan Example', publishDate: '' });
  });

  it.each([
    '<meta property="article:published_time" content="2023-10-08T09:30:00Z">',
    '<time itemprop="datePublished" datetime="2023-10-08T09:30:00Z">8 October 2023</time>',
    '<meta itemprop="datePublished" content="2023-10-08">'
  ])('preserves native publication metadata precedence: %s', extra => {
    expect(metadata(current, { extra })).toMatchObject({ publishDate: '2023-10-08' });
  });

  it('uses page-owned publication metadata ahead of an unlabelled date', () => {
    const extra = '<aside><time datetime="2023-10-08">Related issue</time></aside>';
    expect(metadata(current, { extra }).publishDate).toBe('2024-04-17');
    expect(metadata([], { extra }).publishDate).toBe('');
  });

  it.each([
    '<header><h1>Observation report</h1><time datetime="2023-10-08">8 October 2023</time></header>',
    '<h1>Observation report</h1><time datetime="2023-10-08">8 October 2023</time>'
  ])('recognizes a visible date near the article title when explicit metadata is absent', heading => {
    expect(metadata([], { heading }).publishDate).toBe('2023-10-08');
  });

  it.each([
    ['November 2025', '2025-11'],
    ['2024-02-29', '2024-02-29'],
    ['2025-02-31', ''],
    ['2024-13', ''],
    ['31st February 2025', ''],
    ['February 31, 2025', ''],
    ['31st Jul 2007', '2007-07-31']
  ])('preserves valid publication-date precision for %s', (datePublished, expected) => {
    expect(metadata({ ...current, datePublished }).publishDate).toBe(expected);
  });

  it('rereads the current document date when reusing selectors on another article', async () => {
    const selectors = normalizeCachedSelectors({ content: 'article', title: 'h1', author: 'Previous Example', publishDate: '2020-02-01', detectedLanguage: 'en' });
    expect(selectors).not.toHaveProperty('publishDate');
    expect(selectors).not.toHaveProperty('author');
    expect(selectors).not.toHaveProperty('detectedLanguage');
    for (const [path, date] of [['earlier', '2021-06-09'], ['later', '2024-04-17']]) {
      const url = `https://example.test/${path}`;
      const dom = page({ ...current, mainEntityOfPage: url, datePublished: date }, { url });
      vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
      const before = dom.window.document.body.innerHTML;
      const run = dom.window.eval(`(${serialized.replace('export async function', 'async function')})`);
      expect((await run(url, false, selectors)).publishDate).toBe(date);
      expect(dom.window.document.body.innerHTML).toBe(before);
    }
  });
});

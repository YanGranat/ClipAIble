import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractAutomaticallyInlined } from '../../scripts/extraction/automatic.js';
import { cloneReadingContent } from '../../scripts/extraction/extractor/dom-utils.js';

const inlineSource = extractAutomaticallyInlined.toString();
const documents = [];
afterEach(() => { for (const document of documents.splice(0)) document.window.close(); });

async function extract(html, baseUrl, selectors = {}) {
  const dom = new JSDOM(html, { url: 'https://example.com/article', runScripts: 'outside-only' });
  documents.push(dom);
  dom.window.console.log = () => {};
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 400 });
  const productionExtract = dom.window.eval(`(${inlineSource})`);
  return productionExtract(baseUrl || dom.window.location.href, true, selectors === null ? null :
    { articleContainer: 'main', content: 'p,img', title: 'h1', ...selectors });
}

function contentMarkup(result) {
  return result.content.map(item => item.html || item.text || item.caption || '').join('\n');
}

describe('selector page extraction', () => {
  it('keeps a valid optional selector when a utility class only resembles part of its syntax', async () => {
    const result = await extract('<!doctype html><main><p>Article paragraph selected for export.</p><div class="panel:not">Separate layout label.</div></main>',
      undefined, { content: 'p', exclude: '.panel:not(.visible)' });
    expect(result.content).toEqual([expect.objectContaining({ type: 'paragraph', text: 'Article paragraph selected for export.' })]);
  });

  it('removes a clipped copy-excluded link hint and keeps visible and referenced text', () => {
    const style = 'position:absolute;clip-path:inset(50%);width:1px;height:1px';
    const dom = new JSDOM(`<p><a href="/data" target="_blank">Survey data
      <span class="dont-copy" style="${style}">(opens separately)</span>
      <span class="dont-copy">interim results</span><span class="dont-copy" id="note" style="${style}">Archive note</span>
      </a></p>`);
    documents.push(dom);
    const text = dom.window.document.querySelector('p');
    for (const hint of text.querySelectorAll('[style]')) hint.getBoundingClientRect = () => ({width: 1, height: 1});
    const copy = cloneReadingContent(text);
    expect(copy.querySelector('a').getAttribute('href')).toBe('/data');
    expect(copy.textContent).toContain('Survey data');
    expect(copy.textContent).toContain('interim results');
    expect(copy.textContent).toContain('Archive note');
    expect(copy.textContent).not.toContain('opens separately');
  });

  it.each([false, true])('preserves the image inside a captioned figure control with table=%s', async table => {
    const figure = '<figure><button><img src="/specimen.png" width="600" height="400" alt="Sample profile">Open larger image</button>' +
      '<figcaption>Measured profile.</figcaption><button><img src="/close.png">Close</button></figure>';
    const body = table ? '<table><tr><th>Image</th></tr><tr><td>' + figure + '</td></tr></table>' : figure;
    const result = await extract('<!doctype html><main><article><h1>Field measurements</h1><p>Body observation.</p>' +
      body + '<button><img src="/menu.png">Open menu</button></article></main>', undefined, { content: 'article' });
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.com/specimen.png']);
    if (table) expect(result.content.find(item => item.type === 'table').rows[0][0]).toContain('href="#reading-media-');
    else expect(result.content.find(item => item.type === 'image').caption).toBe('Measured profile.');
    expect(JSON.stringify(result.content)).not.toMatch(/Open larger image|Open menu|>Close|close.png|menu.png/);
  });

  it('keeps only the explicitly selected illustrated specimen from a complementary region', async () => {
    const html = '<!doctype html><main><article><h1>Field measurements</h1><p>Body observation.</p></article>' +
      '<div class="sidebar"><aside id="sidebar-gallery"><div class="specimen"><img src="/section.png" alt="Sample cross section" width="640" height="400">' +
      '<h4>Sample cross section</h4><p>An etched line appears near the center.</p><p class="interface-control">Image controls.</p></div>' +
      '<figure><img src="/unrelated.png" width="640" height="400"><figcaption>Unrelated recommendation.</figcaption></figure>' +
      '<nav><img src="/control.png" width="640" height="400"></nav>' +
      '<div data-component="ad"><img src="/campaign.png" width="640" height="400"></div></aside></div></main>';
    const selectors = { content: 'article,.specimen', heroImage: '.specimen,nav img,[data-component="ad"] img', exclude: ['.interface-control'] };
    const result = await extract(html, undefined, selectors);
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'paragraph', text: 'Body observation.' }),
      expect.objectContaining({ type: 'image', src: 'https://example.com/section.png', caption: 'Sample cross section<br>An etched line appears near the center.' })
    ]);
    const excluded = await extract(html, undefined, { ...selectors, content: 'article', exclude: ['.specimen'] });
    expect(excluded.content.filter(item => item.type === 'image')).toEqual([]);
  });

  it('keeps a floated first letter joined to the word it begins', async () => {
    const result = await extract('<!doctype html><main><p><span style="display:block;float:left;margin-inline-end:4px">R</span>eading begins with a complete word.</p></main>');
    const output = JSDOM.fragment(contentMarkup(result));
    expect(output.querySelector('br')).toBeNull();
    expect(output.textContent).toBe('Reading begins with a complete word.');
  });

  it('keeps title code inline and emits independently authored code blocks once', async () => {
    const result = await extract('<!doctype html><main><article><h1><code>measure</code> and <em><code>reset</code></em></h1>' +
      '<p>Invoke <code>measure</code> after the initial check.</p><pre><code>reset</code></pre>' +
      '<section><h2>Independent sample</h2><pre><code>measure</code></pre></section>' +
      '</article><code id="standalone">record(value)</code></main>', undefined, { content: 'article,#standalone' });
    expect(result.title).toBe('measure and reset');
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'code', 'heading', 'code', 'code']);
    expect(result.content[0].html).toContain('<code>measure</code>');
    expect(result.content.filter(item => item.type === 'code').map(item => item.text)).toEqual(['reset', 'measure', 'record(value)']);
  });

  it('keeps exactly the selected legacy inline prose with its line breaks and links', async () => {
    const result = await extract('<!doctype html><main><p>Outside the selected prose.</p><p>Outside the selected wrapper. <font id="reading-flow">The first observation was independent.<br><br>The next observation has <em>emphasis</em> and <a href="./record">a source</a>.</font></p></main>', undefined, { content: '#reading-flow' });
    expect(result.selectorMatched).toBe(true);
    expect(result.content).toEqual([{ type: 'paragraph', id: 'reading-flow',
      text: 'The first observation was independent.<br><br>The next observation has <em>emphasis</em> and <a href="https://example.com/record">a source</a>.',
      html: 'The first observation was independent.<br><br>The next observation has <em>emphasis</em> and <a href="https://example.com/record">a source</a>.' }]);
  });

  it('partitions an explicitly chosen custom wrapper around authored blocks and keeps a selected anchor', async () => {
    const result = await extract('<!doctype html><main><measurement-panel id="explicit-region">Opening observation. <span id="inline-observation">Nested inline narrative.</span><p>Independent parsed paragraph.</p>Closing observation.</measurement-panel><a id="direct-reference" href="./appendix">Read the authored appendix.</a><p>Unselected material.</p></main>', undefined,
      { content: '#explicit-region,#inline-observation,#direct-reference' });
    expect(result.selectorMatched).toBe(true);
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    expect(contentMarkup(result)).toBe('Opening observation. <span id="inline-observation">Nested inline narrative.</span>\nIndependent parsed paragraph.\nClosing observation.\n<a href="https://example.com/appendix">Read the authored appendix.</a>');
    expect(result.content.map(item => item.id).filter(Boolean)).toEqual(['explicit-region', 'direct-reference']);
  });

  it('keeps Automatic inline behavior and rejects explicitly selected interface content', async () => {
    const report = 'Every report includes a dated measurement and the instrument readings that support it. '.repeat(7);
    const html = '<!doctype html><main><article><h1>Field report</h1><p>The reading contains <span>an inline observation</span> from the field.</p><p>An independent second paragraph records the source for the conclusion. ' + report + '</p><div inert role="menu"><span class="interface-label">Unrelated inert menu item</span></div><button><span class="interface-label">Unrelated control label</span></button></article></main>';
    const selected = await extract(html, undefined, { content: '.interface-label' });
    expect(selected.selectorMatched).toBe(false);
    expect(selected.content).toEqual([]);
    const automatic = await extract(html, undefined, null);
    expect(contentMarkup(automatic).split('an inline observation')).toHaveLength(2);
    expect(contentMarkup(automatic)).toContain('An independent second paragraph');
  });

  it.each(['articleContainer', 'content', 'title', 'subtitle', 'heroImage', 'toc', 'exclude'])('returns a typed miss for invalid CSS in %s', async field => {
    const selectors = { [field]: field === 'exclude' ? ['p >>'] : 'p >>' };
    const result = await extract('<main><h1>Current article</h1><p>Unselected text must not become a successful result.</p></main>', undefined, selectors);
    expect(result.selectorMatched).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.content).toEqual([]);
  });

  it('escapes a literal colon in an existing class before applying the selection', async () => {
    const result = await extract('<main><article><h1 class="md:headline">Field observations</h1>' +
      '<p>The field team recorded the first observation.</p><div class="print:hidden"><p>Auxiliary controls go here.</p></div>' +
      '<p>The last measurement confirmed the result.</p></article></main>', undefined,
    {content: 'article', title: 'h1.md:headline', exclude: ['article > div.print:hidden']});
    expect(result.title).toBe('Field observations');
    expect(result.content.map(item => item.text)).toEqual([
      'The field team recorded the first observation.', 'The last measurement confirmed the result.'
    ]);
  });

  it.each([
    { articleContainer: '.missing-container', content: 'p' },
    { articleContainer: 'main', content: '.missing-body' }
  ])('returns a selector miss without reading unrelated body content: %j', async selectors => {
    const result = await extract('<main><p>Unselected page text must not become a successful selector result.</p></main>', undefined, selectors);
    expect(result.selectorMatched).toBe(false);
    expect(result.content).toEqual([]);
  });

  it('rejects another article query on the same path', async () => {
    await expect(extract('<main><p>The selected article has its own content.</p></main>', 'https://example.com/article?id=other')).rejects.toThrow('page changed');
  });

  it('honors image exclusions inside selected prose while protecting prose from an excluded outer wrapper', async () => {
    const html = '<div class="site-wrapper"><article><h1>Field observations</h1><div class="hero"><img src="/hero.png" width="700" height="400"></div><div class="story"><p>The field report contains a substantial introduction.</p><figure><img src="/body.png" width="600" height="400"><figcaption>The survey illustration.</figcaption></figure><figure data-role="related"><a href="/another-report"><img src="/related.png" width="600" height="400"></a></figure><div class="subscription-box"><picture><img src="/avatar.png" width="100" height="100"></picture><p><img src="/promotion.png" width="600" height="400"></p></div><p>The field report retains its conclusion.</p></div></article></div>';
    const result = await extract(html, undefined, { articleContainer: 'article', content: '.story', heroImage: '.hero img', exclude: ['.site-wrapper', 'figure[data-role="related"]', '.subscription-box'] });
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.com/hero.png', 'https://example.com/body.png']);
    expect(JSON.stringify(result.content)).toContain('The field report retains its conclusion.');
  });

  it('protects an explicitly selected body inside a shared wrapper while excluding actual descendants', async () => {
    const html = '<!doctype html><title>Field notes</title><main><article><h1>Field notes</h1><div class="reading-layout">' +
      '<div class="report"><h2 id="observations">Observations <a class="widget" href="#observations">Copy link</a></h2>' +
      '<p>The report contains an independent first observation.</p>' +
      '<div class="widget"><p>Unrelated control text.</p></div><p>Last independent observation.</p></div></div></article></main>';
    const result = await extract(html, undefined, {
      articleContainer: 'article', content: '.report', exclude: ['article > div:has(.widget)', '.widget']
    });
    expect(result.selectorMatched).toBe(true);
    expect(result.content.find(item => item.id === 'observations')).toMatchObject({ type: 'heading', text: 'Observations' });
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text)).toEqual([
      'The report contains an independent first observation.', 'Last independent observation.'
    ]);
  });

  it('uses the identified publication when stale body selectors only match the cover', async () => {
    const html = '<!doctype html><title>Field notes</title><main><article><h1>Field notes</h1>' +
      '<div class="cover"><figure><img src="/field.png" width="700" height="500" alt="Field illustration">' +
      '<span style="display:block">Photo credit</span></figure></div>' +
      '<p class="fresh-body">The publication begins with an independent observation.</p>' +
      '<div class="unrelated"><p>Unrelated recommendation.</p></div>' +
      '<p class="fresh-body">The publication ends with a second observation.</p></article>' +
      '<article><h1>Other article</h1><p>A separate publication is outside the reading scope.</p></article></main>';
    const result = await extract(html, undefined, {
      articleContainer: 'article:first-of-type', content: '.stale-body,.cover', exclude: ['.unrelated']
    });
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text)).toEqual(expect.arrayContaining([
      'The publication begins with an independent observation.', 'The publication ends with a second observation.'
    ]));
    expect(result.content.filter(item => item.type === 'image')).toHaveLength(1);
    expect(contentMarkup(result)).not.toMatch(/Unrelated recommendation|A separate publication/);
  });

  it('recovers the identified publication after hydration removes every selected body wrapper', async () => {
    const html = '<!doctype html><title>Field notes</title><article><h1>Field notes</h1>' +
      '<p>The publication keeps its reading content through hydration.</p>' +
      '<div class="recommendations"><p>A recommendation is outside the publication.</p></div></article>';
    const result = await extract(html, undefined, {
      articleContainer: 'article', title: 'article > h1', content: '[data-render-part="prose"]', exclude: ['.recommendations']
    });
    expect(result).toMatchObject({ selectorMatched: true, selectorRecovered: true });
    expect(contentMarkup(result)).toContain('The publication keeps its reading content through hydration.');
    expect(contentMarkup(result)).not.toContain('A recommendation');
  });

  it.each(['has-sidebar', 'no-sidebar', 'with-sidebar', 'without-sidebar'])(
    'keeps prose within the %s layout while dropping the actual sidebar', async layout => {
      const html = `<div class="${layout}"><div class="publication"><p>The publication contains an authored observation.</p>` +
        '<div class="sidebar"><p>A separate sidebar panel.</p></div></div></div>';
      const result = await extract(html, undefined, { articleContainer: `.${layout}`, content: '.publication' });
      expect(contentMarkup(result)).toContain('The publication contains an authored observation.');
      expect(contentMarkup(result)).not.toContain('A separate sidebar panel.');
    }
  );

  it('keeps selected prose and authored anchors below a layout with auxiliary components', async () => {
    const html = '<main><div class="layout-navigation split-sidebar-shell related-records-grid social-region share-tools-frame">' +
      '<div class="publication"><section id="notes-for-comments"><h2>Notes for comments</h2>' +
      '<p>The publication retains its commentary policy.</p></section>' +
      '<section id="tuning-cookie-options"><h2>Cookie options</h2><p>Each option controls compiler behavior.</p></section>' +
      '<section id="comments"><h2>Comments</h2><p>A visitor message.</p></section>' +
      '<div class="related-posts"><p>A separate recommendation.</p></div>' +
      '<div class="menu"><p>Navigation controls.</p></div></div></div></main>';
    const result = await extract(html, undefined, { articleContainer: 'main', content: '.publication' });
    expect(contentMarkup(result)).toContain('The publication retains its commentary policy.');
    expect(contentMarkup(result)).toContain('Each option controls compiler behavior.');
    expect(contentMarkup(result)).not.toMatch(/A visitor message|A separate recommendation|Navigation controls/);
  });

  it.each([
    ['<div id="publication-header">', '<div class="body-copy">'],
    ['<div class="subscribe-frame">', '<div class="body-copy">'],
    ['<div class="article-comments-layout">', '<div class="body-copy">'],
    ['<div class="group/header-controls">', '<div class="body-copy">'],
    ['<div>', '<div class="body-copy report-ad" id="report-ad">']
  ])('keeps selected prose within a shared reading layout (%s, %s)', async (layout, body) => {
    const first = 'The field team recorded the first independent measurement before dawn and checked it against the reference.';
    const last = 'A second observer repeated the measurement that evening and documented the difference in recorded temperature.';
    const html = `<!doctype html><title>Field observations</title><main><h1>Field observations</h1>${layout}${body}
      <p>${first}</p><div data-component="ad"><p>Sponsored message within the report.</p></div>
      <div class="ad-rail"><p>Unrelated advertising panel.</p></div>
      <div class="newsletter"><p>Unrelated newsletter promotion.</p></div>
      <p>${last}</p></div></div></main>`;
    const result = await extract(html, undefined, { content: '.body-copy' });
    expect(result.content.map(item => item.text)).toEqual([first, last]);
  });

  it.each(['newsletter-widget', 'subscribe-banner', 'partner-ad'])('rejects an independent %s that also matches a positive selector', async panel => {
    const first = 'The field team recorded the first independent measurement before dawn and checked it against the reference.';
    const last = 'A second observer repeated the measurement that evening and documented the difference in recorded temperature.';
    const html = `<!doctype html><title>Field observations</title><main><h1>Field observations</h1>
      <div class="body-copy"><p>${first}</p><p>${last}</p></div>
      <div class="${panel}"><div class="body-copy"><p>Take advantage of this exclusive opportunity to support the ongoing volunteer activities of this organization.</p>
      <p>Every new member receives a gift and early access to discounts available throughout the coming calendar year.</p></div></div></main>`;
    const result = await extract(html, undefined, { content: `.body-copy,.${panel}` });
    expect(result.content.map(item => item.text)).toEqual([first, last]);
  });

  it('retains prose when a selected wrapper contains both a standfirst and the body', async () => {
    const lead = 'The field report was prepared by independent observers who used the same reference instrument.';
    const first = 'The field team recorded the first independent measurement before dawn and checked it against the reference.';
    const last = 'A second observer repeated the measurement that evening and documented the difference in recorded temperature.';
    const result = await extract(`<main><h1>Field observations</h1><section class="report">
      <p>${lead}</p><div class="report-ad"><p>${first}</p><p>${last}</p></div></section></main>`, undefined, { content: '.report' });
    expect(result.content.map(item => item.text)).toEqual([lead, first, last]);
  });

  it('preserves an article body built as a widget component and rejects a sibling widget', async () => {
    const first = 'The field report records the first sample after the spring thaw.';
    const last = 'A second observation confirms the direction of the temperature change.';
    const result = await extract(`<main><div class="widget"><article><h1>Field observations</h1>
      <div class="widget__body"><section class="editorial"><p>${first}</p><p>${last}</p></section></div>
      <div class="widget"><section class="editorial"><p>Check the forecast in the weather widget.</p></section></div>
      </article></div></main>`, undefined, {content: '.editorial'});
    expect(result.content.map(item => item.text)).toEqual([first, last]);
  });

  it('keeps a full publication rendered in an overlay layout and excludes a dialog in the publication', async () => {
    const first = 'The first reported observation was measured shortly before sunrise.';
    const last = 'The report concludes with an independent observation from a second site.';
    const result = await extract(`<!doctype html><title>Field observations | Journal</title><main>
      <div class="article-overlay"><div class="content-overlay-wrapper">
      <h1>Field observations</h1><div class="editorial"><p>${first}</p>
      <div class="article-overlay" role="dialog"><p>A menu for the overlay.</p></div><p>${last}</p>
      </div></div></div></main>`, undefined, {content: '.editorial'});
    expect(result.content.map(item => item.text)).toEqual([first, last]);
  });

  it('keeps each image and caption of a composite figure in source order', async () => {
    const result = await extract('<main><article><h1>Survey</h1><p>See the paired images below.</p><figure>' +
      '<div><img src="/first.png" width="800" height="500"><figcaption><p>First documented observation.</p></figcaption></div>' +
      '<div><img src="/last.png" width="800" height="500"><figcaption><p>Last documented observation.</p></figcaption></div>' +
      '</figure><p>The survey was completed before winter.</p></article></main>', undefined, {content: 'article'});
    const items = result.content.map(item => item.src || JSDOM.fragment(item.text).textContent);
    expect(items).toEqual([
      'See the paired images below.', 'https://example.com/first.png', 'First documented observation.',
      'https://example.com/last.png', 'Last documented observation.', 'The survey was completed before winter.'
    ]);
  });

  it('keeps a visible authored paragraph with an access label while honoring a real reading barrier', async () => {
    const article = '<main><article><h1>Field observations</h1><p>Public introduction.</p>' +
      '<section class="report"><p class="paywall">A second observation was visible in the report.</p></section></article></main>';
    const normal = await extract(article, undefined, {content: 'article'});
    expect(contentMarkup(normal)).toContain('A second observation');
    const gated = await extract(article + '<div class="paywall-modal"><button>Subscribe to continue</button></div>', undefined, {content: 'article'});
    expect(contentMarkup(gated)).toContain('Public introduction');
    expect(contentMarkup(gated)).not.toContain('A second observation');
  });

  it('omits publisher signup invitations without removing adjacent authored notes', async () => {
    const html = '<main><article><h1>Field observations</h1><p>The instrument recorded a steady temperature.</p>' +
      '<div class="cta-content"><p>Join thousands of newsletter subscribers</p><button>Sign up</button></div>' +
      '<p><strong>Do you want more stories like this? Then <a href="/subscriber/new">subscribe</a> to our updates.</strong></p>' +
      '<aside><p>This story appeared first in our newsletter. <a href="/newsletters/digest">Sign up here</a>.</p>' +
      '<p>Independent measurements are described in the source note.</p></aside>' +
      '<p>The team used a <a href="/newsletters/archive">newsletter archive</a> as a primary source.</p></article></main>';
    const result = await extract(html, undefined, {content: 'article'});
    const content = contentMarkup(result);
    expect(content).not.toMatch(/Join thousands|want more stories|Sign up here/);
    expect(content).toContain('Independent measurements');
    expect(content).toContain('newsletter archive');
  });

  it.each(['(opens a new tab)', 'opens in a new window'])('omits marked link announcements while preserving authored and mathematical text: %s', async label => {
    const result = await extract(`<main><p>A report <a href="https://example.com/reference">reference<span class="screen-reader-text">${label}</span><span class="sr-only">Essential reference description.</span></a> remains available. The quoted phrase “opens a new tab” is part of this paragraph. <span class="sr-only">Essential author text.</span><math><mtext class="sr-only">opens a new tab</mtext></math></p></main>`);
    const text = result.content.map(item => item.text || '').join('');
    expect(text).not.toContain(label === '(opens a new tab)' ? '(opens a new tab)' : 'opens in a new window');
    expect(text).toContain('Essential reference description.');
    expect(text).toContain('Essential author text.');
    expect(text).toContain('The quoted phrase');
    expect(text.match(/opens a new tab/g)).toHaveLength(2);
  });

  it.each(['.twitter-tweet', 'blockquote.twitter-tweet'])('preserves readable embedded article quotations despite a widget exclusion: %s', async widgetSelector => {
    const result = await extract('<main><h1>Field observations</h1><div class="story"><p>The introduction provides context for the quotation.</p><blockquote class="twitter-tweet"><p>Repeated measurements improve the reliability of a field survey.</p>— Field observer <a href="https://example.com/notes/1">Reference</a></blockquote><p>The conclusion follows the quotation.</p></div></main>', undefined, { content: '.story', exclude: [widgetSelector] });
    const content = contentMarkup(result);
    expect(content.match(/Repeated measurements improve/g)).toHaveLength(1);
    expect(content.match(/Field observer/g)).toHaveLength(1);
    expect(content).toContain('The conclusion follows the quotation.');
  });

  it.each(['div class="omit"', 'div id="comments"', 'div class="advertisement"', 'nav'])('keeps embedded quotations excluded inside %s', async parent => {
    const tag = parent.split(' ')[0];
    const result = await extract(`<main><div class="story"><p>The article retains its own substantial introduction.</p><${parent}><blockquote class="twitter-tweet"><p>Excluded panel quotation must remain outside the document.</p></blockquote></${tag}><blockquote class="omit"><p>Explicitly excluded ordinary quotations must remain excluded.</p></blockquote><p>The article retains its conclusion.</p></div></main>`, undefined, { content: '.story', exclude: ['.twitter-tweet', '.omit', '#comments', '.advertisement', 'nav'] });
    expect(JSON.stringify(result.content)).not.toContain('Excluded panel quotation');
    expect(JSON.stringify(result.content)).not.toContain('Explicitly excluded ordinary');
    expect(JSON.stringify(result.content)).toContain('The article retains its conclusion.');
  });

  it('rejects navigation before reading the new document and permits an anchor change', async () => {
    const html = '<h1>Article</h1><main><p>A paragraph with enough content to extract.</p></main>';
    await expect(extract(html, 'https://example.com/other-article')).rejects.toThrow('page changed');
    expect((await extract(html, 'https://example.com/article#section')).title).toBe('Article');
  });
  it.each(['Token budgets in C#', 'Budgeting for a project', 'C# and F# language design'])('preserves ordinary title text: %s', async title => {
    expect((await extract(`<h1>${title}</h1><main><p>A paragraph with enough content to extract.</p></main>`)).title).toBe(title);
  });

  it('keeps distinct images with matching paths on different hosts or different path case', async () => {
    const urls = ['https://first.example/Photo.png', 'https://second.example/Photo.png', 'https://first.example/photo.png'];
    const result = await extract(`<main>${urls.map(url => `<img src="${url}" width="200" height="200">`).join('')}</main>`);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(urls);
  });

  it('keeps inline text contiguous around a linked external indicator', async () => {
    const result = await extract('<main><h1>Technical report</h1><p>These measurements follow the <a href="https://reference.example/" data-extlink>original method</a><svg width="20" height="14" data-extlink-placement="after" role="img" aria-label="External link"><title>External link</title><circle cx="7" cy="7" r="6"></circle></svg> (revised for the second edition).</p></main>', undefined, { content: 'main', title: 'h1' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph']);
    expect(contentMarkup(result)).toContain('<a href="https://reference.example/" data-extlink="">original method</a> (revised for the second edition).');
    expect(contentMarkup(result)).not.toContain('External link');
  });

  const before = 'Before the figure: calibration improves measurements.';
  const after = 'After the figure: compare the recorded observations.';
  const figure = '<figure><img src="https://images.example/first.png" width="500" height="400"><figcaption>Calibration plot caption.</figcaption></figure>';
  it.each([
    `${before}${figure}${after}`,
    `<span>${before}</span>${figure}<span>${after}</span>`,
    `<span>${before}${figure}${after}</span>`
  ])('preserves inline prose around a figure in DOM order: %s', async snippet => {
    const result = await extract(`<main><div class="story">${snippet}</div><img src="https://images.example/second.png" width="500" height="400"></main>`, undefined, { content: '.story,img' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'image']);
    expect(result.content[0].text).toContain(before);
    expect(result.content[2].text).toContain(after);
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text).join('')).not.toContain('Calibration plot caption.');
    expect(contentMarkup(result).match(/Before the figure/g)).toHaveLength(1);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://images.example/first.png', 'https://images.example/second.png']);
    expect(result.content[1].caption).toBe('Calibration plot caption.');
  });

  it('preserves inline formatting and excludes matching subtrees around the figure', async () => {
    const result = await extract(`<main><div class="story"><span style="font-weight:bold">${before}${figure}<span class="omit">Excluded prose.</span>${after}</span></div></main>`, undefined, { content: '.story,img', exclude: ['.omit'] });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(result.content[0].text).toContain(`<strong>${before}</strong>`);
    expect(result.content[2].text).toContain(`<strong>${after}</strong>`);
    expect(JSON.stringify(result.content)).not.toContain('Excluded prose.');
  });

  it('does not emit excluded figures or duplicate overlapping selected descendants', async () => {
    const result = await extract(`<main><div class="story"><font>${before}${figure}${after}</font><figure class="omit"><img src="https://images.example/omitted.png" width="500" height="400"><figcaption>Excluded caption.</figcaption></figure></div></main>`, undefined, { content: '.story,font,img', exclude: ['.omit'] });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(contentMarkup(result).match(/Before the figure/g)).toHaveLength(1);
    expect(JSON.stringify(result.content)).not.toContain('omitted.png');
    expect(JSON.stringify(result.content)).not.toContain('Excluded caption.');
  });

  it('keeps structured paragraphs and lists on their existing extraction path', async () => {
    const result = await extract(`<main><div class="story"><p>${before}</p>${figure}<ul><li>A recorded observation.</li></ul><p>${after}</p></div></main>`, undefined, { content: '.story,img' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'list', 'paragraph']);
    expect(result.content[0].text).toBe(before);
    expect(result.content[3].text).toBe(after);
  });

  it.each([
    ['table', '<table><tbody><tr><td>Recorded value</td><td>12</td></tr></tbody></table>', 'Recorded value'],
    ['code', '<pre><code>const answer = 42;</code></pre>', 'const answer = 42;']
  ])('preserves %s content inside a non-image figure', async (type, body, expected) => {
    const result = await extract(`<main><div class="story">${before}<figure>${body}<figcaption>Recorded example.</figcaption></figure>${after}</div></main>`, undefined, { content: '.story,table,pre' });
    expect(result.content.some(item => item.type === type)).toBe(true);
    expect(JSON.stringify(result.content)).toContain(expected);
  });
});

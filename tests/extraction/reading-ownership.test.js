import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { collectAnnotationTargets } from '../../scripts/extraction/extractor/annotations.js';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';

const pages = [];
let source;
beforeAll(async () => { source = await generateExtractAutomaticallyInlined(); });
afterEach(() => { pages.splice(0).forEach(page => page.window.close()); });
async function extract(body, selectors = {}) {
  const page = new JSDOM(`<!doctype html><title>Field report</title>${body}`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  pages.push(page);
  page.window.console.log = () => {};
  page.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
  const before = page.window.document.documentElement.outerHTML;
  const result = await page.window.extract(page.window.location.href, false, { content: 'article', title: 'h1', ...selectors });
  expect(result.error).toBeUndefined();
  expect(page.window.document.documentElement.outerHTML).toBe(before);
  const node = page.window.document.createElement('div');
  node.innerHTML = result.content.map(item => item.type === 'list'
    ? item.items.map(value => typeof value === 'string' ? value : value.html || value.text || '').join(' ')
    : item.html || item.text || item.caption || '').join(' ');
  return { ...result, plain: node.textContent.replace(/\s+/g, ' ').trim() };
}
describe('Reading ownership', () => {
  it('keeps short authored units in a selected body while respecting actual UI owners', async () => {
    const result = await extract('<h1>Field report</h1><nav><p>Publisher navigation.</p></nav><h2>2035</h2><div>Q7</div><aside><p>An authored summary remains available.</p></aside><div data-module="ad"><p>A promoted result must stay out.</p></div>', { content: 'body' });
    expect(result.plain).toBe('2035 Q7 An authored summary remains available.');
  });

  it('keeps protected ancestors separate from identically named excluded descendants in cloned fragments', async () => {
    const result = await extract('<div class="panel"><article><h1>Field report</h1><div>Before <strong>the first boundary <span class="panel">Excluded inline promotion.</span><p>A complete nested observation.</p> after the boundary.</strong></div><p>The closing observation remains.</p></article></div>', { articleContainer: 'article', exclude: ['.panel'] });
    expect(result.plain).toContain('Before the first boundary');
    expect(result.plain).toContain('A complete nested observation.');
    expect(result.plain).toContain('after the boundary.');
    expect(result.plain).toContain('The closing observation remains.');
    expect(result.plain).not.toContain('Excluded inline');
  });
  it('preserves direct flow text, definition groups, editorial followups, and actual visibility', async () => {
    const result = await extract('<article><h1>Field report</h1>Opening statement.<section>Section introduction.<h2><em>Station details</em></h2>Section conclusion.</section><dl><dt id="scale">Scale</dt><dt>Calibration scale</dt><dd>The first definition.</dd><dd>The second definition.</dd></dl><aside class="corrections"><p>A correction retains the uncertainty interval.</p></aside><section class="further-reading"><h2>Further reading</h2><p>A supporting account remains available.</p></section><div style="display:none"><p>A hidden draft must stay out.</p></div><div style="visibility:hidden"><p style="visibility:visible">A visible descendant remains readable.</p></div><p aria-hidden="true">A visible annotation remains readable.</p>Closing statement.</article>');
    for (const value of ['Opening statement.', 'Section introduction.', 'Station details', 'Section conclusion.', 'Scale', 'Calibration scale', 'The first definition.', 'The second definition.', 'A correction retains the uncertainty interval.', 'Further reading', 'A supporting account remains available.', 'A visible descendant remains readable.', 'A visible annotation remains readable.', 'Closing statement.']) {
      expect(result.plain).toContain(value);
    }
    expect(result.plain).not.toContain('hidden draft');
    expect(result.content.some(item => item.id === 'scale')).toBe(true);
  });
  it('retains numeric links, powers, literal references and numeric headings', async () => {
    const result = await extract('<article><h1>Field results in <a href="#year">2025</a></h1><h2>2025</h2><h2>Response x<sup><a href="#power">2</a></sup></h2><h2>Literal <code><a role="doc-noteref" href="#year">2025</a></code> sample</h2><p id="year">The year is an independently linked measurement.</p><p id="power">The exponent is an independently linked definition.</p></article>');
    expect(result.title).toBe('Field results in 2025');
    expect(result.content.filter(item => item.type === 'heading').map(item => item.text)).toEqual(['2025', 'Response x2', 'Literal 2025 sample']);
  });
  it('omits positively identified title note markers', async () => {
    const result = await extract('<article><h1>Field observations<sup id="ref"><a href="#note" role="doc-noteref">1</a></sup></h1><p>The complete observation remains readable.</p><ol><li id="note" role="doc-footnote">An instrument definition.<a href="#ref" role="doc-backlink">Back</a></li></ol></article>');
    expect(result.title).toBe('Field observations');
    expect(result.plain).toContain('instrument definition');
  });
  it('preserves the article inside an application form with a separate subscription footer', async () => {
    const result = await extract('<form><article><h1>Field report</h1><h2>Survey</h2><p>The first observation establishes the baseline.</p><p>The final observation closes the record.</p></article><footer><input type="email"><button>Subscribe</button></footer></form>');
    expect(result.plain).toBe('Survey The first observation establishes the baseline. The final observation closes the record.');
  });
  it('preserves short figure text and captions in order', async () => {
    const result = await extract('<article><h1>Field report</h1><figure>Measured station.<img src="/chart.png" width="640" height="480"><p>8 m</p><figcaption>Q7</figcaption></figure></article>');
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'paragraph']);
    expect(result.plain).toBe('Measured station. 8 m Q7');
  });
  it('preserves independent equal text and image occurrences', async () => {
    const result = await extract('<article><h1>Field report</h1><div>The same observation is intentionally repeated.</div><p>An intervening observation establishes a new reading position.</p><div>The same observation is intentionally repeated.</div><figure><img src="/chart.png" width="640" height="480"><figcaption>Earlier measurement.</figcaption></figure><figure><img src="/chart.png" width="640" height="480"><figcaption>Later measurement.</figcaption></figure></article>');
    expect(result.plain.match(/same observation/g)).toHaveLength(2);
    expect(result.content.filter(item => item.type === 'image').map(item => item.caption)).toEqual(['Earlier measurement.', 'Later measurement.']);
  });
  it('reads presentation tables as flow without consuming their media', async () => {
    const result = await extract('<article><h1>Field report</h1><table role="presentation"><tr><td><h2>Measurements</h2><p>The first observation remains before its image.</p><img src="/chart.png" width="640" height="480"><p>The final observation remains after its image.</p></td></tr></table></article>');
    expect(result.content.map(item => item.type)).toEqual(['heading', 'paragraph', 'image', 'paragraph']);
  });

  it('retains selected prose inside a table outside the reading roots', async () => {
    const html = '<h1>Field report</h1><table><tr><td><p>Navigation.</p></td><td><p id="report">The first observation.<br>The final observation.</p></td></tr></table>';
    const result = await extract(html, { content: '#report' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph']);
    expect(result.content[0].html).toContain('The first observation.<br>The final observation.');
    expect(result.plain).not.toContain('Navigation.');
  });

  it('keeps reading links while dropping standalone comment controls', async () => {
    const result = await extract('<article><h1>Field report</h1><p>See <a href="#notes">the notes</a> for details.</p><a href="#" class="open-comments-panel">Join the discussion</a><section id="notes"><h2>Notes</h2><p>The sample was sealed.</p></section></article>');
    expect(result.plain).toContain('See the notes for details.');
    expect(result.plain).toContain('The sample was sealed.');
    expect(result.plain).not.toContain('Join the discussion');
  });

  it('keeps a titled aside linked from another selected reading root', async () => {
    const html = '<main><h1>Field report</h1><section class="contents"><a href="#method">Calibration method</a></section>' +
      '<div class="body"><p>The first observation.</p><aside id="method" class="sidebar"><h3>Calibration method</h3>' +
      '<p>The instrument was sealed after calibration.</p></aside><aside class="sidebar" id="other"><h3>Updates</h3>' +
      '<p>Publisher announcements and updates.</p></aside></div></main>';
    const result = await extract(html, { articleContainer: 'main', content: '.contents, .body' });
    expect(result.plain).toContain('The instrument was sealed after calibration.');
    expect(result.plain).not.toContain('Publisher announcements and updates.');
  });

  it('uses a selected contents list as evidence without exporting it as article prose', async () => {
    const html = '<a href="#other">Updates</a><main><h1>Field report</h1><div id="contents"><h2>Contents</h2>' +
      '<a href="#method">Calibration method</a></div><div id="story"><p>The first observation.</p>' +
      '<aside id="method" class="sidebar"><h3>Calibration method</h3><p>The instrument was sealed after calibration.</p>' +
      '<ul><li>Measure the reference first.</li></ul></aside>' +
      '<aside id="other" class="sidebar"><h3>Updates</h3><p>Publisher announcements and updates.</p></aside></div></main>';
    const result = await extract(html, { articleContainer: 'main', content: '#story', toc: '#contents' });
    expect(result.plain).toContain('The instrument was sealed after calibration.');
    expect(result.plain).toContain('Measure the reference first.');
    expect(result.content.find(item => item.type === 'heading' && item.text === 'Calibration method')?.id).toBe('method');
    expect(result.plain).not.toContain('Publisher announcements and updates.');
    expect(result.plain).not.toContain('Contents');
  });

  it('drops a newsletter banner owned by a sign-up panel while retaining editorial figures', async () => {
    const result = await extract('<article><h1>Field report</h1><figure><img src="/measuring.png" width="640" height="480" alt="Test apparatus"><figcaption>Measuring apparatus</figcaption></figure>' +
      '<p>Measurements were taken at regular intervals.</p><div><figure><img src="/promo.png" width="640" height="480" alt="A promotional banner for the bulletin"></figure>' +
      '<p><a href="/newsletters/lab">Sign up for the bulletin</a> for weekly updates.</p></div></article>');
    const sources = result.content.filter(item => item.type === 'image').map(item => item.src);
    expect(sources).toEqual(['https://example.test/measuring.png']);
    expect(result.plain).not.toContain('weekly updates');
  });

  it('drops a banner in the neighboring sign-up block and keeps a captioned editorial image', async () => {
    const html = '<article><h1>Field report</h1><p>Measurements were taken at regular intervals.</p>' +
      '<div><div><figure><img src="/promo.png" width="640" height="480" alt="A promotional banner for the bulletin"></figure></div></div>' +
      '<div><div><p><a href="/newsletters/lab">Sign up for the bulletin</a> for weekly updates.</p></div></div>' +
      '<div><figure><img src="/measuring.png" width="640" height="480" alt="A promotional banner at the site"><figcaption>An exhibit documented in the report.</figcaption></figure></div></article>';
    const result = await extract(html);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/measuring.png']);
    expect(result.plain).not.toContain('weekly updates');
  });

  it('omits the source headline after masthead metadata while keeping later headings and links', async () => {
    const url = 'https://www.google.com/preferences/source?q=example.test';
    const result = await extract('<article><p><a href="/reports">Field reports</a></p><h1>Field report</h1>' +
      '<div data-preferred-source><a href="' + url + '">Follow this publisher</a></div><p>The first observation.</p>' +
      '<section><h1>Field report</h1><p><a href="' + url + '">Background link</a> is an editorial link.</p></section></article>');
    expect(result.title).toBe('Field report');
    expect(result.content.filter(item => item.type === 'heading').map(item => item.text)).toEqual(['Field report']);
    expect(result.plain).toContain('Background link');
    expect(result.plain).not.toContain('Follow this publisher');
  });

  it('keeps links inline when a hidden browser announcement has a block layout', async () => {
    const result = await extract('<article><h1>Field report</h1><p>See <a href="/methods">the method' +
      '<span class="screen-reader-text" style="display: block; position: absolute">(opens a new tab)</span>' +
      '</a>, which uses a calibrated instrument.</p></article>');
    const text = result.content.find(item => item.type === 'paragraph').html;
    expect(text).toContain('the method</a>, which');
    expect(text).not.toContain('<br');
  });
  it('follows authored note portals without exporting adjacent account controls', async () => {
    const result = await extract('<article><h1>Field report</h1><p>An observation<button popovertarget="measurement-note" aria-label="Footnote"><span></span></button> retains its note.</p><p>A <button popovertarget="term">calibrated</button> instrument was used.</p></article><div id="measurement-note" popover hidden><p>The instrument was calibrated independently.</p><blockquote>Calibration retained the uncertainty bound.</blockquote></div><div id="term" popover><p>A scale comparison defines this term.</p></div><div id="account" popover><form><input name="email"><button>Sign in</button></form></div>');
    expect(result.plain).toContain('calibrated instrument');
    expect(result.plain).toContain('The instrument was calibrated independently.');
    expect(result.plain).toContain('Calibration retained the uncertainty bound.');
    expect(result.plain).toContain('A scale comparison defines this term.');
    expect(JSON.stringify(result.content)).not.toContain('Sign in');
    expect(result.content.some(item => item.id === 'measurement-note')).toBe(true);
  });

  it.each(['aria-describedby', 'aria-controls'])('excludes interface text reached through %s', async attribute => {
    const result = await extract(`<article><h1>Field report</h1>
      <p>The recorded value remained stable <button ${attribute}="panel-tip">Options</button>during the second trial.</p>
      </article><div role="tooltip" hidden><p id="panel-tip">Choose the order of the displayed items.</p></div>`);
    expect(result.plain).toBe('The recorded value remained stable during the second trial.');
    expect(result.content.some(item => item.id === 'panel-tip')).toBe(false);
  });

  it.each([
    ['aria-describedby="note"', '<p id="note" role="doc-footnote" hidden>'],
    ['aria-controls="note" data-citation', '<p id="note" hidden>'],
    ['aria-controls="note"', '<p id="note" popover hidden>'],
    ['popovertarget="note"', '<p id="note" popover hidden>']
  ])('keeps authored annotation dependencies for %s', async (reference, target) => {
    const result = await extract(`<article><h1>Field report</h1>
      <p>A recorded value <button ${reference}>Analysis note</button> remains available.</p></article>
      ${target}The independent calibration preceded the second trial.</p>`);
    expect(result.plain).toContain('The independent calibration preceded the second trial.');
    expect(result.content.filter(item => item.id === 'note')).toHaveLength(1);
    expect(result.content.some(item => item.html?.includes('href="#note"'))).toBe(true);
  });
  it('preserves a closed annotation, its nested citation, and distinct visibility exclusions', async () => {
    const result = await extract(`<style>
      [popover]:not([data-ready]) { visibility:hidden; display:none; }
      .visible { visibility:visible; }
      .concealed { visibility:hidden; }
    </style><article><h1>Field report</h1><p>Observation <button popovertarget="detail" aria-label="Note"></button>
      <button popovertarget="actions">Options</button><button popovertarget="detail" aria-label="Note"></button>.</p>
      <div popover id="detail"><p>Supporting data <em>from the instrument</em>.
      <button popovertarget="citation">Full citation</button><span hidden>Hidden draft.</span>
      <span style="display:none">Alternate draft.</span><span style="visibility:hidden">Inline draft.</span>
      <span class="visible">Confirmed reading.<span class="concealed">Concealed label.</span></span></p>
      <div popover id="citation"><p>Independent survey, 2030.</p></div></div>
      <div popover id="actions" role="menu"><ul><li>Change the report.</li></ul></div></article>`);
    expect(result.plain).toContain('Supporting data from the instrument. Full citation');
    expect(result.plain).toContain('Confirmed reading.');
    expect(result.plain).toContain('Independent survey, 2030.');
    expect(result.plain).not.toMatch(/draft|Concealed label|Change the report/);
    expect(result.content.filter(item => item.id === 'detail')).toHaveLength(1);
    expect(result.content.filter(item => item.id === 'citation')).toHaveLength(1);
  });
  it('keeps punctuation with linked words when an inline icon ends a disclosed paragraph', async () => {
    const result = await extract('<article><h1>Field report</h1><p>Observation <button popovertarget="detail">Note</button>.</p></article><div id="detail" popover>See a <a href="/sample">sample entry<svg aria-hidden="true" class="note-icon"><path d="M0 0L3 2"/></svg></a>.</div>');
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.html)).toContain('See a <a href="https://example.test/sample">sample entry</a>.');
    expect(result.content.some(item => item.text === '.')).toBe(false);
  });
  it('recovers a referenced annotation that general reading filters did not export', async () => {
    const result = await extract('<article><h1>Field report</h1><p>Measurement<a href="#offset" role="doc-noteref">1</a>.</p><aside class="sidebar" id="offset"><p>The offset was measured separately.</p></aside></article>');
    expect(result.plain).toContain('The offset was measured separately.');
    expect(result.content.filter(item => item.id === 'offset')).toHaveLength(1);
  });
  it('checks reading visibility only for eligible annotation sources and keeps nested notes', () => {
    const page = new JSDOM(`<!doctype html><p id="reading">
      ${Array.from({ length: 80 }, (_, index) => `<a href="/report/${index}">Related report</a>`).join('')}
      <a id="hidden-reference" role="doc-noteref" href="#note">Hidden reference</a>
      <a id="visible-reference" role="doc-noteref" href="#note">Observed detail</a>
      <a id="duplicate-reference" role="doc-noteref" href="#note">Repeated reference</a>
      <a id="known-reference" role="doc-noteref" href="#known">Already present</a>
      <a id="excluded-reference" class="omit" role="doc-noteref" href="#excluded-source">Excluded reference</a>
      <a id="excluded-target-reference" role="doc-noteref" href="#excluded-target">Excluded target</a>
    </p><div id="note" popover><p>The original observation includes
      <a role="doc-noteref" href="#detail">an independent measurement</a>.</p></div>
    <p id="detail">Supporting measurement.</p><p id="known">A previously emitted note.</p>
    <p id="excluded-source">Unreferenced material.</p><p id="excluded-target" class="omit">Excluded material.</p>`,
    { url: 'https://example.test/report' });
    pages.push(page);
    const checked = [];
    const dependencies = collectAnnotationTargets([page.window.document.getElementById('reading')], new Set(['known']), ['.omit'], reference => {
      checked.push(reference.id);
      return reference.id !== 'hidden-reference';
    });
    expect(checked).toEqual(['hidden-reference', 'visible-reference']);
    expect(dependencies.map(({ target, label }) => [target.id, label])).toEqual([
      ['note', 'Observed detail'], ['detail', 'an independent measurement']
    ]);
    expect(dependencies[1].clone.textContent).toBe('Supporting measurement.');
  });
  it('links repeated citation popups to one matching bibliography paragraph', async () => {
    const entry = 'Survey Group. <a href="https://example.test/method">Coastal measurements.</a>';
    const result = await extract(`<article><h1>Field report</h1><p>The field comparison <button data-citation popovertarget="cite-one">Survey Group</button>
      also draws on <button data-citation popovertarget="cite-two">the same methods</button>.</p><p>Related note<button popovertarget="repeat">Note</button>.</p><h2>References</h2><p id="survey">${entry}</p></article>
      <div popover id="cite-one"><p>${entry}</p></div><div popover id="cite-two"><p>${entry}</p></div><div popover id="repeat"><p>${entry}</p></div>`);
    expect(result.plain.match(/Coastal measurements/g)).toHaveLength(2);
    expect(result.content.filter(item => item.id === 'repeat')).toHaveLength(1);
    const paragraph = result.content.find(item => item.html?.includes('field comparison'));
    expect(paragraph.html.match(/href="#survey"/g)).toHaveLength(2);
  });
  it('retains source table spacing and muted values while dropping standalone input labels', async () => {
    const result = await extract(`<style>table{color:rgb(0,0,0)}.lighter{color:rgb(100,101,102)}.date{margin-inline-start:8px}</style>
      <article><h1>Field report</h1><div><span id="mode">Choose a view</span><button aria-labelledby="mode">Options</button></div>
      <table><tbody><tr><th><b>Station A</b><span class="date">May 2030</span></th><td class="lighter">18</td></tr>
      <tr><th>Station B</th><td>22</td></tr></tbody></table></article>`);
    expect(result.plain).not.toContain('Choose a view');
    const table = result.content.find(item => item.type === 'table');
    expect(table.rows[0][0]).toMatch(/<\/b>\s+<span/);
    expect(table.layoutRows[0].cells[1].muted).toBe(true);
    expect(table.layoutRows[1].cells[1].muted).toBeUndefined();
  });
  it('preserves CSS text boundaries while excluding labels owned only by controls', async () => {
    const result = await extract('<style>.row{display:flex;gap:1em}.date{display:block}</style><article><h1>Field report</h1><h2 class="row">Survey results<span>2025</span></h2><p><span>Station A</span><span class="date">June 2025</span></p><div id="mode-label">Choose a view</div><div role="radiogroup" aria-labelledby="mode-label"><button>Overview</button></div><p>The closing observation remains readable.</p></article>');
    expect(result.plain).toContain('Survey results 2025');
    expect(result.plain).toContain('Station A June 2025');
    expect(result.plain).not.toContain('Choose a view');
  });
  it('keeps ordinary prose after an image separate from actual caption ownership', async () => {
    const result = await extract('<article><h1>Field report</h1><img src="/chart.png" width="640" height="480"><p>The next paragraph begins an independently authored argument.</p><img src="/second.png" width="640" height="480"><p class="image-caption">Measured response at the station.</p></article>');
    expect(result.content.filter(item => item.type === 'image').map(item => item.caption)).toEqual(['', 'Measured response at the station.']);
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text)).toEqual(['The next paragraph begins an independently authored argument.']);
  });
  it('honors nested exclusions within owned image captions', async () => {
    const result = await extract('<article><h1>Field report</h1><figure><img src="/chart.png" width="640" height="480"><figcaption>Measured response.<span class="omit">An unrelated promotion.</span></figcaption></figure></article>', { exclude: ['.omit'] });
    expect(result.content.find(item => item.type === 'image').caption).toBe('Measured response.');
  });
  it('follows a semantic note outside the reading root without discarding numeric source links', async () => {
    const result = await extract('<article><h1>Field report</h1><p>An observation<sup><a href="#note" role="doc-noteref">1</a></sup> and the <a href="#unavailable">2025</a> record remain readable.</p></article><ol><li id="note" role="doc-footnote">The calibration is described in this independent note.</li></ol>');
    expect(result.plain).toContain('2025');
    expect(result.plain).toContain('The calibration is described in this independent note.');
  });
  it('preserves literal heading syntax and sibling prose around an individually translated term', async () => {
    const result = await extract('<article><h1>Field report</h1><h2>C#</h2><h2>Comparing x &lt; y &gt; z</h2><h2>Notation [left | right]</h2><p>Leading prose <span data-original-text="original term">translated term</span> trailing prose.</p></article>');
    expect(result.content.filter(item => item.type === 'heading').map(item => item.text)).toEqual(['C#', 'Comparing x < y > z', 'Notation [left | right]']);
    expect(result.plain).toContain('Leading prose original term trailing prose.');
  });
});

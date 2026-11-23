import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';

const pages = [];
let source;
beforeAll(async () => { source = await generateExtractAutomaticallyInlined(); });
afterEach(() => { pages.splice(0).forEach(page => page.window.close()); });

async function extract(body, selectors = { content: 'article', title: 'h1' }) {
  const page = new JSDOM(`<!doctype html><title>Field report</title>${body}`, {
    url: 'https://example.test/report', runScripts: 'outside-only'
  });
  pages.push(page);
  page.window.console.log = () => {};
  page.window.eval(source.replace('export async function', 'async function') + '\nwindow.entry = extractAutomaticallyInlined;');
  const serialized = page.window.entry.toString();
  const entry = page.window.eval(`(${serialized})`);
  const before = page.window.document.body.innerHTML;
  const result = await entry(page.window.location.href, false, selectors);
  expect(result.error).toBeUndefined();
  expect(page.window.document.body.innerHTML).toBe(before);
  return result;
}

describe('Serializable article runtime', () => {
  it('keeps imported helpers and configuration inside the serialized function', async () => {
    const result = await extract('<article><h1>Field report</h1><aside><h2>Summary</h2><p>Every independent observation remains available to the reader.</p></aside><p>The report ends with the measured conclusion.</p></article>');
    expect(result.content.map(item => item.text).join(' ')).toContain('Every independent observation');
    expect(result.content.map(item => item.text).join(' ')).toContain('measured conclusion');
  });

  it('retains reading text while filtering structurally owned navigation', async () => {
    const result = await extract('<article><h1>Field report</h1><nav><p>Next article</p></nav><p>The article analyzes how newsletter subscriptions change reading habits.</p></article>');
    expect(JSON.stringify(result.content)).not.toContain('Next article');
    expect(JSON.stringify(result.content)).toContain('newsletter subscriptions');
  });

  const report = 'The survey records the route from the valley to the upper ridge. The observers compared the depth of each channel and marked where the ridge begins. They returned the next morning to confirm their measurements and to inspect the reference markers beside the path. The report gives each result alongside the conditions for interpreting it. The accompanying illustrations identify the points at which the instruments were placed. These independent checks preserve enough context for a second group to understand the account.';

  it.each([null, { content: 'article' }])('excludes a recommendation collection while preserving reading order in mode %j', async selectors => {
    const result = await extract(`
      <article><h1>Field report</h1><p>${report}</p><div>
        Direct prose before the cards.
        <section><h2>Related Blog Posts</h2><button>Customize suggestions</button><div>
          <div><a href="/other-report"><h3>Another report</h3></a><p>First recommendation summary.</p></div>
          <div><a href="/archive"><h3>Archive item</h3></a><p>Second recommendation summary.</p></div>
        </div></section>
        Direct prose after the cards.
      </div><p>The measurements end here.</p></article>`, selectors);
    const content = result.content.map(item => item.text).join(' ');
    expect(content).toMatch(/Direct prose before the cards\..*Direct prose after the cards\..*The measurements end here\./s);
    expect(content).not.toMatch(/Related Blog Posts|Customize suggestions|Another report|recommendation summary|Archive item/);
  });

  it.each([null, { content: 'article' }])('keeps reading paragraphs and removes publisher controls in mode %j', async selectors => {
    const result = await extract(`
      <article><h1>Field report</h1><p>${report}</p>
        <figure><a href="#after-panel">Skip past newsletter promotion</a>
          <aside aria-label="Newsletter promotion"><p>Monthly reminders from the publisher.</p>
            <form><input aria-label="Email address"><button>Sign up</button></form>
          </aside><p id="after-panel" role="note">After newsletter promotion</p>
        </figure>
        <p>All measurements in the second survey were obtained independently.</p>
        <p><a href="/newsletter/weekly">Sign up for the weekly newsletter</a> to receive updates.</p>
        <blockquote><p><a href="/newsletter/weekly">Sign up for the weekly newsletter</a> was the original sign on the exhibit.</p></blockquote>
        <section><p>Leave a reply</p><form><input name="author"><textarea name="comment"></textarea>
          <button>Post</button><p>Reply form instructions.</p></form></section>
        <p>The final result and the supporting notes remain part of the report.</p>
        <section><h2>Subscribe to our updates</h2><p>Details about the publication membership.</p>
          <form><input type="email"><button>Subscribe</button></form><a href="/privacy">Privacy Policy</a></section>
      </article>`, selectors);
    const text = JSON.stringify(result.content);
    expect(text).toContain('All measurements in the second survey');
    expect(text).toContain('was the original sign on the exhibit');
    expect(text).toContain('The final result and the supporting notes');
    expect(text).not.toMatch(/to receive updates|Monthly reminders|newsletter promotion|Leave a reply|Reply form instructions|publication membership|Privacy Policy/i);
  });

  it.each([
    [null, true], [null, false], [{ content: 'article' }, true], [{ content: 'article' }, false]
  ])('keeps authored subsections in mode %j (linked: %s)', async (selectors, linked) => {
    const result = await extract(`
      <article><h1>Field report</h1><p>${report}</p>
        ${linked ? '<p>See <a href="#overview">the comparison below</a>.</p>' : ''}
        <section id="overview"><h2>Related Stories</h2>
          ${linked ? '' : '<p>The author compares these two reports with the field measurements.</p>'}
          <div><a href="/first"><h3>First source account</h3></a><p>Observations of the upper ridge.</p></div>
          <div><a href="/second"><h3>Second source account</h3></a><p>Observations of the lower valley.</p></div>
        </section>
      </article>`, selectors);
    expect(result.content.map(item => item.text).join(' ')).toMatch(/First source account.*upper ridge.*Second source account.*lower valley/s);
  });

  it('honors separately selected authored roots without admitting their unselected siblings', async () => {
    const result = await extract(`
      <article><h1>Field report</h1><div class="prose"><p>${report}</p></div>
        <p>Publisher message between the selected sections.</p>
        <section class="appendix"><h2>Related Stories</h2>
          <div><a href="/first"><h3>First source account</h3></a><p>Observations of the upper ridge.</p></div>
          <div><a href="/second"><h3>Second source account</h3></a><p>Observations of the lower valley.</p></div>
        </section>
      </article>`, { articleContainer: 'article', content: '.prose, .appendix' });
    const text = result.content.map(item => item.text).join(' ');
    expect(text).toMatch(/The survey records.*First source account.*upper ridge.*Second source account.*lower valley/s);
    expect(text).not.toContain('Publisher message');
  });

  it.each([null, { articleContainer: 'article', content: '.prose' }])('preserves an editorial owner inside a mixed layout (%j)', async selectors => {
    const result = await extract(`
      <div class="reading-with-sidebar">
        <article class="edition-newsletter-post">
          <h1>Field report</h1>
          <div class="prose">
            <p>${report}</p>
            <figure><img src="/map.png" width="640" height="480" alt="Trail map"><figcaption>Instrument locations.</figcaption></figure>
            <form class="newsletter"><p>Mailing list controls.</p><input type="email"><button>Subscribe</button></form>
            <div class="comments"><p>Reader discussion controls.</p></div>
            <div role="dialog" aria-modal="true"><p>Preference center controls.</p></div>
            <p>Last field measurement.</p>
          </div>
        </article>
        <aside class="sidebar"><p>Unrelated publisher directory.</p></aside>
      </div>`, selectors);
    const content = JSON.stringify(result.content);
    expect(content).toContain(report);
    expect(content).toContain('Instrument locations.');
    expect(content).toContain('Last field measurement.');
    for (const label of ['Mailing list controls.', 'Reader discussion controls.', 'Preference center controls.', 'Unrelated publisher directory.']) {
      expect(content).not.toContain(label);
    }
  });

  it('honors an explicit reader body inside a layout wrapper with a header token', async () => {
    const result = await extract(`
      <div class="layout-header-height">
        <header role="banner"><p>Publication masthead.</p></header>
        <div class="instapaper_body"><h1>Field report</h1><p>${report}</p>
          <div class="instapaper_ignore"><p>Reader settings for the publication.</p></div>
          <p>The final elevation readings belong to the main report.</p>
        </div>
        <p>Reader discussion posted under the report.</p>
      </div>`, null);
    const text = JSON.stringify(result.content);
    expect(text).toContain(report);
    expect(text).toContain('The final elevation readings');
    expect(text).not.toMatch(/Publication masthead|Reader settings|Reader discussion/);
  });

  it('projects a linked reading aside and rejects adjacent widgets', async () => {
    const result = await extract(`
      <main>
        <h1>Field report</h1>
        <nav><a href="#details">Equipment notes</a><a href="#promotion">Offers</a></nav>
        <p>${report}</p>
        <aside class="sidebar" id="details"><h2>Equipment notes</h2><p>The ruler was calibrated before each reading.</p><ul><li>Read from the marked edge.</li></ul></aside>
        <aside class="sidebar related" id="promotion"><h2>Offers</h2><p>An unrelated catalog listing.</p><ul><li>Open the catalog.</li></ul></aside>
        <aside class="sidebar"><h2>Help</h2><p>A publisher utility.</p></aside>
      </main>`, null);
    const content = JSON.stringify(result.content);
    expect(content).toContain('The ruler was calibrated before each reading.');
    expect(content).toContain('"id":"details"');
    expect(result.content.filter(item => item.type === 'list').flatMap(item => item.items.map(entry => entry.html))).toEqual(['Read from the marked edge.']);
    expect(content).not.toContain('An unrelated catalog listing.');
    expect(content).not.toContain('A publisher utility.');
  });

  it.each(['dialog', 'div'])('does not export a stand-alone interface region (%s)', async tag => {
    const attributes = tag === 'dialog' ? 'open' : 'role="dialog" aria-modal="true"';
    const result = await extract(`<${tag} ${attributes}><h2>Display settings</h2><p>${report}</p><button>Close</button></${tag}><h2>Discussion</h2>`, null);
    expect(result.content).toEqual([]);
  });

  it('keeps a short native article and its actual media when a larger widget is present', async () => {
    const result = await extract(`
      <dialog open><p>${report}</p><button>Close</button></dialog>
      <article><h1>Field report</h1><p>Completed.</p><figure><img src="/map.png" width="640" height="480" alt="Trail map"></figure></article>
    `, null);
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image']);
  });

  it('keeps a linked prose note presented by a dialog and skips unlinked dialog text', async () => {
    const result = await extract(`
      <article><h1>Field report</h1><p>A reference <a role="doc-noteref" href="#measurements">1</a> is useful here.</p>
      <dialog open><p>Panel labels and settings.</p></dialog>
      <dialog id="measurements"><p>The note explains how the instruments were calibrated.</p></dialog></article>
    `);
    const content = JSON.stringify(result.content);
    expect(content).toContain('The note explains how the instruments were calibrated.');
    expect(content).not.toContain('Panel labels and settings.');
  });

  it('keeps media declared by the same article without expanding the reading scope', async () => {
    const result = await extract(`
      <section itemscope itemtype="https://schema.org/NewsArticle">
        <h1 itemprop="headline">Field report</h1>
        <figure><img itemprop="image" src="/lead.png" width="640" height="480" alt="Survey overview"><figcaption>Opening map.</figcaption></figure>
        <aside itemscope itemtype="https://schema.org/Person"><img itemprop="image" src="/avatar.png" width="640" height="480" alt="Author portrait"></aside>
        <div><p>Unrelated section decoration.</p><img src="/widget.png" width="640" height="480" alt="Widget"></div>
        <div itemprop="articleBody"><p>${report}</p><figure><img src="/body.png" width="640" height="480" alt="Observed locations"><figcaption>Measured positions.</figcaption></figure></div>
      </section>
    `, null);
    const images = result.content.filter(item => item.type === 'image');
    expect(images.map(({ src, caption }) => [src, caption])).toEqual([
      ['https://example.test/lead.png', 'Opening map.'],
      ['https://example.test/body.png', 'Measured positions.']
    ]);
    expect(JSON.stringify(result.content)).not.toContain('Unrelated section decoration.');
  });

  it('removes share controls for the current document and retains linked reading media', async () => {
    const result = await extract(`
      <article>
        <h1>Field report</h1>
        <p>${report}</p>
        <ul>
          <li><a href="https://social.example.test/share?url=https%3A%2F%2Fexample.test%2Freport"><img src="/share.png" width="640" height="480" alt="Sharing glyph">Share this report</a></li>
          <li><a data-social-service="messages" href="mailto:?body=See%20https%3A%2F%2Fexample.test%2Freport"><img src="/email.png" width="640" height="480" alt="Mail glyph">Email this report</a></li>
        </ul>
        <figure><a href="https://social.example.test/share?url=https%3A%2F%2Fexample.test%2Freport-details"><img src="/source.png" width="640" height="480" alt="Actual source"></a><figcaption>External source illustration.</figcaption></figure>
      </article>
    `, null);
    const images = result.content.filter(item => item.type === 'image');
    expect(images.map(({ src }) => src)).toEqual(['https://example.test/source.png']);
    const content = JSON.stringify(result.content);
    expect(content).not.toContain('Share this report');
    expect(content).not.toContain('Email this report');
    expect(content).toContain('External source illustration.');
  });

  it('retains a full semantic article when its own prose discusses prices and courses', async () => {
    const result = await extract(`
      <main>
        <article>
          <h1>Field report</h1>
          <p>${report}</p>
          <p>The video course cost $120 and included a guided tour of the site.</p>
          <div class="checklist"><ol><li>Read the depth gauge.</li></ol></div>
          <p>Remeasuring in the afternoon improved the final result.</p>
          <div data-component="ad"><p>Unrelated paid advertisement.</p></div>
        </article>
      </main>`, null);
    const prose = result.content.filter(item => item.type === 'paragraph').map(item => item.text);
    expect(prose).toEqual([report, 'The video course cost $120 and included a guided tour of the site.', 'Remeasuring in the afternoon improved the final result.']);
    expect(result.content.filter(item => item.type === 'list')).toHaveLength(1);
  });

  it('recognizes a unique headed article whose SEO and reading titles differ', async () => {
    const result = await extract(`
      <meta property="og:type" content="article">
      <meta property="og:title" content="Abstract of the laboratory report">
      <article class="edition-newsletter-post">
        <h1>Working notes from the ridge</h1>
        <p>${report}</p>
        <p>The last observation closes the report.</p>
      </article>
      <aside class="comments"><article><h2>Reader thread</h2><p>Unrelated reader comments.</p></article></aside>
    `, null);
    const prose = result.content.filter(item => item.type === 'paragraph').map(item => item.text);
    expect(prose).toEqual([report, 'The last observation closes the report.']);
  });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';

let source;
beforeAll(async () => {
  source = (await generateExtractAutomaticallyInlined()).replace('export async function', 'async function');
});

async function extract(body, selectors, configure = () => {}) {
  const dom = new JSDOM('<!doctype html><title>Field report</title><main><h1>Field report</h1>' + body + '</main>', {
    url: 'https://example.test/report', runScripts: 'outside-only'
  });
  try {
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 640, height: 440 });
    configure(dom.window);
    return await dom.window.eval(`(${source})`)(dom.window.location.href, false, {
      articleContainer: 'main', title: 'h1', content: '.story', ...selectors
    });
  } finally {
    dom.window.close();
  }
}

describe('Article media ownership', () => {
  it('keeps a labelled image preview and its credit next to the article', async () => {
    const report = '<div class="popup"><a class="popup" href="/full/specimen.jpg" title="Cross-section">' +
      '<div><img src="/small/specimen.jpg" alt="A specimen in cross-section" width="640" height="440"></div></a>' +
      '<div><span>Cross-section</span> · <span>Photo credit</span></div></div>' +
      '<section class="story"><p>The sample was photographed shortly after collection.</p></section>';
    const controls = '<div class="popup" role="dialog"><a class="popup" href="/full/control.jpg">' +
      '<img src="/small/control.jpg" alt="Dialog control"></a></div>' +
      '<div class="popup"><a class="popup" href="/offer"><img src="/small/promo.jpg" alt="Promo"></a></div>';
    const result = await extract(report + controls, { heroImage: '.popup img' });
    expect(result.content.filter(item => item.type === 'image')).toEqual([
      expect.objectContaining({ src: 'https://example.test/small/specimen.jpg', isFeatured: true,
        caption: '<span>Cross-section</span> · <span>Photo credit</span>' })
    ]);
  });

  it('copies the visible caption of a lead photo when the preview has a hidden caption copy', async () => {
    const html = '<header><div><div class="image-lightbox"><div class="image-lightbox-item">' +
      '<a href="/full/profile.jpg"><img src="/full/profile.jpg" width="640" height="440"></a>' +
      '<div id="caption-profile" hidden>Terrain profile. Credit: Research team.</div>' +
      '</div></div></div><div>Terrain profile. Credit: Research team.</div></header>' +
      '<section class="story"><p>The survey included several transects.</p></section>';
    const result = await extract(html, { heroImage: 'header img' });
    expect(result.content.filter(item => item.type === 'image')).toEqual([
      expect.objectContaining({ src: 'https://example.test/full/profile.jpg', caption: 'Terrain profile. Credit: Research team.' })
    ]);
  });

  it('keeps repeated image cards and their captions without importing link controls or unrelated cards', async () => {
    const card = (file, title, caption, href = `/full/${file}.jpg`) => '<div><div class="card-header">' +
      `<img src="/preview/${file}.jpg" width="640" height="440" alt=""><h3><!-- Layout note -->${title}<svg class="icon"></svg></h3>` +
      `<a href="${href}"><span class="visuallyhidden">Open full version</span></a></div><div><p>${caption}</p></div></div>`;
    const story = '<section class="story"><p>The field team documented the shoreline at low tide.</p></section>';
    const photos = card('map', 'Survey map', 'The markers give the coordinates of each survey point.') +
      card('sample_thumb', 'Stone sample', 'Visible deposits remain across the outer surface.', '/full/sample.jpg');
    const promo = card('offer', 'Sponsor', 'Read about a separate commercial service.', '/offer') +
      card('promo', 'Promotion', 'An unrelated brochure is available.', '/full/brochure.jpg');
    const result = await extract(story + '<section>' + photos + promo + '</section><aside><section>' + photos + '</section></aside>');
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'paragraph', text: 'The field team documented the shoreline at low tide.' }),
      expect.objectContaining({ type: 'image', src: 'https://example.test/preview/map.jpg',
        caption: 'Survey map<br>The markers give the coordinates of each survey point.' }),
      expect.objectContaining({ type: 'image', src: 'https://example.test/preview/sample_thumb.jpg',
        caption: 'Stone sample<br>Visible deposits remain across the outer surface.' })
    ]);
    const excluded = await extract(story + '<section class="gallery">' + photos + '</section>', { exclude: ['.gallery'] });
    expect(excluded.content.filter(item => item.type === 'image')).toEqual([]);
  });

  it('preserves a captioned photo behind an in-article button without exporting the controls', async () => {
    const result = await extract('<section class="story"><p>The specimen was analysed immediately.</p>' +
      '<figure><button><img src="/sample.jpg" alt="A mineral sample" width="640" height="440">Open preview</button>' +
      '<figcaption>The coloured band lies above the matrix.</figcaption>' +
      '<button><img src="/close.jpg" width="16" height="16">Close viewer</button></figure></section>');
    expect(result.content.filter(item => item.type === 'image')).toEqual([
      expect.objectContaining({ src: 'https://example.test/sample.jpg', caption: 'The coloured band lies above the matrix.' })
    ]);
    expect(JSON.stringify(result.content)).not.toMatch(/Open preview|Close viewer|close\.jpg/);
  });

  it('does not capture decorative SVG glyphs placed beside text', async () => {
    const result = await extract('<section class="story"><p>The specimen was analysed immediately.</p>' +
      '<h2>Results<span><svg width="16" height="16"><use href="#arrow"></use></svg></span></h2>' +
      '<h2><span class="section-icon"><svg width="20" height="20"><path d="M2 2h10v10z"/></svg></span>Methods</h2>' +
      '<p>The coloured band lies above the matrix. <a href="/measurements">Data table<svg width="12" height="12"><path d="M0 1L9 9"/></svg></a></p>' +
      '<p><svg width="14" height="14" aria-hidden="true"><path d="M2 2h10v10z"/></svg></p></section>');
    expect(result.error).toBeUndefined();
    expect(result.content.filter(item => item.type === 'image')).toEqual([]);
    expect(JSON.stringify(result.content)).toContain('Data table');
    expect(result.content.filter(item => item.type === 'heading')).toEqual([
      expect.objectContaining({ text: 'Results' }), expect.objectContaining({ text: 'Methods' })
    ]);
  });
});

describe('Deferred article figures', () => {
  const context = '<p>The following measurements were made at a series of stations along the valley.</p>';
  const story = figure => '<section class="story">' + context + figure + '</section>';
  const placeholder = '<figure class="instrument-diagram" aria-hidden="true"></figure>';
  const fallback = '<figure class="instrument-diagram"><picture><img src="/measurements.png" alt="Survey map"></picture>' +
    '<figcaption>Ranges by station.</figcaption></figure>';

  function publicSource(body, title = 'Field report') {
    return vi.fn(async () => Object.defineProperty(new Response('<!doctype html><title>' + title +
      '</title><main><h1>' + title + '</h1>' + body + '</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    }), 'url', { value: 'https://example.test/report' }));
  }

  function withResponse(fetch) {
    return win => {
      win.fetch = fetch;
      win.TextDecoder = TextDecoder;
      win.scrollTo = vi.fn();
    };
  }

  it('recovers a publisher static preview at the exact selected empty figure', async () => {
    const response = publicSource(story(fallback));
    const result = await extract(story(placeholder), {}, withResponse(response));
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'paragraph', text: 'The following measurements were made at a series of stations along the valley.' }),
      expect.objectContaining({ type: 'image', src: 'https://example.test/measurements.png', alt: 'Survey map', caption: 'Ranges by station.' })
    ]);
    expect(response).toHaveBeenCalledTimes(1);
    expect(response).toHaveBeenCalledWith('https://example.test/report',
      expect.objectContaining({ credentials: 'omit', mode: 'same-origin', redirect: 'error' }));
  });

  it.each([
    [story(fallback), '.story'],
    [story('<figure class="instrument-diagram" aria-hidden="true" data-component="ad"></figure>'), '.story'],
    [story('<figure class="instrument-diagram"></figure>'), '.story'],
    [story(placeholder), '.story p']
  ])('keeps ordinary, unrelated, and unselected figures passive', async (body, content) => {
    const response = publicSource(story(fallback));
    await extract(body, { content }, withResponse(response));
    expect(response).not.toHaveBeenCalled();
  });

  it('keeps a page with a query parameter passive', async () => {
    const response = publicSource(story(fallback));
    await extract(story(placeholder), {}, win => {
      withResponse(response)(win);
      win.history.replaceState(null, '', '?access=sample-token');
    });
    expect(response).not.toHaveBeenCalled();
  });

  it.each([
    [story(fallback), 'Different document'],
    [story(fallback.replace('instrument-diagram', 'other-diagram')), 'Field report'],
    [story(fallback).replace(context, '<p>A different account describes a separate survey location.</p>'), 'Field report']
  ])('rejects an uncorroborated public source figure', async (body, title) => {
    const response = publicSource(body, title);
    const result = await extract(story(placeholder), {}, withResponse(response));
    expect(result.content.filter(item => item.type === 'image')).toEqual([]);
  });
});

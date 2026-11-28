import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { PDF_MAX_SINGLE_PAGE_INCHES, preparePdfLayout } from '../../scripts/generation/pdf-layout.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';

const windows = [];
function page(markup, naturalWidth = 756) {
  const dom = new JSDOM(`<!doctype html><style>body,p,th,td{font-size:31px}.article-content{padding:0;border:0}</style><article class="article"><p>Required article prose.</p><div class="article-content">${markup}</div></article>`, { runScripts: 'outside-only' });
  const win = dom.window, doc = win.document;
  windows.push(win);
  win.matchMedia = () => ({ matches: true });
  const article = doc.querySelector('article'), wrapper = doc.querySelector('.article-content');
  article.getBoundingClientRect = () => ({ top: 19, bottom: 419, width: 756, height: 400 });
  Object.defineProperty(article, 'scrollHeight', { value: 400, configurable: true });
  wrapper.getBoundingClientRect = () => ({ width: 756 });
  for (const table of doc.querySelectorAll('table')) {
    table.getBoundingClientRect = () => ({ width: Math.max(756, naturalWidth * parseFloat(win.getComputedStyle(table.querySelector('th,td')).fontSize) / 31) });
  }
  const prepare = (mode = 'single') => win.eval(`(${preparePdfLayout.toString()})(8.27, ${JSON.stringify(mode)}, 11.69, 5, ${PDF_MAX_SINGLE_PAGE_INCHES})`);
  return { win, doc, prepare };
}

function figurePage({ precedingEnd = 680, fit = true, heading = false } = {}) {
  const section = heading ? '<h2>Survey locations</h2><a name="survey-map"></a>' : '';
  const result = page(`<p>Opening observations.</p>${section}<figure class="article-image"><img alt="Survey map"><figcaption id="map-credit">Survey map and credit.</figcaption></figure><p>Closing observation.</p>`);
  const { doc } = result;
  const article = doc.querySelector('.article');
  const preceding = doc.querySelector('.article-content > p');
  const figure = doc.querySelector('figure');
  const image = figure.querySelector('img');
  const imageHeight = () => parseFloat(image.style.maxHeight) || 460;
  article.getBoundingClientRect = () => ({ left: 0, top: 0, bottom: 400, width: 756, height: 400 });
  preceding.getClientRects = () => [{ left: 0, top: 610, bottom: precedingEnd, height: precedingEnd - 610 }];
  const figureTop = heading ? 30 : 0;
  const figureColumn = () => fit && imageHeight() <= 1103 - precedingEnd - 35 - figureTop ? 0 : 756;
  figure.getBoundingClientRect = () => ({ top: figureTop, bottom: figureTop + imageHeight() + 35, height: imageHeight() + 35 });
  figure.getClientRects = () => [{
    ...figure.getBoundingClientRect(),
    left: figureColumn(),
  }];
  if (heading) doc.querySelector('h2').getClientRects = () => [{ left: figureColumn(), top: 0, bottom: 24, height: 24 }];
  image.getBoundingClientRect = () => ({ height: imageHeight() });
  article.style.color = 'black';
  return { ...result, article, figure, image };
}

afterEach(() => windows.splice(0).forEach(win => win.close()));

describe('Final PDF print layout', () => {
  it('measures the complete article in print media with one rounding pixel', async () => {
    const { doc, prepare } = page('<p>A complete observation.</p>');
    expect(await prepare()).toMatchObject({ contentWidth: 756, contentHeight: 420, tableLayouts: [], pageMode: 'single' });
    expect(doc.documentElement.style.getPropertyValue('--pdf-page-width')).toBe('8.27in');
  });

  it('includes the document box when margins extend past the article', async () => {
    const { doc, prepare } = page('<p>A complete observation.</p>');
    doc.documentElement.getBoundingClientRect = () => ({ bottom: 436.6 });
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 850 });
    expect(await prepare()).toMatchObject({ contentHeight: 438, pageMode: 'single' });
  });

  it('scales both dimensions and keeps one page when content exceeds the compatible height', async () => {
    const { doc, prepare } = page('<p>Opening observation.</p><p id="end">Closing observation.</p>');
    const article = doc.querySelector('article');
    Object.defineProperty(article, 'scrollHeight', { value: PDF_MAX_SINGLE_PAGE_INCHES * 96 * 2 });
    const layout = await prepare();
    expect(layout).toMatchObject({ pageMode: 'single', contentHeight: expect.any(Number) });
    expect(layout.contentHeight).toBeLessThanOrEqual(PDF_MAX_SINGLE_PAGE_INCHES * 96);
    expect(layout.paperWidth).toBeCloseTo(8.27 / 2, 1);
    expect(layout.printScale).toBeCloseTo(0.5, 1);
    expect(doc.documentElement.dataset.pdfPageMode).toBe('single');
    expect(doc.getElementById('end').textContent).toBe('Closing observation.');
  });

  it('keeps one page when the required scale is below the browser print parameter minimum', async () => {
    const { doc, prepare } = page('<p>Opening observation.</p><p>Closing observation.</p>');
    Object.defineProperty(doc.querySelector('article'), 'scrollHeight', { value: PDF_MAX_SINGLE_PAGE_INCHES * 96 * 20 });
    const setStyle = vi.spyOn(doc.documentElement.style, 'setProperty');
    const layout = await prepare();
    expect(layout.pageMode).toBe('single');
    expect(layout.contentHeight).toBeLessThanOrEqual(PDF_MAX_SINGLE_PAGE_INCHES * 96);
    expect(layout.printScale).toBe(0.1);
    const zoom = setStyle.mock.calls.find(([name]) => name === 'zoom')?.[1];
    expect(Number(zoom)).toBeCloseTo(0.5, 1);
  });

  it('allows long quotations to start on the current page while keeping short quotations together', async () => {
    const { doc, prepare } = page('<blockquote>Short quote.</blockquote><blockquote>Long quote.</blockquote>');
    const [short, long] = doc.querySelectorAll('blockquote');
    short.getBoundingClientRect = () => ({ height: 120 });
    long.getBoundingClientRect = () => ({ height: 720 });
    await prepare('multi');
    expect(short.style.breakInside).toBe('');
    expect(long.style.breakInside).toBe('auto');
  });

  it('lets oversized preformatted text flow across pages while keeping small examples intact', async () => {
    const { doc, prepare } = page('<pre><code>const scale = 2;</code></pre><pre id="long">Header\n\n  Inline spacing remains part of the text.</pre>');
    const [example, longBlock] = doc.querySelectorAll('pre');
    example.getBoundingClientRect = () => ({ height: 100 });
    longBlock.getBoundingClientRect = () => ({ height: 1800 });
    await prepare('multi');
    expect(example.style.breakInside).toBe('');
    expect(longBlock.style.breakInside).toBe('auto');
    expect(longBlock.textContent).toBe('Header\n\n  Inline spacing remains part of the text.');
  });

  it('removes only unanchored empty paragraphs at the end of a continuous page', async () => {
    const { doc, prepare } = page('<p>Opening note.</p><p data-spacer></p><p>Closing note.</p><p></p><p></p>');
    const flow = doc.querySelector('.article-content');
    const article = doc.querySelector('article');
    Object.defineProperty(article, 'scrollHeight', {
      get: () => flow.lastElementChild.textContent ? 400 : 420,
    });
    expect((await prepare()).contentHeight).toBe(420);
    expect([...flow.children].map(node => node.textContent)).toEqual(['Opening note.', '', 'Closing note.']);
    expect(flow.querySelector('[data-spacer]')).not.toBeNull();
  });

  it('keeps final link targets and leaves paginated paragraphs alone', async () => {
    const continuous = page('<p>Closing note.</p><p id="reference"></p>');
    await continuous.prepare();
    expect(continuous.doc.getElementById('reference')).not.toBeNull();

    const paginated = page('<p>Closing note.</p><p></p>');
    await paginated.prepare('multi');
    expect(paginated.doc.querySelectorAll('.article-content > p')).toHaveLength(2);
  });

  it('rejects a screen-media measurement', async () => {
    const { win, prepare } = page(''); win.matchMedia = () => ({ matches: false });
    await expect(prepare()).rejects.toThrow('print media');
  });

  it('makes source accents legible on the selected print background without recoloring readable text', async () => {
    const { doc, prepare } = page('<p><span id="low" style="color: #303096">An authored accent.</span> ' +
      '<span id="high" style="color: #eee">A readable accent.</span></p>');
    doc.body.style.backgroundColor = '#303030';
    const low = doc.getElementById('low');
    const high = doc.getElementById('high');
    const readableColor = high.style.color;
    await prepare();
    const [red, green, blue] = low.style.color.match(/\d+/g).map(Number);
    expect(red).toBeGreaterThan(125);
    expect(green).toBe(red);
    expect(blue).toBeGreaterThan(red);
    expect(high.style.color).toBe(readableColor);
  });

  it('prints loaded table media in its original cells and preserves fragment destinations', async () => {
    const { doc, prepare } = page([
      '<p><a href="#reading-media-1">Compare chart</a></p>',
      '<table><tbody><tr><td><a href="#reading-media-1" id="plot">Image</a> 23%</td>',
      '<td><a href="#reading-media-1">Image</a></td>',
      '<td><a href="#reading-media-2">Missing chart</a></td></tr></tbody></table>',
      '<a name="reading-media-1"></a><figure class="article-image" id="reading-media-1" data-table-media>',
      '<img alt="Trend"><figcaption>Trend by period</figcaption></figure>',
      '<figure class="article-image" id="reading-media-2" data-table-media><img alt="Missing chart"></figure>',
    ].join(''));
    Object.defineProperty(doc.querySelector('img[alt="Trend"]'), 'naturalWidth', { value: 90 });

    await prepare();

    const [value, duplicate, unavailable] = doc.querySelectorAll('td');
    expect(value.querySelector('img').alt).toBe('Trend');
    expect(value.querySelector('#plot')).not.toBeNull();
    expect(value.querySelector('#reading-media-1 figcaption').textContent).toBe('Trend by period');
    expect(value.textContent).toContain('23%');
    expect(duplicate.querySelector('img').alt).toBe('Trend');
    expect(duplicate.querySelector('figcaption')).toBeNull();
    expect(unavailable.querySelector('a').textContent).toBe('Missing chart');
    expect(doc.querySelector('p a').getAttribute('href')).toBe('#reading-media-1');
    expect(doc.querySelector('.article-content > #reading-media-1')).toBeNull();
    expect(doc.querySelector('[name="reading-media-1"]')).toBeNull();
  });

  it('preserves an authored table reference to a standalone appendix figure', async () => {
    const { doc, prepare } = page([
      '<table><tbody><tr><td><a href="#reading-media-1">See the appendix map</a></td></tr></tbody></table>',
      '<p>Appendix commentary.</p>',
      '<figure class="article-image" id="reading-media-1"><img alt="Survey map"></figure>',
    ].join(''));
    Object.defineProperty(doc.querySelector('img'), 'naturalWidth', { value: 650 });
    await prepare();
    expect(doc.querySelector('td a[href="#reading-media-1"]').textContent).toBe('See the appendix map');
    expect(doc.querySelector('.article-content > figure#reading-media-1')).not.toBeNull();
  });

  it('keeps the table-owned image and authored appendix destination distinct in records', async () => {
    const html = buildHtmlForPdf([
      { type: 'table', cellFormat: 'html', headers: ['Appendix', 'Observation'], rows: [[
        '<a href="#reading-media-1">See the appendix map</a>', '<a href="#reading-media-2">Station chart</a>'
      ]] },
      { type: 'image', id: 'reading-media-2', tableMedia: true, src: 'https://example.test/chart.png', alt: 'Station chart' },
      { type: 'paragraph', text: 'Appendix commentary.' },
      { type: 'image', id: 'reading-media-1', src: 'https://example.test/map.png', alt: 'Survey map' },
    ], 'Survey methods', '', '', 'https://example.test/report');
    const section = JSDOM.fragment(html).querySelector('.article-content');
    const { doc, prepare } = page(section.innerHTML, 1800);
    for (const figure of doc.querySelectorAll('figure img')) Object.defineProperty(figure, 'naturalWidth', { value: 650 });

    expect((await prepare()).tableLayouts[0].mode).toBe('records');
    expect(doc.querySelector('dd a[href="#reading-media-1"]').textContent).toBe('See the appendix map');
    expect(doc.querySelector('dd #reading-media-2 img').alt).toBe('Station chart');
    expect(doc.querySelector('.article-content > figure#reading-media-1 img').alt).toBe('Survey map');
  });

  it('includes content extending below the article border box', async () => {
    const { doc, prepare } = page('<p>A complete observation.</p>');
    Object.defineProperty(doc.querySelector('article'), 'scrollHeight', { value: 700 });
    expect((await prepare()).contentHeight).toBe(720);
  });

  it('only scales a near-fitting figure with its caption and removes measurement styles', async () => {
    const { doc, article, image, prepare } = figurePage();
    await prepare('multi');
    expect(parseFloat(image.style.maxHeight)).toBeGreaterThan(460 * 0.8);
    expect(parseFloat(image.style.maxHeight)).toBeLessThan(460);
    expect(doc.getElementById('map-credit').textContent).toBe('Survey map and credit.');
    expect(article.style.cssText).toBe('color: black;');
  });

  it('counts a heading across invisible link targets when fitting a figure', async () => {
    const { doc, image, prepare } = figurePage({ precedingEnd: 650, heading: true });
    await prepare('multi');
    expect(image.style.maxHeight).toBe('386px');
    expect(doc.querySelector('a[name="survey-map"]')).not.toBeNull();
  });

  it('preserves the original size if the figure needs excessive reduction or still fails to fit', async () => {
    const large = figurePage({ precedingEnd: 760 });
    await large.prepare('multi');
    expect(large.image.style.maxHeight).toBe('');

    const unbreakable = figurePage({ fit: false });
    await unbreakable.prepare('multi');
    expect(unbreakable.image.style.maxHeight).toBe('');
    expect(unbreakable.article.style.cssText).toBe('color: black;');
  });

  it('preserves figure size in continuous PDF mode', async () => {
    const continuous = figurePage();
    await continuous.prepare('single');
    expect(continuous.image.style.maxHeight).toBe('');
    expect(continuous.article.style.cssText).toBe('color: black;');
  });

  it('fits a moderately wide grid by changing only its cell type size', async () => {
    const { win, doc, prepare } = page('<table><tr><th>Station</th><th>Depth</th></tr><tr><td>Cedar</td><td>27 m</td></tr></table>', 825);
    const result = await prepare();
    expect(result.tableLayouts[0].mode).toBe('grid');
    expect(result.tableLayouts[0].scale).toBeCloseTo(756 / 825);
    expect(parseFloat(win.getComputedStyle(doc.querySelector('td')).fontSize)).toBeCloseTo(31 * 756 / 825);
    expect(win.getComputedStyle(doc.querySelector('p')).fontSize).toBe('31px');
    expect(doc.querySelectorAll('td')).toHaveLength(2);
  });

  it('preserves every wide-table field, empty cell and authored target in readable records', async () => {
    const { doc, prepare } = page('<table id="measurements"><thead><tr><th><span id="station-key">Station</span></th><th>Depth</th></tr></thead><tbody><tr><td><a href="#station-key">Cedar</a></td><td>27 m</td></tr><tr><td></td><td><span id="last-value">31 m</span></td></tr></tbody></table>', 1800);
    const result = await prepare();
    expect(result.tableLayouts[0]).toMatchObject({ mode: 'records', columns: 2, scale: 1 });
    expect(doc.querySelector('table')).toBeNull();
    expect(doc.querySelectorAll('.pdf-table-record')).toHaveLength(2);
    expect([...doc.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['Cedar', '27 m', '', '31 m']);
    expect([...doc.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Station', 'Depth', 'Station', 'Depth']);
    expect(doc.querySelectorAll('#station-key')).toHaveLength(1);
    expect(doc.querySelector('#last-value').textContent).toBe('31 m');
    expect(doc.querySelector('a').getAttribute('href')).toBe('#station-key');
    expect(doc.getElementById('measurements').className).toBe('pdf-table-records');
  });

  it('renders an unscoped whole-table title once and keeps specific field labels and links', async () => {
    const { doc, prepare } = page('<table><thead><tr><th colspan="2" id="survey-title">Seasonal survey results</th></tr><tr><th id="channel">Channel</th><th id="level">Water<br>level</th></tr></thead><tbody><tr><td>East inlet<br>North bank</td><td headers="survey-title level"><a href="#survey-title">27 m</a></td></tr><tr><td>West inlet</td><td>31 m</td></tr></tbody></table>', 1800);
    expect((await prepare()).tableLayouts[0].mode).toBe('records');
    expect(doc.querySelector('header.pdf-table-context').textContent).toBe('Seasonal survey results');
    expect([...doc.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Channel', 'Water level', 'Channel', 'Water level']);
    expect([...doc.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['East inletNorth bank', '27 m', 'West inlet', '31 m']);
    expect(doc.querySelector('dt br')).toBeNull();
    expect(doc.querySelector('dd br')).not.toBeNull();
    expect(doc.querySelectorAll('#survey-title')).toHaveLength(1);
    expect(doc.querySelector('a').getAttribute('href')).toBe('#survey-title');
  });

  it('keeps header-only and unlabelled wide tables without inventing header content', async () => {
    const { doc, prepare } = page('<table><thead><tr><th>North</th><th>South</th></tr></thead></table><table><tr><td>8 m</td><td>9 m</td></tr></table>', 1800);
    await prepare();
    expect([...doc.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['North', 'South', '8 m', '9 m']);
    expect([...doc.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['1', '2', '1', '2']);
  });

  it('projects physical spans, header paths and separate row groups without duplicating targets', async () => {
    const { doc, prepare } = page('<table><thead><tr><th rowspan="2">Region</th><th colspan="2">Reading</th></tr><tr><th><span id="depth-key">Depth</span></th><th>Flow</th></tr></thead><tbody><tr><th scope="rowgroup" rowspan="0" id="north-key">North</th><td>27</td><td>31</td></tr><tr><td>29</td><td>33</td></tr></tbody><tbody><tr><th scope="rowgroup" rowspan="0">South</th><td>37</td><td>41</td></tr><tr><td>39</td><td>43</td></tr></tbody><tfoot><tr><th scope="row">Total</th><td colspan="2">120</td></tr></tfoot></table>', 1800);
    const result = await prepare();
    expect(result.tableLayouts[0]).toMatchObject({ mode: 'records', columns: 3 });
    expect([...doc.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['North','27','31','North','29','33','South','37','41','South','39','43','Total','120']);
    expect([...doc.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Region','ReadingDepth','ReadingFlow','Region','ReadingDepth','ReadingFlow','Region','ReadingDepth','ReadingFlow','Region','ReadingDepth','ReadingFlow','Region','ReadingDepthFlow']);
    expect(doc.querySelectorAll('#depth-key')).toHaveLength(1);
    expect(doc.querySelectorAll('#north-key')).toHaveLength(1);
  });

  it('uses a later column-header block without attaching an opaque older header', async () => {
    const { doc, prepare } = page('<table><tbody><tr><th scope="col">Distance</th></tr><tr><td>3</td></tr></tbody><tbody><tr><th scope="col">Velocity</th></tr><tr><td>5</td></tr></tbody></table>', 1800);
    await prepare();
    const values = [...doc.querySelectorAll('dd')];
    expect(values.find(node => node.textContent === '3').previousElementSibling.textContent).toBe('Distance');
    expect(values.find(node => node.textContent === '5').previousElementSibling.textContent).toBe('Velocity');
  });

  it('blocks earlier leaf headers across a later multilevel block while retaining real column-group associations', async () => {
    const { doc, prepare } = page('<table><colgroup span="2"></colgroup><thead><tr><th colspan="2" scope="colgroup">Earlier measurements</th></tr><tr><th scope="col">Density</th><th scope="col">Mass</th></tr></thead><tbody><tr><td>3 g</td><td>4 kg</td></tr><tr><th colspan="2" scope="colgroup">Current measurements</th></tr><tr><th scope="col">Height</th><th scope="col">Speed</th></tr><tr><td>7 m</td><td>8 m/s</td></tr></tbody></table>', 1800);
    await prepare();
    const values = [...doc.querySelectorAll('dd')];
    expect(values.find(node => node.textContent === '7 m').previousElementSibling.textContent).toBe('Earlier measurementsCurrent measurementsHeight');
    expect(values.find(node => node.textContent === '8 m/s').previousElementSibling.textContent).toBe('Earlier measurementsCurrent measurementsSpeed');
  });

  it('uses occupied columns for group headings without source column groups', async () => {
    const { doc, prepare } = page('<table><thead><tr><th colspan="2" scope="colgroup">Earlier measurements</th></tr><tr><th scope="col">Density</th><th scope="col">Mass</th></tr></thead><tbody><tr><td>3 g</td><td>4 kg</td></tr><tr><th colspan="2" scope="colgroup">Current measurements</th></tr><tr><th scope="col">Height</th><th scope="col">Speed</th></tr><tr><td>7 m</td><td>8 m/s</td></tr></tbody></table>', 1800);
    await prepare();
    const values = [...doc.querySelectorAll('dd')];
    expect(values.find(node => node.textContent === '7 m').previousElementSibling.textContent).toBe('Current measurementsHeight');
    expect(values.find(node => node.textContent === '8 m/s').previousElementSibling.textContent).toBe('Current measurementsSpeed');
  });

  it('follows explicit cell-header references including an intentionally empty association', async () => {
    const { doc, prepare } = page('<table><thead><tr><th id="height">Height</th><th id="speed">Speed</th></tr></thead><tbody><tr><td headers="speed">27</td><td headers="">31</td></tr></tbody></table>', 1800);
    await prepare();
    expect([...doc.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Speed', '2']);
  });
});

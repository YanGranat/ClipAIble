import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { preparePdfLayout } from '../../scripts/generation/pdf-layout.js';

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
  const prepare = () => win.eval(`(${preparePdfLayout.toString()})(8.27)`);
  return { win, doc, prepare };
}
afterEach(() => windows.splice(0).forEach(win => win.close()));

describe('Final PDF print layout', () => {
  it('measures the complete article in print media with one rounding pixel', async () => {
    const { doc, prepare } = page('<p>A complete observation.</p>');
    expect(await prepare()).toMatchObject({ contentWidth: 756, contentHeight: 420, tableLayouts: [] });
    expect(doc.documentElement.style.getPropertyValue('--pdf-page-width')).toBe('8.27in');
  });

  it('rejects a screen-media measurement', async () => {
    const { win, prepare } = page(''); win.matchMedia = () => ({ matches: false });
    await expect(prepare()).rejects.toThrow('print media');
  });

  it('includes content extending below the article border box', async () => {
    const { doc, prepare } = page('<p>A complete observation.</p>');
    Object.defineProperty(doc.querySelector('article'), 'scrollHeight', { value: 700 });
    expect((await prepare()).contentHeight).toBe(720);
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

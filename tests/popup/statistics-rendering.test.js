import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { getSafeHistoryUrl, initStats } from '../../popup/stats.js';

vi.mock('../../scripts/locales.js', async importOriginal => ({ ...(await importOriginal()), getUILanguage: async () => 'en' }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));

describe('statistics rendering', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<div id="statsHistory"></div><div id="cacheDomainsList"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1; });
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('renders imported values as text and rejects executable history links', async () => {
    const stats = initStats({ showToast: vi.fn() });
    await stats.displayStats({ history: [null, {
      title: '<img src="https://example.org/track">',
      format: '<img src="https://example.org/format">',
      domain: 'example.org" data-injected="true',
      url: 'javascript:alert(1)', date: 'invalid'
    }] });
    const history = document.getElementById('statsHistory');
    expect(history.querySelector('img')).toBeNull();
    expect(history.querySelector('[data-injected]')).toBeNull();
    expect(history.textContent).toContain('<img');
    expect(history.querySelector('a').getAttribute('href')).toBe('#');
    expect(history.querySelector('button').dataset.index).toBe('1');
  });

  it('escapes attribute quotes and derives cache age from its timestamp', async () => {
    const stats = initStats({ showToast: vi.fn() });
    const domain = 'example.org" data-injected="true';
    await stats.displayCacheStats({ domains: [{ domain, age: '<img src="x">', lastUsed: Date.now() - 3600000 }] });
    const cache = document.getElementById('cacheDomainsList');
    expect(cache.querySelector('img')).toBeNull();
    expect(cache.querySelector('[data-injected]')).toBeNull();
    expect(cache.querySelector('button').dataset.domain).toBe(domain);
    expect(cache.textContent).not.toContain('<img');
    expect(cache.textContent).toContain('1 hour ago');
  });

  it('preserves supported web and local document links', () => {
    for (const value of ['https://example.org/article', 'http://localhost/article', 'file:///C:/library/article.pdf']) {
      expect(getSafeHistoryUrl(value)).toBe(value);
    }
    for (const value of ['data:text/html,test', 'not a URL', undefined]) {
      expect(getSafeHistoryUrl(value)).toBe('#');
    }
  });
});

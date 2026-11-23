import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { getSafeHistoryUrl, initStats } from '../../popup/stats.js';
import { loadStats } from '../../scripts/stats/index.js';
import { handleDeleteHistoryItem } from '../../scripts/message-handlers/stats.js';

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
    vi.useRealTimers();
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

  it.each([true, false])('deletes only the displayed history entry after two renders, with ID=%s', async withId => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const earlier = { title: 'Earlier item', url: 'https://example.org/earlier', format: 'markdown', date: 100, processingTime: 0 };
    const selected = { ...earlier, title: 'Selected item', url: 'https://example.org/selected' };
    if (withId) {
      earlier.id = 'earlier-id';
      selected.id = 'selected-id';
    }
    await chrome.storage.local.set({ extension_stats: { totalSaved: 2, history: [selected, earlier] } });
    const deletions = [];
    chrome.runtime.sendMessage.mockImplementation(packet => {
      if (packet.action === 'deleteHistoryItem') {
        const result = new Promise(resolve => handleDeleteHistoryItem(packet, {}, resolve));
        deletions.push(result);
        return result;
      }
      return Promise.resolve(null);
    });
    const stats = initStats({ showToast: vi.fn() });
    await stats.displayStats({ history: [earlier] });
    await stats.displayStats({ history: [selected, earlier] });
    await vi.runAllTimersAsync();

    const button = document.querySelector('.history-delete');
    expect(button.closest('.history-item').querySelector('.history-title').textContent).toBe(selected.title);
    button.click();
    await vi.runAllTimersAsync();
    await Promise.all(deletions);
    expect(deletions).toHaveLength(1);
    const saved = await loadStats();
    expect(saved.history.map(item => item.title)).toEqual([earlier.title]);
    expect(saved.totalSaved).toBe(2);
  });

  it('asks only once before deleting the displayed cache domain after two renders', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    const stats = initStats({ showToast: vi.fn() });
    await stats.displayCacheStats({ domains: [{ domain: 'earlier.example' }] });
    await stats.displayCacheStats({ domains: [{ domain: 'shown.example' }] });
    await vi.runAllTimersAsync();

    document.querySelector('.cache-domain-delete').click();
    await vi.runAllTimersAsync();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('shown.example'));
    expect(chrome.runtime.sendMessage.mock.calls.map(([packet]) => packet).filter(packet => packet.action === 'deleteDomainFromCache'))
      .toEqual([{ action: 'deleteDomainFromCache', domain: 'shown.example' }]);
  });
});

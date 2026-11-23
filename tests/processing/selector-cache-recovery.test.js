import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheSelectors, getCachedSelectors, normalizeCachedSelectors } from '../../scripts/cache/selectors.js';
import { processWithSelectorMode, processWithoutAI } from '../../scripts/processing/modes.js';
import { JSDOM } from 'jsdom';
import { extractAutomaticallyInlined } from '../../scripts/extraction/automatic.js';

const mocks = vi.hoisted(() => ({ callAI: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAI: mocks.callAI, getProviderFromModel: () => 'openai' }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
vi.mock('../../scripts/translation/index.js', () => ({ detectLanguageByCharacters: () => 'en' }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: async () => 'en', getAIRequestOptions: () => ({}),
  getProcessingCallbacks: () => ({ updateState: vi.fn(), updateProgress: async () => {}, checkCancellation: async () => {} })
}));

const url = 'https://example.org/article';
const article = { title: 'Current title', author: 'Current Writer', publishDate: '2025-02-04', detectedLanguage: 'fr',
  content: [{ type: 'paragraph', text: 'The current article has enough complete text to be preserved in the result.' }] };
let saved, execute;
beforeEach(() => {
  saved = {};
  mocks.callAI.mockReset().mockResolvedValue({ articleContainer: 'article', content: '.current', author: 'Fresh Writer', publishDate: '2025-01-01' });
  execute = vi.fn(async options => [{ result: options.args[2]?.content === '.stale' ? { ...article, content: [], selectorMatched: false } : structuredClone(article) }]);
  vi.stubGlobal('chrome', { storage: { local: {
    get: vi.fn(async () => structuredClone(saved)), set: vi.fn(async value => { Object.assign(saved, structuredClone(value)); })
  } }, tabs: { get: vi.fn(async () => ({ id: 7, url })) }, scripting: { executeScript: execute }, runtime: { lastError: null } });
});

describe('selector template cache', () => {
  it('persists only DOM selectors instead of article metadata', async () => {
    await cacheSelectors(url, { content: '.current', title: 'h1', author: 'Previous Writer', publishDate: '2020-01-01', detectedLanguage: 'de', exclude: ['.advert'] });
    expect(saved.selector_cache['example.org'].selectors).toEqual({ content: '.current', title: 'h1', exclude: ['.advert'] });
    expect((await getCachedSelectors(url)).selectors).toEqual({ content: '.current', title: 'h1', exclude: ['.advert'] });
  });

  it('strips metadata from an existing cache entry and derives fresh metadata from the page', async () => {
    saved.selector_cache = { 'example.org': { selectors: { content: '.current', author: 'Previous Writer', publishDate: '2020-01-01', detectedLanguage: 'de' }, successCount: 3 } };
    const result = await processWithSelectorMode({ url, html: '<article>Current article</article>', title: 'Page', apiKey: 'synthetic-key', model: 'gpt-sample', tabId: 7 }, () => {});
    expect(result).toMatchObject({ author: 'Current Writer', publishDate: '2025-02-04', detectedLanguage: 'fr' });
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(execute.mock.calls[0][0].args).toEqual([url, false, { content: '.current', exclude: [] }]);
  });

  it('recovers once from a template miss by requesting selectors for the current page', async () => {
    await cacheSelectors(url, { content: '.stale' });
    const result = await processWithSelectorMode({ url, html: '<article>Current article</article>', title: 'Page', apiKey: 'synthetic-key', model: 'gpt-sample', tabId: 7 }, () => {});
    expect(result.content).toEqual(article.content);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);
    expect((await getCachedSelectors(url)).selectors.content).toBe('.current');
  });

  it('recovers from invalid cached CSS using the actual serialized extractor', async () => {
    await cacheSelectors(url, { articleContainer: 'article', content: 'p >>' });
    execute.mockImplementation(async options => {
      const dom = new JSDOM('<html lang="fr"><head><meta name="author" content="Current Writer"><title>Current title</title></head><body><article><p class="current">The complete current paragraph must survive a stale selector recovery.</p></article></body></html>', { url, runScripts: 'outside-only' });
      try {
        dom.window.console.log = () => {};
        const run = dom.window.eval(`(${options.func.toString()})`);
        return [{ result: await run(...options.args) }];
      } finally {
        dom.window.close();
      }
    });
    const result = await processWithSelectorMode({ url, html: '<article>Current article</article>', title: 'Page', apiKey: 'synthetic-key', model: 'gpt-sample', tabId: 7 }, extractAutomaticallyInlined);
    expect(result.author).toBe('Current Writer');
    expect(result.content.map(item => item.text).join(' ')).toContain('The complete current paragraph must survive a stale selector recovery.');
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);
    expect((await getCachedSelectors(url)).selectors.content).toBe('.current');
  });

  it('falls back to Automatic extraction after an unmatched cached selector', async () => {
    await cacheSelectors(url, { content: '.stale' });
    const result = await processWithoutAI({ url, html: '<article>Current article</article>', title: 'Page', tabId: 7 }, () => {});
    expect(result.content).toEqual(article.content);
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not pay for new selectors when the tab cannot be accessed', async () => {
    await cacheSelectors(url, { content: '.stale' });
    chrome.tabs.get.mockRejectedValue(new Error('Closed'));
    await expect(processWithSelectorMode({ url, html: '<article>Current article</article>', apiKey: 'synthetic-key', tabId: 7 }, () => {})).rejects.toBeInstanceOf(Error);
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([{ content: {} }, { content: '.current', exclude: [4] }, { content: '.current', title: false }, { content: '.current', exclude: Array(65).fill('.item') }])('rejects malformed cached selectors', value => {
    expect(normalizeCachedSelectors(value)).toBeNull();
  });
});

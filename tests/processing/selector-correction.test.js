import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { processWithoutAI, processWithSelectorMode } from '../../scripts/processing/modes.js';
import { extractAutomaticallyInlined } from '../../scripts/extraction/automatic.js';
import { cacheSelectors, getCachedSelectors } from '../../scripts/cache/selectors.js';
import { CONFIG } from '../../scripts/utils/config.js';

const mocks = vi.hoisted(() => ({ callAI: vi.fn(), progress: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAI: mocks.callAI, getProviderFromModel: () => 'deepseek' }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
vi.mock('../../scripts/translation/index.js', () => ({ detectLanguageByCharacters: () => 'en' }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: async () => 'en',
  getAIRequestOptions: data => ({ provider: data.provider, checkCancelled: data.checkCancelled }),
  getProcessingCallbacks: data => ({
    updateState: vi.fn(), updateProgress: mocks.progress,
    checkCancellation: async () => { data.checkCancelled?.(); }
  })
}));

const url = 'https://example.org/field-report';
const intro = 'The opening observation gives the complete calibration context for this field report.';
const ending = 'The final observation preserves the report conclusion and its stated uncertainty.';
const excluded = 'The secondary panel belongs outside the selected article and must remain excluded.';
const html = `<!doctype html><html><head><title>Field report</title></head><body><main><div class="template-part"><div class="story"><h2>Measurements</h2><p>${intro}</p><div class="skip-region"><p>${excluded}</p></div><p>${ending}</p></div></div></main></body></html>`;
const valid = { articleContainer: 'main', content: '.story', title: 'h1', exclude: ['.skip-region'] };
const conflict = { ...valid, exclude: ['.template-part', '.skip-region'] };
const data = () => ({ html, url, title: 'Field report', apiKey: 'synthetic-key', model: 'deepseek-flash', provider: 'deepseek', tabId: 7, processingRunId: 'synthetic-processing-owner' });
let saved, execute, readCount, sourceHtml;
const windows = [];

beforeEach(() => {
  saved = {};
  readCount = 0;
  sourceHtml = html;
  mocks.progress.mockReset().mockResolvedValue();
  mocks.callAI.mockReset().mockResolvedValue(valid);
  execute = vi.fn(async options => {
    const dom = new JSDOM(sourceHtml, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    windows.push(dom.window);
    expect(dom.window.document.compatMode).toBe('CSS1Compat');
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 400 });
    const run = dom.window.eval(`(${options.func.toString()})`);
    return [{ result: await run(...options.args) }];
  });
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: vi.fn(async () => { readCount++; return structuredClone(saved); }),
      set: vi.fn(async value => { Object.assign(saved, structuredClone(value)); })
    } },
    tabs: { get: vi.fn(async () => ({ id: 7, url })) },
    scripting: { executeScript: execute }, runtime: { lastError: null }
  });
});
afterEach(() => { for (const win of windows.splice(0)) win.close(); });

function assertArticle(result) {
  const text = result.content.map(item => item.text || '').join('\n');
  expect(text).toContain(intro);
  expect(text).toContain(ending);
  expect(text).not.toContain(excluded);
}

describe('bounded selector correction', () => {
  it('reanalyzes a fresh no-content result with the same page, model, provider and cancellation owner', async () => {
    const checkCancelled = vi.fn();
    mocks.callAI.mockResolvedValueOnce(conflict).mockResolvedValueOnce(valid);
    const result = await processWithSelectorMode({ ...data(), checkCancelled }, extractAutomaticallyInlined);
    assertArticle(result);
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.callAI.mock.calls;
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toContain(first[1]);
    expect(second[1]).toContain(JSON.stringify(conflict));
    expect(second[1]).toMatch(/no article content/i);
    expect(second.slice(2)).toEqual(first.slice(2));
    expect(second[5]).toEqual({ provider: 'deepseek', checkCancelled });
    expect(saved.selector_cache['example.org'].selectors).toEqual(valid);
    const progress = mocks.progress.mock.calls.map(call => call[2]);
    expect(progress).toEqual([3, 5, 5, 5, 8]);
  });

  it('stops after two failing AI selector sets and does not cache either set', async () => {
    mocks.callAI.mockImplementation(async () => {
      if (mocks.callAI.mock.calls.length > 2) throw new Error('Unexpected third selector request');
      return conflict;
    });
    await expect(processWithSelectorMode(data(), extractAutomaticallyInlined)).rejects.toMatchObject({ code: 'SELECTOR_MISS' });
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(saved.selector_cache?.['example.org']).toBeUndefined();
  });

  it('shares the two-call AI budget across a failed cache entry and two fresh attempts', async () => {
    await cacheSelectors(url, conflict);
    mocks.callAI.mockResolvedValueOnce(conflict).mockResolvedValueOnce(valid);
    const result = await processWithSelectorMode(data(), extractAutomaticallyInlined);
    assertArticle(result);
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(saved.selector_cache['example.org'].selectors).toEqual(valid);
  });

  it('does not restart the AI budget after a failed cached selector and failed correction', async () => {
    await cacheSelectors(url, conflict);
    mocks.callAI.mockImplementation(async () => {
      if (mocks.callAI.mock.calls.length > 2) throw new Error('Unexpected third selector request');
      return conflict;
    });
    await expect(processWithSelectorMode(data(), extractAutomaticallyInlined)).rejects.toMatchObject({ code: 'SELECTOR_MISS' });
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(saved.selector_cache['example.org'].invalidated).toBe(true);
    expect(await getCachedSelectors(url)).toBeNull();
  });

  it('retains selective exclusions with leaf selectors without requesting correction', async () => {
    mocks.callAI.mockResolvedValue({ ...valid, content: 'p' });
    assertArticle(await processWithSelectorMode(data(), extractAutomaticallyInlined));
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('keeps wholly excluded leaf roots excluded until the AI corrects the selector set', async () => {
    const excludedLeaves = { ...valid, content: '.skip-region p' };
    mocks.callAI.mockResolvedValueOnce(excludedLeaves).mockResolvedValueOnce(valid);
    assertArticle(await processWithSelectorMode(data(), extractAutomaticallyInlined));
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0].args[2]).toEqual(excludedLeaves);
    expect(mocks.callAI.mock.calls[1][1]).toContain(JSON.stringify(excludedLeaves));
  });

  it.each(['h2', 'h2,hr'])('corrects selectors that match headings without reading content: %s', async content => {
    sourceHtml = html.replace('</h2>', '</h2><hr>');
    const structuralSelectors = { ...valid, content };
    mocks.callAI.mockResolvedValueOnce(structuralSelectors).mockResolvedValueOnce(valid);
    assertArticle(await processWithSelectorMode(data(), extractAutomaticallyInlined));
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(mocks.callAI.mock.calls[1][1]).toContain(JSON.stringify(structuralSelectors));
    expect(saved.selector_cache['example.org'].selectors).toEqual(valid);
  });

  it.each([
    ['image', '<img src="/diagram.png" width="500" height="350" alt="Sampling diagram">', 'Sampling diagram'],
    ['table', '<table><tr><th>Sample</th><th>Result</th></tr><tr><td>A</td><td>18</td></tr></table>', 'Result'],
    ['code', '<pre><code>calculate(sample);</code></pre>', 'calculate(sample);']
  ])('accepts an article whose only reading content is %s', async (type, body, expected) => {
    sourceHtml = `<!doctype html><main><article class="story"><h1>Field report</h1>${body}</article></main>`;
    const result = await processWithSelectorMode({ ...data(), html: sourceHtml }, extractAutomaticallyInlined);
    expect(result.content.map(item => item.type)).toEqual([type]);
    expect(JSON.stringify(result.content)).toContain(expected);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(saved.selector_cache['example.org'].selectors).toEqual(valid);
  });

  it('keeps a numeric section and its backlink in Selector and Automatic regardless of cache', async () => {
    const notes = Array.from({ length: 8 }, (_, index) => `<p>Observation ${index + 1} supplies a separate and complete measurement.</p>`).join('');
    const body = `<h2 id="sample-18">18</h2><p><a href="#sample-18">Review sample 18</a>. ${ending}</p>${notes}`;
    sourceHtml = `<!doctype html><main><article class="story"><h1>Field report</h1><p>${intro}</p>${body}</article></main>`;
    const input = { ...data(), html: sourceHtml };
    const cold = await processWithoutAI(input, extractAutomaticallyInlined);
    expect(execute.mock.calls[0][0].args).toHaveLength(2);
    const selected = await processWithSelectorMode(input, extractAutomaticallyInlined);
    const warm = await processWithoutAI(input, extractAutomaticallyInlined);
    expect(execute.mock.calls[2][0].args[2]).toEqual(valid);
    for (const result of [cold, selected, warm]) {
      expect(result.content).toContainEqual(expect.objectContaining({ type: 'heading', id: 'sample-18', text: '18' }));
      expect(result.content.map(item => item.html).join('')).toContain('href="#sample-18"');
    }
    expect(mocks.callAI).toHaveBeenCalledOnce();
  });

  it('does not serialize page diagnostics during normal Selector extraction', async () => {
    assertArticle(await processWithSelectorMode(data(), extractAutomaticallyInlined));
    expect(execute.mock.calls[0][0].args[1]).toBe(false);
    const [{ result }] = await execute.mock.results[0].value;
    expect(result.debugInfo).toBeNull();
  });

  it('collects page diagnostics when debug and verbose logging are enabled', async () => {
    const { LOG_LEVEL, VERBOSE_LOGGING } = CONFIG;
    CONFIG.LOG_LEVEL = 0;
    CONFIG.VERBOSE_LOGGING = true;
    try {
      assertArticle(await processWithSelectorMode(data(), extractAutomaticallyInlined));
      expect(execute.mock.calls[0][0].args[1]).toBe(true);
      const [{ result }] = await execute.mock.results[0].value;
      expect(result.debugInfo.foundElements).toBeGreaterThan(0);
    } finally {
      Object.assign(CONFIG, { LOG_LEVEL, VERBOSE_LOGGING });
    }
  });

  it.each([1, 2])('checks cancellation after extraction %i before further paid calls or cache writes', async attempt => {
    let cancelled = false;
    const cancellation = new Error('Processing owner is no longer current');
    const run = execute.getMockImplementation();
    execute.mockImplementation(async options => {
      const value = await run(options);
      if (execute.mock.calls.length === attempt) cancelled = true;
      return value;
    });
    mocks.callAI.mockResolvedValueOnce(conflict).mockResolvedValueOnce(valid);
    await expect(processWithSelectorMode({ ...data(), checkCancelled: () => { if (cancelled) throw cancellation; } }, extractAutomaticallyInlined)).rejects.toBe(cancellation);
    expect(mocks.callAI).toHaveBeenCalledTimes(attempt);
    expect(execute).toHaveBeenCalledTimes(attempt);
    expect(saved.selector_cache?.['example.org']).toBeUndefined();
  });

  it('discards a corrective response delivered after cancellation before extraction or cache writes', async () => {
    let cancelled = false, resolveCorrection, announceCorrection;
    const cancellation = new Error('Processing owner is no longer current');
    const correctionStarted = new Promise(resolve => { announceCorrection = resolve; });
    mocks.callAI.mockResolvedValueOnce(conflict).mockImplementationOnce(() => {
      announceCorrection();
      return new Promise(resolve => { resolveCorrection = resolve; });
    });
    const pending = processWithSelectorMode({ ...data(), checkCancelled: () => { if (cancelled) throw cancellation; } }, extractAutomaticallyInlined);
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    await Promise.race([correctionStarted, pending]);
    cancelled = true;
    resolveCorrection(valid);
    expect((await outcome).error).toBe(cancellation);
    expect(execute).toHaveBeenCalledOnce();
    expect(saved.selector_cache?.['example.org']).toBeUndefined();
  });

  it('does not invalidate a replacement cache entry after the old cached extraction is superseded', async () => {
    await cacheSelectors(url, conflict);
    let cancelled = false;
    const cancellation = new Error('Processing owner is no longer current');
    const run = execute.getMockImplementation();
    execute.mockImplementation(async options => {
      const value = await run(options);
      await cacheSelectors(url, valid);
      cancelled = true;
      return value;
    });
    await expect(processWithSelectorMode({ ...data(), checkCancelled: () => { if (cancelled) throw cancellation; } }, extractAutomaticallyInlined)).rejects.toBe(cancellation);
    expect(saved.selector_cache['example.org'].selectors).toEqual(valid);
    expect(saved.selector_cache['example.org'].invalidated).toBe(false);
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it('does not invalidate selectors saved while an earlier cached DOM attempt is pending', async () => {
    await cacheSelectors(url, conflict);
    const run = execute.getMockImplementation();
    execute.mockImplementationOnce(async options => {
      const result = await run(options);
      await cacheSelectors(url, valid);
      return result;
    });
    mocks.callAI.mockResolvedValue(conflict);
    await expect(processWithSelectorMode(data(), extractAutomaticallyInlined))
      .rejects.toMatchObject({ code: 'SELECTOR_MISS' });
    expect(mocks.callAI).toHaveBeenCalledTimes(2);
    expect((await getCachedSelectors(url)).selectors).toEqual(valid);
    expect(saved.selector_cache['example.org'].invalidated).toBe(false);
  });

  it('checks cancellation between corrective progress and admission of the next paid request', async () => {
    let cancelled = false;
    const cancellation = new Error('Processing owner is no longer current');
    mocks.callAI.mockResolvedValueOnce(conflict).mockResolvedValueOnce(valid);
    mocks.progress.mockImplementation(async (_stage, status, progress) => {
      if (status === 'stageAnalyzing' && progress === 5) cancelled = true;
    });
    await expect(processWithSelectorMode({ ...data(), checkCancelled: () => { if (cancelled) throw cancellation; } }, extractAutomaticallyInlined)).rejects.toBe(cancellation);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(saved.selector_cache?.['example.org']).toBeUndefined();
  });

  it.each(['NETWORK_ERROR', 'AI_RESPONSE_TRUNCATED', 'JSON_PARSE_ERROR'])('does not retry provider failure %s as a selector correction', async code => {
    const error = Object.assign(new Error('Synthetic provider failure'), { code });
    mocks.callAI.mockRejectedValue(error);
    await expect(processWithSelectorMode(data(), extractAutomaticallyInlined)).rejects.toBe(error);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['throw', 'returned-error'])('does not retry a generic scripting or DOM-engine exception: %s', async kind => {
    if (kind === 'throw') execute.mockRejectedValue(new TypeError('Synthetic DOM engine failure'));
    else execute.mockResolvedValue([{ result: { error: 'Synthetic DOM engine failure' } }]);
    await expect(processWithSelectorMode(data(), extractAutomaticallyInlined)).rejects.toBeInstanceOf(Error);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(saved.selector_cache?.['example.org']).toBeUndefined();
  });

  it('does not request correction when the original tab is no longer available', async () => {
    await cacheSelectors(url, conflict);
    chrome.tabs.get.mockRejectedValue(new Error('Synthetic closed tab'));
    await expect(processWithSelectorMode(data(), extractAutomaticallyInlined)).rejects.toBeInstanceOf(Error);
    expect(mocks.callAI).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(readCount).toBeGreaterThan(0);
    expect((await getCachedSelectors(url)).selectors).toEqual(conflict);
  });
});

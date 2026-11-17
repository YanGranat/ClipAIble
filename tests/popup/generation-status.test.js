import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initSummary } from '../../popup/core/summary.js';
import { initKeyTheses } from '../../popup/core/key-theses.js';
import { STORAGE_KEYS } from '../../popup/constants.js';

vi.mock('../../scripts/locales.js', () => ({ tSync: key => key }));

function element() {
  const classes = new Set();
  return {
    value: '', dataset: {}, style: {}, disabled: false, textContent: '', innerHTML: '',
    removeAttribute(name) { if (name === 'data-i18n') delete this.dataset.i18n; },
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    }
  };
}

describe('popup generation status', () => {
  let store;
  let elements;
  let deps;

  beforeEach(() => {
    store = { summary_generating: false, key_theses_generating: false,
      summary_generating_start_time: null, key_theses_generating_start_time: null };
    elements = Object.fromEntries([
      'generateSummaryBtn', 'summaryContainer', 'summaryText',
      'generateKeyThesesBtn', 'keyThesesContainer', 'keyThesesText',
      'modelSelect', 'apiKey', 'modeSelect', 'useCache', 'apiProviderSelect'
    ].map(name => [name, element()]));
    elements.modelSelect.value = 'gpt-test';
    elements.modeSelect.value = 'automatic';
    elements.apiProviderSelect.value = 'openai';
    elements.apiKey.dataset.provider = 'openai';
    globalThis.document = { createElement: () => element() };
    globalThis.chrome = {
      storage: { local: {
        get: vi.fn(async keys => Object.fromEntries(keys.map(key => [key, store[key]]))),
        set: vi.fn(async values => Object.assign(store, values)),
        remove: vi.fn(async keys => keys.forEach(key => delete store[key]))
      } },
      tabs: { query: vi.fn(async () => [{ id: 7, url: 'https://example.org/article', title: 'Article' }]) },
      scripting: { executeScript: vi.fn(async () => [{ result: { html: '<article>Text</article>', url: 'https://example.org/article' } }]) },
      runtime: { sendMessage: vi.fn(async message => {
        const prefix = message.data?.autoGenerateKeyTheses ? 'key_theses' : 'summary';
        store[`${prefix}_generating`] = true;
        store[`${prefix}_generating_start_time`] = Date.now();
        return { success: true, extracting: true };
      }) }
    };
    deps = {
      elements, STORAGE_KEYS,
      t: vi.fn(async key => key), getUILanguage: vi.fn(async () => 'en'),
      log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), showToast: vi.fn(),
      decryptApiKey: vi.fn(async () => { throw new Error('Cannot decrypt'); }),
      getProviderFromModel: () => 'openai', detectVideoPlatform: () => null,
      markdownToHtmlFn: text => text, sanitizeMarkdownHtml: text => text,
      CONFIG: { SUMMARY_STALE_THRESHOLD_MS: 900000 }
    };
  });

  for (const [name, initializer, method, flag, time, button] of [
    ['summary', initSummary, 'handleGenerateSummary', 'summary_generating', 'summary_generating_start_time', 'generateSummaryBtn'],
    ['key theses', initKeyTheses, 'handleGenerateKeyTheses', 'key_theses_generating', 'key_theses_generating_start_time', 'generateKeyThesesBtn']
  ]) {
    it(`${name} restores its local button after a missing API key without writing background state`, async () => {
      const otherFlag = flag === 'summary_generating' ? 'key_theses_generating' : 'summary_generating';
      store[otherFlag] = true;
      await initializer(deps)[method]();
      expect(store[flag]).toBe(false);
      expect(store[time]).toBeNull();
      expect(store[otherFlag]).toBe(true);
      expect(elements[button].disabled).toBe(false);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it(`${name} restores its local button when decryption fails`, async () => {
      elements.apiKey.value = '****';
      elements.apiKey.dataset.encrypted = 'ciphertext';
      await initializer(deps)[method]();
      expect(store[flag]).toBe(false);
      expect(store[time]).toBeNull();
      expect(elements[button].disabled).toBe(false);
    });

    it(`${name} restores its local button when page extraction returns no data`, async () => {
      elements.apiKey.value = 'synthetic-api-key';
      chrome.scripting.executeScript.mockResolvedValue([]);
      await initializer(deps)[method]();
      expect(store[flag]).toBe(false);
      expect(store[time]).toBeNull();
      expect(elements[button].disabled).toBe(false);
    });

    it(`${name} displays the background owner's flag after extraction starts`, async () => {
      elements.apiKey.value = 'synthetic-api-key';
      await initializer(deps)[method]();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'extractContentOnly' }));
      expect(store[flag]).toBe(true);
      expect(store[time]).toEqual(expect.any(Number));
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it(`${name} preserves an admitted job after a lost response`, async () => {
      elements.apiKey.value = 'synthetic-api-key';
      chrome.runtime.sendMessage.mockImplementation(async () => {
        store[flag] = true;
        store[time] = 123;
        throw new Error('Response channel closed');
      });
      await initializer(deps)[method]();
      expect(store[flag]).toBe(true);
      expect(store[time]).toBe(123);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(button === 'generateSummaryBtn' ? elements[button].disabled : elements[button].classList.contains('key-theses-generating')).toBe(true);
    });

    it(`${name} leaves expiry and cancellation to the background owner`, async () => {
      store[flag] = true;
      store[time] = 1;
      const module = initializer(deps);
      await module[name === 'summary' ? 'checkSummaryStatus' : 'checkKeyThesesStatus']();
      expect(store[flag]).toBe(true);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it(`${name} reports a background error once`, async () => {
      store[name === 'summary' ? 'summary_error' : 'key_theses_error'] = 'Generation could not finish';
      const module = initializer(deps);
      const check = name === 'summary' ? 'checkSummaryStatus' : 'checkKeyThesesStatus';
      await module[check]();
      await module[check]();
      expect(deps.showToast).toHaveBeenCalledTimes(1);
      expect(deps.showToast).toHaveBeenCalledWith('Generation could not finish', 'error');
    });

    it(`${name} forwards the current background error identity to the visible toast`, async () => {
      const prefix = name === 'summary' ? 'summary' : 'key_theses';
      store[`${prefix}_error`] = 'Current failure';
      store[`${prefix}_error_translation`] = { key: 'errorNetwork', params: {} };
      const module = initializer(deps);
      await module[name === 'summary' ? 'checkSummaryStatus' : 'checkKeyThesesStatus']();
      expect(deps.showToast).toHaveBeenCalledWith('Current failure', 'error', { key: 'errorNetwork', params: {} });
    });

    it(`${name} sends video subtitles with the selected provider to background generation`, async () => {
      elements.apiKey.value = 'synthetic-api-key';
      elements.apiProviderSelect.value = 'openrouter';
      elements.apiKey.dataset.provider = 'openrouter';
      deps.detectVideoPlatform = () => ({ platform: 'youtube' });
      chrome.tabs.sendMessage = vi.fn(async () => ({ success: true }));
      chrome.runtime.sendMessage.mockImplementation(async message => {
        if (message.action === 'extractYouTubeSubtitlesForSummary') return { result: { subtitles: [{ text: 'A useful explanation.' }] } };
        store[flag] = true;
        store[time] = Date.now();
        return { started: true, generationId: 'generation-video' };
      });
      await initializer(deps)[method]();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: name === 'summary' ? 'generateSummary' : 'generateKeyTheses',
        data: expect.objectContaining({ provider: 'openrouter', contentItems: [{ type: 'paragraph', text: 'A useful explanation.' }] })
      });
      expect(store[flag]).toBe(true);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  }

  it('cancels local key-theses preparation before it can admit background work', async () => {
    elements.apiKey.value = 'synthetic-api-key';
    let finishTabQuery;
    chrome.tabs.query.mockReturnValue(new Promise(resolve => { finishTabQuery = resolve; }));
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    const module = initKeyTheses(deps);
    const preparation = module.handleGenerateKeyTheses();
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledTimes(1));
    await module.handleGenerateKeyTheses({ target: { closest: () => true } });
    finishTabQuery([{ id: 7, url: 'https://example.org/article' }]);
    await preparation;
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(elements.generateKeyThesesBtn.classList.contains('key-theses-generating')).toBe(false);
  });

  it('targets a late admission acknowledgement after local cancellation by its own generation ID', async () => {
    elements.apiKey.value = 'synthetic-api-key';
    let acknowledge;
    chrome.runtime.sendMessage.mockImplementation(message => message.action === 'extractContentOnly'
      ? new Promise(resolve => { acknowledge = resolve; })
      : Promise.resolve({ success: true }));
    const module = initKeyTheses(deps);
    const preparation = module.handleGenerateKeyTheses();
    await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'extractContentOnly' })));
    await module.handleGenerateKeyTheses({ target: { closest: () => true } });
    acknowledge({ success: true, extracting: true, generationId: 'generation-a' });
    await preparation;
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'cancelKeyThesesGeneration', data: { generationId: 'generation-a' } });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('captures the displayed background generation ID when cancellation is requested', async () => {
    store.key_theses_generating = true;
    store.key_theses_generation_id = 'generation-b';
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    const module = initKeyTheses(deps);
    await module.checkKeyThesesStatus();
    store.key_theses_generation_id = 'generation-c';
    await module.handleGenerateKeyTheses({ target: { closest: () => true } });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'cancelKeyThesesGeneration', data: { generationId: 'generation-b' } });
  });
});

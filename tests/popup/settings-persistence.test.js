import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../scripts/utils/config.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn() }));

describe('popup settings persistence', () => {
  let save;
  let store;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    store = {};
    chrome.storage.local.set = vi.fn(async values => Object.assign(store, structuredClone(values)));
    ({ debouncedSaveSettings: save } = await import('../../popup/utils/settings-helpers.js'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('starts persistence for independent settings before any UI timer runs', async () => {
    const font = save('pdf_font_size', '38');
    const color = save('pdf_custom_bg_color', '#112233');
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
    await Promise.all([font, color]);
    expect(store).toEqual({ pdf_font_size: '38', pdf_custom_bg_color: '#112233' });
  });

  it('debounces callbacks per key and retains the newest same-key callback', async () => {
    const old = vi.fn();
    const newest = vi.fn();
    const independent = vi.fn();
    save('popup_theme', 'dark', old);
    save('output_format', 'epub', independent);
    save('popup_theme', 'light', newest);
    await vi.advanceTimersByTimeAsync(CONFIG.UI_DEBOUNCE_DELAY);
    expect(old).not.toHaveBeenCalled();
    expect(newest).toHaveBeenCalledOnce();
    expect(independent).toHaveBeenCalledOnce();
    expect(store.popup_theme).toBe('light');
  });

  it('does not publish an older callback after a newer value is saved', async () => {
    let finishOlder;
    chrome.storage.local.set.mockImplementationOnce(values => {
      Object.assign(store, values);
      return new Promise(resolve => { finishOlder = resolve; });
    });
    const old = vi.fn();
    const newest = vi.fn();
    save('popup_theme', 'dark', old);
    vi.advanceTimersByTime(CONFIG.UI_DEBOUNCE_DELAY);
    save('popup_theme', 'light', newest);
    expect(store.popup_theme).toBe('light');
    finishOlder();
    await vi.advanceTimersByTimeAsync(CONFIG.UI_DEBOUNCE_DELAY);
    expect(old).not.toHaveBeenCalled();
    expect(newest).toHaveBeenCalledOnce();
    expect(store.popup_theme).toBe('light');
  });

  it('allows retry after a failed write', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    const failed = vi.fn();
    await save('output_format', 'pdf', failed);
    await vi.advanceTimersByTimeAsync(CONFIG.UI_DEBOUNCE_DELAY);
    expect(failed).not.toHaveBeenCalled();
    const retried = vi.fn();
    await save('output_format', 'epub', retried);
    await vi.advanceTimersByTimeAsync(CONFIG.UI_DEBOUNCE_DELAY);
    expect(store.output_format).toBe('epub');
    expect(retried).toHaveBeenCalledOnce();
  });
});

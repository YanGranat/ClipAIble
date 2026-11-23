import { beforeEach, expect, it, vi } from 'vitest';
import { getFormattedStats, loadStats, recordSave } from '../../scripts/stats/index.js';
import { importSettings } from '../../scripts/settings/import-export.js';
import { routeMessage } from '../../scripts/message-handlers/index.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
let stored;
beforeEach(() => {
  stored = {};
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(stored, key)).map(key => [key, structuredClone(stored[key])])));
  chrome.storage.local.set.mockImplementation(async values => { Object.assign(stored, structuredClone(values)); });
});

it('repairs malformed stored statistics while retaining valid cumulative counts', async () => {
  stored.extension_stats = { totalSaved: 12, byFormat: { pdf: 7, audio: 'bad' }, byMonth: null, topSites: [], totalProcessingTime: 'bad', history: 'bad' };
  await expect(getFormattedStats()).resolves.toMatchObject({ totalSaved: 12, history: [], byFormat: { pdf: 7, audio: 0 } });
  const result = await recordSave({ title: 'Article', url: 'https://example.com/', format: 'markdown', processingTime: 200 });
  expect(result).toMatchObject({ totalSaved: 13, byFormat: { pdf: 7, markdown: 1 }, totalProcessingTime: 200 });
  expect(result.history).toHaveLength(1);
});

it('imports malformed optional statistics without breaking later display or saves', async () => {
  await importSettings(JSON.stringify({ settings: {}, statistics: { totalSaved: 3, history: [null, 'bad'] } }), { importStats: true });
  await expect(getFormattedStats()).resolves.toMatchObject({ totalSaved: 3, history: [] });
  await expect(recordSave({ title: 'Article', url: 'https://example.com/', format: 'pdf', processingTime: 10 })).resolves.toMatchObject({ totalSaved: 4 });
});

it('preserves valid legacy format counters and history entries', async () => {
  const entry = { title: 'Saved document', url: 'https://example.com/', format: 'html', date: 1700000000000, processingTime: 250 };
  stored.extension_stats = { totalSaved: 5, byFormat: { html: 5 }, byMonth: { '2023-11': 5 }, topSites: { 'example.com': 5 }, totalProcessingTime: 1250, lastSaved: entry.date, history: [entry] };
  await expect(loadStats()).resolves.toMatchObject(stored.extension_stats);
});

const article = title => ({ title, url: 'https://example.com/', format: 'pdf', processingTime: 50, date: 100 });
const importHistory = () => new Promise(resolve => {
  routeMessage({
    action: 'importSettings',
    jsonData: JSON.stringify({ settings: {}, statistics: { totalSaved: 1, history: [article('Imported')] } }),
    options: { importStats: true }
  }, { id: chrome.runtime.id, url: chrome.runtime.getURL('popup/popup.html') }, resolve, {});
});

it.each([false, true])('orders history import and an overlapping save with import first=%s', async importFirst => {
  await recordSave(article('Original'));
  const write = chrome.storage.local.set.getMockImplementation();
  let started;
  let release;
  const writeStarted = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  chrome.storage.local.set.mockImplementation(async update => {
    if (update.extension_stats && started) {
      started();
      started = null;
      await pending;
    }
    return write(update);
  });

  const first = importFirst ? importHistory() : recordSave(article('New export'));
  await writeStarted;
  const second = importFirst ? recordSave(article('New export')) : importHistory();
  await new Promise(resolve => setTimeout(resolve, 0));
  release();

  const [imported] = await Promise.all([importFirst ? first : second, importFirst ? second : first]);
  expect(imported).toMatchObject({ success: true, result: { statsImported: true } });
  const stats = await loadStats();
  const expectedTitles = importFirst ? ['New export', 'Imported'] : ['Imported'];
  expect(stats.history.map(item => item.title)).toEqual(expectedTitles);
  expect(stats.totalSaved).toBe(expectedTitles.length);
});

it('preserves history after a temporary read failure and records a later export', async () => {
  await recordSave(article('Original'));
  const read = chrome.storage.local.get.getMockImplementation();
  let failNextStatsRead = true;
  chrome.storage.local.get.mockImplementation(async keys => {
    if (failNextStatsRead && keys.length === 1 && keys[0] === 'extension_stats') {
      failNextStatsRead = false;
      throw new Error('Temporary storage error');
    }
    return read(keys);
  });

  await expect(recordSave(article('Export with failed stats read'))).resolves.toBeNull();
  expect((await loadStats()).history.map(item => item.title)).toEqual(['Original']);
  await recordSave(article('Next export'));
  const stats = await loadStats();
  expect(stats.history.map(item => item.title)).toEqual(['Next export', 'Original']);
  expect(stats.totalSaved).toBe(2);
});

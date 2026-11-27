import { beforeEach, expect, it, vi } from 'vitest';
import { deleteHistoryItem, getFormattedStats, loadStats, recordSave } from '../../scripts/stats/index.js';
import { exportSettings, importSettings } from '../../scripts/settings/import-export.js';
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
const importHistory = (dataMode = 'replace') => new Promise(resolve => {
  routeMessage({
    action: 'importSettings',
    jsonData: JSON.stringify({ settings: {}, statistics: { totalSaved: 1, history: [article('Imported')] } }),
    options: { importStats: true, dataMode }
  }, { id: chrome.runtime.id, url: chrome.runtime.getURL('popup/popup.html') }, resolve, {});
});

const historyRow = (id, date, format = 'pdf') => ({
  id, title: `Document ${id}`, url: 'https://example.net/', format, date, processingTime: 300
});
const addSnapshot = statistics => importSettings(JSON.stringify({ settings: {}, statistics }), { importStats: true, dataMode: 'add' });

it('retains only history fields the extension uses when importing and exporting statistics', async () => {
  const row = { ...historyRow('recent', 80), domain: 'example.net' };
  const imported = { ...row, token: 'synthetic-unknown-value', notes: { privateText: 'Example free-form note.' } };
  const statistics = { totalSaved: 1, history: [imported] };
  await addSnapshot(statistics);
  await addSnapshot(statistics);
  expect(stored.extension_stats.history).toEqual([row]);
  expect(JSON.parse((await exportSettings(true)).data).statistics.history).toEqual([row]);
  await deleteHistoryItem(row);
  expect(stored.extension_stats.history).toEqual([]);
});

it('adds unique recent saves without adding overlapping snapshot totals', async () => {
  const original = historyRow('original', new Date(2025, 2, 10).getTime());
  const added = historyRow('another', new Date(2025, 3, 10).getTime(), 'markdown');
  stored.extension_stats = { totalSaved: 1, byFormat: { pdf: 1 }, byMonth: { '2025-03': 1 },
    topSites: { 'example.net': 1 }, totalProcessingTime: 300, lastSaved: original.date, history: [original] };
  const backup = { totalSaved: 81, history: [added, original, added] };
  await expect(addSnapshot(backup)).resolves.toMatchObject({ statsImported: true });
  expect(stored.extension_stats).toMatchObject({ totalSaved: 2, byFormat: { pdf: 1, markdown: 1 },
    byMonth: { '2025-03': 1, '2025-04': 1 }, topSites: { 'example.net': 2 }, totalProcessingTime: 600,
    lastSaved: added.date, history: [added, original] });
  const snapshot = structuredClone(stored.extension_stats);
  await addSnapshot(backup);
  expect(stored.extension_stats).toEqual(snapshot);
});

it('keeps independent saves of the same URL and deduplicates repeat legacy records with no ID', async () => {
  const { id, ...legacy } = historyRow('legacy', 20);
  const first = historyRow('first', 40);
  const second = { ...first, id: 'second' };
  stored.extension_stats = { totalSaved: 1, history: [legacy] };
  await addSnapshot({ totalSaved: 3, history: [first, second, legacy] });
  expect(stored.extension_stats.history).toEqual([first, second, legacy]);
  expect(stored.extension_stats.totalSaved).toBe(3);
});

it('opens a full snapshot on a clean profile and avoids inflating previously counted history', async () => {
  const recent = historyRow('recent', 80);
  const older = historyRow('older', 55);
  await addSnapshot({ totalSaved: 90, history: [recent], lastSaved: recent.date });
  expect(stored.extension_stats.totalSaved).toBe(90);
  await addSnapshot({ totalSaved: 91, history: [recent, older] });
  expect(stored.extension_stats.history).toEqual([recent, older]);
  expect(stored.extension_stats.totalSaved).toBe(90);
  await deleteHistoryItem(recent);
  await addSnapshot({ totalSaved: 91, history: [recent, older] });
  expect(stored.extension_stats.history).toEqual([recent, older]);
  expect(stored.extension_stats.totalSaved).toBe(90);
});

it('preserves the recent history window without counting discarded rows', async () => {
  const history = Array.from({ length: 50 }, (_, i) => historyRow(`row-${i}`, 200 - i));
  stored.extension_stats = { totalSaved: 50, history, historyCountedThrough: null };
  const fresh = historyRow('fresh', 300);
  const discarded = historyRow('discarded', 100);
  await addSnapshot({ totalSaved: 2, history: [fresh, discarded] });
  expect(stored.extension_stats.history).toEqual([fresh, ...history.slice(0, 49)]);
  expect(stored.extension_stats.totalSaved).toBe(51);
  await deleteHistoryItem(fresh);
  await addSnapshot({ totalSaved: 2, history: [fresh, discarded] });
  expect(stored.extension_stats.totalSaved).toBe(51);
});

it('preserves existing data if a malformed statistics section was selected for replacement', async () => {
  stored.extension_stats = { totalSaved: 1, history: [historyRow('saved', 30)] };
  const snapshot = structuredClone(stored.extension_stats);
  const result = await importSettings(JSON.stringify({ settings: {}, statistics: ['invalid'] }), { importStats: true, dataMode: 'replace' });
  expect(result).toMatchObject({ statsImported: false });
  expect(result.errors).toHaveLength(1);
  expect(stored.extension_stats).toEqual(snapshot);
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

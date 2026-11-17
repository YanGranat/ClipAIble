import { beforeEach, expect, it, vi } from 'vitest';
import { getFormattedStats, loadStats, recordSave } from '../../scripts/stats/index.js';
import { importSettings } from '../../scripts/settings/import-export.js';
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

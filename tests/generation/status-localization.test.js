// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';
import { generatePdf } from '../../scripts/generation/pdf.js';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { processImagesInBatches } from '../../scripts/utils/html/images.js';
import { clearUILanguageCache } from '../../scripts/utils/processing/pipeline-helpers.js';
import { formatMessage } from '../../scripts/locales.js';

vi.mock('../../scripts/utils/storage.js', async original => ({ ...await original(), saveLargeData: vi.fn(async () => {}), removeLargeData: vi.fn(async () => {}) }));
vi.mock('../../scripts/api/print-storage.js', () => ({ putPrintJob: vi.fn(async () => {}), removePrintJob: vi.fn(async () => {}), prunePrintJobs: vi.fn(async () => 0) }));
beforeEach(() => {
  clearUILanguageCache();
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'ru' });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample-article');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<style>body{font-family:serif}</style>')));
  chrome.windows = { getCurrent: vi.fn(async () => ({ id: 1 })) };
  chrome.tabs.create = vi.fn(async () => ({ id: 42 }));
  chrome.tabs.get = vi.fn(async () => ({ id: 42 }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['markdown', 'epub', 'fb2', 'pdf'])('keeps %s factory progress translatable through the actual generator', async format => {
  const updates = [];
  await DocumentGeneratorFactory.generate(format, { url: 'https://example.test/article', effectiveLanguage: 'en' },
    { title: 'Sample article', content: [{ type: 'paragraph', text: 'Article body.' }] }, value => updates.push(value));
  const statuses = updates.filter(value => typeof value.status === 'string');
  expect(statuses.length).toBeGreaterThanOrEqual(2);
  for (const update of statuses) {
    expect(update.statusTranslationKey).toBeTruthy();
    expect(update.status).toBe(formatMessage(update.statusTranslationKey, 'ru', update.statusTranslationParams));
    expect(formatMessage(update.statusTranslationKey, 'de', update.statusTranslationParams)).not.toBe(update.status);
  }
  expect(statuses.some(value => value.progress === 95)).toBe(true);
});

it.each([generateMarkdown, generateEpub, generateFb2, generatePdf])('preserves empty-document error identity through a generator rethrow', async generate => {
  const error = await generate({ content: [] }).catch(error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error.translationKey).toBeTruthy();
  expect(error.message).toBe(formatMessage(error.translationKey, 'ru', error.translationParams));
});

it('keeps completed and failed image progress typed without changing progress or outcomes', async () => {
  const updates = [];
  const result = await processImagesInBatches([{ src: 'sample-a' }, { src: 'sample-b' }], 1,
    value => updates.push(value),
    async (image, index) => { if (index) throw new Error('Sample image failed'); return { image }; });
  expect(result).toHaveLength(2);
  expect(result[1].error).toBe('Sample image failed');
  expect(updates.map(value => value.progress)).toEqual([88, 95]);
  expect(updates.map(value => value.statusTranslationParams)).toEqual([{ current: 1, total: 2 }, { current: 2, total: 2 }]);
  expect(updates.every(value => value.status === formatMessage(value.statusTranslationKey, 'ru', value.statusTranslationParams))).toBe(true);
});

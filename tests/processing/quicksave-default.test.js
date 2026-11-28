import { expect, it, vi } from 'vitest';
import { prepareQuickSaveData } from '../../scripts/processing/quicksave.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn() }));

it('uses the same Automatic default as a fresh popup without requiring an API key', async () => {
  const result = await prepareQuickSaveData({}, 'markdown', 3, '<article>Text</article>', 'https://example.org/article', 'Article');
  expect(result.mode).toBe('automatic');
  expect(result.apiKey).toBe('');
});

it.each(['selector', 'extract'])('preserves the explicitly saved %s mode', async mode => {
  const result = await prepareQuickSaveData({ extraction_mode: mode, openai_api_key: 'synthetic-api-key' }, 'markdown', 3, '<article>Text</article>', 'https://example.org/article', 'Article');
  expect(result.mode).toBe(mode);
  expect(result.apiKey).toBe('synthetic-api-key');
});

it('applies the OCR preference only to PDF input, including URLs without an extension', async () => {
  const settings = { pdf_ocr: true, extraction_mode: 'automatic' };
  const url = 'https://example.org/document';
  const pdf = await prepareQuickSaveData(settings, 'markdown', 3, '', url, 'Document', 'application/pdf');
  const web = await prepareQuickSaveData(settings, 'markdown', 3, '', url, 'Article', 'text/html');
  expect(pdf).toMatchObject({ mode: 'ocr', apiKey: '', translateImages: false });
  expect(web.mode).toBe('automatic');
});

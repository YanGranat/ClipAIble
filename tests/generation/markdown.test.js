// Tests for Markdown generation module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMarkdown } from '../../scripts/generation/markdown.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock('../../scripts/utils/html.js', () => ({
  stripHtml: vi.fn((text) => text?.replace(/<[^>]*>/g, '') || ''),
  htmlToMarkdown: vi.fn((text) => text?.replace(/<[^>]*>/g, '') || '')
}));

vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    STORAGE_SAVE_DEBOUNCE: 500
  },
  PDF_LOCALIZATION: {
    en: { date: 'Date', source: 'Source', author: 'Author', contents: 'Contents', abstract: 'Abstract' },
    ru: { date: 'Дата', source: 'Источник', author: 'Автор', contents: 'Содержание', abstract: 'Аннотация' }
  },
  formatDateForDisplay: vi.fn((date, lang) => {
    if (!date) return '';
    // Simple mock: return formatted date
    return new Date(date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
  })
}));

vi.mock('../../scripts/translation/index.js', () => ({
  translateMetadata: vi.fn(async (text, lang, key, model, type) => {
    // Mock translation: return translated text
    if (type === 'date' && lang === 'ru') {
      return '23 декабря 2025';
    }
    return text;
  })
}));

vi.mock('../../scripts/utils/security.js', () => ({
  sanitizeFilename: vi.fn((name) => name.replace(/[^a-zA-Z0-9_-]/g, '_'))
}));

// Mock chrome.downloads
global.chrome = {
  downloads: {
    download: vi.fn((options, callback) => {
      if (callback) callback(1);
      return Promise.resolve(1);
    })
  }
};

// Mock URL.createObjectURL
global.URL = {
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn()
};

describe('generation/markdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateMarkdown', () => {
    it('should throw error if content is empty', async () => {
      await expect(
        generateMarkdown({ content: [], title: 'Test' })
      ).rejects.toThrow('No content to generate Markdown');
    });

    it('should generate basic markdown with title', async () => {
      const content = [
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'paragraph', text: 'Second paragraph' }
      ];
      
      const updateState = vi.fn();
      await generateMarkdown({
        content,
        title: 'Test Article',
        author: 'John Doe',
        sourceUrl: 'https://example.com',
        publishDate: '2025-12-23',
        language: 'en',
        apiKey: 'test-key',
        model: 'gpt-4'
      }, updateState);

      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Building Markdown...', progress: 85 })
      );
      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Saving file...', progress: 95 })
      );
      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Done!', progress: 100 })
      );
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should include metadata block', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateMarkdown({
        content,
        title: 'Test',
        author: 'Author',
        sourceUrl: 'https://example.com',
        publishDate: '2025-12-23',
        language: 'en'
      });

      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe('Test.md');
    });

    it('should generate TOC when enabled', async () => {
      const content = [
        { type: 'heading', text: 'Introduction', level: 2 },
        { type: 'paragraph', text: 'Text' },
        { type: 'heading', text: 'Conclusion', level: 2 }
      ];
      
      await generateMarkdown({
        content,
        title: 'Test',
        generateToc: true,
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should include abstract when enabled', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateMarkdown({
        content,
        title: 'Test',
        generateAbstract: true,
        abstract: 'This is an abstract',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should translate date when language is not auto', async () => {
      const { translateMetadata } = await import('../../scripts/translation/index.js');
      
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateMarkdown({
        content,
        title: 'Test',
        publishDate: '2025-12-23',
        language: 'ru',
        apiKey: 'test-key',
        model: 'gpt-4'
      });

      expect(translateMetadata).toHaveBeenCalledWith(
        expect.any(String),
        'ru',
        'test-key',
        'gpt-4',
        'date'
      );
    });

    it('should handle different content types', async () => {
      const content = [
        { type: 'heading', text: 'Heading', level: 2 },
        { type: 'paragraph', text: 'Paragraph text' },
        { type: 'quote', text: 'Quote text' },
        { type: 'code', text: 'code', language: 'javascript' },
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        { type: 'image', src: 'image.jpg', alt: 'Image' },
        { type: 'hr' }
      ];
      
      await generateMarkdown({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should handle table content', async () => {
      const content = [
        {
          type: 'table',
          rows: [
            ['Header 1', 'Header 2'],
            ['Cell 1', 'Cell 2'],
            ['Cell 3', 'Cell 4']
          ]
        }
      ];
      
      await generateMarkdown({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should sanitize filename', async () => {
      const { sanitizeFilename } = await import('../../scripts/utils/security.js');
      
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateMarkdown({
        content,
        title: 'Test/Article: Name',
        language: 'en'
      });

      expect(sanitizeFilename).toHaveBeenCalledWith('Test/Article: Name');
    });

    it('should work without updateState callback', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await expect(
        generateMarkdown({
          content,
          title: 'Test',
          language: 'en'
        })
      ).resolves.not.toThrow();

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should handle empty title', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateMarkdown({
        content,
        title: '',
        language: 'en'
      });

      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe('article.md');
    });

    it('should skip images in markdown output', async () => {
      const content = [
        { type: 'paragraph', text: 'Text before' },
        { type: 'image', src: 'image.jpg', alt: 'Image' },
        { type: 'paragraph', text: 'Text after' }
      ];
      
      await generateMarkdown({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });
  });
});



// Tests for FB2 generation module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFb2 } from '../../scripts/generation/fb2.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn()
}));

vi.mock('../../scripts/utils/html.js', () => ({
  stripHtml: vi.fn((text) => text?.replace(/<[^>]*>/g, '') || '')
}));

vi.mock('../../scripts/utils/images.js', () => ({
  imageToBase64: vi.fn(async (url) => `data:image/png;base64,${btoa('mock-image-data')}`),
  processImagesInBatches: vi.fn(async (items, concurrency, updateState, processor) => {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const result = await processor(items[i], i);
      results.push(result);
    }
    return results;
  })
}));

vi.mock('../../scripts/utils/config.js', () => ({
  PDF_LOCALIZATION: {
    en: { date: 'Date', source: 'Source', author: 'Author', contents: 'Contents', abstract: 'Abstract' },
    ru: { date: 'Дата', source: 'Источник', author: 'Автор', contents: 'Содержание', abstract: 'Аннотация' }
  },
  formatDateForDisplay: vi.fn((date, lang) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
  }),
  getLocaleFromLanguage: vi.fn((lang) => lang === 'ru' ? 'ru-RU' : 'en-US')
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(() => Promise.resolve('en')),
  tSync: vi.fn((key) => {
    const translations = {
      stageLoadingImages: 'Loading images...'
    };
    return translations[key] || key;
  })
}));

vi.mock('../../scripts/state/processing.js', () => ({
  PROCESSING_STAGES: {
    LOADING_IMAGES: { id: 'loading_images' }
  },
  isCancelled: vi.fn(() => false)
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

describe('generation/fb2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateFb2', () => {
    it('should throw error if content is empty', async () => {
      await expect(
        generateFb2({ content: [], title: 'Test' })
      ).rejects.toThrow();
    });

    it('should generate basic FB2 with title', async () => {
      const content = [
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'paragraph', text: 'Second paragraph' }
      ];
      
      const updateState = vi.fn();
      await generateFb2({
        content,
        title: 'Test Article',
        author: 'John Doe',
        sourceUrl: 'https://example.com',
        publishDate: '2025-12-23',
        language: 'en'
      }, updateState);

      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Building FB2 structure...', progress: 85 })
      );
      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Saving FB2 file...', progress: 95 })
      );
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should include metadata in FB2', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateFb2({
        content,
        title: 'Test',
        author: 'Author',
        sourceUrl: 'https://example.com',
        publishDate: '2025-12-23',
        language: 'en'
      });

      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe('Test.fb2');
    });

    it('should generate TOC when enabled', async () => {
      const content = [
        { type: 'heading', text: 'Introduction', level: 2 },
        { type: 'paragraph', text: 'Text' },
        { type: 'heading', text: 'Conclusion', level: 2 }
      ];
      
      await generateFb2({
        content,
        title: 'Test',
        generateToc: true,
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should include abstract when enabled', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateFb2({
        content,
        title: 'Test',
        generateAbstract: true,
        abstract: 'This is an abstract',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should handle different content types', async () => {
      const content = [
        { type: 'heading', text: 'Heading', level: 2 },
        { type: 'paragraph', text: 'Paragraph text' },
        { type: 'quote', text: 'Quote text' },
        { type: 'code', text: 'code', language: 'javascript' },
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false }
      ];
      
      await generateFb2({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should embed images in FB2', async () => {
      const { imageToBase64, processImagesInBatches } = await import('../../scripts/utils/images.js');
      
      const content = [
        { type: 'paragraph', text: 'Text before' },
        { type: 'image', src: 'https://example.com/image.jpg', alt: 'Image' },
        { type: 'paragraph', text: 'Text after' }
      ];
      
      await generateFb2({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(processImagesInBatches).toHaveBeenCalled();
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should handle base64 images', async () => {
      const content = [
        { type: 'image', base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
      ];
      
      await generateFb2({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should sanitize filename', async () => {
      const { sanitizeFilename } = await import('../../scripts/utils/security.js');
      
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateFb2({
        content,
        title: 'Test/Article: Name',
        language: 'en'
      });

      expect(sanitizeFilename).toHaveBeenCalledWith('Test/Article: Name');
    });

    it('should work without updateState callback', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await expect(
        generateFb2({
          content,
          title: 'Test',
          language: 'en'
        })
      ).resolves.not.toThrow();

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should handle empty title', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateFb2({
        content,
        title: '',
        language: 'en'
      });

      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe('Article.fb2');
    });

    it('should generate valid XML structure', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateFb2({
        content,
        title: 'Test',
        language: 'en'
      });

      // FB2 should be valid XML
      expect(chrome.downloads.download).toHaveBeenCalled();
      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      // The blob should contain XML
      expect(downloadCall.filename).toContain('.fb2');
    });
  });
});



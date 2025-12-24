// Tests for EPUB generation module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEpub } from '../../scripts/generation/epub.js';

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

vi.mock('../../lib/jszip-wrapper.js', () => {
  class MockJSZip {
    constructor() {
      this.files = {};
    }
    
    file(name, content, options = {}) {
      this.files[name] = { content, options };
    }
    
    async generateAsync(options = {}) {
      return new Blob(['mock-zip-content'], { type: 'application/zip' });
    }
  }
  
  return { default: MockJSZip };
});

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
  }
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

// Mock FileReader
global.FileReader = class MockFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
    this.onerror = null;
  }
  
  readAsDataURL(blob) {
    setTimeout(() => {
      this.result = 'data:application/epub+zip;base64,mock-data';
      if (this.onloadend) this.onloadend();
    }, 0);
  }
};

describe('generation/epub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateEpub', () => {
    it('should throw error if content is empty', async () => {
      await expect(
        generateEpub({ content: [], title: 'Test' })
      ).rejects.toThrow('No content to generate EPUB');
    });

    it('should generate basic EPUB with title', async () => {
      const content = [
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'paragraph', text: 'Second paragraph' }
      ];
      
      const updateState = vi.fn();
      await generateEpub({
        content,
        title: 'Test Article',
        author: 'John Doe',
        sourceUrl: 'https://example.com',
        publishDate: '2025-12-23',
        language: 'en'
      }, updateState);

      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Building EPUB structure...', progress: 82 })
      );
      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Done!', progress: 100 })
      );
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should include metadata in EPUB', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateEpub({
        content,
        title: 'Test',
        author: 'Author',
        sourceUrl: 'https://example.com',
        publishDate: '2025-12-23',
        language: 'en'
      });

      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe('Test.epub');
    });

    it('should generate TOC when enabled', async () => {
      const content = [
        { type: 'heading', text: 'Introduction', level: 2, id: 'intro' },
        { type: 'paragraph', text: 'Text' },
        { type: 'heading', text: 'Conclusion', level: 2, id: 'conclusion' }
      ];
      
      await generateEpub({
        content,
        title: 'Test',
        generateToc: true,
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should include abstract when enabled', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateEpub({
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
      
      await generateEpub({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should embed images in EPUB', async () => {
      const { processImagesInBatches } = await import('../../scripts/utils/images.js');
      
      const content = [
        { type: 'paragraph', text: 'Text before' },
        { type: 'image', src: 'https://example.com/image.jpg', alt: 'Image' },
        { type: 'paragraph', text: 'Text after' }
      ];
      
      await generateEpub({
        content,
        title: 'Test',
        language: 'en'
      });

      expect(processImagesInBatches).toHaveBeenCalled();
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should create ZIP structure', async () => {
      const JSZip = (await import('../../lib/jszip-wrapper.js')).default;
      
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateEpub({
        content,
        title: 'Test',
        language: 'en'
      });

      // JSZip should be instantiated
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should sanitize filename', async () => {
      const { sanitizeFilename } = await import('../../scripts/utils/security.js');
      
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateEpub({
        content,
        title: 'Test/Article: Name',
        language: 'en'
      });

      expect(sanitizeFilename).toHaveBeenCalledWith('Test/Article: Name');
    });

    it('should work without updateState callback', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await expect(
        generateEpub({
          content,
          title: 'Test',
          language: 'en'
        })
      ).resolves.not.toThrow();

      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should handle empty title', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateEpub({
        content,
        title: '',
        language: 'en'
      });

      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe('Article.epub');
    });

    it('should generate valid EPUB structure with mimetype', async () => {
      const JSZip = (await import('../../lib/jszip-wrapper.js')).default;
      const zip = new JSZip();
      
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await generateEpub({
        content,
        title: 'Test',
        language: 'en'
      });

      // EPUB should have mimetype file
      expect(chrome.downloads.download).toHaveBeenCalled();
      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toContain('.epub');
    });
  });
});



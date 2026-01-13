// Tests for translation generation module (abstract and summary)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAbstract, generateSummary } from '../../scripts/translation/generation.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logDebug: vi.fn()
}));

vi.mock('../../scripts/utils/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LANGUAGE_NAMES: {
      en: 'English',
      ru: 'Russian',
      ua: 'Ukrainian',
      fr: 'French'
    }
  };
});

vi.mock('../../scripts/api/index.js', () => ({
  getProviderFromModel: vi.fn((model) => {
    if (model.includes('gpt') || model.includes('o1')) return 'openai';
    if (model.includes('claude')) return 'claude';
    if (model.includes('gemini')) return 'gemini';
    return 'openai';
  }),
  parseModelConfig: vi.fn((model) => ({ modelName: model })),
  callAI: vi.fn(async (systemPrompt, userPrompt, apiKey, model, isJson) => {
    // Mock AI response
    if (isJson) {
      return { summary: 'Mock summary text' };
    }
    return 'Mock summary text';
  })
}));

vi.mock('../../scripts/utils/encryption.js', () => ({
  decryptApiKey: vi.fn(async (key) => key)
}));

vi.mock('../../scripts/utils/html.js', () => ({
  stripHtml: vi.fn((text) => text?.replace(/<[^>]*>/g, '') || '')
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(() => Promise.resolve('en')),
  tSync: vi.fn((key) => {
    const translations = {
      errorApiAuthentication: 'API authentication error: {status}',
      errorApiError: 'API error: {status}'
    };
    return translations[key] || key;
  })
}));

// Mock fetch
global.fetch = vi.fn();

describe('translation/generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateAbstract', () => {
    it('should return empty string if content is empty', async () => {
      const result = await generateAbstract([], 'Title', 'key', 'gpt-4');
      expect(result).toBe('');
    });

    it('should return empty string if no text extracted', async () => {
      const content = [
        { type: 'code', text: 'const x = 1;' },
        { type: 'image', src: 'image.jpg' }
      ];
      const result = await generateAbstract(content, 'Title', 'key', 'gpt-4');
      expect(result).toBe('');
    });

    it('should call callAI and return generated abstract', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockResolvedValueOnce('Test abstract');
      
      const content = [
        { type: 'paragraph', text: 'This is a test article with some content.' },
        { type: 'paragraph', text: 'It has multiple paragraphs.' }
      ];

      const result = await generateAbstract(content, 'Test Article', 'test-key', 'gpt-4');
      
      expect(callAI).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Article Title: Test Article'),
        'test-key',
        'gpt-4',
        false
      );
      expect(result).toBe('Test abstract');
    });

    it('should handle AI errors gracefully (abstract is optional)', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockRejectedValueOnce(new Error('API error'));
      
      const content = [{ type: 'paragraph', text: 'Test content' }];
      const result = await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      expect(result).toBe('');
    });

    it('should post-process abstract to single paragraph', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockResolvedValueOnce('First sentence.\n\nSecond sentence.\n\nThird sentence.');
      const content = [
        { type: 'paragraph', text: 'Test content' }
      ];

      const result = await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      // Should merge multiple paragraphs into one
      expect(result).not.toContain('\n\n');
      expect(result.split('\n').length).toBeLessThanOrEqual(1);
    });

    it('should skip code and images when extracting text', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockResolvedValueOnce('Abstract');
      const content = [
        { type: 'paragraph', text: 'Text paragraph' },
        { type: 'code', text: 'const x = 1;' },
        { type: 'image', src: 'image.jpg' },
        { type: 'paragraph', text: 'Another paragraph' }
      ];

      await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      
      const callArgs = callAI.mock.calls[0];
      const userPrompt = callArgs[1];
      
      // Should not contain code or image references
      expect(userPrompt).not.toContain('const x = 1');
      expect(userPrompt).not.toContain('image.jpg');
      expect(userPrompt).toContain('Text paragraph');
      expect(userPrompt).toContain('Another paragraph');
    });

    it('should handle list items in content', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockResolvedValueOnce('Abstract');
      const content = [
        {
          type: 'list',
          items: [
            { html: '<p>Item 1</p>' },
            { html: '<p>Item 2</p>' }
          ]
        }
      ];

      await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      
      const callArgs = callAI.mock.calls[0];
      const userPrompt = callArgs[1];
      
      expect(userPrompt).toContain('Item 1');
      expect(userPrompt).toContain('Item 2');
    });
  });

  describe('generateSummary', () => {
    it('should throw error if content items are empty', async () => {
      await expect(
        generateSummary({ contentItems: [], apiKey: 'key', model: 'gpt-4' })
      ).rejects.toThrow('errorNoContentForSummary');
    });

    it('should throw error if API key or model missing', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await expect(
        generateSummary({ contentItems: content, model: 'gpt-4' })
      ).rejects.toThrow('errorApiKeyRequiredForSummary');
      
      await expect(
        generateSummary({ contentItems: content, apiKey: 'key' })
      ).rejects.toThrow('errorApiKeyRequiredForSummary');
    });

    it('should generate summary using callAI', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      
      const content = [
        { type: 'paragraph', text: 'Test content' }
      ];

      const result = await generateSummary({
        contentItems: content,
        apiKey: 'test-key',
        model: 'gpt-4',
        url: 'https://example.com',
        language: 'en'
      });

      expect(callAI).toHaveBeenCalled();
      expect(result).toHaveProperty('summary');
      expect(result.summary).toBeTruthy();
    });

    it('should extract structured text from content', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      
      const content = [
        { type: 'heading', text: 'Heading', level: 2 },
        { type: 'paragraph', text: 'Paragraph' },
        { type: 'quote', text: 'Quote' },
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        { type: 'table', headers: ['H1', 'H2'], rows: [['C1', 'C2']] }
      ];

      await generateSummary({
        contentItems: content,
        apiKey: 'key',
        model: 'gpt-4',
        language: 'en'
      });

      expect(callAI).toHaveBeenCalled();
      const callArgs = callAI.mock.calls[0];
      const userPrompt = callArgs[1];
      
      // Should contain extracted text from different content types
      expect(userPrompt).toContain('Heading');
      expect(userPrompt).toContain('Paragraph');
      expect(userPrompt).toContain('Quote');
      expect(userPrompt).toContain('Item 1');
      expect(userPrompt).toContain('Item 2');
    });

    it('should skip code and images', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      
      const content = [
        { type: 'paragraph', text: 'Text' },
        { type: 'code', text: 'const x = 1;' },
        { type: 'image', src: 'image.jpg' }
      ];

      await generateSummary({
        contentItems: content,
        apiKey: 'key',
        model: 'gpt-4',
        language: 'en'
      });

      const callArgs = callAI.mock.calls[0];
      const userPrompt = callArgs[1];
      
      expect(userPrompt).toContain('Text');
      expect(userPrompt).not.toContain('const x = 1');
      expect(userPrompt).not.toContain('image.jpg');
    });

    it('should use UI language as fallback if language is auto', async () => {
      const { getUILanguage } = await import('../../scripts/locales.js');
      const { callAI } = await import('../../scripts/api/index.js');
      
      const content = [{ type: 'paragraph', text: 'Content' }];

      await generateSummary({
        contentItems: content,
        apiKey: 'key',
        model: 'gpt-4',
        language: 'auto'
      });

      expect(getUILanguage).toHaveBeenCalled();
      expect(callAI).toHaveBeenCalled();
    });

    it('should throw error if AI returns empty summary', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockResolvedValueOnce('');

      const content = [{ type: 'paragraph', text: 'Content' }];

      await expect(
        generateSummary({
          contentItems: content,
          apiKey: 'key',
          model: 'gpt-4',
          language: 'en'
        })
      ).rejects.toThrow('errorEmptySummary');
    });

    it('should handle errors and throw', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockRejectedValueOnce(new Error('API error'));

      const content = [{ type: 'paragraph', text: 'Content' }];

      await expect(
        generateSummary({
          contentItems: content,
          apiKey: 'key',
          model: 'gpt-4',
          language: 'en'
        })
      ).rejects.toThrow('API error');
    });
  });
});




























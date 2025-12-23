// Tests for translation generation module (abstract and summary)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAbstract, generateSummary } from '../../scripts/translation/generation.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn()
}));

vi.mock('../../scripts/utils/config.js', () => ({
  LANGUAGE_NAMES: {
    en: 'English',
    ru: 'Russian',
    ua: 'Ukrainian',
    fr: 'French'
  }
}));

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

    it('should generate abstract using OpenAI API', async () => {
      const content = [
        { type: 'paragraph', text: 'This is a test article with some content.' },
        { type: 'paragraph', text: 'It has multiple paragraphs.' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'This is a test article summary.'
            }
          }]
        })
      });

      const result = await generateAbstract(content, 'Test Article', 'test-key', 'gpt-4');
      
      expect(result).toBeTruthy();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          })
        })
      );
    });

    it('should generate abstract using Claude API', async () => {
      const content = [
        { type: 'paragraph', text: 'Test content' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{
            type: 'text',
            text: 'Test abstract'
          }]
        })
      });

      const result = await generateAbstract(content, 'Test', 'test-key', 'claude-3-opus');
      
      expect(result).toBeTruthy();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    it('should generate abstract using Gemini API', async () => {
      const content = [
        { type: 'paragraph', text: 'Test content' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: 'Test abstract'
              }]
            }
          }]
        })
      });

      const result = await generateAbstract(content, 'Test', 'test-key', 'gemini-pro');
      
      expect(result).toBeTruthy();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object)
      );
    });

    it('should handle API errors gracefully', async () => {
      const content = [
        { type: 'paragraph', text: 'Test content' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const result = await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      // Should return empty string on error (abstract is optional)
      expect(result).toBe('');
    });

    it('should post-process abstract to single paragraph', async () => {
      const content = [
        { type: 'paragraph', text: 'Test content' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'First sentence.\n\nSecond sentence.\n\nThird sentence.'
            }
          }]
        })
      });

      const result = await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      // Should merge multiple paragraphs into one
      expect(result).not.toContain('\n\n');
      expect(result.split('\n').length).toBeLessThanOrEqual(1);
    });

    it('should skip code and images when extracting text', async () => {
      const content = [
        { type: 'paragraph', text: 'Text paragraph' },
        { type: 'code', text: 'const x = 1;' },
        { type: 'image', src: 'image.jpg' },
        { type: 'paragraph', text: 'Another paragraph' }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Abstract'
            }
          }]
        })
      });

      await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userPrompt = body.messages.find(m => m.role === 'user').content;
      
      // Should not contain code or image references
      expect(userPrompt).not.toContain('const x = 1');
      expect(userPrompt).not.toContain('image.jpg');
      expect(userPrompt).toContain('Text paragraph');
      expect(userPrompt).toContain('Another paragraph');
    });

    it('should handle list items in content', async () => {
      const content = [
        {
          type: 'list',
          items: [
            { html: '<p>Item 1</p>' },
            { html: '<p>Item 2</p>' }
          ]
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Abstract'
            }
          }]
        })
      });

      await generateAbstract(content, 'Test', 'test-key', 'gpt-4');
      
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userPrompt = body.messages.find(m => m.role === 'user').content;
      
      expect(userPrompt).toContain('Item 1');
      expect(userPrompt).toContain('Item 2');
    });
  });

  describe('generateSummary', () => {
    it('should throw error if content items are empty', async () => {
      await expect(
        generateSummary({ contentItems: [], apiKey: 'key', model: 'gpt-4' })
      ).rejects.toThrow('No content items provided');
    });

    it('should throw error if API key or model missing', async () => {
      const content = [{ type: 'paragraph', text: 'Content' }];
      
      await expect(
        generateSummary({ contentItems: content, model: 'gpt-4' })
      ).rejects.toThrow('API key and model are required');
      
      await expect(
        generateSummary({ contentItems: content, apiKey: 'key' })
      ).rejects.toThrow('API key and model are required');
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
      ).rejects.toThrow('AI returned empty summary');
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


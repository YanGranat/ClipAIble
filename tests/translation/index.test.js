import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  translateText,
  translateBatch,
  translateMetadata,
  detectSourceLanguage,
  detectLanguageByCharacters
} from '../../scripts/translation/index.js';

// Mock dependencies
vi.mock('../../scripts/utils/encryption.js', () => ({
  getDecryptedKeyCached: vi.fn((key) => Promise.resolve(key)),
  decryptApiKey: vi.fn((key) => Promise.resolve(key))
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(() => Promise.resolve('en')),
  tSync: vi.fn((key) => {
    const translations = {
      'errorApiAuthentication': 'API authentication error: {status}',
      'errorApiError': 'API error: {status}'
    };
    return translations[key] || key;
  })
}));

vi.mock('../../scripts/api/index.js', () => ({
  getProviderFromModel: vi.fn((model) => {
    if (model.includes('gpt') || model.includes('o1')) return 'openai';
    if (model.includes('claude')) return 'claude';
    if (model.includes('gemini')) return 'gemini';
    return 'openai';
  }),
  parseModelConfig: vi.fn((model) => ({ modelName: model }))
}));

describe('translation/index', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('translateText', () => {
    it('should translate text using OpenAI API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: 'Bonjour le monde'
            }
          }]
        }))
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await translateText('Hello world', 'French', 'test-key', 'gpt-4');
      
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
      expect(result).toBe('Bonjour le monde');
    });

    it('should handle authentication errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: vi.fn(() => Promise.resolve({}))
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(
        translateText('Hello', 'French', 'invalid-key', 'gpt-4')
      ).rejects.toThrow('API authentication error');
    });

    it('should return original text if already in target language (NO_TRANSLATION_MARKER)', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: '[NO_TRANSLATION_NEEDED]'
            }
          }]
        }))
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await translateText('Bonjour', 'French', 'test-key', 'gpt-4');
      expect(result).toBe('Bonjour'); // Should return original
    });

    it('should handle network errors gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await translateText('Hello', 'French', 'test-key', 'gpt-4');
      // Should return original text on error (unless auth error)
      expect(result).toBe('Hello');
    });
  });

  describe('translateBatch', () => {
    it('should translate single text using translateText', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: 'Bonjour'
            }
          }]
        }))
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await translateBatch(['Hello'], 'French', 'test-key', 'gpt-4');
      
      expect(result).toEqual(['Bonjour']);
    });

    it('should translate multiple texts using batch API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                translations: ['Bonjour', 'Au revoir']
              })
            }
          }]
        }))
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await translateBatch(['Hello', 'Goodbye'], 'French', 'test-key', 'gpt-4');
      
      expect(result).toEqual(['Bonjour', 'Au revoir']);
    });

    it('should retry on network errors for batch translation', async () => {
      let callCount = 0;
      global.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        // For multiple texts, translateBatch uses batch API
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: JSON.stringify({
                  translations: ['Bonjour', 'Au revoir']
                })
              }
            }]
          })
        });
      });

      // Mock setTimeout to avoid actual delays in tests
      vi.useFakeTimers();
      const resultPromise = translateBatch(['Hello', 'Goodbye'], 'French', 'test-key', 'gpt-4');
      await vi.advanceTimersByTimeAsync(2000);
      const result = await resultPromise;
      vi.useRealTimers();

      // translateBatch with multiple texts retries on network error
      expect(result).toEqual(['Bonjour', 'Au revoir']);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('translateMetadata', () => {
    it('should translate metadata text', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: 'Jean Dupont'
            }
          }]
        }))
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await translateMetadata('John Doe', 'French', 'test-key', 'gpt-4', 'author');
      
      expect(result).toBe('Jean Dupont');
    });

    it('should return empty string for empty input', async () => {
      const result = await translateMetadata('', 'French', 'test-key', 'gpt-4', 'author');
      expect(result).toBe('');
    });
  });

  describe('detectSourceLanguage', () => {
    it('should detect language from content items', () => {
      const content = [
        { type: 'paragraph', text: 'Hello world' },
        { type: 'heading', text: 'Introduction' }
      ];
      
      const result = detectSourceLanguage(content);
      expect(result).toBe('en');
    });

    it('should detect Russian text', () => {
      const content = [
        { type: 'paragraph', text: 'Привет мир' },
        { type: 'heading', text: 'Введение' }
      ];
      
      const result = detectSourceLanguage(content);
      expect(result).toBe('ru');
    });

    it('should return "unknown" for empty content', () => {
      const result = detectSourceLanguage([]);
      expect(result).toBe('unknown');
    });
  });

  describe('detectLanguageByCharacters', () => {
    it('should default to English for short text (<50 chars)', () => {
      expect(detectLanguageByCharacters('Hello world')).toBe('en');
      expect(detectLanguageByCharacters('')).toBe('en');
    });

    it('should detect Russian for long text', () => {
      const longRussianText = 'Привет мир '.repeat(10); // Make it long enough
      expect(detectLanguageByCharacters(longRussianText)).toBe('ru');
    });

    it('should detect Chinese for long text', () => {
      const longChineseText = '你好世界 '.repeat(20); // Make it long enough
      expect(detectLanguageByCharacters(longChineseText)).toBe('zh');
    });

    it('should detect Japanese for long text', () => {
      const longJapaneseText = 'こんにちは世界 '.repeat(20); // Make it long enough
      expect(detectLanguageByCharacters(longJapaneseText)).toBe('ja');
    });

    it('should detect Korean for long text', () => {
      const longKoreanText = '안녕하세요 세계 '.repeat(20); // Make it long enough
      expect(detectLanguageByCharacters(longKoreanText)).toBe('ko');
    });

    it('should default to English for mixed or unknown', () => {
      expect(detectLanguageByCharacters('Hello 123 '.repeat(10))).toBe('en');
    });
  });
});


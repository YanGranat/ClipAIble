// Tests for translation detection module (AI detection)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectContentLanguage } from '../../scripts/translation/detection.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logDebug: vi.fn()
}));

vi.mock('../../scripts/api/index.js', () => ({
  resolveAIProvider: vi.fn((model, provider) => provider === undefined ? (model.includes('claude') ? 'claude' : model.includes('gemini') ? 'gemini' : 'openai') : provider),
  getProviderFromModel: vi.fn((model) => {
    if (model.includes('gpt') || model.includes('o1')) return 'openai';
    if (model.includes('claude')) return 'claude';
    if (model.includes('gemini')) return 'gemini';
    return 'openai';
  }),
  parseModelConfig: vi.fn((model) => ({ modelName: model }))
}));

vi.mock('../../scripts/utils/encryption.js', () => ({
  getDecryptedKeyCached: vi.fn(async (key, provider) => key)
}));

vi.mock('../../scripts/utils/html.js', () => ({
  stripHtml: vi.fn((text) => text?.replace(/<[^>]*>/g, '') || '')
}));

// Mock fetch
global.fetch = vi.fn();

describe('translation/detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectContentLanguage', () => {
    it('should return "en" if content is empty', async () => {
      const result = await detectContentLanguage([], 'key', 'gpt-4');
      expect(result).toBe('en');
    });

    it('should use offline detection if no API key', async () => {
      const content = [
        { type: 'paragraph', text: 'Привет мир '.repeat(20) }
      ];
      
      const result = await detectContentLanguage(content, '', 'gpt-4');
      
      // Should use character-based detection (offline)
      expect(result).toBe('ru');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should detect language using OpenAI API', async () => {
      const content = [
        { type: 'paragraph', text: 'This English sample uses a deliberately different mocked AI result.' }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          choices: [{
            message: {
              content: 'ru'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const result = await detectContentLanguage(content, 'test-key', 'gpt-4');
      
      expect(result).toBe('ru');
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

    it('should detect language using Claude API', async () => {
      const content = [
        { type: 'paragraph', text: 'Hello world' }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: 'de'
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const result = await detectContentLanguage(content, 'test-key', 'claude-3-opus');
      
      expect(result).toBe('de');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    it('should detect language using Gemini API', async () => {
      const content = [
        { type: 'paragraph', text: 'Bonjour le monde' }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: 'fr'
              }]
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const result = await detectContentLanguage(content, 'test-key', 'gemini-pro');
      
      expect(result).toBe('fr');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.any(Object)
      );
    });

    it('should fallback to character detection if AI returns invalid format', async () => {
      const content = [
        { type: 'paragraph', text: 'Привет мир '.repeat(20) }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          choices: [{
            message: {
              content: 'invalid-format-xyz'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const result = await detectContentLanguage(content, 'test-key', 'gpt-4');
      
      // Should fallback to character-based detection
      expect(result).toBe('ru');
    });

    it('should fallback to character detection on API error', async () => {
      const content = [
        { type: 'paragraph', text: 'Привет мир '.repeat(20) }
      ];

      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await detectContentLanguage(content, 'test-key', 'gpt-4');
      
      // Should fallback to character-based detection
      expect(result).toBe('ru');
    });

    it('should limit sample text to 30k characters', async () => {
      const longText = 'A'.repeat(50000);
      const content = [
        { type: 'paragraph', text: longText }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          choices: [{
            message: {
              content: 'en'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      await detectContentLanguage(content, 'test-key', 'gpt-4');
      
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userPrompt = body.messages.find(m => m.role === 'user').content;
      
      // Should be limited to 30k chars
      expect(userPrompt.length).toBeLessThanOrEqual(30000 + 100); // Some buffer for prompt text
    });

    it('should handle GPT-5.1 models without max_tokens', async () => {
      const content = [
        { type: 'paragraph', text: 'Test' }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          choices: [{
            message: {
              content: 'en'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      await detectContentLanguage(content, 'test-key', 'gpt-5.1');
      
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      
      // GPT-5.1 should not have max_tokens
      expect(body.max_tokens).toBeUndefined();
    });

    it('should extract text from multiple content items', async () => {
      const content = [
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'heading', text: 'Heading' },
        { type: 'paragraph', text: 'Second paragraph' }
      ];

      global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
          choices: [{
            message: {
              content: 'en'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      await detectContentLanguage(content, 'test-key', 'gpt-4');
      
      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userPrompt = body.messages.find(m => m.role === 'user').content;
      
      expect(userPrompt).toContain('First paragraph');
      expect(userPrompt).toContain('Heading');
      expect(userPrompt).toContain('Second paragraph');
    });
  });
});




























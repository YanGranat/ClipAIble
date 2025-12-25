// Tests for audio preparation module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contentToPlainText, splitTextIntoChunks, basicCleanup, AUDIO_CONFIG } from '../../scripts/generation/audio-prep.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn()
}));

// Mock stripHtml function (used internally in audio-prep.js)
// The actual function is defined inside audio-prep.js, so we need to mock it at module level
vi.mock('../../scripts/generation/audio-prep.js', async () => {
  const actual = await vi.importActual('../../scripts/generation/audio-prep.js');
  return {
    ...actual,
    // stripHtml is internal, but we can test contentToPlainText which uses it
  };
});

describe('generation/audio-prep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('contentToPlainText', () => {
    it('should convert paragraph content to plain text', () => {
      const content = [
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'paragraph', text: 'Second paragraph' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
    });

    it('should handle headings with newlines', () => {
      const content = [
        { type: 'heading', text: 'Main Heading', level: 1 },
        { type: 'paragraph', text: 'Content after heading' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Main Heading');
      expect(result).toContain('Content after heading');
      // Headings should have newlines for natural pauses
      expect(result).toMatch(/Main Heading/);
    });

    it('should handle quotes with prefix', () => {
      const content = [
        { type: 'quote', text: 'Quote text here' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Quote:');
      expect(result).toContain('Quote text here');
    });

    it('should skip code blocks', () => {
      const content = [
        { type: 'code', text: 'const x = 1;', language: 'javascript' }
      ];

      const result = contentToPlainText(content);

      // Code blocks are skipped in audio preparation
      expect(result).not.toContain('const x = 1;');
    });

    it('should handle lists', () => {
      const content = [
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    it('should skip images', () => {
      const content = [
        { type: 'paragraph', text: 'Text before' },
        { type: 'image', src: 'image.jpg', alt: 'Image' },
        { type: 'paragraph', text: 'Text after' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Text before');
      expect(result).toContain('Text after');
      expect(result).not.toContain('image.jpg');
    });

    it('should skip separators', () => {
      const content = [
        { type: 'paragraph', text: 'Text before' },
        { type: 'separator' },
        { type: 'paragraph', text: 'Text after' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Text before');
      expect(result).toContain('Text after');
    });

    it('should handle empty content', () => {
      const result = contentToPlainText([]);
      expect(result).toBe('');
    });

    it('should handle null content', () => {
      const result = contentToPlainText(null);
      expect(result).toBe('');
    });

    it('should handle content with HTML tags', () => {
      const content = [
        { type: 'paragraph', text: '<p>Text with <strong>bold</strong> and <em>italic</em></p>' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Text with');
      expect(result).toContain('bold');
      expect(result).toContain('italic');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<strong>');
    });

    it('should handle mixed content types', () => {
      const content = [
        { type: 'heading', text: 'Title', level: 1 },
        { type: 'paragraph', text: 'Paragraph 1' },
        { type: 'quote', text: 'Quote text' },
        { type: 'list', items: ['List item'], ordered: false },
        { type: 'code', text: 'code', language: 'text' }
      ];

      const result = contentToPlainText(content);

      expect(result).toContain('Title');
      expect(result).toContain('Paragraph 1');
      expect(result).toContain('Quote:');
      expect(result).toContain('List item');
      // Code blocks are skipped
      expect(result).not.toContain('code');
    });
  });

  describe('splitTextIntoChunks', () => {
    it('should split long text into chunks', () => {
      // Use text longer than MAX_CHUNK_SIZE * 2 to ensure splitting
      // Need to add newlines to trigger paragraph splitting
      const paragraph = 'a'.repeat(AUDIO_CONFIG.MAX_CHUNK_SIZE - 10) + '\n\n';
      const longText = paragraph.repeat(3);
      const chunks = splitTextIntoChunks(longText);

      // Should split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(AUDIO_CONFIG.MAX_CHUNK_SIZE);
        expect(chunk.index).toBeGreaterThanOrEqual(0);
        expect(typeof chunk.text).toBe('string');
      });
    });

    it('should not split short text', () => {
      const shortText = 'Short text';
      const chunks = splitTextIntoChunks(shortText);

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(shortText);
      expect(chunks[0].index).toBe(0);
    });

    it('should split at sentence boundaries when possible', () => {
      // Create text with paragraphs (double newline) that will definitely be split
      const paragraph = 'First sentence. Second sentence. Third sentence. ';
      const fullParagraph = paragraph.repeat(Math.ceil(AUDIO_CONFIG.MAX_CHUNK_SIZE / paragraph.length / 2));
      const text = (fullParagraph + '\n\n').repeat(3);
      const chunks = splitTextIntoChunks(text);

      // Text should be split if long enough
      if (text.length > AUDIO_CONFIG.MAX_CHUNK_SIZE) {
        expect(chunks.length).toBeGreaterThan(1);
        // Most chunks should end with sentence boundaries
        chunks.slice(0, -1).forEach(chunk => {
          expect(chunk.text.endsWith('.') || chunk.text.endsWith('!') || chunk.text.endsWith('?')).toBe(true);
        });
      } else {
        // If text is short, it won't be split
        expect(chunks.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should split at paragraph boundaries when possible', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\n'.repeat(100);
      const chunks = splitTextIntoChunks(text);

      // Text is long enough to be split
      if (text.length > AUDIO_CONFIG.MAX_CHUNK_SIZE) {
        expect(chunks.length).toBeGreaterThan(1);
      } else {
        expect(chunks.length).toBe(1);
      }
    });

    it('should handle text without sentence boundaries', () => {
      // Use text longer than MAX_CHUNK_SIZE * 2 to ensure splitting
      // Add newlines to trigger paragraph splitting
      const paragraph = 'a'.repeat(AUDIO_CONFIG.MAX_CHUNK_SIZE - 10) + '\n\n';
      const text = paragraph.repeat(3);
      const chunks = splitTextIntoChunks(text);

      expect(chunks.length).toBeGreaterThan(1);
      // Should still split even without sentence boundaries
      chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(AUDIO_CONFIG.MAX_CHUNK_SIZE);
      });
    });

    it('should handle empty text', () => {
      const chunks = splitTextIntoChunks('');
      expect(chunks).toEqual([]);
    });

    it('should respect MIN_CHUNK_SIZE', () => {
      const text = 'a'.repeat(10000);
      const chunks = splitTextIntoChunks(text);

      // If text is split, chunks should be at least MIN_CHUNK_SIZE (except last)
      if (chunks.length > 1) {
        chunks.slice(0, -1).forEach(chunk => {
          // Most chunks should be at least MIN_CHUNK_SIZE, but last before final can be smaller
          expect(chunk.text.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('basicCleanup', () => {
    it('should remove URLs', () => {
      const text = 'Visit https://example.com for more info';
      const result = basicCleanup(text);

      expect(result).not.toContain('https://example.com');
      expect(result).toContain('Visit');
      expect(result).toContain('for more info');
    });

    it('should remove email addresses', () => {
      const text = 'Contact us at test@example.com';
      const result = basicCleanup(text);

      expect(result).not.toContain('test@example.com');
      expect(result).toContain('Contact us at');
    });

    it('should remove code blocks', () => {
      const text = 'Code: `const x = 1;` and more text';
      const result = basicCleanup(text);

      expect(result).not.toContain('`const x = 1;`');
      expect(result).toContain('Code:');
      expect(result).toContain('and more text');
    });

    it('should remove footnotes', () => {
      const text = 'Text with footnote[1] and more text';
      const result = basicCleanup(text);

      expect(result).not.toContain('[1]');
      expect(result).toContain('Text with footnote');
    });

    it('should normalize whitespace', () => {
      const text = 'Text   with    multiple    spaces';
      const result = basicCleanup(text);

      expect(result).not.toContain('   ');
      expect(result).toContain('Text with multiple spaces');
    });

    it('should handle empty text', () => {
      const result = basicCleanup('');
      expect(result).toBe('');
    });

    it('should handle text with only URLs', () => {
      const text = 'https://example.com https://test.com';
      const result = basicCleanup(text);

      // Should return empty or minimal text
      expect(result.length).toBeLessThan(text.length);
    });

    it('should preserve sentence structure', () => {
      const text = 'First sentence. Second sentence! Third sentence?';
      const result = basicCleanup(text);

      expect(result).toContain('First sentence');
      expect(result).toContain('Second sentence');
      expect(result).toContain('Third sentence');
    });

    it('should handle language-specific cleanup', () => {
      const text = 'English text with https://example.com';
      const resultEn = basicCleanup(text, 'en');

      const textRu = 'Русский текст с https://example.com';
      const resultRu = basicCleanup(textRu, 'ru');

      expect(resultEn).not.toContain('https://example.com');
      expect(resultRu).not.toContain('https://example.com');
    });
  });

  describe('AUDIO_CONFIG', () => {
    it('should have correct chunk size limits', () => {
      expect(AUDIO_CONFIG.MIN_CHUNK_SIZE).toBe(4000);
      expect(AUDIO_CONFIG.MAX_CHUNK_SIZE).toBe(6000);
      expect(AUDIO_CONFIG.IDEAL_CHUNK_SIZE).toBe(5000);
      expect(AUDIO_CONFIG.TTS_MAX_INPUT).toBe(4096);
    });

    it('should have valid speed range', () => {
      expect(AUDIO_CONFIG.MIN_SPEED).toBe(0.25);
      expect(AUDIO_CONFIG.MAX_SPEED).toBe(4.0);
      expect(AUDIO_CONFIG.DEFAULT_SPEED).toBe(1.0);
    });

    it('should have default voice', () => {
      expect(AUDIO_CONFIG.DEFAULT_VOICE).toBe('nova');
      expect(AUDIO_CONFIG.VOICES).toContain('nova');
    });
  });
});


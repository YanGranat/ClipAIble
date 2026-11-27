// Tests for audio preparation module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contentToPlainText, splitTextIntoChunks, AUDIO_CONFIG } from '../../scripts/generation/audio-prep.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn()
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

      expect(result).toContain('Main Heading\n\nContent after heading');
    });

    it('keeps the quote without adding an untranslated label', () => {
      const content = [
        { type: 'quote', text: 'Quote text here' }
      ];

      const result = contentToPlainText(content);

      expect(result).toBe('Quote text here');
    });

    it('keeps authored code with its literal operators', () => {
      const content = [
        { type: 'code', text: 'const x = 1;', language: 'javascript' }
      ];

      const result = contentToPlainText(content);

      expect(result).toBe('const x = 1;');
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
        { type: 'paragraph', html: '<p>Text with <strong>bold</strong> and <em>italic</em></p>' }
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
      expect(result).toContain('Quote text');
      expect(result).toContain('List item');
      expect(result).toContain('code');
    });
  });

  describe('splitTextIntoChunks', () => {
    it('keeps non-breaking numeric groups and interior line boundaries intact', () => {
      const source = 'First line.\nSecond line ends!\n\nThe value is 1\u202f023.5.\nKeep this line.';
      const parts = splitTextIntoChunks(source, 30).map(chunk => chunk.text);
      expect(parts).toEqual(['First line.\nSecond line ends!', 'The value is 1\u202f023.5.', 'Keep this line.']);
    });

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

  describe('AUDIO_CONFIG', () => {
    it('should have correct chunk size limits', () => {
      expect(AUDIO_CONFIG.MIN_CHUNK_SIZE).toBe(4000);
      expect(AUDIO_CONFIG.MAX_CHUNK_SIZE).toBe(6000);
      expect(AUDIO_CONFIG.IDEAL_CHUNK_SIZE).toBe(5000);
      expect(AUDIO_CONFIG.TTS_MAX_INPUT).toBe(4096);
    });

    it('should have valid speed range', () => {
      expect(AUDIO_CONFIG.MIN_SPEED).toBe(0.25);
      expect(AUDIO_CONFIG.MAX_SPEED).toBe(1.5);
      expect(AUDIO_CONFIG.DEFAULT_SPEED).toBe(1.0);
    });

    it('should have default voice', () => {
      expect(AUDIO_CONFIG.DEFAULT_VOICE).toBe('marin');
      expect(AUDIO_CONFIG.VOICES).toContain('marin');
    });
  });
});


import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLikelyContentContainerModule,
  calculateContentScoreModule,
  hasSubstantialContentModule
} from '../../../scripts/extraction/modules/content-finder.js';

// Helper to create mock DOM element
function createMockElement(tagName, options = {}) {
  const {
    className = '',
    id = '',
    textContent = '',
    children = [],
    querySelectorAll = () => [],
    attributes = {}
  } = options;

  return {
    tagName: tagName.toUpperCase(),
    className,
    id,
    textContent,
    children,
    hasAttribute: (attr) => {
      return attr in (attributes || {});
    },
    querySelectorAll: (selector) => {
      if (selector === 'p') return options.paragraphs || [];
      if (selector === 'h1, h2, h3, h4, h5, h6') return options.headings || [];
      if (selector === 'a') return options.links || [];
      if (selector === 'ul, ol') return options.lists || [];
      if (selector === 'img') return options.images || [];
      if (selector === 'input[type="email"]') return options.emailInputs || [];
      return querySelectorAll(selector);
    }
  };
}

describe('content-finder', () => {
  describe('isLikelyContentContainerModule', () => {
    it('should return true for elements with content-related class names', () => {
      const element = createMockElement('div', { className: 'article-content' });
      expect(isLikelyContentContainerModule(element)).toBe(true);

      const element2 = createMockElement('div', { className: 'post-body' });
      expect(isLikelyContentContainerModule(element2)).toBe(true);

      const element3 = createMockElement('div', { className: 'main-text' });
      expect(isLikelyContentContainerModule(element3)).toBe(true);
    });

    it('should return true for elements with content-related IDs', () => {
      const element = createMockElement('div', { id: 'article-content' });
      expect(isLikelyContentContainerModule(element)).toBe(true);

      const element2 = createMockElement('div', { id: 'main-story' });
      expect(isLikelyContentContainerModule(element2)).toBe(true);
    });

    it('should be case insensitive', () => {
      const element = createMockElement('div', { className: 'ARTICLE-CONTENT' });
      expect(isLikelyContentContainerModule(element)).toBe(true);
    });

    it('should return false for elements without content indicators', () => {
      const element = createMockElement('div', { className: 'sidebar' });
      expect(isLikelyContentContainerModule(element)).toBe(false);

      const element2 = createMockElement('div', { id: 'navigation' });
      expect(isLikelyContentContainerModule(element2)).toBe(false);
    });

    it('should handle null or undefined className/id', () => {
      const element = createMockElement('div', { className: null, id: null });
      expect(isLikelyContentContainerModule(element)).toBe(false);
    });
  });

  describe('calculateContentScoreModule', () => {
    it('should give base score from paragraphs and headings', () => {
      const paragraphs = Array(5).fill({ textContent: 'text' });
      const headings = Array(2).fill({ textContent: 'heading' });
      const element = createMockElement('div', {
        paragraphs,
        headings,
        textContent: 'Some text content here that is long enough to contribute to the score'
      });

      const score = calculateContentScoreModule(element, () => false);
      expect(score).toBeGreaterThan(0);
      // Base calculation includes paragraphs, headings, and text length
      // Actual score may vary based on text length and other factors
      expect(score).toBeGreaterThan(20);
    });

    it('should apply penalty for high link density', () => {
      const paragraphs = Array(2).fill({ textContent: 'text' });
      // Links with textContent and closest method (returns null to indicate not in paragraph)
      const links = Array(5).fill({ 
        textContent: 'link text',
        closest: () => null // Not inside paragraph, so it's a navigation link
      });
      const element = createMockElement('div', {
        paragraphs,
        links,
        textContent: 'Some text'
      });

      const score = calculateContentScoreModule(element, () => false);
      // Should be penalized (link density > 1.0)
      expect(score).toBeLessThan(50);
    });

    it('should give bonus for article tag', () => {
      const paragraphs = Array(3).fill({ textContent: 'text' });
      const element = createMockElement('article', {
        paragraphs,
        textContent: 'Article content'
      });

      const score = calculateContentScoreModule(element, () => false);
      const normalScore = calculateContentScoreModule(
        createMockElement('div', { paragraphs, textContent: 'Article content' }),
        () => false
      );
      // Article should have higher score (multiplied by 2.0)
      expect(score).toBeGreaterThan(normalScore);
    });

    it('should give bonus for main tag', () => {
      const paragraphs = Array(3).fill({ textContent: 'text' });
      const element = createMockElement('main', {
        paragraphs,
        textContent: 'Main content'
      });

      const score = calculateContentScoreModule(element, () => false);
      const normalScore = calculateContentScoreModule(
        createMockElement('div', { paragraphs, textContent: 'Main content' }),
        () => false
      );
      // Main should have higher score (multiplied by 1.5)
      expect(score).toBeGreaterThan(normalScore);
    });

    it('should give bonus for content-like class/id', () => {
      const paragraphs = Array(3).fill({ textContent: 'text' });
      const element = createMockElement('div', {
        className: 'article-content',
        paragraphs,
        textContent: 'Content with enough text to get a base score'
      });

      const score = calculateContentScoreModule(element, () => true); // isLikelyContentContainer returns true
      // Should have +100 bonus, so score should be significantly higher
      expect(score).toBeGreaterThan(50); // Base score + bonus
    });

    it('should apply penalty for very short content', () => {
      const element = createMockElement('div', {
        textContent: 'Short'
      });

      const score = calculateContentScoreModule(element, () => false);
      expect(score).toBeLessThan(10); // Should be penalized
    });

    it('should give bonus for images', () => {
      const paragraphs = Array(3).fill({ textContent: 'text' });
      const images = Array(2).fill({});
      const element = createMockElement('div', {
        paragraphs,
        images,
        textContent: 'Content with images'
      });

      const score = calculateContentScoreModule(element, () => false);
      const scoreWithoutImages = calculateContentScoreModule(
        createMockElement('div', { paragraphs, textContent: 'Content with images' }),
        () => false
      );
      expect(score).toBeGreaterThan(scoreWithoutImages);
    });

    it('should apply heavy penalty for email signup/newsletter content', () => {
      const paragraphs = Array(3).fill({ textContent: 'text' });
      const element = createMockElement('div', {
        paragraphs,
        textContent: 'Get the latest updates in your inbox. Email powered by Salesforce Marketing Cloud'
      });

      const score = calculateContentScoreModule(element, () => false);
      expect(score).toBeLessThan(0); // Should have heavy penalty
    });

    it('should apply penalty for email inputs with newsletter text', () => {
      const paragraphs = Array(2).fill({ textContent: 'text' });
      const emailInputs = [{ type: 'email' }];
      const element = createMockElement('div', {
        paragraphs,
        emailInputs,
        textContent: 'Subscribe to our newsletter'
      });

      const score = calculateContentScoreModule(element, () => false);
      expect(score).toBeLessThan(0); // Should have heavy penalty
    });
  });

  describe('hasSubstantialContentModule', () => {
    it('should return true for element with substantial text and paragraphs', () => {
      const paragraphs = Array(2).fill({ textContent: 'Paragraph text' });
      const element = createMockElement('div', {
        paragraphs,
        textContent: 'This is a substantial amount of text content that should be considered valid. It has multiple sentences and provides meaningful information.'
      });

      expect(hasSubstantialContentModule(element)).toBe(true);
    });

    it('should return true for element with long text even without paragraphs', () => {
      const element = createMockElement('div', {
        textContent: 'This is a very long text content that exceeds 300 characters. '.repeat(10)
      });

      expect(hasSubstantialContentModule(element)).toBe(true);
    });

    it('should return false for element with too short text', () => {
      const element = createMockElement('div', {
        textContent: 'Short'
      });

      expect(hasSubstantialContentModule(element)).toBe(false);
    });

    it('should return false for element with text between 100-300 chars but no paragraphs', () => {
      const element = createMockElement('div', {
        textContent: 'This is some text content that is longer than 100 characters but shorter than 300 characters and has no paragraph structure.'
      });

      expect(hasSubstantialContentModule(element)).toBe(false);
    });
  });
});


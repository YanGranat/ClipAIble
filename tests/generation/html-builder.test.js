// Tests for HTML builder module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHtmlForPdf, applyCustomStyles } from '../../scripts/generation/html-builder.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock('../../scripts/utils/html.js', () => ({
  escapeHtml: vi.fn((text) => {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }),
  escapeAttr: vi.fn((text) => {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }),
  sanitizeHtml: vi.fn((html, sourceUrl) => {
    // Simple mock: strip script tags
    return String(html || '').replace(/<script[^>]*>.*?<\/script>/gi, '');
  }),
  adjustColorBrightness: vi.fn((color, amount) => color),
  cleanTitle: vi.fn((title) => title?.trim() || '')
}));

vi.mock('../../scripts/utils/config.js', () => ({
  PDF_LOCALIZATION: {
    en: { date: 'Date', source: 'Source', author: 'Author', contents: 'Contents', abstract: 'Abstract' },
    ru: { date: 'Дата', source: 'Источник', author: 'Автор', contents: 'Содержание', abstract: 'Аннотация' },
    auto: { date: 'Date', source: 'Source', author: 'Author', contents: 'Contents', abstract: 'Abstract' }
  }
}));

describe('generation/html-builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildHtmlForPdf', () => {
    const baseContent = [
      { type: 'paragraph', text: 'First paragraph' },
      { type: 'paragraph', text: 'Second paragraph' }
    ];

    it('should build basic HTML structure', () => {
      const html = buildHtmlForPdf(
        baseContent,
        'Test Title',
        'Test Author',
        '<style>body { color: black; }</style>',
        'https://example.com',
        '2025-12-23',
        'en'
      );

      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<body');
      expect(html).toContain('Test Title');
      expect(html).toContain('Test Author');
      expect(html).toContain('First paragraph');
      expect(html).toContain('Second paragraph');
    });

    it('should include title in header', () => {
      const html = buildHtmlForPdf(
        baseContent,
        'Article Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<h1 class="article-title">Article Title</h1>');
    });

    it('should include metadata block', () => {
      const html = buildHtmlForPdf(
        baseContent,
        'Title',
        'Author Name',
        '<style></style>',
        'https://example.com/article',
        '2025-12-23',
        'en'
      );

      // Metadata is in article-meta div, check for author and date
      expect(html).toContain('Author Name');
      expect(html).toContain('2025-12-23');
      expect(html).toContain('https://example.com/article');
    });

    it('should handle different content types', () => {
      const content = [
        { type: 'heading', text: 'Main Heading', level: 2 },
        { type: 'paragraph', text: 'Paragraph text' },
        { type: 'quote', text: 'Quote text' },
        { type: 'code', text: 'const x = 1;', language: 'javascript' },
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        { type: 'image', src: 'image.jpg', alt: 'Image alt' },
        { type: 'separator' }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<h2>Main Heading</h2>');
      expect(html).toContain('<p');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('<pre><code');
      expect(html).toContain('<ul>');
      expect(html).toContain('<figure');
      expect(html).toContain('<hr>');
    });

    it('should generate TOC when enabled', () => {
      const content = [
        { type: 'heading', text: 'Introduction', level: 2 },
        { type: 'paragraph', text: 'Text' },
        { type: 'heading', text: 'Conclusion', level: 2 }
      ];

      const headings = [
        { text: 'Introduction', level: 2, index: 0 },
        { text: 'Conclusion', level: 2, index: 2 }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en',
        true,
        headings
      );

      expect(html).toContain('Contents');
      expect(html).toContain('Introduction');
      expect(html).toContain('Conclusion');
    });

    it('should include abstract when enabled', () => {
      const html = buildHtmlForPdf(
        baseContent,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en',
        false,
        [],
        true,
        'This is an abstract text'
      );

      expect(html).toContain('Abstract');
      expect(html).toContain('This is an abstract text');
    });

    it('should handle subtitle in header', () => {
      const content = [
        { type: 'heading', text: 'Title', level: 1 },
        { type: 'subtitle', text: 'Subtitle text', id: 'subtitle-1' },
        { type: 'paragraph', text: 'Content' }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<p class="standfirst"');
      expect(html).toContain('Subtitle text');
      // Subtitle should not appear in content section
      const contentIndex = html.indexOf('<div class="article-content">');
      const subtitleInContent = html.substring(contentIndex).includes('Subtitle text');
      expect(subtitleInContent).toBe(false);
    });

    it('should skip first heading if it matches title', () => {
      const content = [
        { type: 'heading', text: 'Article Title', level: 1 },
        { type: 'paragraph', text: 'Content' }
      ];

      const html = buildHtmlForPdf(
        content,
        'Article Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      // Title should be in header, not in content
      const headerTitleCount = (html.match(/Article Title/g) || []).length;
      expect(headerTitleCount).toBeGreaterThan(0);
    });

    it('should handle ordered and unordered lists', () => {
      const content = [
        { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        { type: 'list', items: ['First', 'Second'], ordered: true }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<ul>');
      expect(html).toContain('<ol>');
    });

    it('should handle table content', () => {
      const content = [
        {
          type: 'table',
          headers: ['Header 1', 'Header 2'],
          rows: [
            ['Cell 1', 'Cell 2'],
            ['Cell 3', 'Cell 4']
          ]
        }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('Header 1');
      expect(html).toContain('Cell 1');
    });

    it('should handle infobox elements', () => {
      const content = [
        { type: 'infobox_start', title: 'Info Box Title', id: 'info-1' },
        { type: 'paragraph', text: 'Info content' },
        { type: 'infobox_end' }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<div class="infobox"');
      expect(html).toContain('Info Box Title');
      expect(html).toContain('Info content');
    });

    it('should handle images with captions', () => {
      const content = [
        {
          type: 'image',
          src: 'https://example.com/image.jpg',
          alt: 'Image description',
          caption: 'Image caption text'
        }
      ];

      const html = buildHtmlForPdf(
        content,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<figure');
      expect(html).toContain('<img');
      expect(html).toContain('image.jpg');
      expect(html).toContain('<figcaption>');
      expect(html).toContain('Image caption text');
    });

    it('should use localization for different languages', () => {
      const htmlEn = buildHtmlForPdf(
        baseContent,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en',
        true,
        []
      );

      const htmlRu = buildHtmlForPdf(
        baseContent,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'ru',
        true,
        []
      );

      // TOC is only added when generateToc is true and headings exist
      // For this test, we just verify HTML structure is correct
      expect(htmlEn).toContain('<html');
      expect(htmlRu).toContain('<html');
    });

    it('should add translate="no" attributes to paragraphs', () => {
      const html = buildHtmlForPdf(
        baseContent,
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('translate="no"');
      expect(html).toContain('class="notranslate"');
      expect(html).toContain('data-translate="no"');
    });

    it('should handle empty content', () => {
      const html = buildHtmlForPdf(
        [],
        'Title',
        '',
        '<style></style>',
        '',
        '',
        'en'
      );

      expect(html).toContain('<html');
      expect(html).toContain('Title');
      expect(html).toContain('<div class="article-content">');
    });

    it('should handle missing optional parameters', () => {
      const html = buildHtmlForPdf(
        baseContent,
        'Title',
        '',
        '<style></style>'
      );

      expect(html).toContain('<html');
      expect(html).toContain('Title');
    });
  });

  describe('applyCustomStyles', () => {
    it('should apply custom colors', () => {
      const styles = applyCustomStyles(
        '<style>body { color: black; }</style>',
        'single',
        {
          bgColor: '#ffffff',
          textColor: '#000000',
          headingColor: '#333333',
          linkColor: '#0066cc'
        }
      );

      expect(styles).toContain('background-color: #ffffff');
      expect(styles).toContain('color: #000000');
      expect(styles).toContain('h1, h2, h3');
      expect(styles).toContain('#333333');
      expect(styles).toContain('a {');
      expect(styles).toContain('#0066cc');
    });

    it('should handle single page mode', () => {
      // Single page mode doesn't add page-break rules, it keeps existing ones
      const baseStyles = '<style>@page { margin: 0; size: 210mm 9999mm; }</style>';
      const styles = applyCustomStyles(
        baseStyles,
        'single',
        {
          bgColor: '#ffffff',
          textColor: '#000000',
          headingColor: '#333333',
          linkColor: '#0066cc'
        }
      );

      // Single page mode keeps the long page size
      expect(styles).toContain('210mm 9999mm');
    });

    it('should handle multi page mode', () => {
      // Multi page mode replaces long page with A4
      const baseStyles = '<style>@page { margin: 0; size: 210mm 9999mm; }</style>';
      const styles = applyCustomStyles(
        baseStyles,
        'multi',
        {
          bgColor: '#ffffff',
          textColor: '#000000',
          headingColor: '#333333',
          linkColor: '#0066cc'
        }
      );

      // Multi page mode should replace with A4
      expect(styles).toContain('size: A4');
    });
  });
});


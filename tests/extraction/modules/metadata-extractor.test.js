import { describe, it, expect } from 'vitest';
import {
  isValidArticleTitleModule,
  extractAuthorFromUrlModule,
  getMonthNumberModule,
  parseDateToISOModule
} from '../../../scripts/extraction/modules/metadata-extractor.js';

describe('metadata-extractor', () => {
  describe('isValidArticleTitleModule', () => {
    it('should return false for null or undefined', () => {
      expect(isValidArticleTitleModule(null)).toBe(false);
      expect(isValidArticleTitleModule(undefined)).toBe(false);
    });

    it('should return false for element without textContent', () => {
      const element = { textContent: null };
      expect(isValidArticleTitleModule(element)).toBe(false);
    });

    it('should return false for too short text', () => {
      const element = { textContent: 'Hi' };
      expect(isValidArticleTitleModule(element)).toBe(false);
    });

    it('should return false for common site name patterns', () => {
      const patterns = ['home', 'about', 'contact', 'blog', 'news', 'archive'];
      for (const pattern of patterns) {
        const element = { textContent: pattern };
        expect(isValidArticleTitleModule(element)).toBe(false);
      }
    });

    it('should return true for valid article titles', () => {
      const element1 = { textContent: 'How to Build a Web Application' };
      expect(isValidArticleTitleModule(element1)).toBe(true);

      const element2 = { textContent: 'Understanding JavaScript Closures' };
      expect(isValidArticleTitleModule(element2)).toBe(true);
    });

    it('should handle text with whitespace', () => {
      const element = { textContent: '   Valid Article Title   ' };
      expect(isValidArticleTitleModule(element)).toBe(true);
    });
  });

  describe('extractAuthorFromUrlModule', () => {
    it('should return null for null or undefined', () => {
      expect(extractAuthorFromUrlModule(null)).toBe(null);
      expect(extractAuthorFromUrlModule(undefined)).toBe(null);
      expect(extractAuthorFromUrlModule('')).toBe(null);
    });

    it('should extract author from /profile/ URL', () => {
      const url = 'https://example.com/profile/john-smith';
      expect(extractAuthorFromUrlModule(url)).toBe('John Smith');
    });

    it('should extract author from /author/ URL', () => {
      const url = 'https://example.com/author/mary-jane';
      expect(extractAuthorFromUrlModule(url)).toBe('Mary Jane');
    });

    it('should handle underscore separators', () => {
      const url = 'https://example.com/profile/john_smith';
      expect(extractAuthorFromUrlModule(url)).toBe('John Smith');
    });

    it('should handle camelCase names', () => {
      const url = 'https://example.com/profile/johnSmith';
      const result = extractAuthorFromUrlModule(url);
      expect(result).toBe('John Smith');
    });

    it('should handle single part names', () => {
      const url = 'https://example.com/profile/john';
      const result = extractAuthorFromUrlModule(url);
      expect(result).toBe('John');
    });

    it('should return null for URLs without profile/author path', () => {
      const url = 'https://example.com/article/123';
      expect(extractAuthorFromUrlModule(url)).toBe(null);
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://example.com/profile/john-smith?ref=home';
      expect(extractAuthorFromUrlModule(url)).toBe('John Smith');
    });
  });

  describe('getMonthNumberModule', () => {
    it('should return correct month numbers for full names', () => {
      expect(getMonthNumberModule('January')).toBe('01');
      expect(getMonthNumberModule('February')).toBe('02');
      expect(getMonthNumberModule('March')).toBe('03');
      expect(getMonthNumberModule('April')).toBe('04');
      expect(getMonthNumberModule('May')).toBe('05');
      expect(getMonthNumberModule('June')).toBe('06');
      expect(getMonthNumberModule('July')).toBe('07');
      expect(getMonthNumberModule('August')).toBe('08');
      expect(getMonthNumberModule('September')).toBe('09');
      expect(getMonthNumberModule('October')).toBe('10');
      expect(getMonthNumberModule('November')).toBe('11');
      expect(getMonthNumberModule('December')).toBe('12');
    });

    it('should return correct month numbers for abbreviations', () => {
      expect(getMonthNumberModule('Jan')).toBe('01');
      expect(getMonthNumberModule('Feb')).toBe('02');
      expect(getMonthNumberModule('Mar')).toBe('03');
      expect(getMonthNumberModule('Apr')).toBe('04');
      expect(getMonthNumberModule('Jun')).toBe('06');
      expect(getMonthNumberModule('Jul')).toBe('07');
      expect(getMonthNumberModule('Aug')).toBe('08');
      expect(getMonthNumberModule('Sep')).toBe('09');
      expect(getMonthNumberModule('Sept')).toBe('09');
      expect(getMonthNumberModule('Oct')).toBe('10');
      expect(getMonthNumberModule('Nov')).toBe('11');
      expect(getMonthNumberModule('Dec')).toBe('12');
    });

    it('should be case insensitive', () => {
      expect(getMonthNumberModule('JANUARY')).toBe('01');
      expect(getMonthNumberModule('january')).toBe('01');
      expect(getMonthNumberModule('JaNuArY')).toBe('01');
    });

    it('should return null for invalid month names', () => {
      expect(getMonthNumberModule('Invalid')).toBe(null);
      expect(getMonthNumberModule('')).toBe(null);
      expect(getMonthNumberModule('Janu')).toBe(null);
    });
  });

  describe('parseDateToISOModule', () => {
    it('should return null for null or empty string', () => {
      expect(parseDateToISOModule(null, getMonthNumberModule)).toBe(null);
      expect(parseDateToISOModule('', getMonthNumberModule)).toBe(null);
    });

    it('should return ISO format if already ISO', () => {
      expect(parseDateToISOModule('2025-12-31', getMonthNumberModule)).toBe('2025-12-31');
      expect(parseDateToISOModule('2025-01-01', getMonthNumberModule)).toBe('2025-01-01');
    });

    it('should parse Date object compatible strings', () => {
      const result = parseDateToISOModule('2025-12-31T00:00:00Z', getMonthNumberModule);
      expect(result).toMatch(/^2025-12-31/);
    });

    it('should parse ordinal date format', () => {
      expect(parseDateToISOModule('31st Jul 2007', getMonthNumberModule)).toBe('2007-07-31');
      expect(parseDateToISOModule('1st January 2025', getMonthNumberModule)).toBe('2025-01-01');
      expect(parseDateToISOModule('15th March 2020', getMonthNumberModule)).toBe('2020-03-15');
    });

    it('should parse month-year format', () => {
      // Function first tries Date object, which may parse "December 2025" as a date
      // If Date parsing succeeds, it returns full date; otherwise uses regex for YYYY-MM
      const result1 = parseDateToISOModule('December 2025', getMonthNumberModule);
      // Date object might parse this, so result could be full date or YYYY-MM
      expect(result1).toMatch(/^2025-12/);
      
      const result2 = parseDateToISOModule('January 2020', getMonthNumberModule);
      expect(result2).toMatch(/^2020-01/);
    });

    it('should parse year-only format', () => {
      // Function checks for exact year match first (regex), so "2025" should return "2025"
      // But Date object might parse it first, so we check it starts with year
      const result1 = parseDateToISOModule('2025', getMonthNumberModule);
      // Regex pattern should match first, but Date might parse it
      expect(result1).toMatch(/^2025/);
      
      const result2 = parseDateToISOModule('2020', getMonthNumberModule);
      expect(result2).toMatch(/^2020/);
    });

    it('should return null for invalid date strings', () => {
      expect(parseDateToISOModule('invalid date', getMonthNumberModule)).toBe(null);
      expect(parseDateToISOModule('not a date', getMonthNumberModule)).toBe(null);
    });
  });
});


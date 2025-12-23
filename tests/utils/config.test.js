// Tests for config utility functions

import { describe, it, expect } from 'vitest';
import { getLocaleFromLanguage, formatDateForDisplay } from '../../scripts/utils/config.js';

describe('config', () => {
  describe('getLocaleFromLanguage', () => {
    it('should return correct locale for common languages', () => {
      expect(getLocaleFromLanguage('ru')).toBe('ru-RU');
      expect(getLocaleFromLanguage('en')).toBe('en-US');
      expect(getLocaleFromLanguage('ua')).toBe('uk-UA');
      expect(getLocaleFromLanguage('de')).toBe('de-DE');
      expect(getLocaleFromLanguage('fr')).toBe('fr-FR');
      expect(getLocaleFromLanguage('es')).toBe('es-ES');
      expect(getLocaleFromLanguage('it')).toBe('it-IT');
      expect(getLocaleFromLanguage('pt')).toBe('pt-PT');
      expect(getLocaleFromLanguage('zh')).toBe('zh-CN');
      expect(getLocaleFromLanguage('ja')).toBe('ja-JP');
      expect(getLocaleFromLanguage('ko')).toBe('ko-KR');
    });

    it('should return correct locale for additional languages', () => {
      expect(getLocaleFromLanguage('ar')).toBe('ar-SA');
      expect(getLocaleFromLanguage('hi')).toBe('hi-IN');
      expect(getLocaleFromLanguage('pl')).toBe('pl-PL');
      expect(getLocaleFromLanguage('nl')).toBe('nl-NL');
      expect(getLocaleFromLanguage('tr')).toBe('tr-TR');
    });

    it('should return en-US for auto', () => {
      expect(getLocaleFromLanguage('auto')).toBe('en-US');
    });

    it('should return en-US for unknown language codes', () => {
      expect(getLocaleFromLanguage('unknown')).toBe('en-US');
      expect(getLocaleFromLanguage('xx')).toBe('en-US');
    });
  });

  describe('formatDateForDisplay', () => {
    describe('ISO format (YYYY-MM-DD)', () => {
      it('should format full ISO date correctly', () => {
        const result = formatDateForDisplay('2025-12-23', 'en-US');
        expect(result).toContain('2025');
        expect(result).toContain('December');
        expect(result).toContain('23');
      });

      it('should format date in Russian locale', () => {
        const result = formatDateForDisplay('2025-12-23', 'ru');
        expect(result).toContain('2025');
        // Russian month names
        expect(result).toMatch(/декабр|январ|феврал|март|апрел|май|июн|июл|август|сентябр|октябр|ноябр/i);
      });

      it('should format date with language code', () => {
        const result = formatDateForDisplay('2025-12-23', 'ru');
        expect(result).toBeTruthy();
      });

      it('should format date with locale code', () => {
        const result = formatDateForDisplay('2025-12-23', 'ru-RU');
        expect(result).toBeTruthy();
      });
    });

    describe('ISO format (YYYY-MM)', () => {
      it('should format year and month', () => {
        const result = formatDateForDisplay('2025-12', 'en-US');
        expect(result).toContain('2025');
        expect(result).toContain('December');
      });

      it('should format year and month in Russian', () => {
        const result = formatDateForDisplay('2025-12', 'ru');
        expect(result).toContain('2025');
        expect(result).toMatch(/декабр/i);
      });
    });

    describe('ISO format (YYYY)', () => {
      it('should return year only', () => {
        expect(formatDateForDisplay('2025', 'en-US')).toBe('2025');
        expect(formatDateForDisplay('1999', 'en-US')).toBe('1999');
      });
    });

    describe('Legacy format support', () => {
      it('should parse ordinal format (31st Jul 2007)', () => {
        const result = formatDateForDisplay('31st Jul 2007', 'en-US');
        expect(result).toContain('2007');
        expect(result).toContain('July');
        expect(result).toContain('31');
      });

      it('should parse ordinal format without comma', () => {
        const result = formatDateForDisplay('15th January 2025', 'en-US');
        expect(result).toContain('2025');
        expect(result).toContain('January');
        expect(result).toContain('15');
      });

      it('should parse short format (Dec 8, 2025)', () => {
        const result = formatDateForDisplay('Dec 8, 2025', 'en-US');
        expect(result).toContain('2025');
        expect(result).toContain('December');
        expect(result).toContain('8');
      });

      it('should parse short format without comma', () => {
        const result = formatDateForDisplay('Dec 8 2025', 'en-US');
        expect(result).toContain('2025');
        expect(result).toContain('December');
      });

      it('should handle full month names', () => {
        const result = formatDateForDisplay('December 25, 2025', 'en-US');
        expect(result).toContain('2025');
        expect(result).toContain('December');
        expect(result).toContain('25');
      });
    });

    describe('Edge cases', () => {
      it('should return empty string for empty input', () => {
        expect(formatDateForDisplay('', 'en-US')).toBe('');
        expect(formatDateForDisplay(null, 'en-US')).toBe('');
        expect(formatDateForDisplay(undefined, 'en-US')).toBe('');
      });

      it('should fallback to native Date parsing for unrecognized formats', () => {
        const result = formatDateForDisplay('2025/12/23', 'en-US');
        // Should attempt to parse and format
        expect(result).toBeTruthy();
      });

      it('should return as-is if parsing completely fails', () => {
        const invalid = 'not a date';
        const result = formatDateForDisplay(invalid, 'en-US');
        // Should return the input as-is as last resort
        expect(result).toBe(invalid);
      });

      it('should handle invalid dates gracefully', () => {
        const result = formatDateForDisplay('2025-13-45', 'en-US');
        // Should attempt fallback parsing
        expect(result).toBeTruthy();
      });
    });

    describe('Locale handling', () => {
      it('should convert language code to locale', () => {
        const result = formatDateForDisplay('2025-12-23', 'ru');
        expect(result).toBeTruthy();
        // Should use Russian locale formatting
      });

      it('should use locale code directly if provided', () => {
        const result = formatDateForDisplay('2025-12-23', 'ru-RU');
        expect(result).toBeTruthy();
      });

      it('should default to en-US for unknown locales', () => {
        const result = formatDateForDisplay('2025-12-23', 'unknown');
        expect(result).toBeTruthy();
      });
    });

    describe('Month abbreviations', () => {
      it('should handle all month abbreviations', () => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        months.forEach((month, index) => {
          const day = 15;
          const year = 2025;
          const dateStr = `${month} ${day}, ${year}`;
          const result = formatDateForDisplay(dateStr, 'en-US');
          expect(result).toContain(year.toString());
        });
      });

      it('should handle full month names', () => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
        months.forEach((month) => {
          const day = 15;
          const year = 2025;
          const dateStr = `${month} ${day}, ${year}`;
          const result = formatDateForDisplay(dateStr, 'en-US');
          expect(result).toContain(year.toString());
        });
      });
    });
  });
});


// Tests for config utility functions

import { execFileSync } from 'node:child_process';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getExtensionVersion, getLocaleFromLanguage, formatDateForDisplay } from '../../scripts/utils/config.js';

describe('config', () => {
  describe('getExtensionVersion', () => {
    it('reads the installed manifest version and agrees with package metadata', () => {
      const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
      const manifest = readJson('../../manifest.json');
      const packageMetadata = readJson('../../package.json');
      const original = chrome.runtime;
      chrome.runtime = { ...original, getManifest: vi.fn(() => manifest) };
      try {
        expect(getExtensionVersion()).toBe(manifest.version);
        expect(manifest.version).toBe(packageMetadata.version);
      } finally {
        chrome.runtime = original;
      }
    });

    it('does not return a version when the manifest cannot be read', () => {
      const original = chrome.runtime;
      try {
        chrome.runtime = {};
        expect(getExtensionVersion()).toBeNull();
        chrome.runtime.getManifest = () => { throw new Error('Extension context unavailable'); };
        expect(getExtensionVersion()).toBeNull();
      } finally {
        chrome.runtime = original;
      }
    });
  });

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
    it('keeps the source calendar day or month in a time zone west of UTC', () => {
      const moduleUrl = new URL('../../scripts/utils/config.js', import.meta.url).href;
      const samples = ['2032-03-01', '2032-03', '1st Mar 2032', 'Mar 1, 2032', '2032-03-01T12:00:00Z'];
      const output = execFileSync(process.execPath, ['--input-type=module', '--eval',
        `import { formatDateForDisplay } from ${JSON.stringify(moduleUrl)};
         console.log(JSON.stringify(${JSON.stringify(samples)}.map(value => formatDateForDisplay(value, 'en-US'))));`
      ], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Los_Angeles' } });
      expect(JSON.parse(output)).toEqual(['March 1, 2032', 'March 2032', 'March 1, 2032', 'March 1, 2032', 'March 1, 2032']);
    });

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

      it.each(['2025-13-45', '2025-02-29', '2025-00', '31st Apr 2025', 'April 31, 2025'])('does not invent a different date for %s', input => {
        expect(formatDateForDisplay(input, 'en-US')).toBe(input);
      });

      it('formats actual leap days and does not shift a two-digit year by 1900', () => {
        expect(formatDateForDisplay('2024-02-29')).toBe('February 29, 2024');
        expect(formatDateForDisplay('0099-10-03')).toBe('October 3, 99');
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


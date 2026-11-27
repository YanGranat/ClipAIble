import { describe, expect, it } from 'vitest';
import { PROMPTS, PROMPT_IDS, PROMPT_MAX_LENGTH, readPromptOverrides, renderPrompt, validatePrompt } from '../../scripts/settings/prompt-catalog.js';
import { buildChunkSystemPrompt, buildPdfPageUserPrompt } from '../../scripts/extraction/prompts.js';
import { UI_LOCALES } from '../../scripts/locales.js';
import { ADVANCED_LOCALES, getPromptDisplayName } from '../../scripts/settings/advanced-locales.js';

describe('editable AI task prompts', () => {
  it('provides a valid English default for every instruction template', () => {
    expect(PROMPT_IDS).toHaveLength(20);
    for (const id of PROMPT_IDS) {
      const { template, variables } = PROMPTS[id];
      expect(validatePrompt(id, template), id).toBeNull();
      expect(template, id).not.toMatch(/[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Arabic}]/u);
      const values = Object.fromEntries(variables.map(key => [key, 'replacement']));
      expect(renderPrompt(id, undefined, values), id).not.toMatch(/{{[a-zA-Z]+}}/);
    }
  });

  it('requires known placeholders and inserts their values without interpreting them as templates', () => {
    expect(validatePrompt('summary', 'Write a short summary.')).toMatchObject({ key: 'promptMissingVariable' });
    expect(validatePrompt('summary', 'Write in {{targetLanguage}} using {{missing}}.')).toMatchObject({ key: 'promptUnknownVariable' });
    expect(validatePrompt('selector', '')).toMatchObject({ key: 'promptEmpty' });
    expect(validatePrompt('selector', 'x'.repeat(PROMPT_MAX_LENGTH + 1))).toMatchObject({ key: 'promptTooLong' });
    const saved = readPromptOverrides({
      prompt_override_summary: 'Write in {{targetLanguage}}.',
      prompt_override_translateImage: 'Redraw everything.',
      prompt_override_selector: PROMPTS.selector.template,
      prompt_override_nonexistent: 'Not a supported setting'
    });
    expect(saved).toEqual({ summary: 'Write in {{targetLanguage}}.' });
    expect(renderPrompt('summary', { promptOverrides: saved }, { targetLanguage: '$& {{missing}}' })).toBe('Write in $& {{missing}}.');
    expect(renderPrompt('selector', { promptOverrides: saved })).toBe(PROMPTS.selector.template);
  });

  it('keeps the numbering and first-chunk metadata slots in the long article prompt', () => {
    const a = buildChunkSystemPrompt(0, 3);
    const b = buildChunkSystemPrompt(1, 3);
    const c = buildChunkSystemPrompt(2, 3);
    expect(a).toContain('chunk 1 of 3');
    expect(a).toContain('"publishDate"');
    expect(b).toContain('MIDDLE');
    expect(b).not.toContain('"publishDate"');
    expect(c).toContain('END of the article');
    for (const result of [a,b,c]) expect(result).not.toMatch(/[\p{Script=Cyrillic}]/u);
  });

  it('uses distinct PDF prompts and applies the join override only to later pages', () => {
    const options = { promptOverrides: { pdfContinuation: 'Pick the join based on paragraph structure.' } };
    const first = buildPdfPageUserPrompt('', 1, 5, true, true, options);
    const later = buildPdfPageUserPrompt('', 2, 5, false, false, options);
    expect(first).toContain('page 1 of 5');
    expect(first).toContain('DOCUMENT INFORMATION');
    expect(first).not.toContain('Pick the join');
    expect(later).toContain('page 2 of 5');
    expect(later).toContain('Pick the join based on paragraph structure.');
    expect(later).not.toContain('DOCUMENT INFORMATION');
  });

  it('ships the editor controls and validation messages in all supported UI locales', () => {
    expect(Object.keys(ADVANCED_LOCALES).sort()).toEqual(Object.keys(UI_LOCALES).sort());
    for (const copy of Object.values(ADVANCED_LOCALES)) {
      expect(Object.keys(copy)).toEqual(Object.keys(ADVANCED_LOCALES.en));
      expect(copy.promptMissingVariable).toContain('{variable}');
    }
  });

  it('ships readable prompt names and editor labels in every supported UI locale', () => {
    const damagedText = /\uFFFD|\?{2,}|\p{L}\?\p{L}/u;
    const damagedKeys = [];
    for (const [language, copy] of Object.entries(ADVANCED_LOCALES)) {
      const labels = [
        ...Object.entries(copy),
        ...PROMPT_IDS.map(id => [id, getPromptDisplayName(id, language, PROMPTS[id].label)])
      ];
      for (const [key, label] of labels) {
        if (damagedText.test(label)) damagedKeys.push(`${language}.${key}`);
      }
    }
    expect(damagedKeys).toEqual([]);
  });
});

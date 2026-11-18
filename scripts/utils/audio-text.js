// @ts-check

/** Normalize narration typography without dropping meaningful Unicode text. */
export function normalizeSpeechText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/—/g, ' - ')
    .replace(/–/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

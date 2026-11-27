// @ts-check

const SENTENCE_END = /(?:[.!?…]+[”’"')\]]*(?=\s)|[。！？]+[」』】）]*)/gu;
const ABBREVIATION = /(?:^|\s)(?:mr|mrs|ms|dr|prof|sr|jr|inc|ltd|etc|e\.g|i\.e|vs|fig|al|no|vol|pp|p|т\.е|т\.д|т\.п|др|см|ср|\p{Lu})\.$/iu;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Split narration by slicing, preserving punctuation, text order, and internal line breaks. */
export function splitNarrationText(text, maxLength) {
  if (!Number.isInteger(maxLength) || maxLength < 2) throw new RangeError('Invalid narration chunk limit');
  if (typeof text !== 'string') return [];
  const parts = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    // One lookahead character distinguishes real punctuation from a decimal or version number at the cutoff.
    const window = remaining.slice(0, maxLength + 1);
    const preferredStart = Math.floor(maxLength * 2 / 3);
    let paragraph = 0, sentence = 0, line = 0, word = 0;
    for (const match of window.matchAll(/[^\S\u00a0\u202f\u2007]+/gu)) {
      if (match.index > maxLength) break;
      word = match.index;
      const breaks = match[0].match(/\r\n|[\r\n\u2028\u2029]/gu)?.length || 0;
      if (breaks) line = word;
      if (breaks > 1) paragraph = word;
    }
    for (const match of window.matchAll(SENTENCE_END)) {
      const end = match.index + match[0].length;
      if (end > maxLength) break;
      if (!ABBREVIATION.test(window.slice(Math.max(0, end - 16), end))) sentence = end;
    }
    let split = [paragraph, sentence, line].find(point => point > 0 && point >= preferredStart) || word;
    if (!split) {
      split = GRAPHEMES.segment(remaining).containing(maxLength)?.index || maxLength;
      if (/[\uD800-\uDBFF]/.test(remaining.charAt(split - 1)) && /[\uDC00-\uDFFF]/.test(remaining.charAt(split))) split--;
    }
    parts.push(remaining.slice(0, split).trimEnd());
    remaining = remaining.slice(split).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

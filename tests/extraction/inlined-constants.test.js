import { describe, expect, it } from 'vitest';
import { CONSTANTS, getInlinedConstantsCode } from '../../scripts/extraction/extractor/constants.js';

describe('Inlined extraction constants', () => {
  it('preserves navigation pattern names and values for the extraction consumer', () => {
    const generated = new Function(getInlinedConstantsCode() + '\nreturn CONSTANTS;')();
    for (const key of ['NAVIGATION_PATTERNS_CONTAINS', 'NAVIGATION_PATTERNS_STARTS_WITH']) {
      expect(generated[key]).toBeInstanceOf(Array);
      expect(generated[key].map(pattern => pattern.toString())).toEqual(CONSTANTS[key].map(pattern => pattern.toString()));
    }
  });
});

import { expect, it, vi } from 'vitest';
import { CONFIG } from '../../scripts/utils/config.js';
import { applyFontFormatting } from '../../scripts/offscreen/pdf/utils/item-transformer.js';

it('keeps operation diagnostics in the logger payload', () => {
  const originalLevel = CONFIG.LOG_LEVEL;
  const originalVerbose = CONFIG.VERBOSE_LOGGING;
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    CONFIG.LOG_LEVEL = 0;
    CONFIG.VERBOSE_LOGGING = false;
    applyFontFormatting([{ text: 'Sample', fontName: 'Face-Regular', fontSize: 12, x: 20, y: 30, width: 40, height: 12 }], null, 'invalid', null, 7);
    const warning = output.mock.calls.find(([message]) => message.includes('fontNameMap is not a Map'));
    expect(warning).toBeDefined();
    expect(warning[1]).toMatchObject({ marker: 'APPLY_FONT_FORMATTING_WARN', pageNum: 7 });
  } finally {
    CONFIG.LOG_LEVEL = originalLevel;
    CONFIG.VERBOSE_LOGGING = originalVerbose;
    output.mockRestore();
  }
});

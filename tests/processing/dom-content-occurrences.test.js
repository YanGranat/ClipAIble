import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractContentWithSelectors } from '../../scripts/processing/modes.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('Independently owned DOM content occurrences', () => {
  it('retains repeated attributions, paragraphs and list items returned from distinct source elements', async () => {
    const content = [
      { type: 'paragraph', text: 'A measurement is useful when it can be reproduced.' },
      { type: 'paragraph', text: '— Field notebook' },
      { type: 'paragraph', text: 'A calibration is useful when it can be checked.' },
      { type: 'paragraph', text: '— Field notebook' },
      { type: 'list', ordered: false, items: [{ html: 'Record the initial reading.' }] },
      { type: 'paragraph', text: 'Repeat the procedure for the second instrument.' },
      { type: 'list', ordered: false, items: [{ html: 'Record the initial reading.' }] }
    ];
    vi.spyOn(chrome.tabs, 'get').mockResolvedValue({ id: 7, url: 'https://example.test/report' });
    vi.spyOn(chrome.scripting, 'executeScript').mockResolvedValue([{ result: { title: 'Field observations', content: structuredClone(content) } }]);
    const result = await extractContentWithSelectors(7, { content: 'article' }, 'https://example.test/report', async () => {});
    expect(result.content).toEqual(content);
    const document = new JSDOM().window.document;
    expect(result.content.filter(item => item.type === 'paragraph').map(item => {
      const element = document.createElement('p'); element.innerHTML = item.text; return element.textContent;
    }).filter(text => text === '— Field notebook')).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../scripts/utils/html.js';
import { JSDOM } from 'jsdom';

describe('Markdown superscripts and subscripts', () => {
  it.each([
    ['H<sub>2</sub>O and x<sup>2</sup>.', 'H<sub>2</sub>O and x<sup>2</sup>.'],
    ['2<sup><em>N</em></sup> + a<sub>i<sup>2</sup></sub>', '2<sup>*N*</sup> + a<sub>i<sup>2</sup></sub>'],
    ['前<sup>猫</sup>後 <sub>🚀</sub>', '前<sup>猫</sup>後 <sub>🚀</sub>']
  ])('preserves position and nesting in %s', (input, expected) => {
    expect(htmlToMarkdown(input)).toBe(expected);
  });

  it('preserves a reference identity once and discards executable attributes', () => {
    const output = htmlToMarkdown('<sup id="ref&quot;α" onclick="run()"><a href="#note">2</a></sup><sub onmouseover="run()">i<script>run()</script></sub>');
    expect(output).toBe('<a id="ref&quot;α"></a><sup>[2](#note)</sup><sub>i</sub>');
    const document = new JSDOM(output).window.document;
    expect(document.querySelectorAll('[id]')).toHaveLength(1);
    expect(document.querySelector('[id]').id).toBe('ref"α');
    expect(document.querySelector('[onclick], [onmouseover], script')).toBeNull();
  });
});

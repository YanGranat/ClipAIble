import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../scripts/utils/html.js';

describe('rich Markdown inline whitespace', () => {
  it.each([
    ['Before <em>the next phrase </em>continues.', 'Before *the next phrase* continues.'],
    ['Before <i> this phrase</i> continues.', 'Before  *this phrase* continues.'],
    ['Before <strong>the next phrase </strong>continues.', 'Before **the next phrase** continues.'],
    ['Before <b> this phrase </b>continues.', 'Before  **this phrase** continues.'],
    ['One<em> </em>two', 'One two'],
    ['One<strong>\t </strong>two', 'One\t two'],
    ['前<em>猫。 </em>次', '前*猫。* 次'],
    ['A<em>🚀</em>B', 'A<em>🚀</em>B'],
    ['pre<em>fix</em>ed', 'pre*fix*ed'],
    ['<strong>word</strong>next', '**word**next'],
    ['A<em>?</em>B', 'A<em>?</em>B'],
    ['Text<strong>value.</strong>next', 'Text<strong>value.</strong>next'],
    ['a<em>b</em><em>c</em>d', 'a<em>b</em><em>c</em>d'],
    ['a<strong>b</strong><strong>c</strong>d', 'a<strong>b</strong><strong>c</strong>d'],
    ['<em>A </em><a href="https://example.org/read?a=1&amp;b=2">linked <strong>word </strong></a>continues', '*A* [linked **word** ](https://example.org/read?a=1&b=2)continues'],
    ['<ul><li>Prefix<em>?</em>suffix <b> words </b>end</li></ul>', '- Prefix<em>?</em>suffix  **words** end']
  ])('preserves source text boundaries in %s', (input, expected) => {
    expect(htmlToMarkdown(input)).toBe(expected);
  });

  it('restricts inline HTML fallback to sanitized formatting tags', () => {
    const result = htmlToMarkdown('A<em onclick="run()">?</em>B<script>run()</script>');
    expect(result).toBe('A<em>?</em>B');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('script');
  });
});

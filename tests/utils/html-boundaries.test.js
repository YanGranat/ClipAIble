import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { sanitizeHtml, sanitizeMarkdownHtml, stripHtml, decodeHtmlEntities, htmlToMarkdown, markdownToHtml, removeHtmlAttributes, renderContentText } from '../../scripts/utils/html.js';
import { markdownToHtml as popupMarkdown } from '../../popup/utils/format-helpers.js';

const documentFor = html => new JSDOM(`<main>${html}</main>`).window.document;

describe('HTML token boundaries', () => {
  it.each([sanitizeHtml, sanitizeMarkdownHtml])('cannot complete a trailing tag with surrounding markup', sanitize => {
    const output = sanitize('Start <img src="https://example.org/pixel"');
    expect(documentFor(output + '>End').querySelector('img')).toBeNull();
    expect(documentFor(output).querySelector('main').textContent).toContain('<img');
  });

  it('retains attribute-shaped prose, escaped generics and URL query text', () => {
    const input = 'Vector&lt;T&gt; id="chapter" target="_blank" https://example.org/?id=7&amp;class=article';
    expect(documentFor(sanitizeHtml(input)).querySelector('main').textContent).toBe('Vector<T> id="chapter" target="_blank" https://example.org/?id=7&class=article');
  });

  it('preserves literal anchor-looking markers and replacement metacharacters', () => {
    const input = '__ANCHOR_PLACEHOLDER_0__ <a id="note" href="#note">$& $$ $` $\'</a>';
    const main = documentFor(sanitizeHtml(input)).querySelector('main');
    expect(main.textContent).toBe('__ANCHOR_PLACEHOLDER_0__ $& $$ $` $\'');
    expect(main.querySelectorAll('a')).toHaveLength(1);
  });

  it('handles quoted tag delimiters and removes only actual requested attributes', () => {
    const input = 'id="plain" <code>let id="value";</code><a title="x > y" ID="remove" href="https://example.org/?id=keep">Read</a>';
    expect(removeHtmlAttributes(input, ['id'])).toBe('id="plain" <code>let id="value";</code><a title="x > y" href="https://example.org/?id=keep">Read</a>');
  });

  it('limits inline CSS to a valid color and retains footnote anchors', () => {
    const html = sanitizeHtml('<span id="note" style="color:red; background:url(https://example.org/pixel)">Note</span><a href="#note">Back</a>');
    expect(html).not.toContain('background');
    expect(html).toContain('color: red');
    expect(documentFor(html).querySelector('#note')).not.toBeNull();
  });

  it('retains mathematical and vector text while removing active foreign markup', () => {
    const input = '<math><mi>x</mi><mo>+</mo><mn>2</mn></math><svg><text>Axis</text><script>run()</script><image href="https://example.org/pixel"/></svg>';
    const doc = documentFor(sanitizeHtml(input));
    expect(doc.querySelector('main').textContent).toBe('x+2Axis');
    expect(doc.querySelector('svg,math,script,image')).toBeNull();
  });

  it('resolves relative links without guessing whether fragment targets are exported', () => {
    const source = 'https://example.org/story?version=1';
    const doc = documentFor(sanitizeHtml('<a href="../notes#part">Notes</a><a href="https://other.example/story#end">Other</a><a href="?version=2#part">Version</a><a href="?version=1#part">Same</a>', source));
    expect([...doc.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['https://example.org/notes#part', 'https://other.example/story#end', 'https://example.org/story?version=2#part', 'https://example.org/story?version=1#part']);
  });

  it.each(['java&#x09;script:run()', 'javascript&colon;run()', 'data:text/html,test', 'vbscript:run()'])('rejects executable URL %s', href => {
    expect(documentFor(sanitizeHtml(`<a href="${href}">Label</a>`)).querySelector('a').getAttribute('href')).toBe('#');
  });

  it('separates structural breaks and decodes one Unicode entity layer', () => {
    expect(stripHtml('one<br>two<p>three</p>four')).toBe('one two three four');
    expect(decodeHtmlEntities('&amp;lt; &#x1F680; &#128640;')).toBe('&lt; 🚀 🚀');
    expect(decodeHtmlEntities('&#x110000; &#0;')).toBe('� �');
  });
});

describe('Markdown source preservation', () => {
  it('does not turn prose punctuation into lists', () => {
    expect(htmlToMarkdown('Alpha; beta; gamma.')).toBe('Alpha; beta; gamma.');
  });

  it('keeps escaped tag examples as text through both conversions', () => {
    const markdown = htmlToMarkdown('&lt;script&gt;sample&lt;/script&gt;');
    expect(documentFor(markdownToHtml(markdown)).querySelector('script')).toBeNull();
    expect(documentFor(markdownToHtml(markdown)).querySelector('main').textContent).toBe('<script>sample</script>');
  });

  it.each([markdownToHtml, popupMarkdown])('renders fences, lists and identifiers without placeholder collisions', render => {
    const output = render('CODE_BLOCK_0\n```js\nconst my_var_name = "$& <tag>";\n```\n* First\n* Second\nmy_var_name and **bold**');
    const doc = documentFor(output);
    expect(doc.querySelector('pre code').textContent).toBe('const my_var_name = "$& <tag>";');
    expect(doc.querySelectorAll('li')).toHaveLength(2);
    expect(doc.querySelector('strong').textContent).toBe('bold');
    expect(doc.querySelector('main').textContent).toContain('CODE_BLOCK_0');
    expect(doc.querySelector('main').textContent).toContain('my_var_name and bold');
    expect(doc.querySelector('tag')).toBeNull();
  });

  it('escapes raw HTML in Markdown and validates link targets', () => {
    const doc = documentFor(markdownToHtml('<img src=x onerror=run()> [bad](javascript:run()) [ok](https://example.org/a_(b))'));
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelectorAll('a')).toHaveLength(1);
    expect(doc.querySelector('a').getAttribute('href')).toBe('https://example.org/a_(b)');
  });

  it('preserves nested list ordering in block HTML and Markdown', () => {
    const input = '<ol start="3"><li>Before<ul><li>Nested</li></ul>After</li><li>Last</li></ol>';
    expect(documentFor(sanitizeMarkdownHtml(input)).querySelectorAll('li')).toHaveLength(3);
    const markdown = htmlToMarkdown(input);
    expect(markdown.indexOf('Before')).toBeLessThan(markdown.indexOf('Nested'));
    expect(markdown.indexOf('Nested')).toBeLessThan(markdown.indexOf('After'));
    expect(markdown.indexOf('After')).toBeLessThan(markdown.indexOf('Last'));
    expect(markdown).toContain('3. Before');
    const roundtrip = documentFor(markdownToHtml(markdown));
    expect(roundtrip.querySelector('ol').getAttribute('start')).toBe('3');
    const first = roundtrip.querySelector('ol > li');
    expect(first.querySelector('ul > li').textContent).toBe('Nested');
    expect(first.textContent).toContain('After');
    expect(roundtrip.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('distinguishes explicit plain text, rich HTML and Markdown', () => {
    expect(renderContentText({ text: 'Vector<T>', format: 'text' })).toBe('Vector&lt;T&gt;');
    expect(renderContentText({ text: 'old', html: '<strong>Rich</strong>' })).toBe('<strong>Rich</strong>');
    expect(renderContentText({ text: '**Markdown**' })).toBe('<strong>Markdown</strong>');
  });

  it('retains text through deeply nested rich formatting without recursive overflow', () => {
    const input = '<strong>'.repeat(2000) + 'Deep text' + '</strong>'.repeat(2000);
    const result = htmlToMarkdown(input);
    expect(result).toContain('Deep text');
    expect(result.split('Deep text')).toHaveLength(2);
  });
});

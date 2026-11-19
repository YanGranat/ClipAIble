import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../../scripts/utils/html.js';
import {
  collectRenderedFragmentIds, decodeFragmentIdentifier, encodeFragmentIdentifier,
  resolveSourceFragment, rewriteHtmlFragmentLinks, rewriteMarkdownFragmentLinks
} from '../../scripts/generation/source-fragments.js';

const source = 'https://example.test/report?key=a%26b';

describe('Logical fragment identities and source references', () => {
  it.each(['x&y', 'x%26y', 'section-α', 'quoted"target', 'part(one)', 'literal%'])('preserves one URI encoding round for %s', id => {
    const encoded = '#' + encodeFragmentIdentifier(id);
    expect(resolveSourceFragment(encoded, source, new Set([id]))).toBe(encoded);
    expect(decodeFragmentIdentifier(encoded.slice(1))).toBe(id);
  });

  it('keeps percent-containing identifiers distinct from decoded punctuation', () => {
    expect(resolveSourceFragment('#x%26y', source, new Set(['x&y']))).toBe('#x%26y');
    expect(resolveSourceFragment('#x%2526y', source, new Set(['x%26y']))).toBe('#x%2526y');
    expect(resolveSourceFragment('#x%26y', source, new Set(['x%26y']))).toBe(source + '#x%26y');
  });

  it('compares the complete document resource without decoding opaque query values', () => {
    const ids = new Set(['section']);
    expect(resolveSourceFragment(source + '#section', source, ids)).toBe('#section');
    expect(resolveSourceFragment('https://example.test/report?key=a&b#section', source, ids)).toBe('https://example.test/report?key=a&b#section');
    expect(resolveSourceFragment('https://other.test/report?key=a%26b#section', source, ids)).toBe('https://other.test/report?key=a%26b#section');
    expect(resolveSourceFragment('https://example.test/Report?key=a%26b#section', source, ids)).toBe('https://example.test/Report?key=a%26b#section');
  });

  it('preserves an omitted target as an absolute source reference', () => {
    expect(resolveSourceFragment('#title-ref', source, new Set(['note']))).toBe(source + '#title-ref');
    expect(resolveSourceFragment('#', source, new Set())).toBe(source + '#');
    expect(resolveSourceFragment('#note', '', new Set())).toBe('#note');
    expect(resolveSourceFragment('javascript:alert(1)#note', source, new Set(['note']))).toBe('javascript:alert(1)#note');
  });

  it('preserves external text-fragment directives and their original URI syntax', () => {
    const href = 'https://other.test/guide?key=a%26b#section:~:text=begin-,alpha%20beta,end,-finish';
    expect(resolveSourceFragment(href, source, new Set(['section']))).toBe(href);
    expect(resolveSourceFragment('#:~:text=alpha,beta', source, new Set())).toBe(source + '#:~:text=alpha,beta');
    expect(rewriteHtmlFragmentLinks(`<a href="${href.replace('&', '&amp;')}">Evidence</a>`, source, new Set())).toContain('#section:~:text=begin-,alpha%20beta,end,-finish');
    expect(rewriteMarkdownFragmentLinks(`[Evidence](${href})`, source, new Set())).toBe(`[Evidence](${href})`);
  });

  it('preserves external fragment percent bytes and opaque query identity without re-encoding them as IDs', () => {
    for (const fragment of ['part%2fone', 'literal%2526', 'malformed%ZZ', 'part:label']) {
      const foreign = 'https://other.test/guide?key=a%26b#' + fragment;
      expect(resolveSourceFragment(foreign, source, new Set())).toBe(foreign);
      expect(resolveSourceFragment('#' + fragment, source, new Set())).toBe(source + '#' + fragment);
    }
    expect(resolveSourceFragment('https://example.test/report?key=a&b#:~:text=alpha,beta', source, new Set([':~:text=alpha,beta']))).toBe('https://example.test/report?key=a&b#:~:text=alpha,beta');
    expect(resolveSourceFragment('#part:label', source, new Set(['part:label']))).toBe('#part%3Alabel');
  });

  it('collects actual rendered IDs rather than code text or discarded HTML attributes', () => {
    const rendered = sanitizeHtml('<span id="x&amp;y">Marker</span><code><a id="literal"></a></code><div id="discarded">Body</div><script><a id="script"></a></script>');
    expect([...collectRenderedFragmentIds(rendered)]).toEqual(['x&y']);
  });

  it('changes only hyperlink attributes and preserves code, wording and attribute escaping', () => {
    const html = '<em>Before</em> <a title="A &amp; B" href="#omitted">source</a> <a href="#x%26y">retained</a><code><a href="#literal">code</a></code>';
    const result = rewriteHtmlFragmentLinks(html, source, new Set(['x&y']));
    expect(result).toBe('<em>Before</em> <a title="A &amp; B" href="https://example.test/report?key=a%26b#omitted">source</a> <a href="#x%26y">retained</a><code><a href="#literal">code</a></code>');
    expect(rewriteHtmlFragmentLinks(result, source, new Set(['x&y']))).toBe(result);
  });

  it('rewrites Markdown destinations without changing formatting, titles, code spans or fenced code', () => {
    const markdown = '**Read** [the note](#omitted "Reference title") and [the section](#section).\n`[literal](#missing)`\n```text\n[fenced](#missing)\n```\n~~~\n[also fenced](#missing)\n~~~\n\\[escaped](#missing)\n![image](#missing)';
    const expected = markdown.replace('[the note](#omitted', `[the note](${source}#omitted`);
    expect(rewriteMarkdownFragmentLinks(markdown, source, new Set(['section']))).toBe(expected);
    expect(rewriteMarkdownFragmentLinks(expected, source, new Set(['section']))).toBe(expected);
  });

  it('supports nested labels, angled destinations and escaped parentheses without malformed Markdown', () => {
    const markdown = '[the [nested] note](#part\\(one\\)) and [the omitted note](<#omitted>)';
    expect(rewriteMarkdownFragmentLinks(markdown, source, new Set(['part(one)']))).toBe(`[the [nested] note](#part%28one%29) and [the omitted note](<${source}#omitted>)`);
  });
});

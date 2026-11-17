import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { sanitizeHtml, sanitizeMarkdownHtml, cleanTitleFromServiceTokens } from '../../scripts/utils/html/html.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe.each([['inline', sanitizeHtml], ['markdown', sanitizeMarkdownHtml]])('%s attributes', (_name, sanitize) => {
  it.each(['worker', 'document'])('preserves parsed URL and title values in the %s context', (context) => {
    const document = new JSDOM('').window.document;
    vi.stubGlobal('document', context === 'document' ? document : undefined);
    const input = '<a href="https://example.org/article?x=1&amp;y=2" title="A &quot;quote&quot; &amp; more">Example</a>';
    const before = new JSDOM(input).window.document.querySelector('a');
    const after = new JSDOM(sanitize(input)).window.document.querySelector('a');
    expect(after.getAttribute('href')).toBe(before.getAttribute('href'));
    expect(after.getAttribute('title')).toBe(before.getAttribute('title'));
  });

  it('decodes each entity once', () => {
    const input = '<a href="https://example.org/?value=&amp;quot;">Example</a>';
    const anchor = new JSDOM(sanitize(input)).window.document.querySelector('a');
    expect(anchor.getAttribute('href')).toBe('https://example.org/?value=&quot;');
  });

  it.each(['javascript&#58;alert(1)', '&#106;avascript:alert(1)', 'java&#x09;script:alert(1)', 'data&colon;text/html,test'])('rejects encoded executable URL %s', (href) => {
    const anchor = new JSDOM(sanitize(`<a href="${href}">Example</a>`)).window.document.querySelector('a');
    expect(anchor.getAttribute('href')).toBe('#');
  });
});

it.each(['Token Economics', 'Budgeting Basics', 'A token of gratitude', 'C# and F# Basics'])('preserves ordinary title words in %s', (title) => {
  expect(cleanTitleFromServiceTokens(title)).toBe(title);
});

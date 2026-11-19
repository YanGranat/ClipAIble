import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { htmlToMarkdown, sanitizeHtml, sanitizeMarkdownHtml } from '../../scripts/utils/html.js';

const documentFor = value => new JSDOM(`<main>${value}</main>`).window.document;

describe('Markdown fragment targets', () => {
  it('preserves empty anchors and legacy named targets without adding text', () => {
    expect(htmlToMarkdown('<a id="target"></a>')).toBe('<a id="target"></a>');
    expect(htmlToMarkdown('<a name="named"></a>Text')).toBe('<a id="named"></a>Text');
  });

  it('retains reference and list-item targets with non-ASCII identifiers', () => {
    const input = '<sup id="ref:β"><a href="#note:猫">1</a></sup><ol start="4"><li id="note:猫">Note <a href="#ref:β">Back</a></li></ol>';
    const output = htmlToMarkdown(input);
    expect(output).toContain('<a id="ref:β"></a><sup>[1](#note:猫)</sup>');
    expect(output).toContain('[1](#note:猫)</sup>\n\n4. ');
    expect(output).toContain('4. <a id="note:猫"></a>Note [Back](#ref:β)');
  });

  it('retains only safe block-list identity attributes', () => {
    const input = '<ol><li id="first" id="second" onclick="run()">Text</li></ol>';
    const safe = documentFor(sanitizeMarkdownHtml(input));
    expect(safe.querySelector('li').getAttribute('id')).toBe('first');
    expect(safe.querySelector('li').getAttribute('onclick')).toBeNull();
    expect(sanitizeHtml(input)).not.toContain('<li');
    expect(htmlToMarkdown(input)).toContain('<a id="first"></a>');
    expect(htmlToMarkdown(input)).not.toContain('id="second"');
  });

  it('emits a shared target only once while retaining both text runs', () => {
    const output = htmlToMarkdown('<a id="shared"></a>First<span id="shared">Second</span>');
    expect(output.match(/id="shared"/g)).toHaveLength(1);
    expect(output).toContain('First');
    expect(output).toContain('Second');
  });

  it('escapes identity values and keeps event attributes and executable URLs inactive', () => {
    const output = htmlToMarkdown('<span id="memo&quot; onfocus=&quot;run()">Text</span><a href="javascript:run()">Bad</a>');
    const doc = documentFor(output);
    expect(doc.querySelector('[id]').id).toBe('memo" onfocus="run()');
    expect(doc.querySelector('[onfocus]')).toBeNull();
    expect(doc.querySelector('script')).toBeNull();
    expect(output).toContain('[Bad](#)');
  });
});

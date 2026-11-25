import { describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { applyCustomStyles, buildHtmlForPdf } from '../../scripts/generation/html-builder.js';

const colors = { bgColor: '#303030', textColor: '#b9b9b9', headingColor: '#cfcfcf', linkColor: '#6cacff' };

describe('document custom style boundary', () => {
  it.each(['fontFamily', 'bgColor', 'textColor', 'headingColor', 'linkColor'])('rejects HTML injection through %s', key => {
    let error;
    let html;
    try {
      const styles = applyCustomStyles('', 'single', { ...colors, [key]: '</style><div id="injected">Inserted</div><style>' });
      html = buildHtmlForPdf([{ type: 'paragraph', text: 'Original article' }], 'Sample title', '', styles);
    } catch (caught) { error = caught; }
    if (html) {
      const dom = new JSDOM(html, { url: 'https://example.org', virtualConsole: new VirtualConsole() });
      expect(Boolean(dom.window.document.querySelector('#injected'))).toBe(false);
      dom.window.close();
    }
    expect(error).toBeInstanceOf(Error);
  });

  it('preserves supported fonts, colors, and the configured font size', () => {
    const styles = applyCustomStyles('', 'single', { ...colors, fontFamily: 'Times New Roman', fontSize: '38' });
    const dom = new JSDOM(`<style>${styles}</style><p>Article</p>`);
    expect(dom.window.getComputedStyle(dom.window.document.body).fontFamily).toContain('Times New Roman');
    expect(dom.window.getComputedStyle(dom.window.document.body).fontSize).toBe('38px');
    expect(dom.window.getComputedStyle(dom.window.document.body).backgroundColor).toBe('rgb(48, 48, 48)');
    dom.window.close();
  });

  it.each([
    [{ bgColor: '#ffffff', textColor: '#202020' }, 'rgb(32, 32, 32)'],
    [{ bgColor: '#222222', textColor: '#eeeeee' }, 'rgb(238, 238, 238)']
  ])('keeps inline and fenced code readable in the selected palette', (palette, ink) => {
    const styles = applyCustomStyles('pre code {color: #aaa;}', 'multi', { ...colors, ...palette });
    const dom = new JSDOM(`<style>${styles}</style><pre><code>x</code></pre><p><code>x</code></p>`);
    const { document, getComputedStyle } = dom.window;
    for (const code of document.querySelectorAll('code')) expect(getComputedStyle(code).color).toBe(ink);
    expect(getComputedStyle(document.querySelector('pre code')).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    dom.window.close();
  });
});

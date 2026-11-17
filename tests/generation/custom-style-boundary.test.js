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
});

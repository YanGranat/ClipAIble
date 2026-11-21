import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';

const pages = [];
let source;
beforeAll(async () => { source = await generateExtractAutomaticallyInlined(); });
afterEach(() => { pages.splice(0).forEach(page => page.window.close()); });

async function extract(body) {
  const page = new JSDOM(`<!doctype html><title>Field report</title>${body}`, {
    url: 'https://example.test/report', runScripts: 'outside-only'
  });
  pages.push(page);
  page.window.console.log = () => {};
  page.window.eval(source.replace('export async function', 'async function') + '\nwindow.entry = extractAutomaticallyInlined;');
  const serialized = page.window.entry.toString();
  const entry = page.window.eval(`(${serialized})`);
  const before = page.window.document.body.innerHTML;
  const result = await entry(page.window.location.href, false, { content: 'article', title: 'h1' });
  expect(result.error).toBeUndefined();
  expect(page.window.document.body.innerHTML).toBe(before);
  return result;
}

describe('Serializable article runtime', () => {
  it('keeps imported helpers and configuration inside the serialized function', async () => {
    const result = await extract('<article><h1>Field report</h1><aside><h2>Summary</h2><p>Every independent observation remains available to the reader.</p></aside><p>The report ends with the measured conclusion.</p></article>');
    expect(result.content.map(item => item.text).join(' ')).toContain('Every independent observation');
    expect(result.content.map(item => item.text).join(' ')).toContain('measured conclusion');
  });

  it('retains reading text while filtering structurally owned navigation', async () => {
    const result = await extract('<article><h1>Field report</h1><nav><p>Next article</p></nav><p>The article analyzes how newsletter subscriptions change reading habits.</p></article>');
    expect(JSON.stringify(result.content)).not.toContain('Next article');
    expect(JSON.stringify(result.content)).toContain('newsletter subscriptions');
  });
});

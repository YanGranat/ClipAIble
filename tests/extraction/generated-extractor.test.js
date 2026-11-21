import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';
import { JSDOM } from 'jsdom';
import { extractAutomaticallyInlined } from '../../scripts/extraction/automatic.js';

it('ships the current generated extractor without build drift', async () => {
  const generated = await generateExtractAutomaticallyInlined();
  const shipped = await readFile(new URL('../../scripts/extraction/automatic.js', import.meta.url));
  const digest = value => createHash('sha256').update(value).digest('hex');
  expect(digest(shipped), 'Run npm run build:extraction after editing extractor sources.').toBe(digest(generated));
});

it('executes the shipped serialized function with its own selector helpers', async () => {
  const dom = new JSDOM('<main><h1>Independent article</h1><article><p>First retained paragraph.</p><h2>Notes</h2><p>Last retained paragraph.</p></article></main>', {
    url: 'https://example.org/article', runScripts: 'outside-only'
  });
  try {
    const run = dom.window.eval(`(${extractAutomaticallyInlined.toString()})`);
    const result = await run('https://example.org/article', false, { articleContainer: 'main', content: 'article' });
    expect(result.error).toBeUndefined();
    expect(result.selectorMatched).toBe(true);
    expect(result.content.map(item => item.text)).toEqual(['First retained paragraph.', 'Notes', 'Last retained paragraph.']);
  } finally {
    dom.window.close();
  }
});

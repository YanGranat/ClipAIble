import { expect, it } from 'vitest';
import { processContent } from '../../scripts/offscreen/pdf/core/content-processor.js';
import { extractTitle } from '../../scripts/offscreen/pdf/utils/title-extractor.js';

it('preserves the separately determined levels of repeated heading text', () => {
  const heading = (text, fontSize, pageNum, minY) => ({ type: 'heading', text, fontSize, pageNum, minY });
  const paragraph = (text, pageNum, minY) => ({ type: 'paragraph', text, fontSize: 12, pageNum, minY });
  const result = processContent([
    heading('Overview', 22, 1, 60),
    paragraph('A paragraph introducing the first section.', 1, 100),
    heading('Results', 22, 2, 60),
    paragraph('A paragraph introducing the results section.', 2, 100),
    heading('Overview', 15, 2, 240),
    paragraph('A paragraph providing an overview of the results.', 2, 280)
  ], { baseFontSize: 12 }, { title: 'Research Report' }, 'https://example.org/report.pdf');

  expect(result.elements.filter(element => element.type === 'heading').map(({ text, level }) => ({ text, level }))).toEqual([
    { text: 'Overview', level: 1 },
    { text: 'Results', level: 1 },
    { text: 'Overview', level: 2 }
  ]);
});

it('consumes the metadata-equivalent front title without removing a repeated body heading', () => {
  const metadataTitle = 'Caf\u00e9 Watch';
  const label = { type: 'heading', text: 'Field Notes', pageNum: 1, level: 1 };
  const issue = { type: 'paragraph', text: 'Edition 4', pageNum: 1, lines: [{}] };
  const coverTitle = { type: 'heading', text: 'Cafe\u0301\nWatch', pageNum: 1, level: 2 };
  const body = { type: 'paragraph', text: 'The first observation is recorded here.', pageNum: 1, lines: [{}] };
  const bodyHeading = { ...coverTitle, text: metadataTitle };
  const continuation = { ...bodyHeading, pageNum: 3 };
  const elements = [label, issue, coverTitle, body, bodyHeading, continuation];
  expect(extractTitle({ metadataTitle, elements, url: 'https://example.test/notes.pdf' })).toEqual({
    title: metadataTitle, elements: [label, issue, body, bodyHeading, continuation]
  });
  expect(extractTitle({ metadataTitle, elements: [label, body, bodyHeading], url: '' }).elements)
    .toEqual([label, body, bodyHeading]);
  expect(extractTitle({ metadataTitle, elements: [continuation], url: '' }).elements).toEqual([continuation]);
  expect(extractTitle({ metadataTitle, elements: [coverTitle], url: '' }).elements).toEqual([coverTitle]);
  expect(elements[2]).toBe(coverTitle);
});

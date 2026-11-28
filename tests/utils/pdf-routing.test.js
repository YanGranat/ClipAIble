import { expect, it, vi } from 'vitest';
import { detectPdfPage, isPdfTab, isPdfUrl } from '../../scripts/utils/pdf.js';

const viewer = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html';
it.each([
  ['https://example.org/document.PDF?download=1#page=2', true],
  ['https://example.org/download?type=pdf', true],
  ['https://example.org/download?content-type=application%2Fpdf', true],
  ['https://example.org/article?note=type=pdf', false],
  ['https://example.org/article?prototype=pdf', false],
  ['https://example.org/article#type=pdf', false],
  ['https://example.org/article?type=pdf-preview', false]
])('uses exact PDF URL fields: %s', (url, expected) => expect(isPdfUrl(url)).toBe(expected));

it.each(['https://example.org/files/42', 'file:///reading-room/report'])(
  'recognizes a PDF document with an extensionless address: %s',
  (url) => expect(detectPdfPage(url, url, 'application/pdf'))
    .toEqual({ isPdf: true, originalUrl: url })
);

it.each([
  ['https://example.org/files/42', 'text/html'],
  ['https://example.org/files/report.pdf', 'text/html'],
  ['https://example.org/search?type=pdf', 'text/html'],
  ['https://example.org/files/42', 'application/pdf-preview'],
  ['data:application/pdf,example', 'application/pdf']
])('does not use an unsupported MIME or address as a PDF source: %s %s', (url, mime) => {
  expect(detectPdfPage(url, url, mime)).toBeNull();
});

it('does not use an embedded viewer to override the observed top-level page MIME', async () => {
  chrome.scripting.executeScript.mockResolvedValueOnce([{ result: 'text/html' }]);
  const existingNavigation = chrome.webNavigation;
  const getAllFrames = vi.fn();
  chrome.webNavigation = { getAllFrames };
  try {
    expect(await isPdfTab({ id: 21, url: 'https://example.org/search?type=pdf' })).toBe(false);
    expect(getAllFrames).not.toHaveBeenCalled();
  } finally {
    chrome.webNavigation = existingNavigation;
  }
});

it.each(['https://example.org/storage/report', 'file:///reports/survey.pdf'])('retains the original native viewer source: %s', async originalUrl => {
  const url = `${viewer}?file=${encodeURIComponent(originalUrl)}`;
  expect(await isPdfTab({ id: 21, url })).toBe(true);
  expect(detectPdfPage(url, url, 'application/pdf')).toEqual({ isPdf: true, originalUrl });
});

it('does not recognize another extension as the built-in browser viewer', async () => {
  const url = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/other.html?file=report.pdf';
  expect(await isPdfTab({ id: 21, url })).toBe(false);
  expect(detectPdfPage(url, url, 'application/pdf')).toBeNull();
});

it.each([
  [0, 'https://example.org/storage/report', true],
  [0, 'https://example.org/other', false],
  [5, 'https://example.org/storage/report', false]
])('uses unavailable-MIME viewer evidence only for the top-level tab (%s, %s)', async (parentFrameId, rootUrl, expected) => {
  const url = 'https://example.org/storage/report';
  chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents'));
  const existingNavigation = chrome.webNavigation;
  chrome.webNavigation = { getAllFrames: vi.fn(async () => [
    { frameId: 0, parentFrameId: -1, url: rootUrl },
    { frameId: 2, parentFrameId, url: viewer }
  ]) };
  try {
    expect(await isPdfTab({ id: 21, url })).toBe(expected);
  } finally {
    chrome.webNavigation = existingNavigation;
  }
});

// @ts-check
import { parseBase64Image } from '../api/image-data.js';
import { logWarn } from '../utils/logging.js';
import { closesPdfMarkdownFence, readPdfMarkdownFence } from './pdf-markdown.js';

const FIGURE = /^\[Figure: (\d{1,4}),\s*(\d{1,4}),\s*(\d{1,4}),\s*(\d{1,4})\]$/i;
const CAPTION = /^\[Caption\]\s+(.+)$/i;
const MAX_PAGE_FIGURES = 24;
const MAX_FIGURE_BYTES = 64 * 1024 * 1024;

/** Crop source pixels at model-supplied boxes in the rendered page coordinate space. */
export async function preservePdfFigures(markdown, imageData, pageNum, figures, checkCancelled) {
  const lines = markdown.split('\n');
  const requests = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const delimiter = readPdfMarkdownFence(line);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (closesPdfMarkdownFence(fence, line)) fence = null;
      continue;
    }
    if (fence) continue;
    const match = FIGURE.exec(line);
    if (!match && line !== '[Figure]') continue;
    let captionIndex = i + 1;
    while (captionIndex < lines.length && !lines[captionIndex].trim()) captionIndex++;
    const caption = CAPTION.exec(lines[captionIndex]?.trim() || '')?.[1];
    if (caption) lines[captionIndex] = `\n${caption}`;
    if (!match) continue;
    const [left, top, right, bottom] = match.slice(1).map(Number);
    lines[i] = '[Figure]';
    if (requests.length < MAX_PAGE_FIGURES && right <= 1000 && bottom <= 1000 &&
        right - left >= 10 && bottom - top >= 10 &&
        (right - left) * (bottom - top) < 950000) {
      requests.push({ i, left, top, right, bottom, caption, captionIndex });
    }
  }
  if (!requests.length || figures.bytes >= MAX_FIGURE_BYTES) return lines.join('\n');

  let bitmap;
  try {
    await checkCancelled();
    const { base64Image, mimeType } = parseBase64Image(imageData);
    const bytes = Uint8Array.from(atob(base64Image), value => value.charCodeAt(0));
    bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
    for (const { i, left, top, right, bottom, caption, captionIndex } of requests) {
      await checkCancelled();
      const x = Math.floor(left * bitmap.width / 1000);
      const y = Math.floor(top * bitmap.height / 1000);
      const width = Math.ceil(right * bitmap.width / 1000) - x;
      const height = Math.ceil(bottom * bitmap.height / 1000) - y;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) break;
      context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      canvas.width = canvas.height = 0;
      if (!blob.size || figures.bytes + blob.size > MAX_FIGURE_BYTES) break;
      const cropped = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < cropped.length; offset += 32768) {
        binary += String.fromCharCode(...cropped.subarray(offset, offset + 32768));
      }
      const id = '[[pdf-crop:' + crypto.randomUUID() + ']]';
      figures.items.set(id, { type: 'image', src: 'data:image/jpeg;base64,' + btoa(binary), alt: '', caption, captionFormat: 'markdown' });
      figures.bytes += blob.size;
      lines[i] = id;
      if (caption) lines[captionIndex] = '';
    }
  } catch (error) {
    await checkCancelled();
    logWarn('Could not preserve a PDF figure', { pageNum, error: error.name });
  } finally {
    bitmap?.close();
  }
  await checkCancelled();
  return lines.join('\n');
}

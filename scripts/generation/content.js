import { decodeHtmlEntities } from '../utils/html.js';

const captionValue = value => (typeof value === 'string' ? value : '').trim();

function imageUrl(value, sourceUrl) {
  try { return new URL(value, sourceUrl || undefined).href; }
  catch { return value; }
}

/** Remove only figure markup whose image and caption are repeated by the next item. */
export function filterFigureParagraphs(content, sourceUrl = '') {
  if (!Array.isArray(content)) return content;
  return content.flatMap((item, index) => {
    const next = content[index + 1];
    if (item.type !== 'paragraph' || next?.type !== 'image' || typeof next.src !== 'string' || !next.src) return [item];
    if (next.caption != null && typeof next.caption !== 'string') return [item];
    const field = item.text ? 'text' : 'html';
    const original = item[field];
    if (typeof original !== 'string') return [item];
    if ((original.match(/<figure\b/gi) || []).length !== 1) return [item];
    const cleaned = original.replace(/<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi, figure => {
      if ((figure.match(/<figure\b/gi) || []).length !== 1) return figure;
      const images = [...figure.matchAll(/<img\b[^>]*>/gi)];
      const captions = [...figure.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption\s*>/gi)];
      if (images.length !== 1 || captions.length > 1) return figure;
      const src = images[0][0].match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!src || imageUrl(decodeHtmlEntities(src[1] ?? src[2] ?? src[3], true), sourceUrl) !== imageUrl(next.src, sourceUrl)) return figure;
      if (captionValue(captions[0]?.[1]) !== captionValue(next.caption)) return figure;
      const rest = figure.replace(images[0][0], '').replace(captions[0]?.[0] || /$^/, '')
        .replace(/<\/?figure\b[^>]*>/gi, '').replace(/<\/?(?:a|span|div)\b[^>]*>/gi, '').trim();
      return rest ? figure : '';
    });
    if (cleaned === original) return [item];
    if (!cleaned.replace(/<\/?(?:a|span|div|p|font)\b[^>]*>/gi, '').trim()) return [];
    const updated = { ...item, [field]: cleaned };
    if (item.text === item.html) updated.html = cleaned;
    return [updated];
  });
}

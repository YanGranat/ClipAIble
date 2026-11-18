// @ts-check
import { renderContentText, sanitizeMarkdownHtml, sanitizeHtml, markdownToHtml, htmlToMarkdown, stripHtml, escapeHtml } from '../utils/html.js';
import { isNativePdfContent } from './xml.js';
import { filterFigureParagraphs } from './content.js';

export function documentText(item, sourceUrl = '') {
  return renderContentText(isNativePdfContent(item) ? { ...item, format: 'text' } : item, sourceUrl);
}
export function documentPlainText(item, sourceUrl = '') { return stripHtml(documentText(item, sourceUrl)); }
export function documentMarkdown(item, sourceUrl = '') {
  if (item?.format === 'text' || isNativePdfContent(item)) return String(item.text || '').replace(/[\\`*_{}\[\]<>]/g, '\\$&');
  return typeof item?.html === 'string' ? htmlToMarkdown(item.html, sourceUrl) : String(item?.text || '');
}
export function tableCellHtml(item, value, sourceUrl = '') {
  if (item.cellFormat === 'text' || isNativePdfContent(item)) return escapeHtml(String(value ?? ''));
  if (item.cellFormat === 'html') return sanitizeHtml(String(value ?? ''), sourceUrl);
  return markdownToHtml(String(value ?? ''), sourceUrl);
}
export function listHtml(item, sourceUrl = '') {
  const tag = item.ordered ? 'ol' : 'ul';
  const start = Number.isInteger(item.start) ? ` start="${item.start}"` : '';
  return `<${tag}${start}>${(Array.isArray(item.items) ? item.items : []).filter(value => value != null).map(value => {
    const html = typeof value === 'string' ? markdownToHtml(value, sourceUrl) :
      typeof value.html === 'string' ? sanitizeMarkdownHtml(value.html, sourceUrl) : documentText(value, sourceUrl);
    const id = typeof value === 'object' && value.id ? ` id="${escapeHtml(value.id)}"` : '';
    return `<li${id}>${html}</li>`;
  }).join('')}</${tag}>`;
}

/** Assign heading identity once, before collecting navigation or rendering content. */
export function normalizeDocumentContent(content, title = '', sourceUrl = '') {
  let beforeBody = true;
  const ids = new Set();
  return filterFigureParagraphs(content, sourceUrl).flatMap((source, index) => {
    const item = { ...source };
    for (const field of ['text', 'code']) {
      if (item[field] != null && typeof item[field] !== 'string') {
        item[field] = ['number', 'boolean'].includes(typeof item[field]) ? String(item[field]) : '';
      }
    }
    if (item.type === 'heading') {
      const text = documentPlainText(item, sourceUrl).trim().replace(/\s+/g, ' ');
      if (beforeBody && item.level === 1) {
        beforeBody = false;
        if (text && text.toLowerCase() === String(title).trim().replace(/\s+/g, ' ').toLowerCase()) return [];
      }
      let id = item.id || `heading-${index}`;
      const base = id;
      let suffix = 2;
      while (ids.has(id)) id = `${base}-${suffix++}`;
      ids.add(id); item.id = id;
    }
    if (!['image', 'subtitle', 'hr', 'divider', 'separator'].includes(item.type)) beforeBody = false;
    return [item];
  });
}

// @ts-check
import { renderContentText, sanitizeMarkdownHtml, sanitizeHtml, markdownToHtml, htmlToMarkdown, stripHtml, escapeHtml } from '../utils/html.js';
import { isNativePdfContent } from './xml.js';
import { filterFigureParagraphs } from './content.js';
import { collectRenderedFragmentIds, rewriteHtmlFragmentLinks, rewriteMarkdownFragmentLinks } from './source-fragments.js';

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
    const html = listItemHtml(value, sourceUrl);
    const id = typeof value === 'object' && value.id ? ` id="${escapeHtml(value.id)}"` : '';
    return `<li${id}>${html}</li>`;
  }).join('')}</${tag}>`;
}

export function listItemHtml(value, sourceUrl = '') {
  return typeof value === 'string' ? markdownToHtml(value, sourceUrl) :
    typeof value?.html === 'string' ? sanitizeMarkdownHtml(value.html, sourceUrl) : documentText(value, sourceUrl);
}

/** Project only the fields consumed by document renderers, retaining their source format. */
function fragmentViews(content, sourceUrl) {
  const views = [], blockIds = new Set();
  const addId = value => { if (value) blockIds.add(String(value)); };
  const addView = (rendered, holder, key, html, collect = true) => {
    const raw = holder[key];
    if (typeof raw !== 'string') return;
    const mirrorText = key === 'html' && holder.text === raw;
    views.push({ rendered, collect, write(targetIds) {
      const value = html ? rewriteHtmlFragmentLinks(raw, sourceUrl, targetIds) : rewriteMarkdownFragmentLinks(raw, sourceUrl, targetIds);
      holder[key] = value;
      if (mirrorText) holder.text = value;
    } });
  };
  for (const item of content) {
    const literal = item.format === 'text' || isNativePdfContent(item);
    if (['paragraph', 'heading', 'quote', 'blockquote', 'subtitle'].includes(item.type)) {
      const rendered = documentText(item, sourceUrl);
      if ((item.type === 'paragraph' && rendered.trim()) || (item.type === 'heading' && documentPlainText(item, sourceUrl).trim())) addId(item.id);
      if (item.type === 'heading' || item.type === 'subtitle') {
        if (!literal) addView(rendered, item, typeof item.html === 'string' ? 'html' : 'text', typeof item.html === 'string', false);
      } else if (!literal) {
        addView(rendered, item, typeof item.html === 'string' ? 'html' : 'text', typeof item.html === 'string');
      }
    } else if (item.type === 'list' && Array.isArray(item.items)) {
      item.items = item.items.map(value => value && typeof value === 'object' ? { ...value } : value);
      for (const [index, value] of item.items.entries()) {
        if (value == null) continue;
        const rendered = listItemHtml(value, sourceUrl);
        if (rendered.trim() && typeof value === 'object') addId(value.id);
        if (literal || value?.format === 'text' || isNativePdfContent(value)) continue;
        if (typeof value === 'string') addView(rendered, item.items, index, false);
        else addView(rendered, value, typeof value.html === 'string' ? 'html' : 'text', typeof value.html === 'string');
      }
    } else if (item.type === 'image' && !literal && typeof item.caption === 'string') {
      const html = /<[a-z][^>]*>/i.test(item.caption);
      addView(html ? sanitizeHtml(item.caption, sourceUrl) : markdownToHtml(item.caption, sourceUrl), item, 'caption', html, false);
    } else if (item.type === 'table') {
      if (literal || item.cellFormat === 'text') continue;
      if (Array.isArray(item.headers)) {
        item.headers = [...item.headers];
        for (const [index, value] of item.headers.entries()) addView(tableCellHtml(item, value, sourceUrl), item.headers, index, item.cellFormat === 'html');
      }
      if (Array.isArray(item.rows)) {
        item.rows = item.rows.map(row => Array.isArray(row) ? [...row] : row);
        for (const row of item.rows) if (Array.isArray(row)) {
          for (const [index, value] of row.entries()) addView(tableCellHtml(item, value, sourceUrl), row, index, item.cellFormat === 'html');
        }
      }
    }
  }
  return { views, blockIds };
}

/** Assign heading identity once, before collecting navigation or rendering content. */
export function normalizeDocumentContent(content, title = '', sourceUrl = '', { inlineFragmentTargets = true } = {}) {
  let beforeBody = true;
  const ids = new Set();
  const sourceIndices = new Map();
  const originals = content.map(source => {
    const item = { ...source };
    for (const field of ['text', 'code']) {
      if (item[field] != null && typeof item[field] !== 'string') {
        item[field] = ['number', 'boolean'].includes(typeof item[field]) ? String(item[field]) : '';
      }
    }
    return item;
  });
  const reserved = new Set();
  {
    const originalProjection = fragmentViews(originals.map(item => ({ ...item })), sourceUrl);
    for (const id of originalProjection.blockIds) reserved.add(id);
    for (const view of originalProjection.views) for (const id of collectRenderedFragmentIds(view.rendered)) reserved.add(id);
  }
  const normalized = filterFigureParagraphs(originals, sourceUrl).flatMap((source, index) => {
    const item = { ...source };
    sourceIndices.set(item, index);
    if (item.type === 'heading') {
      const text = documentPlainText(item, sourceUrl).trim().replace(/\s+/g, ' ');
      if (beforeBody && item.level === 1) {
        beforeBody = false;
        if (text && text.toLowerCase() === String(title).trim().replace(/\s+/g, ' ').toLowerCase()) return [];
      }
    }
    if (!['image', 'subtitle', 'hr', 'divider', 'separator'].includes(item.type)) beforeBody = false;
    return [item];
  });
  const projection = fragmentViews(normalized, sourceUrl);
  for (const id of projection.blockIds) reserved.add(id);
  for (const view of projection.views) for (const id of collectRenderedFragmentIds(view.rendered)) reserved.add(id);
  for (const item of normalized) {
    if (item.type !== 'heading') continue;
    const authoredId = String(item.id || '');
    let id = authoredId || `heading-${sourceIndices.get(item)}`;
    const base = id;
    let suffix = 2;
    while (ids.has(id) || (id !== authoredId && reserved.has(id))) id = `${base}-${suffix++}`;
    ids.add(id); item.id = id;
  }
  const targets = new Set(projection.blockIds);
  for (const view of projection.views) if (view.collect) {
    for (const id of collectRenderedFragmentIds(view.rendered, inlineFragmentTargets)) targets.add(id);
  }
  for (const view of projection.views) view.write(targets);
  return normalized;
}

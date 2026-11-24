// @ts-check
import { renderContentText, sanitizeMarkdownHtml, sanitizeHtml, markdownToHtml, htmlToMarkdown, stripHtml, escapeHtml, removeHtmlAttributes } from '../utils/html.js';
import { isNativePdfContent, escapeXml, serializeXmlInline } from './xml.js';
import { filterFigureParagraphs } from './content.js';
import { collectRenderedFragmentIds, rewriteHtmlFragmentLinks, rewriteMarkdownFragmentLinks } from './source-fragments.js';

/** Return only a local source's filename, omitting its directory and page fragment. */
export function localDocumentName(sourceUrl) {
  if (!/^file:/i.test(sourceUrl)) return null;
  let name;
  try {
    name = new URL(sourceUrl).pathname.split('/').at(-1);
  } catch {
    return '';
  }
  try { return decodeURIComponent(name); }
  catch { return name; }
}

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

/** Read the value grid shared by every table projection. */
export function tableValueRows(item) {
  const rows = Array.isArray(item.rows) ? item.rows : [];
  return Array.isArray(item.headers) && item.headers.length ? [item.headers, ...rows] : rows;
}

/** Validate physical ownership before using spans to suppress repeated grid slots. */
export function verifiedTableLayout(item) {
  const values = tableValueRows(item);
  const layout = item.layoutRows;
  if (!Array.isArray(layout) || !layout.length || layout.length !== values.length || values.some(row => !Array.isArray(row))) return null;
  const columns = Math.max(0, ...values.map(row => row.length));
  if (!columns) return null;
  const groups = { head: 0, body: 1, foot: 2 };
  for (let row = 0; row < layout.length; row++) {
    const current = layout[row];
    if (!current || !Object.hasOwn(groups, current.group) || !Array.isArray(current.cells) ||
        (current.groupStart !== undefined && typeof current.groupStart !== 'boolean') ||
        (row && groups[current.group] < groups[layout[row - 1].group])) return null;
    if (row && current.group === layout[row - 1].group && current.group !== 'body' && current.groupStart) return null;
  }
  const owners = values.map(() => Array(columns).fill(null));
  const origins = [], aliases = [];
  for (let row = 0; row < layout.length; row++) {
    let groupEnd = row + 1;
    while (groupEnd < layout.length && layout[groupEnd].group === layout[row].group && !layout[groupEnd].groupStart) groupEnd++;
    for (const cell of layout[row].cells) {
      if (!cell || !Number.isInteger(cell.column) || cell.column < 0 || cell.column >= values[row].length ||
          !Number.isInteger(cell.rowSpan) || cell.rowSpan < 1 || row + cell.rowSpan > groupEnd ||
          !Number.isInteger(cell.colSpan) || cell.colSpan < 1 || cell.column + cell.colSpan > columns ||
          typeof cell.header !== 'boolean' || (cell.scope !== undefined &&
            (!cell.header || !['row', 'col', 'rowgroup', 'colgroup'].includes(cell.scope)))) return null;
      const origin = { row, column: cell.column, cell };
      const text = String(values[row][cell.column] ?? '');
      const derived = item.cellFormat === 'html' ? removeHtmlAttributes(text, ['id', 'name']) : text;
      for (let down = row; down < row + cell.rowSpan; down++) for (let across = cell.column; across < cell.column + cell.colSpan; across++) {
        if (owners[down][across]) return null;
        const value = String(values[down][across] ?? '');
        if (value !== text && value !== derived) return null;
        owners[down][across] = origin;
        if (down !== row || across !== cell.column) aliases.push({ row: down, column: across, origin });
      }
      origins.push(origin);
    }
  }
  if (values.some((row, rowIndex) => row.some((value, column) => !owners[rowIndex][column] && String(value ?? '') !== ''))) return null;
  return { values, rows: layout, columns, owners, origins, aliases };
}

/** Update only aliases whose physical ownership was verified before translation. */
export function synchronizeTableAliases(item, layout) {
  for (const alias of layout.aliases) {
    const value = layout.values[alias.origin.row][alias.origin.column];
    layout.values[alias.row][alias.column] = item.cellFormat === 'html'
      ? removeHtmlAttributes(String(value ?? ''), ['id', 'name']) : value;
  }
}

/** Project multi-row column headers into formats without merged cells. */
export function flatTableProjection(item) {
  const layout = verifiedTableLayout(item);
  const rowsWithAnnotations = layout && layout.values.map((row, rowIndex) => row.map((value, column) =>
    value != null && String(value).trim() && layout.owners[rowIndex][column]?.cell.muted === true ? `${value} (gray)` : value));
  let headerCount = 0;
  if (layout) while (layout.rows[headerCount]?.group === 'head') headerCount++;
  if (!layout) return { headers: item.headers, rows: item.rows, hasHeaders: item.hasHeaders };
  if (headerCount < 2) return {
    headers: item.headers?.length ? rowsWithAnnotations[0] : item.headers,
    rows: rowsWithAnnotations.slice(item.headers?.length ? 1 : 0), hasHeaders: item.hasHeaders
  };
  const emitted = new Set();
  const headers = Array.from({ length: layout.columns }, (_, column) => {
    const seen = new Set(), parts = [];
    for (let row = 0; row < headerCount; row++) {
      const owner = layout.owners[row][column];
      if (!owner || seen.has(owner)) continue;
      seen.add(owner);
      let value = String(rowsWithAnnotations[owner.row][owner.column] ?? '');
      if (item.cellFormat === 'html' && emitted.has(owner)) value = removeHtmlAttributes(value, ['id', 'name']);
      emitted.add(owner);
      if (value) parts.push(value);
    }
    return parts.join(item.cellFormat === 'text' || isNativePdfContent(item) ? '\n' : '<br>');
  });
  return { headers, rows: rowsWithAnnotations.slice(headerCount), hasHeaders: true };
}

/** Render physical cells from the canonical value grid, with a flat fallback. */
export function renderTableHtml(item, sourceUrl = '', { xhtml = false, assumeFirstRowHeader = false } = {}) {
  const values = tableValueRows(item);
  if (!values.length) return '';
  const render = value => {
    const html = tableCellHtml(item, value, sourceUrl);
    return xhtml ? serializeXmlInline(html, 'xhtml') : html;
  };
  const escapeAttribute = xhtml ? escapeXml : escapeHtml;
  const id = item.id ? ` id="${escapeAttribute(item.id)}"` : '';
  const layout = verifiedTableLayout(item);
  if (!layout) {
    const hasHeaders = item.hasHeaders !== false && (assumeFirstRowHeader || item.hasHeaders === true ||
      (Array.isArray(item.headers) && item.headers.length > 0));
    const headers = hasHeaders ? `<thead><tr>${(values[0] || []).map(value => `<th>${render(value)}</th>`).join('')}</tr></thead>` : '';
    const body = values.slice(hasHeaders ? 1 : 0).filter(Array.isArray)
      .map(row => `<tr>${row.map(value => `<td>${render(value)}</td>`).join('')}</tr>`).join('');
    return `<table${id}>${headers}<tbody>${body}</tbody></table>`;
  }
  let html = `<table${id}>`, previousGroup = '';
  const groups = Array.isArray(item.columnGroups) ? item.columnGroups : [];
  if (groups.every(span => Number.isInteger(span) && span > 0) && groups.reduce((width, span) => width + span, 0) <= layout.columns) {
    html += groups.map(span => `<colgroup span="${span}"></colgroup>`).join('');
  }
  const headingIds = new Set(layout.origins.filter(origin => origin.cell.header && typeof origin.cell.id === 'string').map(origin => origin.cell.id));
  const tags = { head: 'thead', body: 'tbody', foot: 'tfoot' };
  for (const [rowIndex, row] of layout.rows.entries()) {
    const group = tags[row.group];
    if (group !== previousGroup || row.groupStart) {
      if (previousGroup) html += `</${previousGroup}>`;
      html += `<${group}>`; previousGroup = group;
    }
    html += '<tr>';
    for (let column = 0; column < layout.columns;) {
      const owner = layout.owners[rowIndex][column];
      if (!owner) { html += row.group === 'head' ? '<th></th>' : '<td></td>'; column++; continue; }
      if (owner.row !== rowIndex || owner.column !== column) { column++; continue; }
      const cell = owner.cell, tag = cell.header ? 'th' : 'td';
      const attributes = (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '') +
        (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '') + (cell.scope ? ` scope="${cell.scope}"` : '') +
        (typeof cell.id === 'string' && cell.id ? ` id="${escapeAttribute(cell.id)}"` : '') +
        (Array.isArray(cell.headerIds) ? ` headers="${escapeAttribute(cell.headerIds.filter(id => headingIds.has(id) && id !== cell.id).join(' '))}"` : '') +
        (cell.muted === true ? ' class="table-muted"' : '');
      html += `<${tag}${attributes}>${render(layout.values[rowIndex][column])}</${tag}>`;
      column += cell.colSpan;
    }
    html += '</tr>';
  }
  return `${html}</${previousGroup}></table>`;
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
function fragmentViews(content, sourceUrl, tableCellFragmentTargets) {
  const views = [], blockIds = new Set();
  const addId = value => { if (value) blockIds.add(String(value)); };
  const addView = (rendered, holder, key, html, collect = true) => {
    const raw = holder[key];
    if (typeof raw !== 'string') return;
    const mirrorText = key === 'html' && holder.text === raw;
    views.push({ rendered, collect, write(targetIds, aliases) {
      const value = html ? rewriteHtmlFragmentLinks(raw, sourceUrl, targetIds, aliases) : rewriteMarkdownFragmentLinks(raw, sourceUrl, targetIds, aliases);
      holder[key] = value;
      if (mirrorText) holder.text = value;
    } });
  };
  for (const item of content) {
    const literal = item.format === 'text' || isNativePdfContent(item);
    if (item.type === 'image' && (item.src || item.base64)) addId(item.id);
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
      if (tableCellFragmentTargets) {
        addId(item.id);
        for (const origin of verifiedTableLayout(item)?.origins || []) addId(origin.cell.id);
      }
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

/** Assign title and heading identity before collecting navigation or rendering. */
export function prepareDocumentContent(content, title = '', sourceUrl = '', { titleFragmentIds = [], inlineFragmentTargets = true, tableCellFragmentTargets = false } = {}) {
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
    const originalProjection = fragmentViews(originals.map(item => ({ ...item })), sourceUrl, tableCellFragmentTargets);
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
  const projection = fragmentViews(normalized, sourceUrl, tableCellFragmentTargets);
  for (const id of projection.blockIds) reserved.add(id);
  for (const view of projection.views) for (const id of collectRenderedFragmentIds(view.rendered)) reserved.add(id);
  const headingSources = new Map(normalized.filter(item => item.type === 'heading').map(item =>
    [item, Array.isArray(item.sourceFragmentIds) ? item.sourceFragmentIds.filter(id => typeof id === 'string' && id) : []]));
  for (const sourceIds of headingSources.values()) for (const id of sourceIds) reserved.add(id);
  const aliases = new Map();
  const titleIds = title && Array.isArray(titleFragmentIds) ? titleFragmentIds.filter(id => typeof id === 'string' && id) : [];
  let titleId;
  if (titleIds.length) {
    const preferred = titleIds[0];
    titleId = preferred;
    let suffix = 2;
    while (reserved.has(titleId)) titleId = `${preferred}-${suffix++}`;
    for (const id of titleIds) {
      reserved.add(id);
      aliases.set(id, titleId);
    }
    ids.add(titleId);
  }
  for (const item of normalized) {
    if (item.type !== 'heading') continue;
    const authoredId = String(item.id || '');
    let id = authoredId || `heading-${sourceIndices.get(item)}`;
    const base = id;
    let suffix = 2;
    while (ids.has(id) || (id !== authoredId && reserved.has(id))) id = `${base}-${suffix++}`;
    ids.add(id); item.id = id;
    for (const sourceId of headingSources.get(item) || []) {
      if (!aliases.has(sourceId)) aliases.set(sourceId, id);
    }
  }
  const targets = new Set(projection.blockIds);
  if (titleId) targets.add(titleId);
  for (const view of projection.views) if (view.collect) {
    for (const id of collectRenderedFragmentIds(view.rendered, inlineFragmentTargets)) targets.add(id);
  }
  for (const view of projection.views) view.write(targets, aliases);
  return { content: normalized, titleId };
}

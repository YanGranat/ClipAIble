// @ts-check

/** @typedef {import('../types.js').ContentItem} ContentItem */

const HEADING = /^(#{1,6})\s+(.+)$/;
const LIST_ITEM = /^([-*+]|\d+\.)\s+(.+)$/;

/** Identify a code fence using the same syntax in the crop and document passes. */
export function readPdfMarkdownFence(line) {
  return line.trim().match(/^(\x60{3,}|~{3,})(.*)$/);
}

export function closesPdfMarkdownFence(open, line) {
  const fence = readPdfMarkdownFence(line);
  return fence && fence[1][0] === open[0] && fence[1].length >= open.length && !fence[2].trim();
}

/** Split each physical cell exactly once, including cells at the table edges. */
function readTableRow(line = '') {
  const text = line.trim();
  const cells = [];
  let cell = '';
  let lastDelimiter = -1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '\\' && (next === '\\' || next === '|')) {
      cell += next === '|' ? '|' : '\\\\';
      index++;
    } else if (char === '|') {
      cells.push(cell.trim());
      cell = '';
      lastDelimiter = index;
    } else {
      cell += char;
    }
  }
  if (lastDelimiter < 0) return null;
  const leading = text.startsWith('|');
  const trailing = lastDelimiter === text.length - 1;
  if (leading) cells.shift();
  if (!trailing) cells.push(cell.trim());
  return { cells, enclosed: leading && trailing };
}

function readTable(lines, start) {
  const header = readTableRow(lines[start]);
  if (!header?.cells.length) return null;
  const separator = readTableRow(lines[start + 1]);
  const width = header.cells.length;
  if (separator?.cells.length !== width || !separator.cells.every(cell => /^:?-{3,}:?$/.test(cell))) return null;

  const rows = [];
  let next = start + 2;
  for (; next < lines.length; next++) {
    const row = readTableRow(lines[next]);
    if (row?.cells.length !== width || (header.enclosed && !row.enclosed)) break;
    rows.push(row.cells);
  }
  return { headers: header.cells, rows, next };
}

/** Apply continuation hints only at boundaries that can be joined as prose. */
export function joinPdfMarkdownPages(parts, figures) {
  const figure = text => figures.has(text) || text === '[Figure]';
  const structured = text => HEADING.test(text) || readPdfMarkdownFence(text) || readTableRow(text)?.enclosed;
  let markdown = '';
  for (const part of parts) {
    const next = part.markdown.trim();
    if (!next) continue;
    if (markdown) {
      const lastLine = markdown.slice(markdown.lastIndexOf('\n') + 1).trim();
      const firstLine = next.split('\n', 1)[0].trim();
      if (figure(lastLine) || figure(firstLine)) {
        markdown += '\n\n';
      } else if (part.mergeWithPrevious === 'direct') {
        markdown += structured(lastLine) || structured(firstLine) || LIST_ITEM.test(firstLine) ? '\n' : ' ';
      } else {
        markdown += part.mergeWithPrevious === 'newline' ? '\n' : '\n\n';
      }
    }
    markdown += next;
  }
  return markdown;
}

/**
 * Parse the page transcription into the shared document model. Only a leading
 * level-one heading can be promoted into or consumed by the document title.
 * @param {string} markdown
 * @param {Map<string, ContentItem>} figures
 * @param {string} fallbackTitle
 * @param {boolean} hasMetadataTitle
 */
export function parsePdfMarkdown(markdown, figures, fallbackTitle, hasMetadataTitle) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  /** @type {ContentItem[]} */
  const content = [];
  const paragraphs = [];
  /** @type {ContentItem|null} */
  let list = null;
  let title = fallbackTitle;
  let readingStarted = false;

  function emit(item) {
    content.push(item);
    if (item.type !== 'image') readingStarted = true;
  }

  function flush() {
    if (paragraphs.length) {
      emit({ type: 'paragraph', text: paragraphs.join(' ') });
      paragraphs.length = 0;
    }
    if (list) {
      emit(list);
      list = null;
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index].trim();
    if (!text) {
      flush();
      continue;
    }

    const fence = readPdfMarkdownFence(text);
    if (fence) {
      flush();
      const code = [];
      while (++index < lines.length && !closesPdfMarkdownFence(fence[1], lines[index])) code.push(lines[index]);
      emit({ type: 'code', format: 'text', text: code.join('\n'), language: fence[2].trim().split(/\s+/)[0] });
      continue;
    }

    const figure = figures.get(text);
    if (figure) {
      flush();
      emit(figure);
      lines[index] = ['[Figure]', figure.caption].filter(Boolean).join('\n\n');
      continue;
    }

    const heading = text.match(HEADING);
    if (heading) {
      flush();
      const level = heading[1].length;
      const label = heading[2].trim();
      if (level === 1 && !readingStarted && lines.slice(index + 1).some(line => line.trim())) {
        const matchesMetadata = label.toLowerCase() === title.trim().toLowerCase();
        const plausibleTitle = label.length > 10 && !/\.pdf$/i.test(label) && !/^\d+[-_]/.test(label);
        if (hasMetadataTitle ? matchesMetadata : plausibleTitle) {
          if (!hasMetadataTitle) title = label;
          readingStarted = true;
          lines[index] = '';
          continue;
        }
      }
      emit({ type: 'heading', level, text: label });
      continue;
    }

    const table = text.includes('|') ? readTable(lines, index) : null;
    if (table) {
      flush();
      emit({ type: 'table', headers: table.headers, rows: table.rows, hasHeaders: true });
      index = table.next - 1;
      continue;
    }

    const item = text.match(LIST_ITEM);
    if (item) {
      const ordered = /^\d/.test(item[1]);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { type: 'list', ordered, items: [] };
      }
      list.items.push(item[2]);
      continue;
    }

    if (list) flush();
    paragraphs.push(text);
  }
  flush();
  return { title, content, markdown: lines.join('\n').trim() };
}

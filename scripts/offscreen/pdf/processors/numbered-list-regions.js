// @ts-check
import { calculateLineRight } from '../analyzers/column-detection-helpers.js';
import { joinPdfText } from '../utils/text-join.js';

const DETACHED_NUMBER = /^(0|[1-9]\d{0,3})\.$/;
const positionTolerance = em => em * 0.25;

function rowBody(lines, em) {
  if (!lines.length || lines.some(line => !line.text.trim())) return '';
  for (let index = 1; index < lines.length; index++) {
    const gap = lines[index].x - calculateLineRight(lines[index - 1], em);
    if (gap > em * 0.75 || gap < -positionTolerance(em)) return '';
  }
  return lines.reduce((text, line) => joinPdfText(text, line.text), '');
}

/** Recognize a number printed as a separate item to the left of its text. */
function numberedStart(row, em) {
  const [marker, ...body] = row.lines;
  const found = DETACHED_NUMBER.exec(marker.text.trim());
  if (!found || !body.length) return null;
  const right = calculateLineRight(marker, em);
  const bodyX = body[0].x;
  const gap = bodyX - right;
  if (gap < 0 || gap > em * 1.5 || bodyX - marker.x > em * 2.5) return null;
  const text = rowBody(body, em);
  if (!/\p{L}/u.test(text)) return null;
  return { marker, right, bodyX, text, number: Number(found[1]) };
}

/**
 * The lane already has an independent reading order. Find detached decimal
 * markers with sequential numbering and physically attached wrapped bodies.
 * Never infer an ordered list from a bare vertical strip of numeric cells.
 */
export function findNumberedListRegions(lines, em) {
  const rows = [];
  for (const [index, line] of lines.entries()) {
    const last = rows.at(-1);
    if (last && line.y - last.y <= em * 0.2) {
      last.lines.push(line);
      last.end = index + 1;
    } else rows.push({ y: line.y, start: index, end: index + 1, lines: [line] });
  }
  for (const row of rows) row.lines.sort((a, b) => a.x - b.x);

  const regions = [];
  let run = [];
  const flush = () => {
    if (run.length >= 3 && run.filter(entry => entry.wraps).length >= 2) {
      const first = run[0], last = run.at(-1);
      regions.push({
        start: first.start,
        end: last.end,
        element: {
          type: 'list', ordered: true, listType: 'ordered', start: first.number,
          text: run.map(entry => `${entry.number}. ${entry.text}`).join('\n'),
          items: run.map(entry => ({ text: entry.text, format: 'text' })),
          pageNum: first.marker.pageNum, minX: first.marker.x,
          minY: first.y, maxY: last.lastY,
          lines: lines.slice(first.start, last.end)
        }
      });
    }
    run = [];
  };
  for (let index = 0; index < rows.length;) {
    const row = rows[index++];
    const marker = numberedStart(row, em);
    if (!marker) {
      flush();
      continue;
    }
    const last = run.at(-1), first = run[0];
    if (last && (marker.number !== last.number + 1 || row.y - last.lastY > em * 3.5 ||
      Math.abs(marker.bodyX - first.bodyX) > positionTolerance(em) ||
      Math.min(Math.abs(marker.marker.x - first.marker.x), Math.abs(marker.right - first.right)) > em * 0.5)) flush();
    const entry = { ...marker, start: row.start, end: row.end, y: row.y, lastY: row.y, wraps: false };
    while (index < rows.length) {
      const following = rows[index];
      if (following.y - entry.lastY > em * 1.45 ||
        Math.abs(following.lines[0].x - marker.bodyX) > positionTolerance(em)) break;
      const text = rowBody(following.lines, em);
      if (!text) break;
      entry.text = joinPdfText(entry.text, text);
      entry.end = following.end;
      entry.lastY = following.y;
      entry.wraps = true;
      index++;
    }
    run.push(entry);
  }
  flush();
  return regions;
}

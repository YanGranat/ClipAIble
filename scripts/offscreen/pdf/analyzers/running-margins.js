// @ts-check
import { calculateLineRight } from './column-detection-helpers.js';

function collectAlternatingHeader(sorted, pageNum, baseFontSize, groups) {
  const first = sorted[0];
  const { viewportHeight: height, viewportWidth: width } = first?.items?.[0] || {};
  const fontSize = first?.fontSize;
  if (!height || !width || !fontSize || fontSize < baseFontSize || first.y >= height * 0.05) return;
  const next = sorted.findIndex(line => line.y - first.y > fontSize * 0.05);
  if (next < 1 || next > 6 || sorted[next].y - first.y < baseFontSize * 2) return;
  const fragments = sorted.slice(0, next).sort((a, b) => a.x - b.x);
  if (fragments.some((line, index) => !/^[\p{Lu}\p{M} ]+$/u.test(line.text || '') ||
    Math.abs(line.fontSize - fontSize) > fontSize * 0.05 ||
    (index && line.x - calculateLineRight(fragments[index - 1], baseFontSize) > fontSize))) return;
  const text = fragments.map(line => line.text.trim()).join(' ');
  const tokens = text.split(/ +/u);
  if (tokens.length < 2 || tokens.length > 6) return;
  const right = calculateLineRight(fragments.at(-1), baseFontSize);
  const side = right < width * 0.25 ? 'left' : fragments[0].x > width * 0.75 ? 'right' : null;
  if (!side) return;
  const key = tokens.sort().join(' ');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ pageNum, text, y: first.y, fontSize, side });
}

/** Match isolated alternating recto/verso headers only when both variants repeat. */
function dedupeAlternatingHeaders(groups, pageCount) {
  return [...groups.values()].flatMap(group => {
    const left = group.filter(line => line.side === 'left');
    const right = group.filter(line => line.side === 'right');
    if (left.length < 2 || right.length < 2 || group.length < Math.ceil(pageCount / 2)) return [];
    const stable = lines => lines.every(line => line.text === lines[0].text && (line.pageNum % 2) === (lines[0].pageNum % 2));
    const fontSizes = group.map(line => line.fontSize);
    const baselines = group.map(line => line.y);
    return left[0].pageNum % 2 !== right[0].pageNum % 2 && stable(left) && stable(right) &&
      Math.max(...fontSizes) - Math.min(...fontSizes) <= Math.min(...fontSizes) * 0.05 &&
      Math.max(...baselines) - Math.min(...baselines) <= Math.min(...fontSizes) * 0.25 ? group : [];
  });
}

/** Identify repeated running text and folios at page edges. */
export function findRunningMargins(lines, pageCount, baseFontSize) {
  if (pageCount < 3) return [];
  const groups = new Map();
  const alternatingHeaders = new Map();
  /** @type {MapConstructor & {groupBy?: <T, K>(items: Iterable<T>, key: (item: T, index: number) => K) => Map<K, T[]>}} */
  const mapConstructor = Map;
  const byPage = mapConstructor.groupBy ? mapConstructor.groupBy(lines, line => line.pageNum) : lines.reduce((map, line) => {
    if (!map.has(line.pageNum)) map.set(line.pageNum, []);
    map.get(line.pageNum).push(line); return map;
  }, new Map());
  for (const [pageNum, pageLines] of byPage) {
    const sorted = [...pageLines].sort((a, b) => a.y - b.y);
    collectAlternatingHeader(sorted, pageNum, baseFontSize, alternatingHeaders);
    for (const line of [sorted[0], sorted.at(-1)]) {
      if (!line) continue;
      const height = line.items?.[0]?.viewportHeight;
      const font = line.fontSize || line.items?.[0]?.fontSize;
      const text = String(line.text || '').trim();
      if (!height || !font || !text) continue;
      const number = /^\d+$/.test(text);
      if (number ? Number(text) !== pageNum : font >= baseFontSize) continue;
      // A baseline near the edge can belong to a folio in the same size as the body.
      const edge = line.y < height * 0.05 ? 'top' : line.y + (number ? font / 2 : 0) > height * 0.95 ? 'bottom' : null;
      if (!edge) continue;
      const neighbor = edge === 'top' ? sorted[1] : sorted.at(-2);
      if (!neighbor || Math.abs(neighbor.y - line.y) < baseFontSize * 2) continue;
      const key = `${edge}:${number ? '<page>' : text}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ pageNum, text, y: line.y, fontSize: font });
    }
  }
  const repeated = [...groups.values()].flatMap(group => {
    const pages = new Set(group.map(line => line.pageNum));
    const tolerance = Math.min(...group.map(line => line.fontSize));
    return pages.size >= 3 && pages.size >= Math.ceil(pageCount / 2) && Math.max(...group.map(line => line.y)) - Math.min(...group.map(line => line.y)) <= tolerance ? group : [];
  });
  return repeated.concat(dedupeAlternatingHeaders(alternatingHeaders, pageCount));
}

export function isRunningMargin(element, candidates) {
  if (!['paragraph', 'heading'].includes(element.type) || !element.lines?.length) return false;
  return candidates.some(line => line.pageNum === element.pageNum && line.text === String(element.text || '').trim() &&
    (line.side ? element.lines.every(part => Math.abs(line.y - part.y) <= line.fontSize * 0.05) :
      element.lines.length === 1 && Math.abs(line.y - element.lines[0].y) < line.fontSize));
}

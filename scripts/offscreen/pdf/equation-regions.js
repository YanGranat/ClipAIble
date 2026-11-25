// @ts-check
import { calculateLineRight } from './analyzers/column-detection-helpers.js';

const LARGE_OPERATOR = /[∑∏∫√]/u;
const VARIABLE_RELATION = /(?:^|[^\p{L}\p{N}])\p{L}\d*\s*[=<>±∓≤≥≠≈≡≃∼∝~§]|[=<>±∓≤≥≠≈≡≃∼∝~§]\s*\p{L}\d*(?=$|[^\p{L}\p{N}])/u;
const WORDS = /\p{L}{2,}/gu;
const EQUATION_NUMBER = /^\(\d+(?:[.:]\d+)*(?:[a-z])?\)$/i;
const overlapsX = (a, b) => a.left < b.right && b.left < a.right;
const intersects = (a, b) => overlapsX(a, b) && a.top < b.bottom && b.top < a.bottom;
const hasMathSyntax = text => LARGE_OPERATOR.test(text) || VARIABLE_RELATION.test(text);
const countWords = text => (text.match(WORDS) || []).length;
const hasProse = line => line.items.some(item => typeof item.str === 'string' &&
  countWords(item.str) >= 3 && !hasMathSyntax(item.str));

function bounds(lines) {
  return lines.reduce((box, line) => ({
    left: Math.min(box.left, line.left), right: Math.max(box.right, line.right),
    top: Math.min(box.top, line.top), bottom: Math.max(box.bottom, line.bottom)
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
}

/** Find isolated display equations between body text in the same reading lane. */
export function findEquationRegions(lines, viewport, baseFontSize, paintedTables) {
  if (viewport.rotation || lines.length > 3000 || baseFontSize <= 0) return [];
  const em = baseFontSize;
  const positioned = lines.filter(line => line.items?.length).map(line => {
    const itemBoxes = line.items.filter(item => item.width > 0 && item.str?.trim()).map(item => ({
      left: item.x, right: item.x + item.width, top: item.y - item.fontSize * 0.78, bottom: item.y + item.fontSize * 0.27
    }));
    const box = bounds(itemBoxes);
    return { ...box, line, y: line.y, words: countWords(line.text) };
  }).filter(box => Number.isFinite(box.left + box.right + box.top + box.bottom) && box.left < box.right)
    .sort((a, b) => a.y - b.y);

  const prose = positioned.filter(item => item.right - item.left >= em * 12 && item.words >= 5 &&
    item.line.fontSize >= em * 0.85 && item.line.fontSize <= em * 1.15);
  const regions = [];
  const claimed = new Set();
  const positions = new Map(positioned.map((row, index) => [row, index]));
  for (const [index, before] of prose.entries()) {
    let after;
    for (let nextIndex = index + 1; nextIndex < prose.length; nextIndex++) {
      const next = prose[nextIndex];
      if (next.y - before.y > em * 10) break;
      if (next.y > before.y && Math.abs(next.left - before.left) <= em * 1.45 && overlapsX(next, before)) {
        after = next;
        break;
      }
    }
    if (!after || after.y - before.y < em * 2.35) continue;
    const lane = { left: Math.min(before.left, after.left), right: Math.max(before.right, after.right) };
    const between = positioned.slice(positions.get(before) + 1, positions.get(after))
      .filter(box => box.y > before.y + em * 0.46 && box.y < after.y - em * 0.82 && overlapsX(lane, box));
    if (between.length < 2 || between.length > 44 || between.some(box =>
      box.words > 5 || hasProse(box.line) || (box.words >= 3 && !hasMathSyntax(box.line.text)) || claimed.has(box.line))) continue;
    const atoms = between.filter(box => !EQUATION_NUMBER.test(box.line.text.trim()));
    const region = bounds(between);
    const core = bounds(atoms);
    if (atoms.length < 2 || core.left < lane.left + em * 1.25 || core.right > lane.right - em * 0.5 ||
      region.right > lane.right + em * 0.6 || region.bottom - region.top > em * 7.5) continue;

    const itemCount = atoms.reduce((count, box) => count + box.line.items.length, 0);
    const verticallyStacked = atoms.some((box, index) => atoms.slice(index + 1)
      .some(next => next.y - box.y >= em * 0.5 && overlapsX(box, next)));
    const mathSyntax = atoms.some(box => hasMathSyntax(box.line.text));
    if (!mathSyntax || !verticallyStacked || itemCount < 4) continue;

    const crop = {
      left: Math.max(lane.left, region.left - em * 0.4),
      right: Math.min(viewport.width, region.right + em * 0.4),
      top: Math.max(before.bottom + em * 0.05, region.top - em * 0.3),
      bottom: Math.min(after.top - em * 0.05, region.bottom + em * 0.3)
    };
    if (crop.top >= between[0].y || crop.bottom <= between.at(-1).y || crop.left >= crop.right) continue;
    const owned = new Set(between.map(box => box.line));
    if (positioned.some(box => !owned.has(box.line) && intersects(crop, box)) ||
      paintedTables.some(table => table.paintedBounds && intersects(crop, table.paintedBounds))) continue;
    for (const line of owned) claimed.add(line);
    const x = before.line.x;
    const y = (crop.top + crop.bottom) / 2;
    const width = Math.max(calculateLineRight(before.line, em), calculateLineRight(after.line, em)) - x;
    const marker = { text: '', x, y, width, items: [{ x, y, width }], fontSize: em, pageNum: before.line.pageNum };
    regions.push({ crop, owned, marker });
    if (regions.length === 12) break;
  }
  return regions;
}

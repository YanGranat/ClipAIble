import { isTableLine } from './graphics-helpers.js';
import { clusterObjects } from '../core/clustering.js';
import { collateLine } from '../core/text-collation.js';

/** Keep painted grids independent of the page's reading columns. */
export function extractPaintedTables(lines, graphics, baseFontSize) {
  const used = new Set(), tables = [], tolerance = baseFontSize * 0.3;
  const spans = [];
  for (const line of graphics?.lines || []) {
    if (!isTableLine(line, baseFontSize).isVertical) continue;
    const top = Math.min(line.y1, line.y2), bottom = Math.max(line.y1, line.y2);
    let span = spans.find(group => Math.abs(group.top - top) <= tolerance && Math.abs(group.bottom - bottom) <= tolerance);
    if (!span) { span = { top, bottom, xs: [] }; spans.push(span); }
    span.xs.push(line.x1);
  }
  const regions = spans.filter(group => group.xs.length >= 3).map(group => ({ x: Math.min(...group.xs), y: group.top,
    width: Math.max(...group.xs) - Math.min(...group.xs), height: group.bottom - group.top }));
  regions.push(...(graphics?.tableRegions || []));
  for (const region of regions.sort((a, b) => a.width * a.height - b.width * b.height)) {
    const owned = lines.filter(line => !used.has(line) && line.y > region.y && line.y < region.y + region.height &&
      line.x >= region.x - tolerance && line.x + (line.width || 0) <= region.x + region.width + tolerance);
    if (owned.length < 2) continue;
    const grouped = clusterObjects(owned, line => line.y, tolerance, 'painted grid rows');
    const rows = getBorderedGridRows(grouped, graphics, baseFontSize, tolerance);
    if (!rows) continue;
    for (const line of owned) used.add(line);
    tables.push({ type: 'table', cellFormat: 'text', rows, rowCount: rows.length, columnCount: rows[0].length,
      hasHeaders: grouped[0].some(line => line.isBold), text: rows.map(row => row.join(' ')).join('\n'),
      lines: owned, pageNum: owned[0].pageNum, minY: Math.min(...owned.map(line => line.y)), maxY: Math.max(...owned.map(line => line.y)) });
  }
  const ruled = extractHorizontalTables(lines.filter(line => !used.has(line)), graphics, baseFontSize);
  for (const line of ruled.used) used.add(line);
  tables.push(...ruled.tables);
  return { tables, remainingLines: lines.filter(line => !used.has(line)) };
}

function horizontalChunks(row, font) {
  const result = [];
  for (const item of [...row].sort((a, b) => a.x - b.x)) {
    const previous = result.at(-1);
    if (previous && item.x - previous.right <= font * 0.5) { previous.right = Math.max(previous.right, item.x + item.width); previous.items.push(item); }
    else result.push({ left: item.x, right: item.x + item.width, items: [item] });
  }
  return result;
}

function extractHorizontalTables(lines, graphics, baseFontSize) {
  const tolerance = baseFontSize * 0.3, bands = [], used = new Set(), tables = [];
  const horizontal = (graphics?.lines || []).filter(line => isTableLine(line, baseFontSize).isHorizontal);
  for (const rule of horizontal) {
    const left = Math.min(rule.x1, rule.x2), right = Math.max(rule.x1, rule.x2);
    let band = bands.find(group => Math.abs(group.left - left) <= tolerance && Math.abs(group.right - right) <= tolerance);
    if (!band) { band = { left, right, rules: [] }; bands.push(band); }
    band.rules.push(rule.y1);
  }
  const candidates = [];
  for (const band of bands) {
    const sorted = [...new Set(band.rules)].sort((a, b) => a - b);
    let connected = sorted.length ? [sorted[0]] : [];
    for (let index = 0; index < sorted.length - 1; index++) {
      const intervalItems = lines.flatMap(line => line.items || []).filter(item => item.y > sorted[index] && item.y < sorted[index + 1] &&
        item.x >= band.left - tolerance && item.x + item.width <= band.right + tolerance);
      const size = Math.max(...intervalItems.map(item => item.fontSize || baseFontSize));
      const supported = intervalItems.length && clusterObjects(intervalItems.filter(item => item.fontSize >= size * 0.8), item => item.y, tolerance, 'ruled region continuity')
        .some(row => horizontalChunks(row, size).length >= 2);
      if (supported) connected.push(sorted[index + 1]);
      else {
        if (connected.length >= 3) candidates.push({ ...band, rules: connected });
        connected = [sorted[index + 1]];
      }
    }
    if (connected.length >= 3) candidates.push({ ...band, rules: connected });
  }
  for (const band of candidates) {
    const rules = band.rules;
    if (rules.length < 3) continue;
    const owned = lines.filter(line => !used.has(line) && line.y > rules[0] && line.y < rules.at(-1) &&
      (line.items || []).every(item => item.x >= band.left - tolerance && item.x + item.width <= band.right + tolerance));
    const items = [...new Set(owned.flatMap(line => line.items || []))].filter(item => item.str?.trim());
    if (!items.length) continue;
    const font = Math.max(...items.map(item => item.fontSize || baseFontSize));
    const chunks = row => horizontalChunks(row, font);
    const anchors = clusterObjects(items.filter(item => item.fontSize >= font * 0.8), item => item.y, tolerance, 'ruled table baselines')
      .filter(row => chunks(row).length >= 2).map(row => ({ y: row[0].y, items: [] }));
    const body = anchors.filter(row => row.y > rules[1]);
    if (body.length < 2) continue;
    for (const item of items) {
      const row = anchors.reduce((best, next) => Math.abs(next.y - item.y) < Math.abs(best.y - item.y) ? next : best);
      row.items.push(item);
    }
    const denseCount = Math.max(...body.map(row => chunks(row.items).length));
    if (denseCount < 2) continue;
    const dense = body.filter(row => chunks(row.items).length === denseCount);
    let gutters = chunks(dense[0].items).slice(0, -1).map((chunk, index) => [chunk.right, chunks(dense[0].items)[index + 1].left]);
    for (const row of dense.slice(1)) {
      const cells = chunks(row.items);
      gutters = gutters.map(([left, right], index) => [Math.max(left, cells[index].right), Math.min(right, cells[index + 1].left)]);
    }
    if (gutters.some(([left, right]) => right - left <= tolerance)) continue;
    const cuts = [band.left, ...gutters.map(([left, right]) => (left + right) / 2), band.right];
    const column = item => cuts.slice(1, -1).filter(x => item.x >= x - tolerance).length;
    const headerItems = items.filter(item => item.y < rules[1]);
    const text = cell => {
      const baselines = clusterObjects(cell.filter(item => item.fontSize >= font * 0.8), item => item.y, tolerance, 'table cell baselines');
      if (!baselines.length) return collateLine(cell);
      const rows = baselines.map(row => ({ y: row[0].y, items: [] }));
      for (const item of cell) rows.reduce((best, next) => Math.abs(next.y - item.y) < Math.abs(best.y - item.y) ? next : best).items.push(item);
      return rows.map(row => collateLine(row.items)).join(' ').trim();
    };
    const headers = Array.from({ length: denseCount }, () => []), headerGroups = new Set();
    for (const item of headerItems) {
      const center = item.x + item.width / 2;
      const groupRule = horizontal.find(rule => Math.min(rule.x1, rule.x2) >= band.left - tolerance &&
        Math.max(rule.x1, rule.x2) <= band.right + tolerance && Math.abs(rule.x2 - rule.x1) < band.right - band.left - tolerance && rule.y1 > item.y && rule.y1 < rules[1] &&
        center >= Math.min(rule.x1, rule.x2) && center <= Math.max(rule.x1, rule.x2));
      const targets = groupRule ? cuts.slice(0, -1).map((left, index) => ({ index, center: (left + cuts[index + 1]) / 2 }))
        .filter(cell => cell.center >= Math.min(groupRule.x1, groupRule.x2) && cell.center <= Math.max(groupRule.x1, groupRule.x2)).map(cell => cell.index) : [column({ ...item, x: center })];
      if (targets.length > 1) headerGroups.add(item);
      for (const index of targets.length ? targets : [column({ x: center })]) headers[index].push(item);
    }
    for (let index = 1; index < rules.length - 1; index++) {
      const top = rules[index], bottom = rules[index + 1], groupedRows = body.filter(row => row.y > top && row.y < bottom);
      if (groupedRows.length < 2) continue;
      const labels = items.filter(item => item.y > top && item.y < bottom && column(item) === 0);
      if (!labels.length || Math.max(...labels.map(item => item.y)) - Math.min(...labels.map(item => item.y)) > tolerance) continue;
      if (Math.abs(labels[0].y - (top + bottom) / 2) > font / 2) continue;
      for (const row of groupedRows) row.items = row.items.filter(item => !labels.includes(item));
      groupedRows[0].items.push(...labels);
    }
    const rows = [headers.map(cell => {
      const parent = cell.filter(item => headerGroups.has(item)), leaf = cell.filter(item => !headerGroups.has(item));
      return parent.length && leaf.length ? `${text(parent)} / ${text(leaf)}` : text(cell);
    })];
    let invalid = false;
    for (const row of body) {
      const cells = Array.from({ length: denseCount }, () => []);
      const rowChunks = chunks(row.items.filter(item => item.y >= rules[1]));
      const painted = (graphics.allLines || graphics.lines || []).filter(line => Math.abs(line.x1 - line.x2) <= tolerance &&
        Math.min(line.y1, line.y2) <= row.y && Math.max(line.y1, line.y2) >= row.y).map(line => line.x1);
      for (const chunk of rowChunks) {
        const left = Math.max(band.left, ...painted.filter(x => x <= chunk.left + tolerance));
        const right = Math.min(band.right, ...painted.filter(x => x >= chunk.right - tolerance));
        const enclosed = rowChunks.filter(candidate => candidate.left >= left - tolerance && candidate.right <= right + tolerance);
        const spans = cuts.slice(1, -1).filter(x => x > left + tolerance && x < right - tolerance).length > 0;
        const wide = cuts.slice(1, -1).some(x => chunk.left < x - tolerance && chunk.right > x + tolerance);
        const index = painted.length && spans && wide && enclosed.length === 1 ? column({ x: left + tolerance }) : column({ x: chunk.left });
        if (index >= denseCount) { invalid = true; break; }
        cells[index].push(...chunk.items);
      }
      rows.push(cells.map(cell => collateLine(cell)));
    }
    if (invalid || rows.slice(1).some(row => row.filter(Boolean).length < 2)) continue;
    for (const line of owned) used.add(line);
    tables.push({ type: 'table', cellFormat: 'text', rows, hasHeaders: true, rowCount: rows.length, columnCount: denseCount,
      columns: cuts.slice(0, -1), text: rows.map(row => row.join(' ')).join('\n'), lines: owned,
      pageNum: owned[0].pageNum, minY: rules[0], maxY: rules.at(-1) });
  }
  return { tables, used };
}

/** Recover cells only when complete painted borders enclose every owned row. */
export function getBorderedGridRows(rowLines, graphics, baseFontSize, tolerance) {
  if (!graphics?.lines || rowLines.length < 2 || rowLines.some(lines => !lines.length)) return null;
  const allLines = rowLines.flat();
  if (allLines.some(line => !Number.isFinite(line.x) || !Number.isFinite(line.y))) return null;
  const ys = rowLines.map(lines => lines.reduce((sum, line) => sum + line.y, 0) / lines.length);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minX = Math.min(...allLines.map(line => line.x));
  const maxX = Math.max(...allLines.map(line => line.x + (line.width || 0)));
  const unique = values => values.sort((a, b) => a - b).filter((value, index, sorted) => index === 0 || value - sorted[index - 1] > tolerance);
  const vertical = graphics.lines.filter(line => isTableLine(line, baseFontSize).isVertical &&
    Math.min(line.y1, line.y2) <= minY && Math.max(line.y1, line.y2) >= maxY);
  const xs = unique(vertical.map(line => (line.x1 + line.x2) / 2));
  const left = Math.max(...xs.filter(x => x <= minX));
  const right = Math.min(...xs.filter(x => x >= maxX));
  const columns = xs.filter(x => x >= left && x <= right);
  if (!Number.isFinite(left) || !Number.isFinite(right) || columns.length < 3) return null;
  const horizontal = graphics.lines.filter(line => isTableLine(line, baseFontSize).isHorizontal &&
    Math.min(line.x1, line.x2) <= left + tolerance && Math.max(line.x1, line.x2) >= right - tolerance);
  const rowBorders = unique(horizontal.map(line => (line.y1 + line.y2) / 2));
  const top = Math.max(...rowBorders.filter(y => y < minY));
  const bottom = Math.min(...rowBorders.filter(y => y > maxY));
  const borders = rowBorders.filter(y => y >= top && y <= bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || borders.length !== rowLines.length + 1) return null;
  if (!columns.every(x => vertical.some(line => Math.abs(line.x1 - x) <= tolerance &&
    Math.min(line.y1, line.y2) <= top + tolerance && Math.max(line.y1, line.y2) >= bottom - tolerance))) return null;
  if (graphics.lines.some(line => isTableLine(line, baseFontSize).isVertical && line.x1 > left && line.x1 < right &&
    Math.max(line.y1, line.y2) > top && Math.min(line.y1, line.y2) < bottom &&
    !vertical.some(border => Math.abs(border.x1 - line.x1) <= tolerance))) return null;
  if (!ys.every((y, index) => y > borders[index] && y < borders[index + 1])) return null;
  const result = [];
  for (const lines of rowLines) {
    const cells = Array.from({ length: columns.length - 1 }, () => []);
    for (const line of [...new Set(lines)].sort((a, b) => a.x - b.x)) {
      const index = columns.findIndex((x, i) => i < columns.length - 1 && line.x >= x && line.x < columns[i + 1]);
      if (index < 0) return null;
      const items = (line.items || []).filter(item => item.str?.trim());
      if (items.some(item => item.x < columns[index] || item.x >= columns[index + 1] ||
        item.x + (item.width || 0) > columns[index + 1] + tolerance)) return null;
      cells[index].push(line.text || '');
    }
    result.push(cells.map(cell => cell.join(' ').trim()));
  }
  return result;
}

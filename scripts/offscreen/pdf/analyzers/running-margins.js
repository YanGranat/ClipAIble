// @ts-check
/** Identify repeated, isolated small-print lines at page edges. */
export function findRunningMargins(lines, pageCount, baseFontSize) {
  if (pageCount < 3) return [];
  const groups = new Map();
  /** @type {MapConstructor & {groupBy?: <T, K>(items: Iterable<T>, key: (item: T, index: number) => K) => Map<K, T[]>}} */
  const mapConstructor = Map;
  const byPage = mapConstructor.groupBy ? mapConstructor.groupBy(lines, line => line.pageNum) : lines.reduce((map, line) => {
    if (!map.has(line.pageNum)) map.set(line.pageNum, []);
    map.get(line.pageNum).push(line); return map;
  }, new Map());
  for (const [pageNum, pageLines] of byPage) {
    const sorted = [...pageLines].sort((a, b) => a.y - b.y);
    for (const line of [sorted[0], sorted.at(-1)]) {
      if (!line) continue;
      const height = line.items?.[0]?.viewportHeight;
      const font = line.fontSize || line.items?.[0]?.fontSize;
      const text = String(line.text || '').trim();
      if (!height || !font || font >= baseFontSize || !text) continue;
      const edge = line.y < height * 0.05 ? 'top' : line.y > height * 0.95 ? 'bottom' : null;
      if (!edge) continue;
      const neighbor = edge === 'top' ? sorted[1] : sorted.at(-2);
      if (!neighbor || Math.abs(neighbor.y - line.y) < baseFontSize * 2) continue;
      const number = /^\d+$/.test(text);
      if (number && Number(text) !== pageNum) continue;
      const key = `${edge}:${number ? '<page>' : text}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ pageNum, text, y: line.y, fontSize: font });
    }
  }
  return [...groups.values()].flatMap(group => {
    const pages = new Set(group.map(line => line.pageNum));
    const tolerance = Math.min(...group.map(line => line.fontSize));
    return pages.size >= 3 && pages.size >= Math.ceil(pageCount / 2) && Math.max(...group.map(line => line.y)) - Math.min(...group.map(line => line.y)) <= tolerance ? group : [];
  });
}

export function isRunningMargin(element, candidates) {
  if (!['paragraph', 'heading'].includes(element.type) || element.lines?.length !== 1) return false;
  return candidates.some(line => line.pageNum === element.pageNum && line.text === String(element.text || '').trim() &&
    Math.abs(line.y - element.lines[0].y) < line.fontSize);
}

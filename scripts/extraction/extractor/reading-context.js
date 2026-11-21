// @ts-check

/** Every admitted reading scope owns its nested authored content. */
export function isReadingOwned(element, roots = []) {
  return (roots || []).some(root => root.contains(element));
}

/** Presentation tables provide flow layout rather than data-cell ownership. */
export function isLayoutTable(element) {
  if (!element || element.tagName !== 'TABLE') return false;
  if (['presentation', 'none'].includes(element.getAttribute('role') || '')) return true;
  if (element.querySelector('th,thead') || !element.querySelector('h1,h2,h3')) return false;
  const rows = Array.from(/** @type {HTMLTableElement} */ (element).rows).filter(row => row.closest('table') === element);
  return rows.length > 0 && rows.every(row => row.cells.length === 1 && row.cells[0].colSpan === 1);
}

/** Semantic flow containers keep direct text and partition around owned child blocks. */
export function isFlowContainer(element) {
  return ['DIV', 'ARTICLE', 'SECTION', 'MAIN', 'ASIDE', 'BODY', 'DL', 'DT', 'DD', 'TD', 'TH'].includes(element.tagName);
}

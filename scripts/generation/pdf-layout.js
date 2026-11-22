// @ts-check

/** Prepare and measure the final print layout in its owning document. */
export async function preparePdfLayout(paperWidthInches, pageMode = 'single') {
  if (!window.matchMedia('print').matches) throw new Error('PDF layout requires print media.');
  document.documentElement.style.setProperty('--pdf-page-width', `${paperWidthInches}in`);
  document.documentElement.style.setProperty('--pdf-layout-width', pageMode === 'multi' ? `calc(${paperWidthInches}in - 10mm)` : `${paperWidthInches}in`);
  if (document.fonts?.ready) await document.fonts.ready;
  const article = document.querySelector('.article') || document.body;
  if (pageMode === 'single') {
    const flow = article.querySelector('.article-content') ?? article;
    // Empty final paragraphs can create a print fragment after the article.
    while (flow.lastElementChild?.matches('p:empty:not([id],[name])')) {
      flow.lastElementChild.remove();
    }
  }
  const tableLayouts = [];

  function projectTable(table) {
    const rows = Array.from(table.rows);
    const grid = rows.map(() => []);
    const projected = rows.map(row => ({ row, cells: [] }));
    const headerOwners = new Map();
    rows.forEach((row, rowIndex) => {
      let groupEnd = rowIndex + 1;
      while (groupEnd < rows.length && rows[groupEnd].parentElement === row.parentElement) groupEnd++;
      let column = 0;
      for (const cell of Array.from(row.cells)) {
        const width = cell.colSpan, height = Math.min(cell.rowSpan || groupEnd - rowIndex, groupEnd - rowIndex);
        while (Array.from({ length: width }, (_, offset) => grid[rowIndex][column + offset]).some(Boolean)) column++;
        const owner = { cell, column, width, height, rowIndex };
        headerOwners.set(cell, owner);
        for (let down = 0; down < height; down++) for (let across = 0; across < width; across++) {
          grid[rowIndex + down][column + across] = owner;
        }
        column += width;
      }
    });
    const columns = grid.reduce((count, row) => Math.max(count, row.length), 0);
    projected.forEach((entry, index) => { entry.cells = [...new Set(grid[index].filter(Boolean))]; });
    const headers = [...headerOwners.values()].filter(owner => owner.cell.tagName === 'TH');
    const groups = [];
    for (const group of Array.from(table.children).filter(element => element.tagName === 'COLGROUP')) {
      const cols = Array.from(group.children).filter(element => element.tagName === 'COL');
      const span = cols.length ? cols.reduce((total, col) => total + col.span, 0) : group.span;
      for (let offset = 0; offset < span; offset++) groups.push(group);
    }
    // Use occupied columns when a group header has no matching COLGROUP.
    const isColumn = owner => owner.cell.scope === 'col' ||
      (owner.cell.scope === 'colgroup' && !groups[owner.column]) ||
      (!owner.cell.scope && grid.slice(owner.rowIndex, owner.rowIndex + owner.height).every(row => !row.some(other => other.cell.tagName === 'TD')));
    function headingsFor(principal) {
      if (principal.cell.hasAttribute('headers')) return [...new Set(principal.cell.getAttribute('headers').trim().split(/\s+/).filter(Boolean)
        .map(id => table.ownerDocument.getElementById(id)).filter(cell => cell && headerOwners.has(cell) && cell !== principal.cell && (cell.children.length || cell.textContent?.trim())))];
      const associated = new Set();
      for (let column = principal.column; column < principal.column + principal.width; column++) {
        const opaque = [], visited = new Set();
        let block = principal.cell.tagName === 'TH' ? [principal] : [];
        for (let row = principal.rowIndex - 1; row >= 0; row--) {
          const owner = grid[row][column];
          if (!owner || visited.has(owner)) continue;
          visited.add(owner);
          if (owner.cell.tagName === 'TH') {
            block.push(owner);
            if (isColumn(owner) && !opaque.some(previous => previous.column === owner.column && previous.width === owner.width)) associated.add(owner.cell);
          } else if (block.length) { opaque.push(...block); block = []; }
        }
        if (groups[column]) for (const owner of headers) {
          if (owner.cell.scope === 'colgroup' && groups[owner.column] === groups[column] && owner.column <= principal.column + principal.width - 1 && owner.rowIndex <= principal.rowIndex + principal.height - 1) associated.add(owner.cell);
        }
      }
      associated.delete(principal.cell);
      return [...associated].filter(cell => cell.children.length || cell.textContent?.trim()).sort((first, second) => {
        const left = headerOwners.get(first), right = headerOwners.get(second);
        return left.rowIndex - right.rowIndex || left.column - right.column;
      });
    }
    const body = projected.filter(entry => entry.row.parentElement !== table.tHead);
    return { columns, headingsFor, rows: body.length ? body : projected, headersOnly: body.length === 0 };
  }

  for (const table of Array.from(article.querySelectorAll('table'))) {
    const projection = projectTable(table);
    const parent = table.parentElement;
    const parentStyle = getComputedStyle(parent);
    const available = parent.getBoundingClientRect().width -
      parseFloat(parentStyle.paddingLeft || '0') - parseFloat(parentStyle.paddingRight || '0') -
      parseFloat(parentStyle.borderLeftWidth || '0') - parseFloat(parentStyle.borderRightWidth || '0');
    const cells = /** @type {HTMLTableCellElement[]} */ (Array.from(table.querySelectorAll('th,td'))).filter(cell => cell.closest('table') === table);
    const fonts = cells.map(cell => parseFloat(getComputedStyle(cell).fontSize));
    const naturalWidth = table.getBoundingClientRect().width;
    let scale = 1;
    if (naturalWidth > available && available > 0) {
      scale = available / naturalWidth;
      // Keep table type within the document's existing small-text scale.
      if (scale >= 0.84) {
        cells.forEach((cell, index) => cell.style.setProperty('font-size', `${fonts[index] * scale}px`, 'important'));
        const fittedWidth = table.getBoundingClientRect().width;
        if (fittedWidth > available) {
          const adjustment = available / fittedWidth;
          scale *= adjustment;
          cells.forEach((cell, index) => cell.style.setProperty('font-size', `${fonts[index] * scale}px`, 'important'));
        }
      }
    }
    if (table.getBoundingClientRect().width <= available + 0.1 && scale >= 0.84) {
      tableLayouts.push({ mode: 'grid', columns: projection.columns, scale });
      continue;
    }

    const records = document.createElement('div');
    records.className = 'pdf-table-records';
    if (table.id) records.id = table.id;
    const emittedIds = new Set();
    function appendCell(target, cell) {
      const copy = document.createElement('span');
      if (cell.classList.contains('table-muted')) copy.className = 'table-muted';
      copy.append(...Array.from(cell.childNodes).map(node => node.cloneNode(true)));
      if (cell.id) copy.id = cell.id;
      for (const node of [copy, ...Array.from(copy.querySelectorAll('[id],[name]'))]) {
        for (const name of ['id', 'name']) {
          const id = node.getAttribute(name);
          if (!id) continue;
          if (emittedIds.has(id)) node.removeAttribute(name);
          else emittedIds.add(id);
        }
      }
      target.append(...(copy.id ? [copy] : Array.from(copy.childNodes)));
    }
    projection.rows.forEach(entry => {
      const record = document.createElement('dl');
      record.className = 'pdf-table-record';
      const rowHeaders = projection.headersOnly ? [] : entry.cells.filter(owner => owner.cell.tagName === 'TH' && !['col', 'colgroup'].includes(owner.cell.scope));
      entry.cells.forEach(owner => {
        const field = document.createElement('div');
        field.className = rowHeaders.includes(owner) ? 'pdf-table-field pdf-table-context' : 'pdf-table-field';
        const label = document.createElement('dt');
        const value = document.createElement('dd');
        const headings = projection.headersOnly ? [] : projection.headingsFor(owner);
        headings.forEach((heading, index) => {
          if (index) label.appendChild(document.createElement('br'));
          appendCell(label, heading);
        });
        if (!headings.length) label.textContent = owner.width > 1 ? `${owner.column + 1}–${owner.column + owner.width}` : String(owner.column + 1);
        appendCell(value, owner.cell);
        field.append(label, value); record.append(field);
      });
      records.append(record);
    });
    table.replaceWith(records);
    tableLayouts.push({ mode: 'records', columns: projection.columns, scale: 1 });
  }

  const bounds = article.getBoundingClientRect();
  const contentHeight = Math.ceil(Math.max(bounds.bottom, bounds.top + article.scrollHeight)) + 1;
  return { contentWidth: bounds.width, contentHeight, tableLayouts };
}

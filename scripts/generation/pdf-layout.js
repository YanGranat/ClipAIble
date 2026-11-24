// @ts-check

export const PDF_PAGE_MARGIN_MM = 5;
// Chromium writes a default PDF user unit of 1/72 inch and readers can limit a page to 14,400 units.
export const PDF_MAX_SINGLE_PAGE_INCHES = 200;

/** Prepare and measure the final print layout in its owning document. */
export async function preparePdfLayout(paperWidthInches, pageMode = 'single', paperHeightInches = 0, pageMarginMm = 5,
  maxSinglePageInches = Infinity) {
  if (!window.matchMedia('print').matches) throw new Error('PDF layout requires print media.');
  document.documentElement.style.setProperty('--pdf-page-width', `${paperWidthInches}in`);
  const multiPageWidth = `calc(${paperWidthInches}in - ${2 * pageMarginMm}mm)`;
  document.documentElement.style.setProperty('--pdf-layout-width', pageMode === 'multi' ? multiPageWidth : `${paperWidthInches}in`);
  if (document.fonts?.ready) await document.fonts.ready;
  const article = document.querySelector('.article') || document.body;
  fitSourceTextColors();
  if (pageMode === 'single') {
    const flow = article.querySelector('.article-content') ?? article;
    // Empty final paragraphs can create a print fragment after the article.
    while (flow.lastElementChild?.matches('p:empty:not([id],[name])')) {
      flow.lastElementChild.remove();
    }
  }
  restoreTableMedia();
  const tableLayouts = [];

  /** Keep source emphasis readable on the selected print background. */
  function fitSourceTextColors() {
    const luminance = rgb => rgb.reduce((sum, channel, index) => {
      const srgb = channel / 255;
      return sum + [0.2126, 0.7152, 0.0722][index] *
        (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4);
    }, 0);
    const contrast = (first, second) => (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    const rgb = value => {
      const parts = value.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
      return parts && (!parts[4] || Number(parts[4]) === 1) ? parts.slice(1, 4).map(Number) : null;
    };
    const backdrop = new Map();
    function background(element) {
      if (!element) return [255, 255, 255];
      if (!backdrop.has(element)) backdrop.set(element,
        rgb(getComputedStyle(element).backgroundColor) || background(element.parentElement));
      return backdrop.get(element);
    }
    for (const element of article.querySelectorAll('.article-content span[style]')) {
      const span = /** @type {HTMLElement} */ (element);
      if (!span.style.color) continue;
      const foreground = rgb(getComputedStyle(span).color);
      if (!foreground) continue;
      const backdropLightness = luminance(background(span));
      if (contrast(luminance(foreground), backdropLightness) >= 4.5) continue;
      const target = contrast(1, backdropLightness) > contrast(0, backdropLightness) ? 255 : 0;
      for (let step = 1; step <= 16; step++) {
        const adjusted = foreground.map(channel => Math.round(channel + (target - channel) * step / 16));
        if (contrast(luminance(adjusted), backdropLightness) < 4.5) continue;
        span.style.color = 'rgb(' + adjusted.join(', ') + ')';
        break;
      }
    }
  }

  function restoreTableMedia() {
    const media = new Map();
    for (const figure of article.querySelectorAll('figure.article-image[data-table-media][id]')) {
      const image = /** @type {HTMLImageElement | null} */ (figure.querySelector(':scope > img'));
      if (image?.naturalWidth) media.set(`#${figure.id}`, { figure, image });
    }
    if (!media.size) return;

    for (const reference of article.querySelectorAll('th a[href^="#reading-media-"], td a[href^="#reading-media-"]')) {
      const asset = media.get(reference.getAttribute('href'));
      if (!asset) continue;
      const { figure, image } = asset;
      let inlineMedia = figure;
      if (figure.classList.contains('table-media')) {
        inlineMedia = document.createElement('span');
        inlineMedia.className = 'table-media';
        inlineMedia.append(image.cloneNode());
      } else {
        const oldAnchor = figure.previousElementSibling;
        if (oldAnchor?.matches('a[name]:empty') && oldAnchor.getAttribute('name') === figure.id) oldAnchor.remove();
        figure.classList.replace('article-image', 'table-media');
      }
      if (reference.id) {
        const anchor = document.createElement('span');
        anchor.id = reference.id;
        reference.before(anchor);
      }
      reference.replaceWith(inlineMedia);
    }
  }

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
    const headersById = new Map();
    for (const { cell } of headers) if (cell.id && !headersById.has(cell.id)) headersById.set(cell.id, cell);
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
      if (principal.cell.hasAttribute('headers')) return [...new Set(principal.cell.getAttribute('headers').split(/[\t\n\f\r ]+/)
        .map(id => headersById.get(id)).filter(cell => cell && cell !== principal.cell && (cell.children.length || cell.textContent?.trim())))];
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
    const headCells = [...new Set(projected.filter(entry => entry.row.parentElement === table.tHead)
      .flatMap(entry => entry.cells.map(owner => owner.cell)))];
    return { columns, headingsFor, rows: body.length ? body : projected, headCells, headersOnly: body.length === 0 };
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
    const usedHeadings = new Set();
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
          usedHeadings.add(heading);
          if (index) label.appendChild(document.createElement('br'));
          appendCell(label, heading);
        });
        if (!headings.length) label.textContent = owner.width > 1 ? `${owner.column + 1}–${owner.column + owner.width}` : String(owner.column + 1);
        appendCell(value, owner.cell);
        field.append(label, value); record.append(field);
      });
      records.append(record);
    });
    if (!projection.headersOnly) {
      const unassigned = projection.headCells.filter(cell => !usedHeadings.has(cell) && (cell.id || cell.children.length || cell.textContent?.trim()));
      if (unassigned.length) {
        const context = document.createElement('header');
        context.className = 'pdf-table-context';
        unassigned.forEach((cell, index) => {
          if (index) context.appendChild(document.createElement('br'));
          appendCell(context, cell);
        });
        records.prepend(context);
      }
    }
    table.replaceWith(records);
    tableLayouts.push({ mode: 'records', columns: projection.columns, scale: 1 });
  }

  if (pageMode === 'single' && measureHeight() > maxSinglePageInches * 96) {
    pageMode = 'multi';
    // Move the original body padding to page margins without reducing the article's line width.
    const rules = document.createElement('style');
    rules.textContent = `@media print { @page { margin: ${pageMarginMm}mm ${pageMarginMm}mm 0; } body { padding: 0 !important; } }`;
    document.head.append(rules);
    document.documentElement.style.setProperty('--pdf-layout-width', multiPageWidth);
  }
  if (pageMode === 'multi' && paperHeightInches > pageMarginMm / 25.4) {
    const printableHeight = (paperHeightInches - pageMarginMm / 25.4) * 96;
    for (const quote of article.querySelectorAll('.article-content blockquote')) {
      if (quote instanceof HTMLElement && quote.getBoundingClientRect().height > printableHeight / 2) {
        quote.style.breakInside = 'auto';
      }
    }
    fitPageEndFigures(printableHeight);
  }

  return { contentWidth: article.getBoundingClientRect().width, contentHeight: measureHeight(), tableLayouts, pageMode };

  function measureHeight() {
    const bounds = article.getBoundingClientRect();
    // Collapsed margins can extend the document beyond the article's own box.
    const documentBottom = document.documentElement.getBoundingClientRect().bottom;
    return Math.ceil(Math.max(documentBottom, bounds.bottom, bounds.top + article.scrollHeight)) + 1;
  }

  function fitPageEndFigures(printablePageHeight) {
    if (!(article instanceof HTMLElement)) return;
    const figures = article.querySelectorAll('.article-content > figure.article-image');
    if (!figures.length) return;
    const articleBox = article.getBoundingClientRect();
    if (!articleBox.width) return;
    const printStyles = article.style.cssText;
    const lastFragment = element => Array.from(element?.getClientRects() || []).filter(rect => rect.height > 0).at(-1);
    const column = rect => Math.round(Math.abs(rect.left - articleBox.left) / articleBox.width);
    const margin = (element, direction) => parseFloat(getComputedStyle(element)[direction]) || 0;

    // Use page-sized columns to estimate where Chromium can keep a figure together.
    Object.assign(article.style, {
      columnWidth: `${articleBox.width}px`, columnGap: '0px', columnFill: 'auto',
      height: `${printablePageHeight}px`, minHeight: '0', maxHeight: 'none'
    });
    try {
      for (const figure of figures) {
        const image = /** @type {HTMLImageElement | null} */ (figure.querySelector(':scope > img'));
        if (!image) continue;

        let start = figure;
        let previous = start.previousElementSibling;
        while (previous) {
          if (lastFragment(previous)) {
            if (!previous.matches('h1,h2,h3,h4,h5,h6')) break;
            start = previous;
          }
          previous = previous.previousElementSibling;
        }
        const previousFragment = lastFragment(previous);
        const startFragment = lastFragment(start);
        if (!previousFragment || !startFragment || column(startFragment) !== column(previousFragment) + 1) continue;

        const gap = printablePageHeight - (previousFragment.bottom - articleBox.top);
        if (gap < printablePageHeight / 5) continue;
        const imageHeight = image.getBoundingClientRect().height;
        const figureEnd = figure.getBoundingClientRect().bottom;
        const before = Math.max(margin(previous, 'marginBottom'), margin(start, 'marginTop'));
        const groupHeight = figureEnd - startFragment.top;
        const availableImageHeight = Math.floor(imageHeight - (groupHeight + before - gap) - 2);

        // Keep diagrams readable and retain their caption within the same page.
        if (availableImageHeight < imageHeight * 0.8 || availableImageHeight >= imageHeight) continue;
        const oldMaxHeight = image.style.maxHeight;
        image.style.maxHeight = `${availableImageHeight}px`;
        const movedStart = lastFragment(start);
        const movedFigure = lastFragment(figure);
        if (!movedStart || !movedFigure || column(movedStart) !== column(previousFragment) ||
            column(movedFigure) !== column(previousFragment)) image.style.maxHeight = oldMaxHeight;
      }
    } finally {
      article.style.cssText = printStyles;
    }
  }
}

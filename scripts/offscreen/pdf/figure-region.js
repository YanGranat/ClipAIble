// @ts-check
import { loadPdfJs } from './utils/pdf-loader.js';
import { FIGURE_CAPTION_PATTERN } from './utils/regex-patterns.js';

function locateText(item, viewport, ascent = 1) {
  const matrix = item.transform;
  if (!matrix || !Number.isFinite(item.width) || !Number.isFinite(item.height)) return null;
  const [a, b, c, d, x, y] = matrix;
  const h = Math.hypot(a, b);
  const v = Math.hypot(c, d);
  if (!h || !v || item.height <= 0 || item.width <= 0) return null;
  const advance = [a * item.width / h, b * item.width / h];
  const rise = [c * item.height / v, d * item.height / v];
  const points = [0,1].flatMap(end => [-0.16,ascent].map(top =>
    viewport.convertToViewportPoint(x + advance[0]*end + rise[0]*top, y + advance[1]*end + rise[1]*top)));
  const left = Math.min(...points.map(point => point[0]));
  const right = Math.max(...points.map(point => point[0]));
  const top = Math.min(...points.map(point => point[1]));
  const bottom = Math.max(...points.map(point => point[1]));
  const [, baseline] = viewport.convertToViewportPoint(x, y);
  const height = item.height * viewport.scale;
  if (!Number.isFinite(left + baseline + height + right + top + bottom) || height <= 0 || right <= left) return null;
  return { item, left, right, top, bottom, baseline, height, horizontal: !matrix[1] && !matrix[2] && matrix[0] > 0 };
}

/** An authored caption is a necessary witness for an untagged PDF figure. */
export function authoredFigureCaption(textItems, viewport) {
  if (viewport.rotation) return null;
  const captions = textItems
    .filter(item => FIGURE_CAPTION_PATTERN.test((item.str || '').trim()))
    .map(item => locateText(item, viewport))
    .filter(Boolean);
  return captions.length === 1 && captions[0].horizontal ? captions[0].item : null;
}

function hasNonGridPath(commands) {
  let current;
  for (let offset = 0; offset < commands.length;) {
    const operator = commands[offset++];
    if (operator === 2 || operator === 3) return true;
    if (operator === 4) continue;
    if (operator !== 0 && operator !== 1) return false;
    const point = [commands[offset++], commands[offset++]];
    if (operator === 1 && current && current[0] !== point[0] && current[1] !== point[1]) return true;
    current = point;
  }
  return false;
}

function intersects(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function contains(outer, inner) {
  return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
}

function containsProseColumn(items, width, lineHeight) {
  const lines = items.filter(item => item.horizontal && item.right - item.left >= width * 0.24 &&
    (item.item.str.match(/\p{L}{2,}/gu) || []).length >= 7).sort((a, b) => a.baseline - b.baseline);
  for (const line of lines) {
    const next = lines.find(candidate => candidate.baseline - line.baseline > lineHeight * 0.5 &&
      candidate.baseline - line.baseline < lineHeight * 2 && Math.abs(candidate.left - line.left) < lineHeight);
    if (next && lines.some(candidate => candidate.baseline - next.baseline > lineHeight * 0.5 &&
      candidate.baseline - next.baseline < lineHeight * 2 && Math.abs(candidate.left - next.left) < lineHeight)) return true;
  }
  return false;
}

function boundingArea(boxes) {
  return boxes.reduce((area, box) => ({
    left: Math.min(area.left, box.left), top: Math.min(area.top, box.top),
    right: Math.max(area.right, box.right), bottom: Math.max(area.bottom, box.bottom)
  }));
}

function findVectorArea(paths, bins, caption, width, height) {
  const band = caption.height;
  const supportedBins = [...bins.entries()].filter(([, size]) => size >= 2).map(([bin]) => bin).sort((a, b) => a - b);
  const lastBin = supportedBins.pop();
  if (lastBin === undefined || caption.top / band - lastBin > 4) return null;
  let firstBin = lastBin;
  for (const bin of supportedBins.reverse()) {
    if (firstBin - bin > 2) break;
    firstBin = bin;
  }
  const ownedPaths = paths.filter(path => path.bin >= firstBin && path.bin <= lastBin);
  if (ownedPaths.length < 25 || ownedPaths.length > 12000 || ownedPaths.filter(path => path.nonGrid).length < 3) return null;
  const area = boundingArea(ownedPaths);
  if (area.right - area.left < width * 0.72 || area.bottom - area.top < band * 8 ||
      area.top > height * 0.25 || caption.left < area.left - 3 * band || caption.left > area.right) return null;
  return area;
}

/** Bind painted raster panels to a shared caption and their nearest overlapping band. */
function findRasterArea(images, caption) {
  const overlapsCaption = image => image.left < caption.right && image.right > caption.left;
  const candidates = images.filter(overlapsCaption).sort((a, b) => b.bottom - a.bottom);
  const nearest = candidates[0];
  if (!nearest || caption.top - nearest.bottom > caption.height * 4) return null;
  return boundingArea(candidates.filter(image => image.top < nearest.bottom && image.bottom > nearest.top));
}

/**
 * Keep one disjoint figure region preceding its caption.
 * The page renderer owns the operator bounds after clipping and transformations.
 */
export async function findFigureRegion(page, textItems, captionItem, paintedTables, viewport, width, height, operation, captionAscent = 1) {
  const boxes = page.recordedBBoxes;
  if (!boxes) return null;
  const caption = locateText(captionItem, viewport);
  if (!caption || caption.top >= height * 0.58 || caption.top <= height * 0.14) return null;

  operation.check();
  const { OPS, AnnotationMode } = await loadPdfJs();
  const operators = await page.getOperatorList({ intent: 'print', annotationMode: AnnotationMode.DISABLE });
  operation.check();
  const paths = [];
  const images = [];
  const bins = new Map();
  const band = caption.height;
  const figureLimit = Math.floor(caption.top - band * 0.12);
  const rasterCaption = captionAscent > 0 && captionAscent <= 1 ? locateText(captionItem, viewport, captionAscent) : caption;
  const rasterLimit = Math.floor(rasterCaption.top - band * 0.12);
  const rasterOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject]);
  const count = Math.min(operators.fnArray.length, boxes.length);
  if (count > 100000) return null;
  for (let index = 0; index < count; index++) {
    const op = operators.fnArray[index];
    const raster = rasterOps.has(op);
    if ((!raster && op !== OPS.constructPath) || boxes.isEmpty(index)) continue;
    const left = boxes.minX(index) * width;
    const top = boxes.minY(index) * height;
    const right = boxes.maxX(index) * width;
    const bottom = boxes.maxY(index) * height;
    if (!Number.isFinite(left + top + right + bottom) || left < 0 || top < 0 || right > width ||
        right <= left || bottom <= top) continue;
    const area = (right - left) * (bottom - top);
    if (raster) {
      if (bottom <= rasterLimit && right - left >= 2 * band && bottom - top >= 2 * band && area < width * height / 2) {
        images.push({ left, top, right, bottom });
      }
      continue;
    }
    if (bottom > figureLimit || area > width * height / 8) continue;
    const [paint, pathsArgs] = operators.argsArray[index] || [];
    if (![OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke,
      OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint)) continue;
    const bin = Math.floor((top + bottom) / (2 * band));
    bins.set(bin, (bins.get(bin) || 0) + 1);
    paths.push({ left, top, right, bottom, bin, nonGrid: hasNonGridPath(pathsArgs?.[0] || []) });
  }

  const vector = findVectorArea(paths, bins, caption, width, height);
  const area = vector || findRasterArea(images, rasterCaption);
  if (!area) return null;
  const bottomLimit = vector ? figureLimit : rasterLimit;

  const crop = {
    left: Math.max(0, area.left-band),
    top: Math.max(0, area.top-band),
    right: Math.min(width, area.right+band),
    bottom: Math.min(bottomLimit, area.bottom+band)
  };
  const all = textItems.filter(item => item.str?.trim()).map(item => locateText(item, viewport));
  if (all.some(item => !item)) return null;
  const labels = all.filter(item => item.top < crop.bottom && item.bottom > crop.top && item.item !== captionItem);
  const hasUnownedLabels = labels.some(label => label.right-label.left > width*0.38 ||
      label.left < area.left-3*band || label.right > area.right+3*band || label.bottom > bottomLimit);
  if ((vector && !labels.length) || labels.length > 4096 || hasUnownedLabels || containsProseColumn(labels, width, band)) return null;
  crop.left = Math.max(0, Math.floor(Math.min(crop.left, ...labels.map(label => label.left-band))));
  crop.right = Math.min(width, Math.ceil(Math.max(crop.right, ...labels.map(label => label.right+band))));
  crop.top = Math.max(0, Math.floor(Math.min(crop.top, ...labels.map(label => label.top-band))));
  crop.bottom = Math.min(height, Math.ceil(Math.max(crop.bottom, ...labels.map(label => label.bottom))));
  if (labels.some(label => !contains(crop, label))) return null;
  const labelSet = new Set(labels.map(label => label.item));
  if (all.some(item => item.item !== captionItem && !labelSet.has(item.item) && intersects(crop, item))) return null;
  const collision = paintedTables.some(table => {
    const bounds = table.paintedBounds;
    if (!bounds) return false;
    const scale = viewport.scale;
    return intersects(crop, { left: bounds.left*scale, top: bounds.top*scale, right: bounds.right*scale, bottom: bounds.bottom*scale });
  });
  if (collision) return null;
  return { ...crop, labelSet, sourceTop: crop.top/viewport.scale };
}

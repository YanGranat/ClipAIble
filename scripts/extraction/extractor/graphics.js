// @ts-check
import { toSvg } from 'html-to-image';
import { CONFIG } from '../../utils/config.js';
import { MAX_IMAGE_BYTES, detectImageMime, imageDataUrlBytes, readImageBytes, imageDataError } from '../../utils/html/image-bytes.js';
import { isExternalLinkAdornment, isSourceExcluded } from './dom-utils.js';
import { isCollapsedImageLayer, isPlaceholderUrl } from './images.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OMIT = 'figcaption,script,style,template,noscript,source,button,input,select,textarea,nav,footer,iframe,video,audio,object,embed,[role="button"],[role="navigation"],[contenteditable="true"]';
const DEFINITIONS = 'defs,marker,pattern,linearGradient,radialGradient,clipPath,mask,symbol,title,desc';
const FAILURE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
const CAPTION_GLYPH_MAX_SIZE = 48;

function failure() {
  return Object.assign(new Error('The article graphic could not be captured.'), {
    code: 'GRAPHIC_CAPTURE_FAILED', translationKey: 'errorImageUnavailable', translationParams: {}
  });
}

function hidden(element, descendants = false) {
  const win = element.ownerDocument.defaultView;
  for (let node = element; node; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if (style.display === 'none' || style.contentVisibility === 'hidden' || style.opacity === '0') return true;
    const absolute = style.position === 'absolute' || style.position === 'fixed';
    const emptyClip = absolute && /^rect\(0px,0px,0px,0px\)$/.test((style.clip || '').replace(/\s/g, ''));
    if (emptyClip || style.clipPath === 'inset(50%)') return true;
    if (node.matches('.katex-mathml,.MJX_Assistive_MathML') && style.position === 'absolute' && style.overflow === 'hidden') return true;
  }
  return ['hidden', 'collapse'].includes(win.getComputedStyle(element).visibility) && (!descendants || !Array.from(element.querySelectorAll('*')).some(node => !node.closest(DEFINITIONS) && !hidden(node)));
}

function controls(element) {
  return !!element.closest('button,input,select,textarea,nav,footer,[role="button"],[role="navigation"],[contenteditable="true"]');
}

function isRenderedPlaceholder(element) {
  if (element.tagName !== 'IMG') return false;
  const image = /** @type {HTMLImageElement} */ (element);
  const source = image.currentSrc || image.getAttribute('src');
  return !!source && isPlaceholderUrl(source, image);
}

function hasLayeredImages(figure) {
  const bounds = Array.from(figure.querySelectorAll('img')).filter(image => image.closest('figure') === figure && image.complete && image.naturalWidth && image.naturalHeight && !isRenderedPlaceholder(image) && !controls(image) && !hidden(image)).map(image => {
    const border = image.getBoundingClientRect(), style = image.ownerDocument.defaultView.getComputedStyle(image);
    if (!(border.width > 0 && border.height > 0)) return null;
    const inset = side => parseFloat(style.getPropertyValue(`border-${side}-width`) || '0') + parseFloat(style.getPropertyValue(`padding-${side}`) || '0');
    const horizontal = inset('left') + inset('right'), vertical = inset('top') + inset('bottom');
    const scaleX = border.width / ((parseFloat(style.width) || border.width) + (style.boxSizing === 'border-box' ? 0 : horizontal));
    const scaleY = border.height / ((parseFloat(style.height) || border.height) + (style.boxSizing === 'border-box' ? 0 : vertical));
    const rect = { left: border.left + inset('left') * scaleX, top: border.top + inset('top') * scaleY, right: border.right - inset('right') * scaleX, bottom: border.bottom - inset('bottom') * scaleY, width: border.width - horizontal * scaleX, height: border.height - vertical * scaleY };
    if (!['contain', 'scale-down', 'none'].includes(style.objectFit)) return rect;
    const fit = style.objectFit === 'none' ? 1 : Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight, style.objectFit === 'scale-down' ? 1 : Infinity);
    const width = image.naturalWidth * fit, height = image.naturalHeight * fit;
    const positions = (style.objectPosition || '50% 50%').split(/\s+/);
    if (positions.length !== 2) return null;
    const offset = (value, space) => value.endsWith('%') ? parseFloat(value) * space / 100 : value.endsWith('px') ? parseFloat(value) : ({ left: 0, top: 0, center: space / 2, right: space, bottom: space })[value];
    const x = offset(positions[0], rect.width - width), y = offset(positions[1], rect.height - height);
    return Number.isFinite(x + y) ? { left: Math.max(rect.left, rect.left + x), top: Math.max(rect.top, rect.top + y), right: Math.min(rect.right, rect.left + x + width), bottom: Math.min(rect.bottom, rect.top + y + height) } : null;
  }).filter(Boolean).sort((first, second) => first.left - second.left);
  return bounds.some((first, index) => {
    for (let next = index + 1; next < bounds.length && bounds[next].left < first.right; next++) {
      const second = bounds[next];
      if (Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)) return true;
    }
    return false;
  });
}

function isDecorativeLinkGraphic(graphic) {
  if (graphic && isExternalLinkAdornment(graphic)) return true;
  if (graphic?.tagName.toLowerCase() !== 'svg' || graphic.getAttribute('aria-hidden') !== 'true' ||
      graphic.textContent?.trim() || graphic.hasAttribute('aria-label') || graphic.hasAttribute('aria-labelledby')) return false;
  const link = graphic.closest('a[href]');
  const figure = graphic.closest('figure');
  return !!link?.textContent?.trim() && !(figure && link.contains(figure));
}

function isCaptionSvgGlyph(graphic, figure) {
  if (graphic.localName !== 'svg' || graphic.closest('figcaption')?.closest('figure') !== figure) return false;
  if (graphic.hasAttribute('role') || graphic.hasAttribute('aria-label') || graphic.hasAttribute('aria-labelledby') ||
      graphic.textContent?.trim() || graphic.querySelector('title,desc,text,image,foreignObject')) return false;
  const { width, height } = graphic.getBoundingClientRect();
  return width > 0 && height > 0 && width <= CAPTION_GLYPH_MAX_SIZE && height <= CAPTION_GLYPH_MAX_SIZE;
}

/** Identify a graphic by its reading scope and semantic ownership. */
export function getGraphicReadingOwner(element, roots) {
  if (!element || !roots?.some(root => root === element || root.contains(element))) return null;
  const graphic = element.closest('svg,canvas');
  const pre = graphic?.parentElement;
  const replacesCodeBlock = pre?.tagName === 'PRE' && Array.from(pre.childNodes).every(node =>
    node === graphic || node.nodeType === 8 || node.nodeType === 3 && !node.textContent?.trim());
  if (element.closest('code,math,mjx-container,.MathJax,.katex') || (!replacesCodeBlock && element.closest('pre'))) return null;
  const figure = element.closest('figure');
  if ((!figure && !graphic) || isDecorativeLinkGraphic(graphic) || controls(element) || hidden(element, true)) return null;
  if (figure && roots.some(root => root === figure || root.contains(figure))) {
    const graphics = Array.from(figure.querySelectorAll('svg,canvas')).filter(node => node.closest('figure') === figure &&
      !isCaptionSvgGlyph(node, figure) && !isDecorativeLinkGraphic(node) && !controls(node) && !hidden(node, true));
    const layered = hasLayeredImages(figure);
    if (graphics.length || layered) {
      const mixed = !!figure.querySelector('figure') || Array.from(figure.querySelectorAll('p,table,img,blockquote,pre,ul,ol')).some(node =>
        !(layered && node.tagName === 'IMG') && !isRenderedPlaceholder(node) && !node.closest('figcaption,svg,[role="img"]') && !controls(node) && !hidden(node));
      if (!mixed) return figure;
      return element.closest('svg,canvas');
    }
  }
  if (!graphic || /(?:^|[\s_-])icon(?:$|[\s_-])/i.test(graphic.getAttribute('class') || '')) return null;
  const labelled = replacesCodeBlock || graphic.tagName === 'CANVAS' || graphic.matches('[role~="img"],[role~="graphics-document"]') || graphic.hasAttribute('aria-label') || graphic.hasAttribute('aria-labelledby') ||
    !!graphic.querySelector('title') || roots.includes(graphic);
  return labelled ? graphic : null;
}

function excluded(element, owner, selectors) {
  if (element.tagName === 'IMG' && isCollapsedImageLayer(/** @type {HTMLImageElement} */ (element))) return true;
  if (isRenderedPlaceholder(element) || hidden(element, true) || isSourceExcluded(element, selectors)) return true;
  for (let node = element; node && node !== owner; node = node.parentElement) {
    if (node.matches(OMIT)) return true;
  }
  return isSourceExcluded(owner, selectors);
}

function visibleText(owner, selectors, caption = false) {
  function read(node) {
    if (node.nodeType === 3) return !hidden(node.parentElement) ? node.textContent || '' : '';
    if (node.nodeType !== 1) return '';
    const element = /** @type {Element} */ (node);
    if ((!caption && element.closest('figcaption')) || excluded(element, owner, selectors) || element.matches('script,style,template,noscript,title,desc,defs')) return '';
    if (element.tagName === 'IMG') return '\n' + (element.getAttribute('alt') || graphicLabel(element)) + '\n';
    const annotation = element.matches('.katex,.MathJax') ? element.querySelector('annotation[encoding*="tex"]') : null;
    if (annotation?.textContent?.trim()) return ' ' + annotation.textContent.trim() + ' ';
    let text = Array.from(element.childNodes).map(read).join('');
    if (element.namespaceURI !== SVG_NS && !hidden(element)) {
      const pseudo = name => {
        const style = element.ownerDocument.defaultView.getComputedStyle(element, name);
        if (style.display === 'none' || style.visibility === 'hidden') return '';
        return (style.content.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) || []).map(value => value.slice(1, -1).replace(/\\(?:([a-f\d]{1,6})\s?|([\s\S]))/gi, (_, hex, character) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : character)).join('');
      };
      text = [pseudo('::before'), text, pseudo('::after')].filter(Boolean).join('\n');
    }
    if (element !== owner && element.matches('svg,canvas')) {
      const label = graphicLabel(element);
      if (label && label !== text.trim()) text = label + '\n' + text;
    }
    const display = element.ownerDocument.defaultView.getComputedStyle(element).display;
    return /^(?:block|flex|grid|flow-root|list-item|table)/.test(display) || element.tagName === 'BR' || element.localName === 'text' ? '\n' + text + '\n' : text;
  }
  return read(owner).replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function graphicLabel(element) {
  const doc = element.ownerDocument;
  return (element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ') || element.querySelector('title')?.textContent || '').trim();
}

function hasCanvasPixels(context, canvas, deadline) {
  for (let top = 0; top < canvas.height; top += 64) {
    if (Date.now() >= deadline) throw imageDataError('IMAGE_TIMEOUT');
    const pixels = context.getImageData(0, top, canvas.width, Math.min(64, canvas.height - top)).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) return true;
    }
  }
  return false;
}

function unreadableCanvasReference(owner, roots, text) {
  const doc = owner.ownerDocument;
  const link = doc.createElement('a');
  const target = owner.closest('[id]');
  if (target?.id && roots.some(root => root === target || root.contains(target))) {
    const url = new URL(doc.URL);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
      url.hash = encodeURIComponent(target.id);
      link.href = url.href;
    }
  }
  if (!link.hasAttribute('href') && !text) return null;
  link.textContent = text || 'Open original graphic';
  const html = link.hasAttribute('href') ? link.outerHTML : link.innerHTML;
  return { type: 'paragraph', text: html, html };
}

function localReference(value, doc) {
  try {
    const url = new URL(value, doc.baseURI), source = new URL(doc.URL);
    const hash = url.hash; url.hash = source.hash = '';
    return hash && url.href === source.href ? hash : null;
  } catch { return null; }
}

function originalImageLayers(owner, included) {
  if (owner.tagName !== 'FIGURE' || included.some(node => node.matches('svg,canvas'))) return [];
  const images = included.filter(node => node.tagName === 'IMG' && node.closest('figure') === owner);
  const sources = [];
  for (const node of images) {
    const image = /** @type {HTMLImageElement} */ (node);
    const source = image.currentSrc || image.getAttribute('src');
    if (!source || !image.complete || !image.naturalWidth || !image.naturalHeight) return [];
    const url = new URL(source, image.ownerDocument.baseURI);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
    sources.push(url.href);
  }
  return sources;
}

function paintedRectangles(win, owner, elements) {
  const clips = new Map();
  const boundary = owner.parentElement;
  const clipsAxis = value => /^(hidden|clip|auto|scroll)$/.test(value);
  const clippingBox = element => {
    if (!clips.has(element)) {
      const style = win.getComputedStyle(element);
      const horizontal = clipsAxis(style.overflowX || style.overflow);
      const vertical = clipsAxis(style.overflowY || style.overflow);
      clips.set(element, horizontal || vertical ? { horizontal, vertical, rect: element.getBoundingClientRect() } : null);
    }
    return clips.get(element);
  };
  const rectangles = [];
  for (const element of elements) {
    let { left, top, right, bottom } = element.getBoundingClientRect();
    if (right <= left || bottom <= top) continue;
    for (let parent = element.parentElement; parent && parent !== boundary; parent = parent.parentElement) {
      const clip = clippingBox(parent);
      if (clip?.horizontal) { left = Math.max(left, clip.rect.left); right = Math.min(right, clip.rect.right); }
      if (clip?.vertical) { top = Math.max(top, clip.rect.top); bottom = Math.min(bottom, clip.rect.bottom); }
      if (right <= left || bottom <= top) break;
    }
    if (right > left && bottom > top) rectangles.push({ left, top, right, bottom });
  }
  return rectangles;
}

/** Capture each owned graphic once without modifying its source document. */
export async function captureReadingGraphics(win, elements, state, constants) {
  const roots = state.referenceRoots || [];
  const selectors = state.selectionExclusions || [];
  const deadline = state.extractionDeadline ?? Date.now() + CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT;
  const owners = new Set();
  for (const element of elements) {
    if (Date.now() >= deadline) throw imageDataError('IMAGE_TIMEOUT');
    const owner = getGraphicReadingOwner(element, roots);
    if (owner) owners.add(owner);
  }
  const result = new Map();
  if (!owners.size) return result;
  const controller = new win.AbortController();
  const timer = win.setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(imageDataError('IMAGE_TIMEOUT')), { once: true }));
  const bounded = promise => Promise.race([promise, aborted]);
  const resources = new Map();
  const failedFetches = new WeakSet();
  const validateResource = bytes => {
    const mime = detectImageMime(bytes);
    if (mime === 'image/svg+xml') {
      const xml = new win.DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
      const externalCss = value => /@import/i.test(value) || [...value.matchAll(/url\((['"]?)(.*?)\1\)/g)].some(match => !match[2].trim().startsWith('#'));
      if (xml.querySelector('parsererror,script,foreignObject') || Array.from(xml.querySelectorAll('*')).some(node =>
        (node.localName === 'style' && externalCss(node.textContent || '')) || Array.from(node.attributes).some(attribute =>
          /^on/i.test(attribute.name) || ((attribute.name === 'href' || attribute.name.endsWith(':href')) && !attribute.value.startsWith('#')) || externalCss(attribute.value)))) throw failure();
    }
    return mime;
  };
  const dataUrl = async (url, doc) => {
    if (/^data:image\//i.test(url)) { validateResource(imageDataUrlBytes(url)); return url; }
    const absolute = new URL(url, doc.baseURI);
    if (!['https:', 'http:', 'blob:'].includes(absolute.protocol) || absolute.username || absolute.password) throw failure();
    if (!resources.has(absolute.href)) resources.set(absolute.href, (async () => {
      const response = await win.fetch(absolute.href, { credentials: 'omit', signal: controller.signal }).catch(error => {
        if (!controller.signal.aborted && error?.name === 'TypeError') failedFetches.add(error);
        throw error;
      });
      if (!response.ok) throw failure();
      const bytes = await readImageBytes(response), mime = validateResource(bytes);
      return await new Promise((resolve, reject) => {
        const reader = new win.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
        reader.readAsDataURL(new win.Blob([bytes], { type: mime }));
      });
    })());
    return bounded(resources.get(absolute.href));
  };

  async function image(url) {
    return bounded(new Promise((resolve, reject) => {
      const img = new win.Image(); img.onload = () => img.naturalWidth && img.naturalHeight ? resolve(img) : reject(failure()); img.onerror = () => reject(failure()); img.src = url;
    }));
  }

  try {
    captureOwner: for (const owner of owners) {
      if (Date.now() >= deadline) throw imageDataError('IMAGE_TIMEOUT');
      if (excluded(owner, owner, selectors)) continue;
      const doc = owner.ownerDocument;
      if (doc.fonts?.ready) await bounded(doc.fonts.ready);
      const captionNode = owner.tagName === 'FIGURE' ? Array.from(owner.querySelectorAll('figcaption')).find(node => node.closest('figure') === owner) : null;
      const caption = captionNode ? visibleText(captionNode, selectors, true) : '';
      const label = graphicLabel(owner);
      const text = visibleText(owner, selectors);
      const alt = [label.trim() && label.trim() !== text && label.trim() !== caption ? label.trim() : '', text].filter(Boolean).join('\n');
      const nodes = [owner, ...Array.from(owner.querySelectorAll('*'))];
      const included = nodes.filter(node => !excluded(node, owner, selectors) && !node.closest(DEFINITIONS));
      const rectangles = paintedRectangles(win, owner, owner.tagName === 'FIGURE' ? included.slice(1) : included);
      if (!rectangles.length) throw failure();
      const extent = rectangles.reduce((bounds, rect) => ({ left: Math.min(bounds.left, rect.left), top: Math.min(bounds.top, rect.top), right: Math.max(bounds.right, rect.right), bottom: Math.max(bounds.bottom, rect.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      if (owner.localName === 'svg') {
        // The viewport clips descendant geometry before the SVG is painted.
        const viewport = owner.getBoundingClientRect();
        const { overflowX, overflowY } = win.getComputedStyle(owner);
        if (viewport.width && /^(hidden|clip|auto|scroll)$/.test(overflowX)) {
          extent.left = viewport.left;
          extent.right = viewport.right;
        }
        if (viewport.height && /^(hidden|clip|auto|scroll)$/.test(overflowY)) {
          extent.top = viewport.top;
          extent.bottom = viewport.bottom;
        }
      }
      let width = extent.right - extent.left, height = extent.bottom - extent.top;
      if (!Number.isFinite(width * height) || width <= 0 || height <= 0) throw failure();
      const scale = Math.min(1, 32767 / width, 32767 / height, Math.sqrt(2 ** 25 / (width * height)));
      const canvas = doc.createElement('canvas'); canvas.width = Math.max(1, Math.floor(width * scale)); canvas.height = Math.max(1, Math.floor(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw failure();
      const backdrop = [];
      for (let node = owner; node; node = node.parentElement) backdrop.push(win.getComputedStyle(node).backgroundColor);
      if (owner.tagName === 'CANVAS') {
        context.drawImage(owner, 0, 0, canvas.width, canvas.height);
        if (!hasCanvasPixels(context, canvas, deadline)) {
          const reference = unreadableCanvasReference(owner, roots, alt);
          if (reference) result.set(owner, reference);
          continue;
        }
        context.globalCompositeOperation = 'destination-over';
        for (const color of backdrop) { context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height); }
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
        for (const color of backdrop.reverse()) { context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height); }
        const clone = owner.cloneNode(true), copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
        const definitions = doc.createElementNS(SVG_NS, 'svg');
        definitions.setAttribute('width', '0'); definitions.setAttribute('height', '0');
        definitions.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
        const definitionRoot = doc.createElementNS(SVG_NS, 'defs'); definitions.append(definitionRoot);
        const referenceScope = doc.createElement('div'); referenceScope.append(clone, definitions);
        const pseudoRules = [];
        for (let index = 0; index < nodes.length; index++) {
          if (Date.now() >= deadline) throw imageDataError('IMAGE_TIMEOUT');
          const original = nodes[index], copy = copies[index];
          const pseudoReferences = [];
          const style = win.getComputedStyle(original);
          if (copy.style) {
            const declarations = [];
            for (const property of Array.from(style)) {
              const value = style.getPropertyValue(property).replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, url) => {
                const local = localReference(url, doc); return local ? `url("${local}")` : match;
              });
              if (value) declarations.push(`${property}:${value}!important;`);
              else copy.style.removeProperty(property);
            }
            copy.style.cssText += declarations.join('');
          }
          for (const attribute of Array.from(copy.attributes || [])) if (/^on/i.test(attribute.name)) copy.removeAttribute(attribute.name);
          if ((original === owner || owner.contains(original)) && excluded(original, owner, selectors)) {
            const rect = original.getBoundingClientRect(); copy.replaceChildren();
            copy.style?.setProperty('visibility', 'hidden', 'important'); copy.style?.setProperty('width', rect.width + 'px', 'important'); copy.style?.setProperty('height', rect.height + 'px', 'important');
            for (const attribute of Array.from(copy.attributes)) if (attribute.name !== 'style') copy.removeAttribute(attribute.name);
            for (const property of Array.from(copy.style || [])) if (/url\(|@import/i.test(copy.style.getPropertyValue(property))) copy.style.removeProperty(property);
            if ('value' in copy) copy.value = '';
            continue;
          }
          if (original.namespaceURI !== SVG_NS) {
            for (const pseudo of ['::before', '::after']) {
              const pseudoStyle = win.getComputedStyle(original, pseudo);
              if (!pseudoStyle.content || ['none', 'normal'].includes(pseudoStyle.content) || pseudoStyle.display === 'none') continue;
              const token = `reading-graphic-${index}-${pseudo.slice(2)}`;
              copy.classList.add(token);
              const declarations = Array.from(pseudoStyle).map(property => `${property}:${pseudoStyle.getPropertyValue(property)}!important;`).join('');
              pseudoReferences.push(...[...declarations.matchAll(/url\(['"]?(#[^)'"\s]+)['"]?\)/g)].map(match => match[1]));
              pseudoRules.push(`.${token}${pseudo}{${declarations}}`);
            }
          }
          if (original.tagName === 'CANVAS') {
            const bitmap = doc.createElement('img'); bitmap.src = original.toDataURL(); bitmap.style.cssText = copy.style.cssText;
            copy.replaceWith(bitmap); continue;
          }
          if (original.tagName === 'IMG') {
            const source = original.currentSrc || original.getAttribute('src');
            if (!source) throw failure();
            let embeddedSource;
            try {
              embeddedSource = await dataUrl(source, doc);
            } catch (error) {
              if (!failedFetches.has(error) || new URL(source, doc.baseURI).origin === new URL(doc.URL).origin) throw error;
              const layers = originalImageLayers(owner, included);
              if (layers.length < 2) throw error;
              state.originalImageLayers ||= new Map();
              state.originalImageLayers.set(owner, layers);
              continue captureOwner;
            }
            copy.setAttribute('src', embeddedSource);
            for (const attribute of ['srcset', 'sizes', 'loading', 'crossorigin']) copy.removeAttribute(attribute);
          }
          for (const attribute of ['href', 'xlink:href', 'src']) {
            const value = copy.getAttribute(attribute);
            if (!value) continue;
            if (copy.tagName === 'A' || copy.localName === 'a') { copy.removeAttribute(attribute); continue; }
            const local = localReference(value, doc);
            if (local) copy.setAttribute(attribute, local);
            else if (copy.localName === 'use') throw failure();
            else if (['img', 'image', 'feImage'].includes(copy.localName)) copy.setAttribute(attribute, await dataUrl(value, doc));
          }
          for (const property of Array.from(copy.style || [])) {
            const value = copy.style.getPropertyValue(property);
            const matches = [...value.matchAll(/url\((['"]?)(.*?)\1\)/g)];
            let embedded = value;
            for (const match of matches) {
              if (match[2].startsWith('#') || match[2].startsWith('data:')) continue;
              if (!/^(?:background|mask|-webkit-mask|border-image|list-style-image)/.test(property)) throw failure();
              embedded = embedded.replace(match[0], `url("${await dataUrl(match[2], doc)}")`);
            }
            if (embedded !== value || copy.style.getPropertyPriority(property) !== 'important') {
              copy.style.setProperty(property, embedded, 'important');
            }
          }
          const references = [...pseudoReferences, ...Array.from(copy.attributes).flatMap(attribute => {
            const values = [...attribute.value.matchAll(/url\(['"]?(#[^)'"\s]+)['"]?\)/g)].map(match => match[1]);
            if ((attribute.name === 'href' || attribute.name.endsWith(':href')) && attribute.value.startsWith('#')) values.push(attribute.value);
            return values;
          })];
          for (const reference of references) {
            const id = decodeURIComponent(reference.slice(1));
            if (Array.from(referenceScope.querySelectorAll('[id]')).some(node => node.id === id)) continue;
            const source = doc.getElementById(id);
            if (!source || source.namespaceURI !== SVG_NS || source.matches('script,foreignObject')) throw failure();
            const definition = source.cloneNode(true);
            definitionRoot.append(definition);
            nodes.push(source, ...Array.from(source.querySelectorAll('*')));
            copies.push(definition, ...Array.from(definition.querySelectorAll('*')));
          }
        }
        const rootRect = owner.getBoundingClientRect(), rootStyle = win.getComputedStyle(owner);
        let matrix = new win.DOMMatrix();
        for (let node = owner; node; node = node.parentElement) {
          const transform = win.getComputedStyle(node).transform;
          if (transform && transform !== 'none') matrix = new win.DOMMatrix(transform).multiply(matrix);
        }
        if (!matrix.is2D) throw failure();
        const dimension = axis => {
          const sides = axis === 'width' ? ['left', 'right'] : ['top', 'bottom'];
          return parseFloat(rootStyle[axis]) + (rootStyle.boxSizing === 'border-box' ? 0 : sides.reduce((total, side) => total + parseFloat(rootStyle.getPropertyValue(`padding-${side}`) || '0') + parseFloat(rootStyle.getPropertyValue(`border-${side}-width`) || '0'), 0));
        };
        const sourceWidth = dimension('width'), sourceHeight = dimension('height');
        const corners = [[0, 0], [sourceWidth, 0], [0, sourceHeight], [sourceWidth, sourceHeight]].map(([x, y]) => ({ x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y }));
        const left = Math.min(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y));
        if (!Number.isFinite(sourceWidth * sourceHeight) || Math.abs(Math.max(...corners.map(point => point.x)) - left - rootRect.width) > 2 || Math.abs(Math.max(...corners.map(point => point.y)) - top - rootRect.height) > 2) throw failure();
        const wrapper = doc.createElement('div'); wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
        clone.style.setProperty('position', 'absolute', 'important'); clone.style.setProperty('margin', '0', 'important');
        clone.style.setProperty('transform', `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},0,0)`, 'important'); clone.style.setProperty('transform-origin', '0 0', 'important');
        clone.style.setProperty('left', rootRect.left - extent.left - left + 'px', 'important'); clone.style.setProperty('top', rootRect.top - extent.top - top + 'px', 'important');
        wrapper.append(clone, definitions);
        if (pseudoRules.length) { const styles = doc.createElement('style'); styles.textContent = pseudoRules.join('\n'); wrapper.append(styles); }
        const svgUrl = await bounded(toSvg(wrapper, { width, height, skipFonts: true, includeQueryParams: true, includeStyleProperties: [], imagePlaceholder: FAILURE_IMAGE,
          fetchRequestInit: { credentials: 'omit', signal: controller.signal }, onImageErrorHandler: () => { throw failure(); } }));
        const xml = decodeURIComponent(svgUrl.slice(svgUrl.indexOf(',') + 1));
        if (xml.includes(FAILURE_IMAGE) || /url\(\s*["']?(?:https?:|blob:)/i.test(xml)) throw failure();
        const serialized = new win.DOMParser().parseFromString(xml, 'image/svg+xml');
        if (serialized.querySelector('parsererror')) throw failure();
        const serializedElements = Array.from(serialized.querySelectorAll('*'));
        if (serializedElements.some(node => Array.from(node.attributes).some(attribute =>
          ['href', 'src'].includes(attribute.localName) && /^(?:https?:|blob:)/i.test(attribute.value.trim())))) throw failure();
        const ids = new Set(Array.from(serialized.querySelectorAll('[id]')).map(node => node.id));
        const references = [...xml.matchAll(/url\(['"]?(#[^)'"\s]+)['"]?\)/g)].map(match => match[1]);
        references.push(...serializedElements.flatMap(node => Array.from(node.attributes).filter(attribute => (attribute.name === 'href' || attribute.name.endsWith(':href')) && attribute.value.startsWith('#')).map(attribute => attribute.value)));
        if (references.some(reference => !ids.has(decodeURIComponent(reference.slice(1))))) throw failure();
        if (scale < 1) { serialized.documentElement.setAttribute('width', String(canvas.width)); serialized.documentElement.setAttribute('height', String(canvas.height)); }
        const rendered = await image(scale < 1 ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new win.XMLSerializer().serializeToString(serialized)) : svgUrl);
        context.drawImage(rendered, 0, 0, canvas.width, canvas.height);
      }
      const src = canvas.toDataURL('image/png');
      const bytes = imageDataUrlBytes(src);
      if (detectImageMime(bytes) !== 'image/png' || bytes.byteLength > MAX_IMAGE_BYTES) throw failure();
      result.set(owner, { type: 'image', isGraphic: true, src, alt, caption });
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw imageDataError('IMAGE_TIMEOUT');
    throw typeof error?.code === 'string' ? error : failure();
  } finally { win.clearTimeout(timer); }
}

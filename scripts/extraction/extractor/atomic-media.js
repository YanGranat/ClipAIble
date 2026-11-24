// @ts-check
import { cloneReadingContent, isSourceExcluded } from './dom-utils.js';
import { preserveClonedMathInputs } from './inline-content.js';

/** @typedef {import('./types.js').ContentItem} ContentItem */

function sourceOrder(first, second) {
  if (first === second) return 0;
  return first.compareDocumentPosition(second) & 4 ? -1 : 1;
}

function hasReadingContent(fragment) {
  return !!fragment.textContent?.trim() || !!fragment.querySelector('img,svg,canvas');
}

/** Reserve both authored fragment targets and authored links to unresolved targets. */
function reservedMediaIds(document) {
  const reserved = new Set(Array.from(document.querySelectorAll('[id],[name]'))
    .flatMap(element => [element.id, element.getAttribute('name')]).filter(Boolean));
  const source = new URL(document.URL);
  source.hash = '';
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href').trim();
    if (!href.includes('#')) continue;
    try {
      const target = new URL(href, document.baseURI);
      const id = decodeURIComponent(target.hash.slice(1));
      if (!id.startsWith('reading-media-')) continue;
      target.hash = '';
      if (href.startsWith('#') || target.href === source.href) reserved.add(id);
    } catch (_) { }
  }
  return reserved;
}

function replaceLinkedMedia(copy, reference) {
  const link = copy.closest('a[href]');
  if (!link) { copy.replaceWith(reference); return null; }
  const doc = copy.ownerDocument;
  const afterRange = doc.createRange(); afterRange.selectNodeContents(link); afterRange.setStartAfter(copy);
  const after = afterRange.extractContents();
  const beforeRange = doc.createRange(); beforeRange.selectNodeContents(link); beforeRange.setEndBefore(copy);
  const before = beforeRange.extractContents();
  const linkedContent = hasReadingContent(before) || hasReadingContent(after);
  const parts = [];
  const part = fragment => {
    if (!fragment.childNodes.length) return;
    const anchor = link.cloneNode(false); anchor.append(fragment); parts.push(anchor);
  };
  part(before); parts.push(reference); part(after);
  if (!linkedContent) {
    const source = link.cloneNode(false); source.textContent = 'Source'; parts.push(doc.createTextNode(' '), source);
  }
  const seen = new Set();
  for (const element of parts.filter(node => node.nodeType === 1)) {
    for (const node of [element, ...Array.from(element.querySelectorAll('[id]'))]) {
      if (!node.id) continue;
      if (seen.has(node.id)) node.removeAttribute('id');
      else seen.add(node.id);
    }
  }
  link.replaceWith(...parts);
  return { removed: link, links: parts.filter(node => node.nodeType === 1 && node !== reference && node.tagName === 'A') };
}

/**
 * Project admitted media into local references followed by typed image items.
 * @param {Element} originalElement
 * @param {Iterable<Element>} admittedElements
 * @param {{readingGraphics?: Map<Element, ContentItem>, readingMediaIds?: Map<Element, string>, readingMediaReservations?: Set<string>, readingMediaCounter?: number, selectionExclusions?: Array<Element|string>}} state
 * @param {(source: Element) => ContentItem|null} createImageItem
 * @returns {{clone: Element, copies: Map<Element, Element>, media: Array<{source: Element, item: ContentItem}>}}
 */
export function projectAtomicMedia(originalElement, admittedElements, state, createImageItem) {
  const copies = new Map();
  const clone = /** @type {Element} */ (cloneReadingContent(originalElement, state.selectionExclusions || [], copies));
  preserveClonedMathInputs(originalElement, copies);
  const admitted = new Set(admittedElements);
  const graphics = [...(state.readingGraphics?.keys() || [])].filter(owner => originalElement.contains(owner) &&
    (admitted.has(owner) || [...admitted].some(element => owner.contains(element))));
  const candidates = [...new Set([...graphics, ...Array.from(originalElement.querySelectorAll('img')).filter(image => admitted.has(image))])].sort(sourceOrder);
  const owners = candidates.filter(owner => !candidates.some(other => other !== owner && other.contains(owner)));
  if (!owners.length) return { clone, copies, media: [] };
  state.readingMediaIds ||= new Map();
  const reserved = state.readingMediaReservations ||= new Set([
    ...reservedMediaIds(originalElement.ownerDocument), ...state.readingMediaIds.values()
  ]);
  const media = [];
  const sourceLinks = new Map();
  for (const owner of owners) {
    let copy = copies.get(owner), insertion = null;
    if (!copy || !clone.contains(copy)) {
      if (isSourceExcluded(owner, state.selectionExclusions || [])) continue;
      const win = owner.ownerDocument.defaultView;
      if (['hidden', 'collapse'].includes(win?.getComputedStyle(owner).visibility)) continue;
      let hidden = false;
      for (let node = owner; node; node = node.parentElement) if (win?.getComputedStyle(node).display === 'none') { hidden = true; break; }
      if (hidden) continue;
      let originalTextOwner = false;
      for (let ancestor = owner.parentElement; ancestor && originalElement.contains(ancestor); ancestor = ancestor.parentElement) {
        const target = copies.get(ancestor);
        if (ancestor.getAttribute('data-original-text')?.trim() && target && clone.contains(target)) { originalTextOwner = true; break; }
      }
      if (originalTextOwner) for (let ancestor = owner.parentElement; ancestor && originalElement.contains(ancestor); ancestor = ancestor.parentElement) {
        const target = copies.get(ancestor);
        if (ancestor.matches('td,th,li,blockquote') && target && clone.contains(target)) { insertion = target; break; }
      }
      if (!insertion) continue;
    }
    const item = state.readingGraphics?.get(owner) || (owner.tagName === 'IMG' ? createImageItem(owner) : null);
    if (!item) continue;
    let id = state.readingMediaIds.get(owner);
    if (!id) {
      do { state.readingMediaCounter = (state.readingMediaCounter || 0) + 1; id = `reading-media-${state.readingMediaCounter}`; } while (reserved.has(id));
      state.readingMediaIds.set(owner, id); reserved.add(id);
    }
    const reference = originalElement.ownerDocument.createElement('a');
    reference.href = '#' + encodeURIComponent(id);
    reference.textContent = item.alt?.trim() || 'Image';
    if (owner.id) reference.id = owner.id;
    const sourceLink = owner.closest('a[href]');
    if (insertion) {
      insertion.append(' ', reference);
      if (sourceLink) {
        const link = originalElement.ownerDocument.createElement('a'); link.setAttribute('href', sourceLink.getAttribute('href')); link.textContent = 'Source';
        if (sourceLink.id && !Array.from(clone.querySelectorAll('[id]')).some(node => node.id === sourceLink.id)) link.id = sourceLink.id;
        insertion.append(' ', link);
      }
    } else {
      const control = copy.closest('button,[role="button"]');
      let split = null;
      if (control && clone.contains(control) && control !== clone) control.replaceWith(reference);
      else split = replaceLinkedMedia(copy, reference);
      if (sourceLink && split) {
        if (!sourceLinks.has(sourceLink)) sourceLinks.set(sourceLink, new Set());
        const links = sourceLinks.get(sourceLink); links.delete(split.removed);
        for (const link of split.links) links.add(link);
      }
    }
    const cell = owner.closest('td,th');
    const tableMedia = originalElement.tagName === 'TABLE' && cell && originalElement.contains(cell);
    const image = { ...item, id, ...(tableMedia ? { tableMedia: true } : {}) };
    const figure = owner.closest('figure');
    const caption = figure && Array.from(figure.querySelectorAll('figcaption')).find(node => node.closest('figure') === figure);
    const captionCopy = caption && copies.get(caption);
    if (captionCopy && clone.contains(captionCopy)) image.caption = '';
    media.push({ source: owner, item: image });
  }
  for (const links of sourceLinks.values()) {
    const connected = [...links].filter(link => clone.contains(link));
    if (!connected.length || connected.some(link => {
      const text = link.cloneNode(true);
      for (const media of Array.from(text.querySelectorAll('img,svg,canvas,script,style'))) media.remove();
      return !!text.textContent?.trim();
    })) continue;
    connected[0].append('Source');
  }
  return { clone, copies, media };
}

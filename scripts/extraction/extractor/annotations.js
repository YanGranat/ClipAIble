// @ts-check
import { getDocumentFragmentTarget, isDocumentNoteReference, isSourceExcluded, cloneReadingContent } from './dom-utils.js';

const CONTROL_REGION = 'nav,form,input,select,textarea,[role="menu"],[role="menubar"],[role="listbox"],[role="tablist"],[role="navigation"]';
const CITATION_REFERENCE = '[role="doc-biblioref"],[epub\\:type~="biblioref"],[rel~="citation"],[data-citation],.cite-ref';

function isAuthoredAnnotation(target) {
  return !!target && !target.matches(CONTROL_REGION) && !target.querySelector(CONTROL_REGION);
}

/** Reuse a unique, already exported citation when a popup repeats it verbatim. */
export function reuseAnnotationCitations(content, dependencies, document) {
  const paragraphKey = item => {
    if (item.type !== 'paragraph' || !item.html?.includes('<a')) return null;
    const fragment = document.createElement('template');
    fragment.innerHTML = item.html;
    const links = Array.from(fragment.content.querySelectorAll('a[href]'), link => link.getAttribute('href'));
    if (!links.length || !links.every(link => /^https?:\/\//i.test(link))) return null;
    return JSON.stringify([fragment.content.textContent.trim().replace(/\s+/g, ' '), links]);
  };
  const bodyParagraphs = new Map();
  for (const item of content) {
    const key = paragraphKey(item);
    if (key) bodyParagraphs.set(key, bodyParagraphs.has(key) ? null : item);
  }
  const aliases = new Map();
  for (const { target, label, items, citation } of dependencies) {
    if (!items.length) continue;
    const key = citation && target.hasAttribute('popover') && items.length === 1
      ? paragraphKey(items[0]) : null;
    const existing = key ? bodyParagraphs.get(key) : null;
    if (existing) {
      existing.id ||= target.id;
      if (existing.id !== target.id) aliases.set('#' + target.id, '#' + existing.id);
      continue;
    }
    content.push({ type: 'heading', level: 3, text: label, format: 'text', id: target.id }, ...items);
  }
  if (!aliases.size) return;
  const rewrite = html => {
    if (!html?.includes('doc-noteref')) return html;
    const fragment = document.createElement('template');
    fragment.innerHTML = html;
    for (const link of Array.from(fragment.content.querySelectorAll('a[role="doc-noteref"][href]'))) {
      const alias = aliases.get(link.getAttribute('href'));
      if (alias) link.setAttribute('href', alias);
    }
    return fragment.innerHTML;
  };
  for (const item of content) {
    if (item.html) {
      const html = rewrite(item.html);
      if (item.text === item.html) item.text = html;
      item.html = html;
    }
    if (item.caption) item.caption = rewrite(item.caption);
    if (item.headers) item.headers = item.headers.map(rewrite);
    if (item.rows) item.rows = item.rows.map(row => row.map(rewrite));
    for (const entry of item.items || []) if (typeof entry === 'object' && entry.html) entry.html = rewrite(entry.html);
  }
}

export function emittedReadingIds(content, document) {
  const ids = new Set();
  const fragment = document.createElement('template');
  for (const item of content) {
    if (item.id) ids.add(item.id);
    const html = [item.html, item.caption, ...(item.headers || []), ...(item.rows || []).flat()];
    for (const part of item.items || []) if (typeof part === 'object') {
      if (part.id) ids.add(part.id);
      html.push(part.html);
    }
    for (const value of html) {
      if (!value?.includes('id=')) continue;
      fragment.innerHTML = value;
      for (const target of Array.from(fragment.content.querySelectorAll('[id]'))) ids.add(target.id);
    }
  }
  return ids;
}

/** Resolve explicit annotation relationships without searching unrelated page text. */
export function getAnnotationTarget(reference) {
  if (reference.closest('pre,code,math,mjx-container,.MathJax,.katex')) return null;
  if (reference.tagName === 'A' && isDocumentNoteReference(reference)) {
    const target = getDocumentFragmentTarget(reference);
    return isAuthoredAnnotation(target) ? target : null;
  }
  if (!reference.matches('button,[role="button"],a')) return null;
  if (!reference.closest('p,li,h1,h2,h3,h4,h5,h6,td,th,figcaption,blockquote')) return null;
  for (const attribute of ['popovertarget', 'aria-describedby', 'aria-controls']) {
    for (const id of (reference.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)) {
      const target = reference.ownerDocument.getElementById(id);
      if (!isAuthoredAnnotation(target) || target.contains(reference)) continue;
      if (target.textContent?.trim() && (target.matches('p,li,blockquote,pre,[popover]') || target.querySelector('p,li,blockquote,pre'))) return target;
    }
  }
  return null;
}

/**
 * Follow authored annotation dependencies once per source target, including nested notes.
 * @param {Element[]} elements
 * @param {Set<string>} emittedIds
 * @param {Array<Element|string>} [excludedSelectors]
 * @param {function(Element): boolean} [accept]
 */
export function collectAnnotationTargets(elements, emittedIds, excludedSelectors = [], accept = reference => !!reference) {
  const pending = elements.map(owner => ({ owner, projected: false }));
  const visited = new Set(), targets = [], seenTargets = new Set();
  while (pending.length) {
    const { owner, projected } = pending.shift();
    if (visited.has(owner)) continue;
    visited.add(owner);
    const references = [owner, ...Array.from(owner.querySelectorAll('a,button,[role="button"]'))];
    for (const reference of references) {
      if ((!projected && !accept(reference)) || isSourceExcluded(reference, excludedSelectors)) continue;
      const target = getAnnotationTarget(reference);
      if (!target || seenTargets.has(target) || emittedIds.has(target.id) ||
          isSourceExcluded(target, excludedSelectors)) continue;
      seenTargets.add(target);
      const clone = cloneAnnotationContent(target, excludedSelectors);
      targets.push({ target, clone, citation: reference.matches(CITATION_REFERENCE),
        label: reference.textContent?.trim() || reference.getAttribute('aria-label') || 'Note' });
      pending.push({ owner: clone, projected: true });
    }
  }
  return targets;
}

/** Copy a referenced reading region, leaving nested definitions with their own owners. */
export function cloneAnnotationContent(target, exclusions = []) {
  let clone = cloneReadingContent(target, exclusions, null, { disclosed: true });
  for (const nested of Array.from(clone.querySelectorAll('[popover],script,style,template'))) nested.remove();
  for (const attribute of ['id', 'popover', 'hidden', 'aria-hidden', 'style', 'class', 'role']) clone.removeAttribute(attribute);
  if (['LI', 'DD', 'DT', 'SPAN'].includes(clone.tagName)) {
    const wrapper = target.ownerDocument.createElement('div');
    wrapper.append(...clone.childNodes);
    clone = wrapper;
  }
  return clone;
}

/** Replace inline disclosure controls with portable references and preserve their labels. */
export function materializeAnnotationReferences(clone) {
  for (const reference of Array.from(clone.querySelectorAll('button,[role="button"],a'))) {
    if (reference.closest('pre,code,math,mjx-container,.MathJax,.katex')) continue;
    const target = getAnnotationTarget(reference);
    if (!target?.id) {
      if (reference.matches('button,[role="button"]')) reference.remove();
      continue;
    }
    if (reference.tagName === 'A' && reference.hasAttribute('href')) continue;
    const anchor = clone.ownerDocument.createElement('a');
    anchor.setAttribute('href', '#' + target.id);
    anchor.setAttribute('role', 'doc-noteref');
    const visibleLabel = reference.textContent?.trim();
    anchor.textContent = visibleLabel || reference.getAttribute('aria-label') || 'Note';
    if (visibleLabel) reference.replaceWith(anchor);
    else {
      const marker = clone.ownerDocument.createElement('sup');
      marker.append(anchor);
      reference.replaceWith(' ', marker);
    }
  }
}

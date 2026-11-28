// @ts-check

import { CANDIDATE_SELECTOR } from './constants.js';
import { INTERFACE_REGIONS, readArticleMetadataText } from './dom-utils.js';
import { isEditorialOwner } from './reading-context.js';

export function selectorValues(value) {
  return (Array.isArray(value) ? value : [value]).filter(item => typeof item === 'string' && item.trim());
}

function matchableSelector(doc, selector) {
  let syntaxError;
  try {
    if (doc.querySelector(selector)) return selector;
  } catch (error) {
    if (error?.name !== 'SyntaxError') throw error;
    syntaxError = error;
  }
  // An unescaped utility class can look like a pseudo-class in a model response.
  const corrected = selector.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|\.([\w-]+(?::[\w-]+)+)/g,
    (token, name) => name && doc.getElementsByClassName(name).length ? `[class~="${name}"]` : token);
  if (corrected !== selector && doc.querySelector(corrected)) return corrected;
  if (syntaxError) throw syntaxError;
  return selector;
}

export function resolveContentSelection(doc, selectors) {
  const normalized = { ...selectors };
  try {
    for (const name of ['articleContainer', 'content', 'title', 'subtitle', 'heroImage', 'toc', 'exclude']) {
      normalized[name] = selectorValues(selectors[name]).map(selector => matchableSelector(doc, selector));
    }
  } catch (error) {
    if (error?.name === 'SyntaxError') return { matched: false, containers: [], roots: [], elements: [], exclusions: [], tocRoots: [] };
    throw error;
  }
  selectors = normalized;
  const containers = selectorValues(selectors.articleContainer).flatMap(selector => Array.from(doc.querySelectorAll(selector)));
  if (selectorValues(selectors.articleContainer).length && !containers.length) {
    return { matched: false, containers: [], roots: [], elements: [], exclusions: [], tocRoots: [] };
  }
  const scopes = containers.length ? containers : [doc];
  const queries = selectorValues(selectors.content);
  const roots = new Set();
  for (const scope of scopes) {
    if (!queries.length && scope.nodeType === 1) roots.add(scope);
    for (const selector of queries) {
      if (scope.nodeType === 1 && scope.matches(selector)) roots.add(scope);
      for (const node of Array.from(scope.querySelectorAll(selector))) roots.add(node);
    }
  }
  const rootsList = [...roots];
  const editorialContainers = containers.filter(isEditorialOwner);
  const hasBodyWrapper = rootsList.some(root => root.matches('div,section,article') && root.querySelector('p,blockquote,pre,table,ul,ol'));
  const exclusions = [...new Set(selectorValues(selectors.exclude)
    .flatMap(selector => Array.from(doc.querySelectorAll(selector))))].filter(node => {
      if (containers.some(container => node.contains(container))) return false;
      // A shared layout wrapper should not exclude the entire positive body selection.
      return !(hasBodyWrapper && !node.closest(INTERFACE_REGIONS) &&
        editorialContainers.some(container => container.contains(node)) &&
        rootsList.every(root => node !== root && node.contains(root)));
    });
  const elements = new Set();
  for (const root of roots) {
    if (root.matches(CANDIDATE_SELECTOR)) elements.add(root);
    for (const node of Array.from(root.querySelectorAll(CANDIDATE_SELECTOR))) elements.add(node);
  }
  const tocRoots = selectorValues(selectors.toc)
    .flatMap(selector => containers.flatMap(container => [...container.querySelectorAll(selector)]))
    .filter(node => !isSelectedContentExcluded(node, exclusions));
  return { matched: roots.size > 0, containers: [...new Set(containers)], roots: rootsList, elements: [...elements], exclusions, tocRoots, selectors };
}

export function isSelectedContentExcluded(element, exclusions) {
  return exclusions.some(node => {
    if (!node.contains(element)) return false;
    if (node === element && node.matches('blockquote.twitter-tweet') && node.textContent?.trim()) return false;
    return true;
  });
}

export function findSelectedTextElement(doc, value, exclusions = []) {
  for (const selector of selectorValues(value)) {
    const node = doc.querySelector(selector);
    if (node && readArticleMetadataText(node, exclusions)) return node;
  }
  return null;
}

export function readSelectedText(doc, value) {
  const node = findSelectedTextElement(doc, value);
  return node ? readArticleMetadataText(node) : '';
}

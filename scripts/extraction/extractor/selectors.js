// @ts-check

import { CANDIDATE_SELECTOR } from './constants.js';
import { readArticleMetadataText } from './dom-utils.js';

export function selectorValues(value) {
  return (Array.isArray(value) ? value : [value]).filter(item => typeof item === 'string' && item.trim());
}

export function resolveContentSelection(doc, selectors) {
  try {
    for (const name of ['articleContainer', 'content', 'title', 'subtitle', 'heroImage', 'toc', 'exclude']) {
      for (const selector of selectorValues(selectors[name])) doc.querySelector(selector);
    }
  } catch (error) {
    if (error?.name === 'SyntaxError') return { matched: false, roots: [], elements: [], exclusions: [] };
    throw error;
  }
  const containers = selectorValues(selectors.articleContainer).flatMap(selector => Array.from(doc.querySelectorAll(selector)));
  if (selectorValues(selectors.articleContainer).length && !containers.length) {
    return { matched: false, roots: [], elements: [], exclusions: [] };
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
  const exclusions = selectorValues(selectors.exclude).flatMap(selector => Array.from(doc.querySelectorAll(selector)))
    .filter(node => !containers.some(container => node.contains(container)));
  const containerQueries = selectorValues(selectors.articleContainer);
  const exclusionSelectors = selectorValues(selectors.exclude).map(selector => containerQueries.length
    ? `:is(${selector}):not(:is(${containerQueries.join(',')})):not(:has(:is(${containerQueries.join(',')})))`
    : selector);
  const elements = new Set();
  for (const root of roots) {
    if (root.matches(CANDIDATE_SELECTOR)) elements.add(root);
    for (const node of Array.from(root.querySelectorAll(CANDIDATE_SELECTOR))) elements.add(node);
  }
  return { matched: roots.size > 0, roots: [...roots], elements: [...elements], exclusions, exclusionSelectors };
}

export function isSelectedContentExcluded(element, exclusions) {
  return exclusions.some(node => {
    if (!node.contains(element)) return false;
    if (node === element && node.matches('blockquote.twitter-tweet') && node.textContent?.trim()) return false;
    return true;
  });
}

export function readSelectedText(doc, value) {
  for (const selector of selectorValues(value)) {
    const node = doc.querySelector(selector);
    const text = node ? readArticleMetadataText(node) : '';
    if (text) return text;
  }
  return '';
}

// @ts-check

import { getDocumentFragmentTarget, INTERFACE_REGIONS } from './dom-utils.js';

const DECLARED_BODY = '[itemprop~="articleBody"],.instapaper_body';
export const EDITORIAL_CONTAINERS = 'article,[role~="article"],' + DECLARED_BODY;
const HEADINGS = 'h1,h2,h3,h4,h5,h6';
const RELATED_HEADING = /^(?:related (?:articles|stories|(?:blog )?posts)|recommended (?:articles|stories|posts)|most (?:read|viewed)|you (?:may|might) also like|also in .+)$/i;
const normalizedLabel = value => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Reading landmarks are evaluated at their own boundary during discovery. */
export function isSemanticReadingScope(element) {
  return element.matches(EDITORIAL_CONTAINERS + ',main,[role~="main"]');
}

function ownHeadings(element) {
  return Array.from(element.querySelectorAll('h1')).filter(heading =>
    heading.closest(EDITORIAL_CONTAINERS) === element && !heading.closest(INTERFACE_REGIONS));
}

/** A page headline identifies reading content even without an ARTICLE wrapper. */
export function isDocumentHeadline(heading) {
  if (!heading || heading.closest(INTERFACE_REGIONS)) return false;
  const doc = heading.ownerDocument;
  const label = normalizedLabel(heading.textContent);
  const titles = [doc.title, doc.querySelector('meta[property="og:title"]')?.getAttribute('content')].map(normalizedLabel);
  return !!label && titles.some(title => title === label ||
    [' | ', ' — ', ' – ', ' - '].some(separator => title.startsWith(label + separator)));
}

/** Identify the scope of the document headline or a declared article body. */
export function isEditorialOwner(element) {
  if (!element?.matches(EDITORIAL_CONTAINERS) || element.closest(INTERFACE_REGIONS)) return false;
  if (element.matches(DECLARED_BODY)) return true;
  const doc = element.ownerDocument;
  const headings = ownHeadings(element);
  if (headings.some(isDocumentHeadline)) return true;
  if (headings.length !== 1 || !normalizedLabel(headings[0].textContent) ||
      doc.querySelector('meta[property="og:type"]')?.getAttribute('content')?.toLowerCase() !== 'article') return false;
  return !Array.from(doc.querySelectorAll('article,[role~="article"]')).some(other =>
    other !== element && ownHeadings(other).some(heading => normalizedLabel(heading.textContent)));
}

/** Compound layout labels can enclose the editorial owner without owning a panel. */
export function isEditorialLayoutLabel(region, source, role) {
  if (role === 'modal') {
    if (!isSemanticReadingScope(region) || region.closest(INTERFACE_REGIONS)) return false;
  } else if (role !== 'newsletter' && role !== 'sidebar' && role !== 'header') return false;
  if (region.matches('aside,[role~="complementary"],[role~="banner"]')) return false;
  if (role === 'header' && region.closest('main,[role~="main"],article,[role~="article"]') &&
      Array.from(region.querySelectorAll('h1')).some(isDocumentHeadline)) {
    return true;
  }
  if (region.matches('header')) return false;
  if (region.id.toLowerCase() === role || Array.from(region.classList).some(name => name.toLowerCase() === role)) return false;
  if (role === 'sidebar') {
    // Layout modifiers describe the presence of a lateral region.
    const labels = [region.id, ...Array.from(region.classList)].filter(name => /(?:^|[-_])sidebar(?:$|[-_])/i.test(name));
    if (labels.length && labels.every(name =>
      /^(?:has|no|non|with|without)[-_]sidebar(?:[-_](?:content|layout|body|main))?$/i.test(name))) return true;
  }
  if (role === 'modal') {
    const modalLabel = /(?:^|[_-])modal(?:$|[_-])/i;
    const hooks = Array.from(region.classList).filter(name => modalLabel.test(name));
    if (!modalLabel.test(region.id) && hooks.length && hooks.every(name => /^js-/i.test(name))) return true;
  }
  const owner = source.closest(EDITORIAL_CONTAINERS);
  return isEditorialOwner(owner) && (region === owner || (role !== 'newsletter' && region.contains(owner)));
}

/** A section destination referenced by its heading belongs to the article's reading order. */
export function isReferencedReadingAside(element, roots, tocRoots = []) {
  if (!element.matches('aside[id],[role~="complementary"][id]')) return false;
  const heading = element.querySelector('h2,h3,h4,h5,h6');
  const label = normalizedLabel(heading?.textContent);
  if (!label || !element.querySelector('p,blockquote,ul,ol,figure,table')) return false;
  const articleRoots = roots.filter(root => !root.matches('body,html'));
  if (!articleRoots.some(root => root.contains(element))) return false;
  return [...articleRoots, ...tocRoots].some(root =>
    Array.from(root.querySelectorAll('a[href*="#"]')).some(link => !element.contains(link) &&
      normalizedLabel(link.textContent) === label && getDocumentFragmentTarget(link) === element));
}

/** Every admitted reading scope owns its nested authored content. */
export function isReadingOwned(element, roots = []) {
  return (roots || []).some(root => root.contains(element));
}

/** An article card points to a different document instead of owning its own body. */
export function linkedArticlePreview(element) {
  if (!element.matches('article,[role~="article"]') || isEditorialOwner(element) ||
      element.querySelector('article,[role~="article"],table,pre,blockquote,math')) return null;
  const doc = element.ownerDocument;
  const body = Array.from(element.querySelectorAll('p')).filter(node =>
    !node.closest('figcaption,header,footer') && normalizedLabel(node.textContent).length >= 60);
  if (body.length > 1 || body.some(node => normalizedLabel(node.textContent).length >= 260)) return null;
  const actions = Array.from(element.querySelectorAll('a[href]')).filter(link =>
    !link.closest('nav,figcaption,p') && !!normalizedLabel(link.textContent));
  const title = element.querySelector(HEADINGS);
  const tail = actions.at(-1);
  const action = actions.find(link => link.matches('[rel~="bookmark"]') || title?.contains(link) || (title && link.contains(title))) ||
    (actions.length === 1 || (tail && title && (title.compareDocumentPosition(tail) & title.DOCUMENT_POSITION_FOLLOWING)) ? tail : null);
  if (!action) return null;
  try {
    const url = new URL(action.getAttribute('href'), doc.baseURI);
    const page = new URL(doc.URL);
    return /^https?:$/.test(url.protocol) && (url.origin !== page.origin || url.pathname !== page.pathname) ? url.href : null;
  } catch { return null; }
}

/** Find independent navigation collections by their heading and linked card structure. */
export function findRecommendationRegions(root) {
  const regions = [];
  const linkedTargets = new Set(Array.from(root.querySelectorAll('a[href*="#"]'), getDocumentFragmentTarget));
  const page = new URL(root.ownerDocument.URL);
  page.hash = '';
  function linkedPage(heading) {
    const link = heading.closest('a[href]') || heading.querySelector('a[href]');
    if (!link) return null;
    try {
      const url = new URL(link.getAttribute('href'), root.ownerDocument.baseURI);
      url.hash = '';
      return /^https?:$/.test(url.protocol) && url.href !== page.href ? url.href : null;
    } catch { return null; }
  }
  for (const label of Array.from(root.querySelectorAll(HEADINGS))) {
    if (label.tagName === 'H1' || !RELATED_HEADING.test(normalizedLabel(label.textContent)) || linkedTargets.has(label) ||
        label.closest('pre,blockquote,figcaption,a')) continue;
    for (let region = label.parentElement; region && region !== root; region = region.parentElement) {
      if (linkedTargets.has(region) || region.querySelector('table,pre,blockquote,math,[role~="doc-bibliography"],[role~="doc-endnotes"]')) break;
      const headings = Array.from(region.querySelectorAll(HEADINGS));
      if (headings[0] !== label) break;
      const cards = headings.slice(1);
      const destinations = cards.map(linkedPage);
      if (destinations.includes(null) || cards.some(heading => linkedTargets.has(heading))) break;
      if (new Set(destinations).size < 2) continue;
      if (containsOnlyCardText(region, label, cards)) regions.push(region);
      break;
    }
  }
  const previews = Array.from(root.querySelectorAll('article,[role~="article"]'), element =>
    ({ element, href: linkedArticlePreview(element) })).filter(({ element, href }) =>
    href && !Array.from(linkedTargets).some(target => target && element.contains(target)));
  const previewOwners = new Set(previews.map(({ element }) => element));
  for (const { element } of previews) {
    let collection = null;
    for (let region = element.parentElement; region && region !== root; region = region.parentElement) {
      if (linkedTargets.has(region)) break;
      const cards = previews.filter(card => region.contains(card.element));
      if (new Set(cards.map(card => card.href)).size < 2) continue;
      const labels = Array.from(region.querySelectorAll(HEADINGS)).filter(node =>
        !cards.some(card => card.element.contains(node)));
      if (labels.length > 1 || labels.some(node => node.tagName === 'H1' || linkedTargets.has(node)) ||
          !containsOnlyCardText(region, labels[0], cards.map(card => card.element), previewOwners)) break;
      collection = region;
    }
    if (collection) regions.push(collection);
  }
  return [...new Set(regions)];
}

/** Every non-label text node must belong to a single linked card. */
function containsOnlyCardText(region, label, cards, previewOwners = null) {
  const walker = region.ownerDocument.createTreeWalker(region, region.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || label?.contains(node) ||
        node.parentElement?.closest('script,style,template,noscript,button,[role="button"]')) continue;
    if (previewOwners) {
      if (!previewOwners.has(node.parentElement?.closest('article,[role~="article"]'))) return false;
      continue;
    }
    let count = 0;
    for (let owner = node.parentElement; owner && owner !== region && count === 0; owner = owner.parentElement) {
      count = cards.filter(card => owner.contains(card)).length;
    }
    if (count !== 1) return false;
  }
  return true;
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

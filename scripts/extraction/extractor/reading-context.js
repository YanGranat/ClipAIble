// @ts-check

import { getDocumentFragmentTarget, readArticleMetadataText, INTERFACE_REGIONS } from './dom-utils.js';
import { RELATED_ARTICLES_PATTERNS } from '../patterns/exclusion-patterns.js';

const DECLARED_BODY = '[itemprop~="articleBody"],.instapaper_body';
export const EDITORIAL_CONTAINERS = 'article,[role~="article"],' + DECLARED_BODY;
export const DOCUMENT_CONTENTS = '[role~="doc-toc"],nav.toc,nav#toc,nav[data-toc],ol.toc,ul.toc';
const HEADINGS = 'h1,h2,h3,h4,h5,h6';
const RELATED_HEADING = /^(?:related (?:articles|stories|(?:blog )?posts)|recommended (?:articles|stories|posts)|most (?:read|viewed)|you (?:may|might) also like|also in .+)$/i;
const FLAT_RECOMMENDATION_LABELS = 'p,h2,h3,h4,h5,h6,b,strong,span';
const normalizedLabel = value => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const relatedLabels = new Set(Object.values(RELATED_ARTICLES_PATTERNS).flat().map(normalizedLabel));

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
  const label = normalizedLabel(readArticleMetadataText(heading));
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
  if (role === 'header' && region.matches('table') && !region.closest(INTERFACE_REGIONS + ',header') &&
      Array.from(region.querySelectorAll('th')).some(cell => cell.closest('table') === region)) {
    const labels = [region.id, ...region.classList].filter(name => /(?:^|[-_])header(?:$|[-_])/i.test(name));
    if (labels.length && labels.every(name => /^(?:(?:has|uses|supports)[-_])?(?:sticky|fixed|pinned)[-_]headers?$/i.test(name))) {
      return true;
    }
  }
  if (role === 'lightbox' && region.matches('img') && !region.closest(INTERFACE_REGIONS)) {
    const figure = region.closest('figure');
    const labels = [region.id, ...region.classList].filter(name => /(?:^|[-_])lightbox(?:$|[-_])/i.test(name));
    if (figure && labels.length && labels.every(name => /^(?:lightbox[-_](?:image|photo|trigger)|(?:image|photo)[-_]lightbox)$/i.test(name)) &&
        (region.getAttribute('alt')?.trim() || figure.querySelector('figcaption')?.textContent?.trim())) return true;
  }
  if (role === 'comment' || role === 'comments') {
    // A comment capability on the reading layout is distinct from a discussion panel.
    const labels = [region.id, ...region.classList].filter(name => /(?:^|[-_])comments?(?:$|[-_])/i.test(name));
    return labels.length > 0 &&
      labels.every(name => /^(?:(?:has|with|without)[-_]comments?|comments?[-_](?:enabled|disabled|available))$/i.test(name)) &&
      !region.closest(INTERFACE_REGIONS + ',aside,[role~="complementary"]') &&
      Array.from(region.querySelectorAll('h1')).some(isDocumentHeadline);
  }
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
  function linkedPage(element) {
    const link = element.closest('a[href]') || element.querySelector('a[href]');
    if (!link) return null;
    try {
      const url = new URL(link.getAttribute('href'), root.ownerDocument.baseURI);
      url.hash = '';
      return /^https?:$/.test(url.protocol) && url.href !== page.href ? url.href : null;
    } catch { return null; }
  }
  for (const panel of root.querySelectorAll('[class*="related"],[class*="recommend"],[class*="suggest"]')) {
    if (panel.children.length !== 2 || panel.closest('blockquote,pre,figure,[role~="doc-bibliography"],[role~="doc-endnotes"]') ||
        Array.from(linkedTargets).some(target => target && panel.contains(target))) continue;
    const [label, card] = Array.from(panel.children);
    const labelText = normalizedLabel(label.textContent).replace(/[:：]$/, '');
    if (label.querySelector('a[href],img') || !labelText || labelText.length > 80 || !card.matches('a[href]') ||
        (!card.querySelector('img,picture,svg,h2,h3,h4,h5,h6') && !relatedLabels.has(labelText)) || !linkedPage(card)) continue;
    if (containsOnlyCardText(panel, label, [card])) regions.push(panel);
  }
  for (const action of root.querySelectorAll('a.btn[href],a.button[href],a[role~="button"][href]')) {
    const componentLabel = /(?:^|-)\b(?:promo(?:tion)?|call[-_]to[-_]action|vacancy|cta)(?:$|[-_])/i;
    const panelSelector = ':is(div,section,aside):is([class*="promo"],[class*="call-to-action"],[class*="vacancy"],[class*="cta"]):has(> :first-child:is(h2,h3,h4,h5,h6))';
    const panel = action.closest(panelSelector);
    if (!panel || !root.contains(panel) || panel === root || !linkedPage(action) ||
        !Array.from(panel.classList).some(name => componentLabel.test(name)) ||
        panel.closest('figure,blockquote,pre,[role~="doc-bibliography"]') ||
        Array.from(linkedTargets).some(target => target && panel.contains(target))) continue;
    const heading = panel.firstElementChild;
    const descriptions = Array.from(panel.querySelectorAll('p'));
    if (!heading?.matches('h2,h3,h4,h5,h6') || descriptions.length !== 1 ||
        normalizedLabel(descriptions[0].textContent).length > 260 || panel.querySelectorAll('a[href]').length !== 1 ||
        panel.querySelector('article,pre,figure,table,ol,ul,blockquote,math')) continue;
    if (containsOnlyCardText(panel, heading, [action], null, descriptions[0])) regions.push(panel);
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
  for (const label of root.querySelectorAll(FLAT_RECOMMENDATION_LABELS)) {
    const text = normalizedLabel(label.textContent).replace(/[:：]$/, '');
    if ((text !== 'related' && text !== 'recommendations' && !RELATED_HEADING.test(text) && !relatedLabels.has(text)) || linkedTargets.has(label) ||
        label.closest('pre,blockquote,figcaption,a,[role~="doc-bibliography"],[role~="doc-endnotes"]')) continue;
    if (label.matches('b,strong,span') && !isStandaloneLine(label)) continue;
    const sharedBlock = label.parentElement;
    if (label.matches('b,strong,span') && sharedBlock !== root && sharedBlock.matches('p,div') &&
        sharedBlock.firstElementChild === label && !linkedTargets.has(sharedBlock) && isLinkCollection(sharedBlock, linkedPage, label)) {
      regions.push(sharedBlock);
      continue;
    }
    const links = nextFlowElement(label, linkedTargets);
    if (links && !linkedTargets.has(links) && isLinkCollection(links, linkedPage)) regions.push(label, links);
  }
  return [...new Set(regions)];
}

function isWhitespaceNode(node) {
  return node.nodeType === 8 || (node.nodeType === 3 && !node.textContent?.trim());
}

function isStandaloneLine(label) {
  let before = label.previousSibling;
  let after = label.nextSibling;
  while (before && isWhitespaceNode(before)) before = before.previousSibling;
  while (after && isWhitespaceNode(after)) after = after.nextSibling;
  return (!before || before.nodeName === 'BR') && (!after || after.nodeName === 'BR');
}

/** Find the adjacent block without crossing prose or an independently referenced section. */
function nextFlowElement(label, linkedTargets) {
  for (let parent = label; parent && !isSemanticReadingScope(parent) && !parent.matches('body,html'); parent = parent.parentElement) {
    if (linkedTargets.has(parent)) return null;
    let sibling = parent.nextSibling;
    while (sibling && (isWhitespaceNode(sibling) || sibling.nodeName === 'BR')) sibling = sibling.nextSibling;
    if (sibling) return sibling.nodeType === 1 ? /** @type {Element} */ (sibling) : null;
  }
  return null;
}

function isLinkCollection(region, linkedPage, label = null) {
  if (region.matches('a,[role~="doc-bibliography"],[role~="doc-endnotes"]') ||
      region.querySelector('pre,blockquote,math,thead,th,[role~="doc-bibliography"],[role~="doc-endnotes"]')) return false;
  const destinations = new Set(Array.from(region.querySelectorAll('a[href]'), link =>
    link.textContent?.trim() && linkedPage(link)).filter(Boolean));
  if (destinations.size < 2) return false;
  const walker = region.ownerDocument.createTreeWalker(region, region.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim() && !label?.contains(node) &&
        !node.parentElement?.closest('a[href],script,style,template,noscript')) return false;
  }
  return true;
}

/** Every non-label text node must belong to a single linked card. */
function containsOnlyCardText(region, label, cards, previewOwners = null, description = null) {
  const walker = region.ownerDocument.createTreeWalker(region, region.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || label?.contains(node) || description?.contains(node) ||
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

// @ts-check
// Discover reading roots for the shared DOM parser.

import { isExcluded, isWidget } from './filters.js';
import { isSemanticReadingScope } from './reading-context.js';

/** Find a social article's reading scope without interpreting its authored blocks. */
export function findSocialReadingRoot(baseUrl, doc) {
  let hostname;
  try { hostname = new URL(baseUrl).hostname.toLowerCase(); } catch { return null; }
  if (!['x.com', 'twitter.com'].some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
  const readView = doc.querySelector('div[data-testid="twitterArticleReadView"]');
  if (readView) return readView;
  const article = doc.querySelector('article[data-testid="tweet"]');
  return article?.querySelector('div[data-testid="tweetText"]') || article;
}

/**
 * Order alternative reading scopes; all of them use the same source-to-content parser.
 * @returns {Element[]}
 */
export function findFallbackReadingRoots(win, doc, constants, attempted = []) {
  const seen = new Set(attempted);
  const roots = [];
  const excluded = element => isExcluded(win, element, constants, isSemanticReadingScope(element) ? [element] : []);
  const admit = element => {
    if (!element || seen.has(element) || excluded(element) || isWidget(win, element)) return;
    seen.add(element);
    roots.push(element);
  };
  for (const element of Array.from(doc.querySelectorAll('article,main,[role~="article"],[role~="main"],[itemprop~="articleBody"]'))) admit(element);

  let best = null;
  let bestParagraphs = 0;
  let bestLength = 0;
  for (const element of Array.from(doc.querySelectorAll('div, section, article, main'))) {
    if (seen.has(element) || excluded(element) || isWidget(win, element)) continue;
    const paragraphs = element.querySelectorAll('p').length;
    const length = element.textContent?.length || 0;
    if (paragraphs > bestParagraphs || (paragraphs === bestParagraphs && length > bestLength)) {
      best = element;
      bestParagraphs = paragraphs;
      bestLength = length;
    }
  }
  if (bestParagraphs >= 3) admit(best);
  admit(doc.body);
  return roots;
}

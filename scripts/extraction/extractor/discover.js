// @ts-check
// Content discovery functions for extraction
// Finds the main content container using multiple strategies

import { safeGetComputedStyle } from './dom-utils.js';

/**
 * Check if element is likely a content container based on class/id
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is likely content container
 */
export function isLikelyContentContainer(element) {
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  const contentIndicators = [
    'article', 'content', 'post', 'entry', 'main', 'story', 'text'
  ];
  
  for (const indicator of contentIndicators) {
    if (className.includes(indicator) || id.includes(indicator)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate stopword bonus for text quality detection.
 * Inspired by the Goose algorithm used in node-unfluff / python-goose:
 * real prose contains many function words (stopwords); boilerplate/navigation has fewer.
 * Supports: English, Russian, Ukrainian, German, French, Spanish, Italian, Portuguese.
 * CJK text (Chinese/Japanese/Korean) is treated as prose by default since word-level
 * stopword analysis doesn't apply to character-based scripts.
 * @param {string} text - Text to analyse
 * @returns {number} - Score bonus (positive = likely prose, negative = likely boilerplate)
 */
export function calculateStopwordBonus(text) {
  if (!text || text.length < 50) return 0;

  // CJK detection — treat as prose (stopword ratio doesn't apply)
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  if (cjkChars > text.length * 0.15) return 10;

  // Compact multilingual stopword set (common function words across supported languages)
  const SW = new Set([
    // English
    'the','is','was','are','were','a','an','of','in','to','it','he','she',
    'they','we','that','this','for','with','on','at','by','from','as','but',
    'and','or','not','have','has','had','will','would','could','should','be',
    'been','being','its','his','her','their','our','you','if','do','did',
    // Russian
    'и','в','не','на','что','он','она','они','я','мы','с','по','к','из',
    'как','то','у','но','да','так','если','же','уже','при','или','за','со',
    // Ukrainian
    'і','та','не','на','що','він','вона','вони','я','ми','з','по','до',
    'як','то','у','але','вже','або','ж','за','зі',
    // German
    'der','die','das','und','in','ist','den','zu','von','für','eine','einer',
    'auf','nicht','mit','sich','des','dem','war','sind','an','hat','er',
    'sie','es','als','um','aber','wie','so','oder','noch','wenn',
    // French
    'le','la','les','de','et','en','un','une','dans','est','que','il',
    'elle','on','nous','par','sur','pour','pas','plus','ce','qui','mais',
    'ou','car','ni','si','dont',
    // Spanish
    'el','la','los','las','de','en','y','que','es','un','una','para','con',
    'se','lo','del','su','por','al','le','más','como','pero','sus','si',
    // Italian
    'il','la','di','e','che','in','un','una','per','con','non','si',
    'ha','ma','sono','da','al','lo','le','della','del','come','più',
    // Portuguese
    'o','a','os','as','de','em','e','que','um','uma','para','com',
    'se','na','no','ao','do','da','mais','por','como','mas','já',
  ]);

  // Extract Latin-script words (length ≥ 2)
  const words = text.toLowerCase().match(/[a-zа-яёіїєäöüßàáâèéêìíîòóôùúûñ]{2,}/g) || [];
  if (words.length < 8) return 0;

  const stopCount = words.reduce((acc, w) => acc + (SW.has(w) ? 1 : 0), 0);
  const ratio = stopCount / words.length;

  if (ratio >= 0.18) return 25; // Strong prose signal
  if (ratio >= 0.12) return 15; // Good prose signal
  if (ratio >= 0.08) return  5; // Moderate prose signal
  if (ratio < 0.04 && words.length > 30) return -10; // Suspiciously low — likely boilerplate
  return 0;
}

/**
 * Calculate content score for element (Readability-inspired algorithm)
 * @param {Window} win - Window object
 * @param {Element} element - Element to score
 * @returns {number} - Content score
 */
export function calculateContentScore(win, element) {
  const paragraphs = element.querySelectorAll('p');
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const links = element.querySelectorAll('a');
  const text = element.textContent || '';
  const textLength = text.length;

  // Base score from structure
  let score = paragraphs.length * 10;
  score += headings.length * 5;
  score += Math.min(textLength / 100, 50);
  
  // Visual position analysis
  try {
    const rect = element.getBoundingClientRect();
    const viewportWidth = win.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = win.innerHeight || document.documentElement.clientHeight;
    
    if (viewportWidth > 0 && viewportHeight > 0) {
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;
      
      const distanceFromCenter = Math.sqrt(
        Math.pow(elementCenterX - centerX, 2) + Math.pow(elementCenterY - centerY, 2)
      );
      const maxDistance = Math.sqrt(Math.pow(viewportWidth, 2) + Math.pow(viewportHeight, 2));
      const normalizedDistance = maxDistance > 0 ? distanceFromCenter / maxDistance : 0;
      
      if (normalizedDistance < 0.3) score += 10;
      else if (normalizedDistance < 0.5) score += 5;
      else if (normalizedDistance > 0.8) score *= 0.9;
      
      // Bonus for visible content
      const isVisible = rect.top < viewportHeight && rect.bottom > 0 && 
                       rect.left < viewportWidth && rect.right > 0;
      if (isVisible) score += 5;
    }
  } catch (e) {
    // Skip visual analysis
  }
  
  // SPA root bonus
  const id = (element.id || '').toLowerCase();
  const className = String(element.className || '').toLowerCase();
  if (id === 'root' || id === 'app' || id === '__next' || 
      className.includes('notion-page') || 
      element.hasAttribute('data-reactroot')) {
    if (textLength >= 500) score += 50;
  }
  
  // Link density calculation
  let navigationLinkLength = 0;
  let totalLinkTextLength = 0;
  
  for (const link of Array.from(links)) {
    const linkText = (link.textContent || '').trim();
    if (linkText.length > 2 && linkText.length < 200) {
      totalLinkTextLength += linkText.length;
      if (!link.closest('p')) {
        navigationLinkLength += linkText.length;
      }
    }
  }
  
  const linkDensity = textLength > 0 ? navigationLinkLength / textLength : 0;
  
  if (linkDensity > 0.3) score *= 0.4;
  else if (linkDensity > 0.2) score *= 0.6;
  else if (linkDensity > 0.1) score *= 0.8;
  
  // Bonus for content links inside paragraphs
  const contentLinkRatio = totalLinkTextLength > 0 
    ? (totalLinkTextLength - navigationLinkLength) / totalLinkTextLength 
    : 0;
  if (contentLinkRatio > 0.7 && links.length > 0) {
    score *= 1.1;
  }
  
  // Comma count bonus (prose text indicator)
  const commaCount = (text.match(/,/g) || []).length;
  if (commaCount > 10) score *= 1.2;
  else if (commaCount > 5) score *= 1.1;

  // Sentence count bonus
  const sentenceCount = (text.match(/[.!?]+\s+/g) || []).length;
  if (sentenceCount > 5) score += Math.min(sentenceCount * 2, 30);

  // Stopword bonus — inspired by Goose algorithm (node-unfluff / python-goose)
  // Real prose has many function words; navigation/boilerplate has fewer.
  // Apply both at container level and per-paragraph for bottom-up signal.
  score += calculateStopwordBonus(text);
  if (paragraphs.length > 0) {
    let paragraphBonusTotal = 0;
    let paragraphsChecked = 0;
    for (const p of Array.from(paragraphs)) {
      const pText = (p.textContent || '').trim();
      if (pText.length > 50) {
        paragraphBonusTotal += calculateStopwordBonus(pText);
        paragraphsChecked++;
      }
    }
    if (paragraphsChecked > 0) {
      // Average per-paragraph bonus, capped to avoid over-boosting
      score += Math.min(paragraphBonusTotal / paragraphsChecked, 30);
    }
  }

  // Virtual paragraph detection — inspired by node-unfluff's div-to-p conversion.
  // Some sites use <div> for body text instead of <p>. Count inline divs without
  // block-level children as "virtual paragraphs" for scoring when real <p>s are absent.
  if (paragraphs.length < 3) {
    try {
      const BLOCK = new Set(['p','ul','ol','table','blockquote','pre','h1','h2','h3','h4','h5','h6','div','section','article']);
      const divs = Array.from(element.querySelectorAll('div')).slice(0, 100);
      let virtualParas = 0;
      for (const div of divs) {
        const hasBlockChild = Array.from(div.children).some(c => BLOCK.has(c.tagName.toLowerCase()));
        if (!hasBlockChild && (div.textContent || '').trim().length > 80) {
          virtualParas++;
        }
      }
      if (virtualParas >= 3) {
        score += virtualParas * 6; // Similar magnitude to real paragraph score
      }
    } catch (e) { /* skip */ }
  }

  // Semantic HTML bonus
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'article') score *= 2.0;
  else if (tagName === 'main') score *= 1.5;
  else if (tagName === 'section' && paragraphs.length >= 3) score *= 1.2;
  
  // Content-like class/id bonus
  if (isLikelyContentContainer(element)) score += 100;
  
  // Penalty for short content
  if (textLength < 100) score *= 0.5;
  else if (textLength < 200) score *= 0.8;
  
  // Penalty for too many lists (navigation indicator)
  const lists = element.querySelectorAll('ul, ol');
  if (lists.length > paragraphs.length * 3 && paragraphs.length < 3) {
    score *= 0.6;
  }
  
  // Heavy penalty for newsletter/email content
  const textLower = text.toLowerCase();
  if (textLower.includes('get the latest') && textLower.includes('inbox') ||
      textLower.includes('salesforce marketing cloud')) {
    score -= 1000;
  }
  
  // Penalty for email inputs
  const emailInputs = element.querySelectorAll('input[type="email"]');
  if (emailInputs.length > 0) {
    const hasNewsletterText = textLower.includes('newsletter') || 
                              textLower.includes('subscribe');
    if (hasNewsletterText) score -= 1000;
    else score -= 50;
  }
  
  // Bonus for images
  const images = element.querySelectorAll('img');
  if (images.length > 0 && images.length < 20) {
    score += Math.min(images.length * 3, 20);
  }
  
  // Bonus for long paragraphs
  let longParagraphs = 0;
  for (const p of Array.from(paragraphs)) {
    if ((p.textContent || '').trim().length > 200) {
      longParagraphs++;
    }
  }
  if (longParagraphs > 3) score += longParagraphs * 5;
  
  return score;
}

/**
 * Check if element has substantial content
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element has substantial content
 */
export function hasSubstantialContent(element) {
  const text = (element.textContent || '').trim();
  const paragraphs = element.querySelectorAll('p');
  return text.length > 100 && (paragraphs.length >= 1 || text.length > 300);
}

/**
 * Find main content container using multiple strategies
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {function(Element): boolean} isExcluded - Function to check exclusion
 * @param {Object} [debugInfo] - Debug info object for logging
 * @param {function} [pushDebugLog] - Function to push debug logs
 * @returns {Element|null} - Main content element
 */
export function findMainContent(win, doc, isExcluded, debugInfo, pushDebugLog) {
  // Strategy 0: SPA root containers
  const spaSelectors = [
    '#root', '#app', '#__next', '[data-reactroot]', '[ng-app]',
    '.notion-page-content', '.notion-page'
  ];
  
  for (const selector of spaSelectors) {
    try {
      const spaRoot = doc.querySelector(selector);
      if (spaRoot) {
        const spaText = (spaRoot.textContent || '').trim();
        if (spaText.length >= 500) {
          const specificContent = spaRoot.querySelector('article, main, [role="main"], .article-content, .post-content');
          if (specificContent && (specificContent.textContent || '').trim().length >= 500) {
            if (!isExcluded(specificContent)) return specificContent;
          }
          if (!isExcluded(spaRoot) || isLikelyContentContainer(spaRoot)) {
            return spaRoot;
          }
        }
      }
    } catch (e) { }
  }
  
  // Strategy 1: Semantic HTML5
  const article = doc.querySelector('article');
  if (article) {
    const articleText = (article.textContent || '').trim();
    if (articleText.length > 500) {
      const isRelatedArticle = article.querySelector('.gc__image-placeholder') !== null ||
                               article.closest('aside, .related, .sidebar') !== null;
      if (!isRelatedArticle) {
        // PRIORITY: Always prefer ARTICLE element over other containers
        // Even if it contains some excludable elements, ARTICLE is the semantic content container
        // Special handling for Atavist magazine - look for more specific content container
        const hostname = win.location?.hostname || '';
        if (hostname.includes('atavist.com') || hostname.includes('magazine.atavist.com')) {
          // Try to find a more specific container within the article
          const specificSelectors = [
            '.entry-content', '.post-content', '.article-body',
            '[class*="content"]', '[class*="article"]', '[class*="post"]'
          ];
          for (const selector of specificSelectors) {
            const specificElement = article.querySelector(selector);
            if (specificElement) {
              const specificText = (specificElement.textContent || '').trim();
              if (specificText.length > 500) {
                // For Atavist, we can be less strict about exclusion since we're looking for more specific content
                const className = String(specificElement.className || '').toLowerCase();
                const isEntryContent = className.includes('entry-content');
                if (isEntryContent || !isExcluded(specificElement)) {
                  return specificElement;
                }
              }
            }
          }
        }
        return article;
      }
    }
  }
  
  const main = doc.querySelector('main');
  // Special handling for Wikipedia
  const hostname = win.location?.hostname || '';
  if (hostname.includes('wikipedia.org') || hostname.includes('wikimedia.org')) {
    // For Wikipedia, find the main content parser output (the one with most content)
    const parserOutputs = Array.from(doc.querySelectorAll('.mw-parser-output'));
    let bestParserOutput = null;
    let maxTextLength = 0;

    for (const parserOutput of parserOutputs) {
      const textLength = (parserOutput.textContent || '').trim().length;
      if (textLength > maxTextLength) {
        maxTextLength = textLength;
        bestParserOutput = parserOutput;
      }
    }

    if (bestParserOutput && maxTextLength > 500) {
      return bestParserOutput; // Return the parser output with most content
    }
  }

  if (main) {
    const mainText = (main.textContent || '').trim();
    if (mainText.length > 100) {
      const specificContent = main.querySelector('.wysiwyg, .article-content, .post-content');
      if (specificContent && (specificContent.textContent || '').trim().length > 500) {
        if (!isExcluded(specificContent)) return specificContent;
      }
      if (!isExcluded(main)) return main;
    }
  }
  
  // Strategy 2: Common content selectors
  const contentSelectors = [
    '[role="main"]',
    '.article-content', '.post-content', '.entry-content', '.content',
    '.post-body', '.article-body', '.entry-body',
    '#content', '#main-content', '#article-content',
    '.wp-block-post-content', '.entry', '.post',
    '.prose', '.article-text', '.story-body',
    '.wysiwyg', '.wysiwyg--all-content'
  ];
  
  for (const selector of contentSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        const elementText = (element.textContent || '').trim();
        if (elementText.length > 100) {
          if (isLikelyContentContainer(element) || !isExcluded(element)) {
            return element;
          }
        }
      }
    } catch (e) { }
  }
  
  // Strategy 3: Score-based search (including legacy table-based layouts)
  let candidates = Array.from(doc.querySelectorAll('div, article, main, section, table'));

  // Prevent performance issues on pages with too many elements
  if (candidates.length > 500) {
    candidates = candidates.slice(0, 500);
  }

  let bestCandidate = null;
  let maxScore = 0;
  
  for (const candidate of candidates) {
    if (!isLikelyContentContainer(candidate) && isExcluded(candidate)) continue;
    
    const candidateText = (candidate.textContent || '').trim();
    if (candidateText.length < 100) continue;
    
    const score = calculateContentScore(win, candidate);
    
    // Early exit for very good candidates
    if (score > 100) return candidate;
    
    if (score > maxScore) {
      maxScore = score;
      bestCandidate = candidate;
    }
  }
  
  return bestCandidate && maxScore > 0 ? bestCandidate : null;
}

// Content finding functions for automatic extraction
// These functions will be inlined into extractAutomaticallyInlined

/**
 * Check if element is likely a content container
 * @param {Element} element - Element to check
 * @returns {boolean} True if element is likely a content container
 */
export function isLikelyContentContainerModule(element) {
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  // These are strong indicators of content containers
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
 * Calculate content score for element (Readability-inspired algorithm)
 * @param {Element} element - Element to score
 * @param {Function} isLikelyContentContainer - Function to check if element is likely content
 * @returns {number} Content score
 */
export function calculateContentScoreModule(element, isLikelyContentContainer) {
  const paragraphs = element.querySelectorAll('p');
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const links = element.querySelectorAll('a');
  const text = element.textContent || '';
  const textLength = text.length;
  
  // Base score from structure
  let score = paragraphs.length * 10;
  score += headings.length * 5;
  score += Math.min(textLength / 100, 50);
  
  // Link density penalty (high link density = navigation, not content)
  const linkDensity = paragraphs.length > 0 
    ? links.length / Math.max(paragraphs.length, 1)
    : links.length / Math.max(textLength / 100, 1);
  
  // More lenient: only heavy penalty if link density is very high (>1.0)
  if (linkDensity > 1.0) {
    score *= 0.5; // Heavy penalty for navigation-like content
  } else if (linkDensity > 0.7) {
    score *= 0.75; // Moderate penalty
  } else if (linkDensity > 0.5) {
    score *= 0.9; // Light penalty
  }
  
  // Comma count bonus (many commas = likely prose text, not navigation)
  const commaCount = (text.match(/,/g) || []).length;
  if (commaCount > 10) {
    score *= 1.2; // Bonus for text-rich content
  } else if (commaCount > 5) {
    score *= 1.1;
  }
  
  // Sentence count (more sentences = more content)
  const sentenceCount = (text.match(/[.!?]+\s+/g) || []).length;
  if (sentenceCount > 5) {
    score += Math.min(sentenceCount * 2, 30);
  }
  
  // Semantic HTML bonus (stronger bonus)
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'article') {
    score *= 2.0; // Very strong indicator of content
  } else if (tagName === 'main') {
    score *= 1.5;
  } else if (tagName === 'section' && paragraphs.length >= 3) {
    score *= 1.2;
  }
  
  // Content-like class/id bonus (stronger)
  if (isLikelyContentContainer(element)) {
    score += 100; // Increased bonus
  }
  
  // Penalty for very short content (less strict)
  if (textLength < 100) {
    score *= 0.5;
  } else if (textLength < 200) {
    score *= 0.8; // Less penalty
  }
  
  // Penalty for too many lists (likely navigation) - more lenient
  const lists = element.querySelectorAll('ul, ol');
  if (lists.length > paragraphs.length * 3 && paragraphs.length < 3) {
    score *= 0.6;
  } else if (lists.length > paragraphs.length * 2 && paragraphs.length < 5) {
    score *= 0.8; // Less penalty
  }
  
  // HEAVY PENALTY for email signup/newsletter content
  const textLower = text.toLowerCase();
  if (textLower.includes('get the latest') && textLower.includes('inbox') ||
      textLower.includes('email powered by') ||
      textLower.includes('salesforce marketing cloud') ||
      textLower.includes('marketing cloud')) {
    score -= 1000; // Very heavy penalty - should never be selected
  }
  
  // HEAVY PENALTY for email signup forms/newsletters
  const emailInputs = element.querySelectorAll('input[type="email"]');
  if (emailInputs.length > 0) {
    // Check if it's a newsletter signup (not a contact form)
    const hasNewsletterText = textLower.includes('newsletter') || 
                              textLower.includes('subscribe') ||
                              textLower.includes('get the latest') ||
                              textLower.includes('inbox') ||
                              textLower.includes('marketing cloud');
    if (hasNewsletterText) {
      score -= 1000; // Very heavy penalty for newsletter signups
    } else {
      score -= 50; // Still penalty for email inputs
    }
  }
  
  // Penalty for marketing cloud indicators
  if (textLower.includes('marketing cloud') || textLower.includes('salesforce')) {
    score -= 500;
  }
  
  // Bonus for images (content usually has images)
  const images = element.querySelectorAll('img');
  if (images.length > 0 && images.length < 20) { // Not too many (could be gallery)
    score += Math.min(images.length * 3, 20);
  }
  
  // Bonus for long paragraphs (indicator of article content, not navigation)
  let longParagraphs = 0;
  for (const p of paragraphs) {
    if (p.textContent.trim().length > 200) {
      longParagraphs++;
    }
  }
  if (longParagraphs > 3) {
    score += longParagraphs * 5; // Bonus for substantial paragraphs
  }
  
  return score;
}

/**
 * Check if element has substantial content
 * @param {Element} element - Element to check
 * @returns {boolean} True if element has substantial content
 */
export function hasSubstantialContentModule(element) {
  const text = element.textContent.trim();
  const paragraphs = element.querySelectorAll('p');
  // Less strict: allow elements with at least 100 chars OR 1 paragraph
  // This helps with pages that have less structured content
  return text.length > 100 && (paragraphs.length >= 1 || text.length > 300);
}

/**
 * Find main content container using multiple strategies
 * @param {Function} isExcluded - Function to check if element is excluded
 * @param {Function} isLikelyContentContainer - Function to check if element is likely content
 * @param {Function} calculateContentScore - Function to calculate content score
 * @returns {Element|null} Main content element
 */
export function findMainContentModule(isExcluded, isLikelyContentContainer, calculateContentScore) {
  // Strategy 1: Semantic HTML5 (less strict checks)
  // IMPORTANT: Check if article is actually the main content, not a related article card
  const article = document.querySelector('article');
  if (article) {
    const articleText = article.textContent.trim();
    // Even if doesn't meet hasSubstantialContent, check if it has reasonable content
    if (articleText.length > 100) {
      // Check if article is likely a related article card (small content, has image placeholder, etc.)
      const isRelatedArticle = articleText.length < 500 || 
                               article.querySelector('.gc__image-placeholder') !== null ||
                               article.className.includes('gc--type-post') ||
                               article.className.includes('card') ||
                               article.closest('aside, .related, .sidebar') !== null;
      
      // Only use article if it's substantial content (not a card)
      if (!isRelatedArticle && articleText.length > 500) {
        const isExcludedResult = isExcluded(article);
        const isLikelyContent = isLikelyContentContainer(article);
        // For semantic containers, only exclude if clearly not content (very strict)
        if (!isExcludedResult) {
          return article;
        }
        // Fallback: if excluded but is likely content container, still use it
        if (isLikelyContent) {
          return article;
        }
      }
    }
  }
  
  const main = document.querySelector('main');
  if (main) {
    const mainText = main.textContent.trim();
    if (mainText.length > 100) {
      // Check if there's a more specific content container inside main
      // (e.g., .wysiwyg for Al Jazeera, .article-content for other sites)
      const specificContent = main.querySelector('.wysiwyg, .wysiwyg--all-content, .article-content, .post-content, .entry-content, .article-body, .post-body');
      if (specificContent && specificContent.textContent.trim().length > 500) {
        // Use the specific content container instead of main
        const isExcludedResult = isExcluded(specificContent);
        if (!isExcludedResult) {
          return specificContent;
        }
      }
      
      const isExcludedResult = isExcluded(main);
      const isLikelyContent = isLikelyContentContainer(main);
      // Same logic as for article
      if (!isExcludedResult) {
        return main;
      }
      if (isLikelyContent) {
        return main;
      }
    }
  }
  
  // Strategy 2: Common content selectors (prioritize these)
  const contentSelectors = [
    '[role="main"]',
    '.article-content', '.post-content', '.entry-content', '.content',
    '.post-body', '.article-body', '.entry-body',
    '#content', '#main-content', '#article-content',
    '.wp-block-post-content', '.entry', '.post',
    // Additional common patterns
    '.prose', '.article-text', '.story-body', '.article-body-content',
    '.wysiwyg', '.wysiwyg--all-content', // Al Jazeera uses this
    '[class*="article"]', '[class*="content"]', '[id*="article"]', '[id*="content"]'
  ];
  
  for (const selector of contentSelectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const elementText = element.textContent.trim();
        // Less strict: accept if has reasonable text length
        if (elementText.length > 100) {
          // For known content containers, be less strict about exclusions
          if (isLikelyContentContainer(element) || !isExcluded(element)) {
            // If we found main/article, check if there's a more specific content container inside
            // (e.g., .wysiwyg inside main for Al Jazeera)
            if ((element.tagName.toLowerCase() === 'main' || element.tagName.toLowerCase() === 'article') && 
                elementText.length > 500) {
              const specificContent = element.querySelector('.wysiwyg, .wysiwyg--all-content, .article-content, .post-content, .entry-content');
              if (specificContent && specificContent.textContent.trim().length > 500) {
                return specificContent;
              }
            }
            return element;
          }
        }
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }
  
  // Strategy 3: Score-based search (Readability-inspired)
  // Check all potential containers
  const candidates = Array.from(document.querySelectorAll('div, article, main, section'));
  
  let bestCandidate = null;
  let maxScore = 0;
  const topCandidates = []; // Track top 5 for debugging
  
  // Cache for textContent to avoid repeated expensive operations
  const textContentCache = new WeakMap();
  function getCachedTextContent(element) {
    if (!textContentCache.has(element)) {
      textContentCache.set(element, element.textContent.trim());
    }
    return textContentCache.get(element);
  }
  
  for (const candidate of candidates) {
    // Skip if clearly excluded (but be lenient for content-like containers)
    if (!isLikelyContentContainer(candidate) && isExcluded(candidate)) continue;
    
    // Use cached textContent
    const candidateText = getCachedTextContent(candidate);
    // Less strict: accept candidates with at least 100 chars
    if (candidateText.length < 100) continue;
    
    // Calculate score using improved algorithm
    const score = calculateContentScore(candidate, isLikelyContentContainer);
    
    // Early exit if we found a very good candidate
    if (score > 100) {
      return candidate;
    }
    
    // Track top candidates for debugging
    if (topCandidates.length < 5 || score > topCandidates[topCandidates.length - 1].score) {
      topCandidates.push({ element: candidate, score: score });
      topCandidates.sort((a, b) => b.score - a.score);
      if (topCandidates.length > 5) topCandidates.pop();
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestCandidate = candidate;
    }
  }
  
  // If we found a good candidate, return it
  // Lower threshold to be less strict (was 20, now 10)
  if (bestCandidate && maxScore > 10) {
    return bestCandidate;
  }
  
  // Fallback: return best candidate even if score is lower (but must have some content)
  if (bestCandidate && maxScore > 0) {
    return bestCandidate;
  }
  return null;
}


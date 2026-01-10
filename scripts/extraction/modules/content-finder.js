// @ts-check
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
 * @param {import('../../types.js').IsLikelyContentContainerFunction} isLikelyContentContainer - Function to check if element is likely content
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
  
  // Visual position analysis (inspired by research on visual features)
  // Content is usually positioned near the center of the viewport
  // Navigation/ads are often at edges or top/bottom
  try {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    if (viewportWidth > 0 && viewportHeight > 0) {
      // Calculate distance from viewport center
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;
      
      const distanceFromCenter = Math.sqrt(
        Math.pow(elementCenterX - centerX, 2) + Math.pow(elementCenterY - centerY, 2)
      );
      const maxDistance = Math.sqrt(Math.pow(viewportWidth, 2) + Math.pow(viewportHeight, 2));
      const normalizedDistance = maxDistance > 0 ? distanceFromCenter / maxDistance : 0;
      
      // Content is usually closer to center (normalizedDistance < 0.4)
      // Navigation/ads are often at edges (normalizedDistance > 0.6)
      if (normalizedDistance < 0.3) {
        score += 10; // Bonus for being near center
      } else if (normalizedDistance < 0.5) {
        score += 5; // Moderate bonus
      } else if (normalizedDistance > 0.8) {
        score *= 0.9; // Light penalty for being at edges (might be sidebar/nav)
      }
      
      // Bonus if element is visible in viewport (not scrolled out)
      const isVisible = rect.top < viewportHeight && rect.bottom > 0 && 
                       rect.left < viewportWidth && rect.right > 0;
      if (isVisible) {
        score += 5; // Bonus for visible content
      }
    }
  } catch (e) {
    // Skip visual analysis if error (element might be detached)
  }
  
  // SPA-specific bonus: Check for React/Vue/Angular root containers
  const id = (element.id || '').toLowerCase();
  const className = String(element.className || '').toLowerCase();
  if (id === 'root' || id === 'app' || id === '__next' || 
      className.includes('notion-page') || 
      element.hasAttribute('data-reactroot') ||
      element.hasAttribute('ng-app') ||
      element.hasAttribute('data-vue-app')) {
    // Only give bonus if it actually has content
    if (textLength >= 500) {
      score += 50; // Significant bonus for SPA root containers with content
    }
  }
  
  // Improved link density calculation (inspired by Readability.js and Boilerpipe)
  // Only count text links (not icon buttons), exclude links inside paragraphs (they're part of content)
  let navigationLinkLength = 0;
  let totalLinkTextLength = 0;
  
  for (const link of Array.from(links)) {
    const linkText = link.textContent.trim();
    // Skip icon-only links (very short or empty, likely buttons/icons)
    if (linkText.length > 2 && linkText.length < 200) {
      totalLinkTextLength += linkText.length;
      
      // Check if link is inside a paragraph (part of article content, not navigation)
      const isInParagraph = link.closest('p') !== null;
      if (!isInParagraph) {
        // This is likely a navigation link
        navigationLinkLength += linkText.length;
      }
    }
  }
  
  // Calculate link density: navigation link text / total text
  // Higher ratio = more navigation, less content
  const linkDensity = textLength > 0 ? navigationLinkLength / textLength : 0;
  
  // More lenient: only heavy penalty if link density is very high (>0.3 = 30% of text is navigation links)
  if (linkDensity > 0.3) {
    score *= 0.4; // Heavy penalty for navigation-like content
  } else if (linkDensity > 0.2) {
    score *= 0.6; // Moderate penalty
  } else if (linkDensity > 0.1) {
    score *= 0.8; // Light penalty
  }
  
  // Bonus if links are mostly inside paragraphs (part of content, not navigation)
  const contentLinkRatio = totalLinkTextLength > 0 
    ? (totalLinkTextLength - navigationLinkLength) / totalLinkTextLength 
    : 0;
  if (contentLinkRatio > 0.7 && links.length > 0) {
    score *= 1.1; // Bonus for content with inline links (typical of articles)
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
  for (const p of Array.from(paragraphs)) {
    if (p.textContent.trim().length > 200) {
      longParagraphs++;
    }
  }
  if (longParagraphs > 3) {
    score += longParagraphs * 5; // Bonus for substantial paragraphs
  }
  
  // Text density analysis (inspired by Boilerpipe)
  // Higher text density = more likely to be content (text per area)
  try {
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0 && textLength > 0) {
      const textDensity = textLength / area;
      // Optimal text density is between 0.01 and 0.1 (characters per pixel²)
      // Very low density (< 0.001) = likely navigation/spacing
      // Very high density (> 0.2) = likely compressed text/ads
      if (textDensity >= 0.01 && textDensity <= 0.1) {
        score += 15; // Bonus for optimal text density
      } else if (textDensity >= 0.005 && textDensity <= 0.15) {
        score += 8; // Moderate bonus
      } else if (textDensity < 0.001) {
        score *= 0.7; // Penalty for very low density (likely navigation/spacing)
      }
    }
  } catch (e) {
    // Element might be detached or in iframe, skip text density
  }
  
  // DOM structure analysis (inspired by Web2Text and research)
  // Content is usually at medium depth (not too shallow, not too deep)
  // Very shallow (< 3 levels) = likely template/wrapper
  // Very deep (> 10 levels) = likely nested navigation/widgets
  // Optimal depth: 3-8 levels from body
  try {
    let depth = 0;
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      depth++;
      current = current.parentElement;
      if (depth > 20) break; // Safety limit
    }
    
    // Optimal depth for content is 3-8 levels
    if (depth >= 3 && depth <= 8) {
      score += 10; // Bonus for optimal depth
    } else if (depth >= 2 && depth <= 10) {
      score += 5; // Moderate bonus
    } else if (depth < 2) {
      score *= 0.8; // Penalty for very shallow (likely template)
    } else if (depth > 12) {
      score *= 0.9; // Light penalty for very deep (might be nested widget)
    }
  } catch (e) {
    // Skip depth analysis if error
  }
  
  // Pattern recognition (inspired by Web2Text)
  // Detect repeating structures - likely template/navigation, not content
  try {
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      if (siblings.length >= 3) {
        // Get structure signature for each sibling (simplified: tag + class pattern)
        const getStructureSignature = (el) => {
          const tag = el.tagName.toLowerCase();
          const classPattern = (el.className || '').split(' ').slice(0, 2).join(' ').toLowerCase();
          return `${tag}:${classPattern}`;
        };
        
        const signatures = siblings.map(getStructureSignature);
        const candidateSig = getStructureSignature(element);
        
        // Count how many siblings have the same structure
        const sameStructureCount = signatures.filter(sig => sig === candidateSig).length;
        
        // If many siblings have same structure, it's likely a template/navigation
        // Content blocks usually have unique or varied structures
        if (sameStructureCount >= siblings.length * 0.6 && siblings.length >= 3) {
          score *= 0.7; // Penalty for repeating pattern (likely template/navigation)
        } else if (sameStructureCount >= siblings.length * 0.4) {
          score *= 0.9; // Light penalty for somewhat repetitive
        }
      }
    }
  } catch (e) {
    // Skip pattern recognition if error
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
 * @param {import('../../types.js').IsExcludedFunction} isExcluded - Function to check if element is excluded
 * @param {import('../../types.js').IsLikelyContentContainerFunction} isLikelyContentContainer - Function to check if element is likely content
 * @param {import('../../types.js').CalculateContentScoreFunction} calculateContentScore - Function to calculate content score
 * @returns {Element|null} Main content element
 */
export function findMainContentModule(isExcluded, isLikelyContentContainer, calculateContentScore) {
  // Strategy 0: SPA root containers (React, Vue, Angular, Notion) - check first for SPAs
  // These are often the main content containers in single-page applications
  const spaSelectors = [
    { selector: '#root', name: 'React root' },
    { selector: '#app', name: 'Vue/Generic app' },
    { selector: '#__next', name: 'Next.js' },
    { selector: '[data-reactroot]', name: 'React root (data attr)' },
    { selector: '[ng-app]', name: 'Angular app' },
    { selector: '[data-vue-app]', name: 'Vue app' },
    { selector: '.notion-page-content', name: 'Notion page' },
    { selector: '.notion-page', name: 'Notion page (alt)' }
  ];
  
  for (const { selector, name } of spaSelectors) {
    try {
      const spaRoot = document.querySelector(selector);
      if (spaRoot) {
        const spaText = spaRoot.textContent.trim();
        // For SPA roots, be more lenient - accept if has reasonable content
        if (spaText.length >= 500) {
          // Check if there's a more specific content container inside
          const specificContent = spaRoot.querySelector('article, main, [role="main"], .article-content, .post-content, .entry-content');
          if (specificContent && specificContent.textContent.trim().length >= 500) {
            const isExcludedResult = isExcluded(specificContent);
            if (!isExcludedResult) {
              return specificContent;
            }
          }
          // Use SPA root if it has substantial content and is not excluded
          const isExcludedResult = isExcluded(spaRoot);
          if (!isExcludedResult || isLikelyContentContainer(spaRoot)) {
            return spaRoot;
          }
        }
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }
  
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
    // SPA-specific selectors (React, Vue, Angular, Notion)
    '#root', '#app', '#__next', '[data-reactroot]', '[ng-app]', '[data-vue-app]',
    '.notion-page-content', '.notion-page', // Notion
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
  // Check all potential containers, including SPA root containers
  const candidates = Array.from(document.querySelectorAll('div, article, main, section'));
  
  // Also check SPA root containers specifically (React, Vue, Angular, Notion)
  const spaRoots = [
    document.getElementById('root'),
    document.getElementById('app'),
    document.getElementById('__next'),
    document.querySelector('[data-reactroot]'),
    document.querySelector('[ng-app]'),
    document.querySelector('[data-vue-app]'),
    document.querySelector('.notion-page-content'),
    document.querySelector('.notion-page')
  ].filter(el => el !== null && !candidates.includes(el));
  
  candidates.push(...spaRoots);
  
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
    let score = calculateContentScore(candidate, isLikelyContentContainer);
    
    // Neighbor analysis (inspired by Boilerpipe)
    // If neighbors are also content-like, increase score (context-aware)
    // If neighbors are navigation/ads, decrease score
    try {
      const parent = candidate.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const candidateIndex = siblings.indexOf(candidate);
        
        // Check previous and next siblings
        const prevSibling = candidateIndex > 0 ? siblings[candidateIndex - 1] : null;
        const nextSibling = candidateIndex < siblings.length - 1 ? siblings[candidateIndex + 1] : null;
        
        let neighborBonus = 0;
        let neighborPenalty = 0;
        
        // Analyze previous sibling
        if (prevSibling) {
          const prevScore = calculateContentScore(prevSibling, isLikelyContentContainer);
          if (prevScore > 50) {
            neighborBonus += 5; // Neighbor is also content-like
          } else if (prevScore < -100) {
            neighborPenalty += 5; // Neighbor is clearly not content
          }
        }
        
        // Analyze next sibling
        if (nextSibling) {
          const nextScore = calculateContentScore(nextSibling, isLikelyContentContainer);
          if (nextScore > 50) {
            neighborBonus += 5; // Neighbor is also content-like
          } else if (nextScore < -100) {
            neighborPenalty += 5; // Neighbor is clearly not content
          }
        }
        
        // Apply neighbor analysis to score
        score += neighborBonus;
        score -= neighborPenalty;
      }
    } catch (e) {
      // Skip neighbor analysis if there's an error
    }
    
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
  
  // Block merging (inspired by Boilerpipe)
  // If best candidate has neighbors with similar scores, consider merging them
  // This helps capture content that spans multiple containers
  if (bestCandidate && maxScore > 10) {
    try {
      const parent = bestCandidate.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const candidateIndex = siblings.indexOf(bestCandidate);
        
        // Check if we should merge with adjacent high-scoring siblings
        const mergeThreshold = maxScore * 0.7; // Merge if neighbor score is at least 70% of best
        
        // Check previous sibling
        if (candidateIndex > 0) {
          const prevSibling = siblings[candidateIndex - 1];
          const prevScore = calculateContentScore(prevSibling, isLikelyContentContainer);
          if (prevScore > mergeThreshold && prevScore > 20) {
            // Previous sibling is also content-like, check if we should use parent instead
            const parentScore = calculateContentScore(parent, isLikelyContentContainer);
            if (parentScore > maxScore * 0.9) {
              // Parent contains both high-scoring elements, use parent
              return parent;
            }
          }
        }
        
        // Check next sibling
        if (candidateIndex < siblings.length - 1) {
          const nextSibling = siblings[candidateIndex + 1];
          const nextScore = calculateContentScore(nextSibling, isLikelyContentContainer);
          if (nextScore > mergeThreshold && nextScore > 20) {
            // Next sibling is also content-like, check if we should use parent instead
            const parentScore = calculateContentScore(parent, isLikelyContentContainer);
            if (parentScore > maxScore * 0.9) {
              // Parent contains both high-scoring elements, use parent
              return parent;
            }
          }
        }
      }
    } catch (e) {
      // Skip block merging if error
    }
    
    return bestCandidate;
  }
  
  // Fallback: return best candidate even if score is lower (but must have some content)
  if (bestCandidate && maxScore > 0) {
    return bestCandidate;
  }
  return null;
}


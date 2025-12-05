// Page script for content extraction - runs in page context
// This file is injected into the page and cannot use ES modules

/**
 * Extract content from page using provided selectors
 * @param {Object} selectors - CSS selectors from AI
 * @param {string} baseUrl - Page URL for resolving relative links
 * @returns {Object} Extracted content
 */
function extractFromPage(selectors, baseUrl) {
  console.log('[WebpageToPDF:Page] Starting extraction', { selectors, baseUrl });
  
  const content = [];
  const debugInfo = {
    containerFound: false,
    containerSelector: null,
    elementsProcessed: 0,
    elementsExcluded: 0,
    headingCount: 0
  };
  
  // Mapping from TOC link text to anchor id
  const tocMapping = {};
  let footnotesHeaderAdded = false;
  const addedImageUrls = new Set();
  
  // ========================================
  // HELPER FUNCTIONS
  // ========================================
  
  function toAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    try {
      return new URL(url, baseUrl).href;
    } catch (e) {
      return url;
    }
  }
  
  function normalizeText(text) {
    return (text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  
  function normalizeImageUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      return u.pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }
  
  function isInfoboxDiv(element) {
    if (element.tagName.toLowerCase() !== 'div') return false;
    const className = element.className.toLowerCase();
    const infoboxClasses = ['spoiler', 'interview', 'terminology', 'infobox', 'note-box', 'callout', 'aside-box', 'expandable', 'collapsible'];
    return infoboxClasses.some(cls => className.includes(cls));
  }
  
  function shouldExclude(element) {
    if (isInfoboxDiv(element) || element.tagName.toLowerCase() === 'aside' || element.tagName.toLowerCase() === 'details') {
      return false;
    }
    if (!selectors.exclude) return false;
    for (const selector of selectors.exclude) {
      try {
        if (element.matches(selector) || element.closest(selector)) {
          return true;
        }
      } catch (e) {}
    }
    return false;
  }
  
  function getFormattedHtml(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('a[href]').forEach(a => {
      a.href = toAbsoluteUrl(a.getAttribute('href'));
    });
    if (selectors.exclude) {
      selectors.exclude.forEach(sel => {
        try {
          clone.querySelectorAll(sel).forEach(el => el.remove());
        } catch (e) {}
      });
    }
    return clone.innerHTML;
  }
  
  // ========================================
  // IMAGE EXTRACTION HELPERS
  // ========================================
  
  function isImageUrl(url) {
    if (!url || url.startsWith('javascript:') || url.startsWith('data:')) return false;
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'];
    const imageHosts = ['substackcdn', 'imgur', 'cloudinary', 'imgix', 'wp-content/uploads', 'media.', 'images.', 'cdn.'];
    const lowerUrl = url.toLowerCase();
    for (const ext of imageExtensions) {
      if (lowerUrl.includes(ext + '?') || lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '#')) {
        return true;
      }
    }
    if (imageHosts.some(host => lowerUrl.includes(host))) return true;
    return false;
  }
  
  function isPlaceholderUrl(url) {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('data:') && url.length < 200) return true;
    const placeholderPatterns = ['placeholder', 'spacer', 'blank.gif', 'pixel.gif', 'loading.'];
    return placeholderPatterns.some(p => lowerUrl.includes(p));
  }
  
  function isSmallOrAvatarImage(imgElement, src) {
    if (!src) return true;
    const resizeMatch = src.match(/resize:(fit|fill):(\d+)(?::(\d+))?/);
    if (resizeMatch) {
      const width = parseInt(resizeMatch[2]);
      const height = resizeMatch[3] ? parseInt(resizeMatch[3]) : width;
      if (width < 100 || height < 100) return true;
    }
    if (imgElement) {
      const naturalW = imgElement.naturalWidth || 0;
      const naturalH = imgElement.naturalHeight || 0;
      if (naturalW > 0 && naturalH > 0 && (naturalW < 100 || naturalH < 100)) return true;
      const className = (imgElement.className || '').toLowerCase();
      if (className.includes('avatar') || className.includes('profile') || className.includes('author')) return true;
    }
    return false;
  }
  
  function getBestSrcsetUrl(srcset) {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim()).filter(s => s);
    if (parts.length === 0) return null;
    let bestUrl = null;
    let bestScore = 0;
    for (let part of parts) {
      part = part.trim();
      if (!part || part.startsWith('data:')) continue;
      const descriptorMatch = part.match(/\s+(\d+(?:\.\d+)?[wx])$/i);
      let url, descriptor;
      if (descriptorMatch) {
        url = part.substring(0, part.length - descriptorMatch[0].length).trim();
        descriptor = descriptorMatch[1].toLowerCase();
      } else {
        url = part;
        descriptor = null;
      }
      if (!url || url.startsWith('data:')) continue;
      url = url.replace(/^["']|["']$/g, '');
      if (!url.match(/^(https?:\/\/|\/\/|\/)/)) continue;
      let score = 1;
      if (descriptor) {
        if (descriptor.endsWith('w')) score = parseInt(descriptor) || 1;
        else if (descriptor.endsWith('x')) score = (parseFloat(descriptor) || 1) * 1000;
      }
      if (score >= bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
    return bestUrl;
  }
  
  function isTrackingPixelOrSpacer(imgElement, src) {
    const width = imgElement?.naturalWidth || imgElement?.width || parseInt(imgElement?.getAttribute('width')) || 0;
    const height = imgElement?.naturalHeight || imgElement?.height || parseInt(imgElement?.getAttribute('height')) || 0;
    if ((width === 1 && height === 1) || (width === 0 && height === 0)) return true;
    if (src) {
      const lowerSrc = src.toLowerCase();
      if (lowerSrc.includes('spacer') || lowerSrc.includes('pixel') || lowerSrc.includes('tracking')) return true;
    }
    return false;
  }
  
  function extractBestImageUrl(imgElement, containerElement = null) {
    if (!imgElement) return null;
    let src = null;
    const container = containerElement || imgElement.parentElement;
    
    // Priority 1: currentSrc
    if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc)) {
      src = imgElement.currentSrc;
    }
    // Priority 2: Parent link href
    if (!src) {
      const parentLink = container?.closest('a[href]') || container?.querySelector('a[href]');
      if (parentLink) {
        const href = parentLink.getAttribute('href');
        if (href && isImageUrl(href)) src = href;
      }
    }
    // Priority 3: img.src
    if (!src) {
      const imgSrc = imgElement.src || imgElement.getAttribute('src');
      if (imgSrc && !isPlaceholderUrl(imgSrc)) src = imgSrc;
    }
    // Priority 4: srcset
    if (!src) src = getBestSrcsetUrl(imgElement.getAttribute('srcset'));
    // Priority 5: picture source
    if (!src) {
      const picture = imgElement.closest('picture') || container?.querySelector('picture');
      if (picture) {
        const sources = picture.querySelectorAll('source[srcset]');
        for (const source of sources) {
          const sourceSrc = getBestSrcsetUrl(source.getAttribute('srcset'));
          if (sourceSrc) src = sourceSrc;
        }
      }
    }
    // Priority 6: lazy-load attributes
    if (!src) {
      const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-full-src'];
      for (const attr of lazyAttrs) {
        const val = imgElement.getAttribute(attr);
        if (val && !val.includes('data:')) {
          src = attr === 'data-srcset' ? getBestSrcsetUrl(val) : val;
          if (src) break;
        }
      }
    }
    return src;
  }
  
  // ========================================
  // TOC EXTRACTION
  // ========================================
  
  function extractTocMapping(listElement) {
    const links = listElement.querySelectorAll('a[href^="#"]');
    if (links.length < 2) return false;
    let isToc = false;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const anchor = href.substring(1);
        const text = normalizeText(link.textContent);
        if (text && anchor) {
          tocMapping[text] = anchor;
          isToc = true;
        }
      }
    });
    return isToc;
  }
  
  // ========================================
  // FIND CONTAINERS
  // ========================================
  
  let containers = [];
  let container = null;
  const aiSelectors = [selectors.content, selectors.articleContainer].filter(Boolean);
  
  for (const sel of aiSelectors) {
    try {
      const allElements = document.querySelectorAll(sel);
      if (allElements.length > 1) {
        containers = Array.from(allElements);
        debugInfo.containerFound = true;
        debugInfo.containerSelector = sel;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
        break;
      } else if (allElements.length === 1) {
        container = allElements[0];
        debugInfo.containerFound = true;
        debugInfo.containerSelector = sel;
        break;
      }
    } catch (e) {}
  }
  
  // Check for multiple articles inside container
  if (container && containers.length === 0) {
    const articlesInside = container.querySelectorAll('article');
    if (articlesInside.length > 1) {
      containers = Array.from(articlesInside);
      debugInfo.multipleContainers = true;
      debugInfo.containerCount = containers.length;
      container = null;
    }
  }
  
  if (containers.length === 0 && !container) {
    container = document.body;
    debugInfo.containerSelector = 'body';
  }
  
  // ========================================
  // GET TITLE
  // ========================================
  
  let articleTitle = '';
  if (selectors.title) {
    try {
      const titleEl = document.querySelector(selectors.title);
      if (titleEl) articleTitle = titleEl.textContent.trim();
    } catch (e) {}
  }
  if (!articleTitle) {
    const allArticles = document.querySelectorAll('main article');
    if (allArticles.length > 1) {
      const h1OutsideMain = Array.from(document.querySelectorAll('h1')).find(h1 => !h1.closest('main'));
      if (h1OutsideMain) articleTitle = h1OutsideMain.textContent.trim();
    }
  }
  if (!articleTitle) {
    const h1 = document.querySelector('h1');
    if (h1) articleTitle = h1.textContent.trim();
  }
  
  // Get author
  let articleAuthor = selectors.author || '';
  if (articleAuthor) articleAuthor = articleAuthor.replace(/^by\s+/i, '').trim();
  
  // Get publish date
  let publishDate = '';
  const dateSelectors = ['time[datetime]', 'time', '[itemprop="datePublished"]', '.date', '.post-date'];
  for (const sel of dateSelectors) {
    try {
      const dateEl = document.querySelector(sel);
      if (dateEl) {
        if (sel.startsWith('meta')) {
          publishDate = dateEl.getAttribute('content') || '';
        } else if (dateEl.hasAttribute('datetime')) {
          publishDate = dateEl.getAttribute('datetime');
        } else {
          publishDate = dateEl.textContent.trim();
        }
        if (publishDate) break;
      }
    } catch (e) {}
  }
  
  // ========================================
  // PROCESS ELEMENT FUNCTION
  // ========================================
  
  function getAnchorId(el) {
    if (el.id) return el.id;
    if (el.getAttribute && el.getAttribute('name')) return el.getAttribute('name');
    const firstChild = el.firstElementChild;
    if (firstChild) {
      const childTag = firstChild.tagName?.toLowerCase();
      if (childTag === 'a' || childTag === 'span') {
        if (firstChild.id) return firstChild.id;
        if (firstChild.getAttribute && firstChild.getAttribute('name')) return firstChild.getAttribute('name');
      }
    }
    const nestedWithId = el.querySelector('a[id], a[name], span[id], span[name], sup[id], [id^="source"], [id^="ref"], [id^="cite"]');
    if (nestedWithId) return nestedWithId.id || nestedWithId.getAttribute('name') || '';
    return '';
  }
  
  function processElement(element) {
    if (shouldExclude(element)) {
      debugInfo.elementsExcluded++;
      return;
    }
    
    const tagName = element.tagName.toLowerCase();
    
    // Skip hidden elements
    try {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return;
    } catch (e) {}
    
    debugInfo.elementsProcessed++;
    const elementId = getAnchorId(element);
    
    // Process by tag type
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = element.textContent.trim();
      const formattedText = getFormattedHtml(element);
      if (text && text !== articleTitle) {
        if (articleAuthor) {
          const textLower = text.toLowerCase();
          const authorLower = articleAuthor.toLowerCase();
          if (textLower === authorLower || (text.length < 50 && textLower.includes(authorLower))) return;
        }
        let headingId = elementId;
        if (!headingId) {
          const normalizedHeading = normalizeText(text);
          if (tocMapping[normalizedHeading]) headingId = tocMapping[normalizedHeading];
          else headingId = String(debugInfo.headingCount + 1);
        }
        debugInfo.headingCount++;
        content.push({ type: 'heading', level: parseInt(tagName[1]), text: formattedText, id: headingId });
      }
    }
    else if (tagName === 'p') {
      let html = getFormattedHtml(element);
      if (html.trim()) {
        const plainText = element.textContent?.trim() || '';
        if (articleAuthor && plainText === articleAuthor) return;
        const cleanText = plainText.replace(/[\s\u00A0]/g, '');
        if (cleanText.length <= 3 && /^[—–\-\._·•\*]+$/.test(cleanText)) return;
        if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) {
          html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
        }
        content.push({ type: 'paragraph', text: html, id: elementId });
      }
    }
    else if (tagName === 'img') {
      if (element.closest('figure')) return;
      let src = extractBestImageUrl(element);
      src = toAbsoluteUrl(src);
      const normalizedSrc = normalizeImageUrl(src);
      if (src && !isTrackingPixelOrSpacer(element, src) && !isPlaceholderUrl(src) && 
          !addedImageUrls.has(normalizedSrc) && !isSmallOrAvatarImage(element, src)) {
        content.push({ type: 'image', src: src, alt: element.alt || '', id: elementId });
        addedImageUrls.add(normalizedSrc);
      }
    }
    else if (tagName === 'figure') {
      const img = element.querySelector('img');
      const caption = element.querySelector('figcaption');
      if (img) {
        let src = extractBestImageUrl(img, element);
        src = toAbsoluteUrl(src);
        const normalizedSrc = normalizeImageUrl(src);
        if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && 
            !addedImageUrls.has(normalizedSrc) && !isSmallOrAvatarImage(img, src)) {
          content.push({
            type: 'image',
            src: src,
            alt: caption ? getFormattedHtml(caption) : (img.alt || ''),
            id: elementId || img.id || ''
          });
          addedImageUrls.add(normalizedSrc);
        }
      }
    }
    else if (tagName === 'blockquote') {
      content.push({ type: 'quote', text: getFormattedHtml(element), id: elementId });
    }
    else if (tagName === 'ul' || tagName === 'ol') {
      if (Object.keys(tocMapping).length === 0) extractTocMapping(element);
      const items = Array.from(element.querySelectorAll(':scope > li')).map(li => {
        const liId = getAnchorId(li);
        let html = getFormattedHtml(li);
        if (liId && !html.includes(`id="${liId}"`)) {
          html = `<a id="${liId}" name="${liId}"></a>${html}`;
        }
        return { html, id: liId };
      }).filter(item => item.html);
      if (items.length > 0) {
        content.push({ type: 'list', ordered: tagName === 'ol', items: items, id: elementId });
      }
    }
    else if (tagName === 'pre') {
      const code = element.querySelector('code');
      const text = code ? code.textContent : element.textContent;
      const langClass = code?.className.match(/language-(\w+)/);
      content.push({ type: 'code', language: langClass ? langClass[1] : 'text', text: text, id: elementId });
    }
    else if (tagName === 'table') {
      const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(element.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => getFormattedHtml(td))
      );
      if (headers.length > 0 || rows.length > 0) {
        content.push({ type: 'table', headers: headers, rows: rows, id: elementId });
      }
    }
    else if (tagName === 'hr') {
      content.push({ type: 'separator', id: elementId });
    }
    else if (tagName === 'aside' || tagName === 'details' || isInfoboxDiv(element)) {
      const summary = element.querySelector(':scope > summary');
      const titleEl = element.querySelector(':scope > .spoiler-title, :scope > .interview-title, :scope > h3, :scope > h4');
      const titleText = summary ? summary.textContent.trim() : (titleEl ? titleEl.textContent.trim() : '');
      content.push({ type: 'infobox_start', title: titleText, id: elementId });
      for (const child of element.children) {
        const childTag = child.tagName.toLowerCase();
        const isTitle = childTag === 'summary' || child.classList.contains('spoiler-title') || 
                       (titleText && child.textContent.trim() === titleText);
        if (!isTitle) processElement(child);
      }
      content.push({ type: 'infobox_end' });
    }
    else if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
      const className = element.className?.toLowerCase() || '';
      const elId = element.id?.toLowerCase() || '';
      const isFootnotesSection = className.includes('footnotes') || elId.includes('footnotes');
      
      if (isFootnotesSection && !footnotesHeaderAdded) {
        content.push({ type: 'separator', id: '' });
        content.push({ type: 'heading', level: 2, text: 'Примечания', id: 'footnotes-section' });
        footnotesHeaderAdded = true;
      }
      
      for (const child of element.children) {
        processElement(child);
      }
    }
  }
  
  // ========================================
  // START PROCESSING
  // ========================================
  
  if (containers.length > 0) {
    for (const cont of containers) {
      for (const child of cont.children) {
        processElement(child);
      }
    }
  } else if (container) {
    for (const child of container.children) {
      processElement(child);
    }
  }
  
  console.log('[WebpageToPDF:Page] Extraction complete', { 
    contentItems: content.length,
    headingCount: debugInfo.headingCount
  });
  
  return {
    title: articleTitle,
    author: articleAuthor,
    content: content,
    publishDate: publishDate,
    debug: debugInfo
  };
}

// Export for injection
if (typeof window !== 'undefined') {
  window.extractFromPage = extractFromPage;
}








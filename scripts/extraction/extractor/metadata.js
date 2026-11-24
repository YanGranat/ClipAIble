// @ts-check
// Metadata extraction functions for extraction
// Extracts title, author, and publication date from page

import { cleanHeadingText } from './text-utils.js';
import { readArticleMetadataText, safeGetComputedStyle } from './dom-utils.js';

/**
 * Check if h1 looks like a valid article title (not site name)
 * @param {Element} h1Element - H1 element to check
 * @returns {boolean} - True if h1 is valid article title
 */
export function isValidArticleTitle(h1Element) {
  if (!h1Element || !h1Element.textContent) return false;
  const text = readArticleMetadataText(h1Element);
  if (text.length < 5) return false;
  
  const siteNamePatterns = ['home', 'about', 'contact', 'blog', 'news', 'archive'];
  const lowerText = text.toLowerCase();
  if (siteNamePatterns.some(pattern => lowerText === pattern)) return false;
  
  return true;
}

/**
 * Extract author name from profile URL
 * @param {string} url - Profile URL
 * @returns {string|null} - Extracted author name or null
 */
export function extractAuthorFromUrl(url) {
  if (!url) return null;
  try {
    const profileMatch = url.match(/\/(?:profile|author)\/([^\/\?]+)/i);
    if (profileMatch) {
      const slug = profileMatch[1];
      const parts = slug.split(/[-_]/);
      
      if (parts.length > 1) {
        const name = parts
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
        if (name.length > 2 && name.length < 100) return name;
      }
      
      // Try camelCase
      const camelCaseMatch = slug.match(/^([a-z]+)([A-Z][a-z]*)$/);
      if (camelCaseMatch) {
        const name = [
          camelCaseMatch[1].charAt(0).toUpperCase() + camelCaseMatch[1].slice(1).toLowerCase(),
          camelCaseMatch[2].charAt(0).toUpperCase() + camelCaseMatch[2].slice(1).toLowerCase()
        ].join(' ');
        if (name.length > 2 && name.length < 100) return name;
      }
      
      // Capitalize as single name
      const name = slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase();
      if (name.length > 2 && name.length < 100) return name;
    }
  } catch (e) { }
  return null;
}

/**
 * Get month number from month name
 * @param {string} monthName - Month name (English)
 * @returns {string|null} - Month number as "MM" or null
 */
export function getMonthNumber(monthName) {
  const months = {
    'january': '01', 'jan': '01',
    'february': '02', 'feb': '02',
    'march': '03', 'mar': '03',
    'april': '04', 'apr': '04',
    'may': '05',
    'june': '06', 'jun': '06',
    'july': '07', 'jul': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'october': '10', 'oct': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12'
  };
  const name = monthName.toLowerCase();
  return Object.hasOwn(months, name) ? months[name] : null;
}

/** @param {string} date - A complete calendar date in YYYY-MM-DD form. */
function validatedCalendarDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date ? date : null;
}

/**
 * Parse various date formats to ISO format
 * @param {string|null} dateStr - Date string
 * @returns {string|null} - ISO date (YYYY-MM-DD, YYYY-MM, or YYYY) or null
 */
export function parseDateToISO(dateStr) {
  const input = dateStr?.trim();
  if (!input) return null;

  const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}(?=$|[Tt\s])/);
  if (isoMatch) return validatedCalendarDate(isoMatch[0]);
  if (/^\d{4}(?:-\d{2})?$/.test(input)) {
    return /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(input) ? input : null;
  }

  const namedDate = input.match(/\b(?<day>\d{1,2})(?:st|nd|rd|th)?\s+(?<name>[a-z]+)\s+(?<year>\d{4})\b/i) ||
    input.match(/\b(?<name>[a-z]+)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?,?\s+(?<year>\d{4})\b/i);
  if (namedDate?.groups) {
    const { day, name, year } = namedDate.groups;
    const month = getMonthNumber(name);
    if (month) return validatedCalendarDate(`${year}-${month}-${day.padStart(2, '0')}`);
  }

  const monthYear = input.match(/^(?:published\s+(?:in\s+)?)?([a-z]+)\s+(\d{4})$/i);
  if (monthYear) {
    const month = getMonthNumber(monthYear[1]);
    if (month) return `${monthYear[2]}-${month}`;
  }

  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return null;
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return validatedCalendarDate(`${year}-${month}-${day}`);
}

/** @param {Document|Element} root @param {string[]} selectors */
function readPublicationDate(root, selectors) {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      const parsed = readDateElement(element);
      if (parsed) return parsed;
    }
  }
  return '';
}

/** @param {Element} element */
function readDateElement(element) {
  return parseDateToISO(element.getAttribute('content') || element.getAttribute('datetime') || element.textContent);
}

/** Read publication metadata from the structured record owned by this page. */
export function readStructuredArticleMetadata(doc, baseUrl) {
  const records = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent || '');
      const pending = [data];
      while (pending.length) {
        const record = pending.shift();
        if (!record || typeof record !== 'object') continue;
        if (Array.isArray(record)) { pending.push(...record); continue; }
        records.push(record);
        pending.push(...Object.values(record).filter(value => value && typeof value === 'object'));
      }
    } catch (_) { }
  }
  const absoluteId = value => {
    try { return typeof value === 'string' && value.trim() ? new URL(value, baseUrl).href : ''; }
    catch (_) { return ''; }
  };
  const pageIdentity = value => {
    try {
      const url = new URL(value, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  };
  const pages = new Set([baseUrl, doc.URL, doc.querySelector('link[rel="canonical"]')?.getAttribute('href')]
    .filter(Boolean).map(pageIdentity).filter(Boolean));
  const byId = new Map();
  const conflictingIds = new Set();
  const comparable = value => {
    if (Array.isArray(value)) return value.map(comparable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, key === '@id' ? absoluteId(value[key]) : comparable(value[key])]));
  };
  for (const record of records) {
    const id = absoluteId(record['@id']);
    if (!id) continue;
    byId.set(id, { ...byId.get(id), ...record });
  }
  const resolve = value => value && typeof value === 'object' && value['@id']
    ? { ...byId.get(absoluteId(value['@id'])), ...value } : value;
  const values = value => Array.isArray(value) ? value : [value];
  const identities = value => values(value).flatMap(item => {
    const resolved = resolve(item);
    return typeof resolved === 'string' ? [resolved] : resolved?.url
      ? values(resolved.url).filter(url => typeof url === 'string') : typeof resolved?.['@id'] === 'string' ? [resolved['@id']] : [];
  });
  const matchesPage = value => identities(value).some(identity => pages.has(pageIdentity(identity)));
  const metadataValue = (field, value) => {
    if (field === 'url' || field === 'mainEntityOfPage') return identities(value).map(identity => pageIdentity(identity) || absoluteId(identity));
    if (field === 'datePublished' && typeof value === 'string') return parseDateToISO(value);
    if (field === 'author') return values(value).map(author => {
      if (typeof author === 'string') return byId.get(absoluteId(author))?.name || author;
      return resolve(author)?.name || absoluteId(author?.['@id']);
    });
    return comparable(value);
  };
  const assertions = new Map();
  for (const record of records) {
    const id = absoluteId(record['@id']);
    if (!id) continue;
    const previous = assertions.get(id) || {};
    for (const field of ['author', 'datePublished', 'url', 'mainEntityOfPage', 'name', 'headline']) {
      if (record[field] === undefined) continue;
      const value = JSON.stringify(metadataValue(field, record[field]));
      if (previous[field] !== undefined && previous[field] !== value) conflictingIds.add(id);
      previous[field] = value;
    }
    assertions.set(id, previous);
  }
  const hasType = (record, pattern) => values(record?.['@type']).some(type => typeof type === 'string' && pattern.test(type));
  const currentPageSubjects = new Set();
  const inlineSubjects = new Set();
  for (const record of records) {
    if (!hasType(record, /WebPage$/) || !matchesPage(record.url || record['@id'])) continue;
    for (const subject of values(record.mainEntity)) {
      const id = absoluteId(typeof subject === 'string' ? subject : subject?.['@id']);
      if (id) currentPageSubjects.add(id);
      if (subject && typeof subject === 'object') inlineSubjects.add(subject);
    }
  }
  const title = (readArticleMetadataText(doc.querySelector('article h1,main h1,h1')) || doc.title || '').replace(/\s+/g, ' ').trim();
  const candidates = [];
  const seenIds = new Set();
  for (const source of records) {
    const record = resolve(source);
    if (!hasType(record, /(?:Article|BlogPosting)$/)) continue;
    const id = absoluteId(record['@id']);
    if (id && conflictingIds.has(id)) continue;
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    let rank;
    if (identities(record.mainEntityOfPage).length) {
      if (!matchesPage(record.mainEntityOfPage)) continue;
      rank = 4;
    } else if ((id && currentPageSubjects.has(id)) || inlineSubjects.has(source)) {
      rank = 4;
    } else if (identities(record.url).length) {
      if (!matchesPage(record.url)) continue;
      rank = 3;
    } else if (id && pageIdentity(id)) {
      if (!pages.has(pageIdentity(id))) continue;
      rank = 2;
    } else if (id) continue;
    else rank = 0;
    const headlineMatches = typeof record.headline === 'string' && record.headline.replace(/\s+/g, ' ').trim() === title;
    candidates.push({ record, rank, headlineMatches });
  }
  candidates.sort((a, b) => b.rank - a.rank || Number(b.headlineMatches) - Number(a.headlineMatches));
  const chosen = candidates[0];
  const empty = { author: '', publishDate: '' };
  if (!chosen || candidates.some((candidate, index) => index > 0 && candidate.rank === chosen.rank && candidate.headlineMatches === chosen.headlineMatches &&
      JSON.stringify(comparable([candidate.record.author, candidate.record.datePublished])) !== JSON.stringify(comparable([chosen.record.author, chosen.record.datePublished])))) return empty;
  const article = chosen.record;
  const names = values(article.author).map(author => {
    if (typeof author === 'string') {
      if (conflictingIds.has(absoluteId(author))) return '';
      const referenced = byId.get(absoluteId(author));
      return referenced?.name || (/^(?:https?:|urn:|#)/i.test(author) ? '' : author);
    }
    if (conflictingIds.has(absoluteId(author?.['@id']))) return '';
    return resolve(author)?.name;
  }).filter(name => typeof name === 'string').map(name => name.trim()).filter(Boolean);
  return { author: names.join(', '), publishDate: typeof article.datePublished === 'string' ? parseDateToISO(article.datePublished) || '' : '' };
}

/** Exclude non-rendered author candidates without treating ARIA exposure as visibility. */
function isAuthorCandidateDisplayed(element) {
  for (let node = element; node; node = node.parentElement) {
    const style = safeGetComputedStyle(element.ownerDocument.defaultView, node);
    if (style?.display === 'none' || (!style && node.hasAttribute('hidden'))) return false;
  }
  return true;
}

function isArticleAuthorCandidate(element) {
  if (!isAuthorCandidateDisplayed(element) || element.closest('figure, figcaption')) return false;
  for (let node = element; node; node = node.parentElement) {
    const types = (node.getAttribute('itemtype') || '').split(/\s+/);
    if (types.some(type => /^https?:\/\/schema\.org\/(ImageObject|VideoObject|AudioObject)\/?$/.test(type))) return false;
  }
  return true;
}

/** Prefer an expanded name over initials only when both labels identify the same profile. */
function readAuthorProfileName(element, baseUrl) {
  const readLabel = node => readArticleMetadataText(node).replace(/^by\s+/i, '').trim();
  const label = readLabel(element);
  const anchor = element.closest('a[href]');
  const initials = label.replace(/[\s.\u00b7-]/g, '');
  if (!anchor || !/^\p{Lu}{1,4}$/u.test(initials)) return label;
  let identity;
  try { identity = new URL(anchor.getAttribute('href'), baseUrl).href; } catch (_) { return label; }
  for (const candidate of Array.from(element.ownerDocument.querySelectorAll('a[href]'))) {
    if (!isArticleAuthorCandidate(candidate)) continue;
    try { if (new URL(candidate.getAttribute('href'), baseUrl).href !== identity) continue; }
    catch (_) { continue; }
    const name = readLabel(candidate);
    const words = name.match(/[\p{L}\p{M}]+/gu) || [];
    if (words.length < 2 || name.length >= 100) continue;
    const letters = words.map(word => Array.from(word)[0].toUpperCase());
    if (letters.join('') === initials || letters[0] + letters[letters.length - 1] === initials ||
        (initials.length === 1 && letters[0] === initials)) return name;
  }
  return label;
}

/**
 * Extract metadata (title, author, date) from document
 * @param {Document} doc - Document object
 * @param {string} baseUrl - Base URL
 * @returns {{title: string, author: string, publishDate: string}} - Metadata object
 */
export function extractMetadata(doc, baseUrl, titleElement = findArticleTitleElement(doc)) {
  const metadata = {
    title: titleElement ? cleanHeadingText(readArticleMetadataText(titleElement)) : doc.title || '',
    author: '',
    publishDate: ''
  };
  
  // Author extraction
  const authorSelectors = [
    'meta[name="author"]',
    'meta[name="citation_author"]',
    'meta[property="article:author"]',
    '[rel="author"]',
    '.author', '.byline', '.meta-author',
    '[itemprop="author"]',
    'a[rel="author"]'
  ];
  
  for (const selector of authorSelectors) {
    try {
      const elements = Array.from(doc.querySelectorAll(selector));
      if (selector === 'meta[name="citation_author"]') {
        const names = elements.map(element => (element.getAttribute('content') || '').normalize('NFC').replace(/\s+/g, ' ').trim())
          .filter(name => name && !/^https?:/i.test(name) && name.length < 100);
        if (names.length) { metadata.author = [...new Set(names)].join(', '); break; }
      }
      for (const element of elements) {
        if (element.tagName !== 'META' && !isArticleAuthorCandidate(element)) continue;
        let authorText = '';
        
        if (element.tagName === 'META') {
          authorText = element.getAttribute('content') || '';
        } else {
          authorText = readAuthorProfileName(element, baseUrl);
        }
        
        // Clean "By " prefix
        authorText = authorText.replace(/^by\s+/i, '').trim();
        
        // Skip if looks like URL
        if (authorText && !authorText.startsWith('http') && authorText.length < 100) {
          metadata.author = authorText;
          break;
        }
        
        // Try to extract from href
        if (element.tagName === 'A') {
          const href = element.getAttribute('href') || '';
          const extracted = extractAuthorFromUrl(href);
          if (extracted) {
            metadata.author = extracted;
            break;
          }
        }
      }
      if (metadata.author) break;
    } catch (e) { }
  }

  const structured = readStructuredArticleMetadata(doc, baseUrl);
  if (!metadata.author) metadata.author = structured.author;
  if (!metadata.author) {
    for (const element of Array.from(doc.querySelectorAll('a[href*="/author/"], a[href*="/profile/"]'))) {
      try {
        if (new URL(element.getAttribute('href'), baseUrl).origin !== new URL(baseUrl).origin) continue;
        if (!isArticleAuthorCandidate(element)) continue;
        const text = readAuthorProfileName(element, baseUrl);
        if (text && !text.startsWith('http') && text.length < 100) { metadata.author = text; break; }
      } catch (_) { }
    }
  }
  
  metadata.publishDate = readPublicationDate(doc, [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[name="citation_date"]',
    '[itemprop="datePublished"]',
    'time[pubdate]'
  ]) || structured.publishDate || readPublicationDate(doc, ['meta[name="date"]']);

  if (!metadata.publishDate) {
    const article = titleElement?.closest('article, main');
    const titleHeader = titleElement?.closest('header');
    const header = article?.contains(titleHeader) ? titleHeader : article?.querySelector(':scope > header');
    if (header) metadata.publishDate = readPublicationDate(header, ['time[datetime]', '.published', '.date', '.meta-date']);
    if (!metadata.publishDate && article) {
      const next = titleElement?.nextElementSibling;
      metadata.publishDate = (next?.matches('time[datetime],.published,.meta-date') && readDateElement(next)) ||
        readPublicationDate(article, [':scope > .published', ':scope > .meta-date']);
    }
  }
  return metadata;
}

/** Return the source heading used to populate the document title. */
export function findArticleTitleElement(doc) {
  for (const selector of ['article h1', 'main h1', 'h1']) {
    const heading = doc.querySelector(selector);
    if (heading && isValidArticleTitle(heading)) return heading;
  }
  return null;
}

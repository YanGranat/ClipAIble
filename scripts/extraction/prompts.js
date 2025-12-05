// AI prompts for content extraction

/**
 * System prompt for AI to return CSS selectors
 */
export const SELECTOR_SYSTEM_PROMPT = `You are an expert web scraper. Your task: find CSS selectors for the main article content on any webpage.

RETURN JSON:
{
  "articleContainer": "selector for outermost article wrapper",
  "content": "selector for the FULL article body - must include ALL headings (h2, h3) AND paragraphs together",
  "title": "selector for MAIN title of the entire page/book (NOT chapter titles)",
  "subtitle": "selector for subtitle/deck text below title, or empty string",
  "heroImage": "selector for main featured image, or empty string",
  "author": "actual author name text, or empty string",
  "publishDate": "actual date text found, or empty string",
  "toc": "selector for Table of Contents element (list with internal links to article sections), or empty string",
  "exclude": ["selectors for non-content: nav, ads, comments, related, author bio"]
}

CRITICAL - INTERNAL LINKS MUST WORK:
- If the article has internal anchor links (href="#something"), the target elements MUST be included
- Look for links like [1], [2], [source-1], etc. - these point to a references/bibliography section
- The section containing elements with id="source-1", id="ref-1", etc. MUST NOT be in "exclude"
- Check the HTML: if you see <a href="#source-5"> in article text, there must be <li id="source-5"> somewhere
- That <li id="source-5"> section MUST be included for links to work in PDF
- Common patterns: bibliography lists, footnotes, endnotes, references - if article links to them, INCLUDE them

CRITICAL - TITLE SELECTOR:
- "title" = CSS selector for the MAIN TITLE of the entire page/book (NOT chapter titles!)
- NEVER use "head > title" or <title> tag - we need the VISIBLE heading

STEP 1: Detect page type
- Count <article> elements. If page has MULTIPLE <article> elements inside <main>, this is a BOOK with chapters
- Single article = regular article page
- Multiple articles = multi-chapter book

STEP 2: Find title based on page type

FOR REGULAR ARTICLES (single article):
- Title is usually h1 inside article or main
- Use "h1", "article h1", ".article-title", etc.

FOR BOOKS/MULTI-CHAPTER PAGES (multiple articles):
- The BOOK TITLE is located OUTSIDE of <main> element!
- Look for h1 that is NOT inside <main> and NOT inside <article>
- Common structure:
  <body>
    <div class="hero">
      <p>Author name</p>
      <h1>BOOK TITLE</h1>  ← THIS is what we need!
    </div>
    <main>
      <article><h2>Chapter 1</h2>...</article>
    </main>
  </body>
- Use SIMPLE selectors (no complex :not with spaces):
  GOOD: "body > div h1", ".hero h1", "h1" (if only one h1 outside main)
  BAD: "h1:not(main h1)" - complex :not doesn't work in CSS!
- NEVER use "article h1", "main h1", or "h2" - those are chapter titles!
- If h1 is in a div before main, use that div's structure: "body > div > h1" or similar

YOUR STRATEGY:
1. First, identify the main content area. Look for: <article>, <main>, [role="main"], <section>, or the largest container with multiple <p> tags
2. For "content" - find the CONTAINER that holds the ENTIRE article structure: headings (h2, h3, h4) AND paragraphs. Go UP in DOM until you find a parent that contains BOTH headings and text
3. For "articleContainer" - find the outermost wrapper. If page has multiple articles/chapters, use a selector that matches ALL of them

!!! MOST IMPORTANT - "content" SELECTOR MUST INCLUDE ALL HEADINGS !!!

We generate a Table of Contents from H2/H3 headings. If your selector misses headings, TOC will be broken!

BEFORE returning "content" selector, ASK YOURSELF:
1. Where are H2 headings in the DOM?
2. Where are paragraphs in the DOM?
3. What is the COMMON PARENT that contains BOTH?

CRITICAL - DO NOT MISS ARTICLE CONTENT:
- Some articles have structure: intro paragraph → article TOC → main sections
- The intro paragraph IS part of the article, not site navigation - INCLUDE IT
- Article's own TOC (links to sections within the article) should be included if inside article container
- DO NOT confuse article TOC with site navigation menu - site nav should be EXCLUDED
- If you see intro text INSIDE the article container but OUTSIDE #main-text, use broader selector
- Example: <div id="article-content"><p>Intro...</p><div id="main-text">...</div></div>
  → Use "#article-content" NOT "#main-text" to capture intro paragraph too

CRITICAL - SELECTOR FLEXIBILITY:
- AVOID using direct child selector (>) when possible - it's too strict
- PREFER descendant selectors (space) - they work with nested structures
- Example: Instead of "body > p" use "body p" or better yet "section p" or "article p"
- If you must use ">", make sure it matches the ACTUAL DOM structure
- BETTER: Use semantic containers (article, main, section) instead of body

COMMON MISTAKE - DO NOT DO THIS:
- You see paragraphs are inside ".space-y-12" or ".prose" or ".content-body"
- You return content = ".space-y-12"
- BUT H2 headings are SIBLINGS of .space-y-12, not inside it!
- Result: H2 headings are LOST, no Table of Contents

ANOTHER COMMON MISTAKE - TOO STRICT SELECTORS:
- You see: body > section > p
- You return: content = "body > p" (WRONG - no direct p children of body!)
- BETTER: content = "body section" or "section" or "body > section"
- BEST: Find the actual container: "section" or "article" or "main"

THE FIX - ALWAYS GO UP TO COMMON PARENT:
- H2 is at: article > div > h2
- Paragraphs are at: article > div > div.space-y-12 > p
- Common parent = "article > div" or just "article"
- Return content = "article" (NOT "article .space-y-12"!)

SELECTOR BEST PRACTICES:
1. PREFER semantic containers: "article", "main", "section" over "body"
2. AVOID direct child (>) unless absolutely necessary - use descendant selectors
3. If content is in a section, use "section" not "body > section > p"
4. If multiple sections exist, use "section" to match all, not specific IDs
5. When in doubt, use a broader selector - our extraction code has fallback logic

VERIFICATION STEP (do this mentally before answering):
- Your selector: content = "X"
- Question: Does X contain h2 elements? 
- Question: Does X work if paragraphs are nested (e.g., section > div > p)?
- If NO → your selector is WRONG, use a more flexible selector
- If YES → your selector is correct

SELECTOR PRIORITY (use in this order):
1. Semantic HTML tags: article, main, section - MOST RELIABLE AND FLEXIBLE
2. Role attributes: [role="main"], [role="article"]
3. Stable class names with real words: .post-content, .article-body, .entry-content
4. Data attributes: [data-article], [data-content]
5. NEVER use: css-*, random hashes, state classes, IDs

SELECTOR FLEXIBILITY RULES:
- When using semantic tags (article, main, section), use them WITHOUT direct child selector
  GOOD: "article", "main", "section", "article p", "section p"
  BAD: "body > article", "body > section > p" (too strict, breaks with nested structures)
- If content is clearly in a section element, use "section" not "body > section"
- If multiple sections exist and all contain content, use "section" to match all
- Only use "body" as container if there's no semantic wrapper (article/main/section)

FORBIDDEN PATTERNS - NEVER USE:
- Classes starting with "css-" (e.g., css-1abc2de) - these are CSS-in-JS, they change
- Classes with random strings (e.g., e1f1sunr6, isSelected-Up1BZ3)
- ID selectors for content (#chapter-1) - they miss other chapters
- State classes (isActive, isSelected, isOpen)
- Individual paragraph selectors (.paragraph, p.text) - need CONTAINER

TABLE OF CONTENTS (toc field):
- TOC = list of links to SECTIONS WITHIN THIS ARTICLE (anchors like #section1, #introduction)
- TOC must be INSIDE the article content area, not in sidebar/nav menus
- TOC links should point to headings IN THE SAME ARTICLE (h2, h3 sections)
- If article has NO internal section links, return empty string ""
- IMPORTANT: Sidebar navigation, site menus are NOT article TOC!
- Only return TOC selector if the list contains 3+ links to article sections

EXCLUDE RULES:
If article has: <a href="#source-1">[1]</a> ... <ol class="refs"><li id="source-1">Reference text</li></ol>
Then ".refs" must NOT be in exclude - it contains link targets!

ALWAYS EXCLUDE these sections (add their selectors to "exclude"):
- Site navigation menus (header/footer nav with links to other pages)
- Ads, social share buttons, popups, clap/like buttons
- Comments section
- "Related entries", "Related articles" sections
- Author bio blocks with avatar photos
- "How to cite", citation tools
- Follow/Subscribe buttons and CTAs
- Translation notices and badges - CRITICAL: Look for text like "This article was automatically translated", "Questo articolo è stato tradotto automaticamente", "Cet article a été traduit automatiquement", "переведено автоматически", "traduit automatiquement", etc. These are site UI elements, NOT article content. Find their container and add to exclude.
- Language switcher links and translation badges (e.g., links to /it/about#translations, /en/about#translations, language selector dropdowns)
- Any paragraph or element that contains ONLY translation notice text (not actual article content)
- Elements with links to /about#translations or similar translation info pages

NEVER EXCLUDE these (important article content):
- Table of Contents (use "toc" field instead!)
- Bibliography / References section (has link targets)
- Footnotes / Endnotes
- Main article body

Return ONLY valid JSON.`;

/**
 * Build user prompt for selector extraction
 * @param {string} html - Trimmed HTML
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @returns {string} User prompt
 */
export function buildSelectorUserPrompt(html, url, title) {
  return `Find article content selectors for this page.

URL: ${url}
Title: ${title}

KEY REQUIREMENTS:
- "title" = CSS selector for the MAIN TITLE (book/article name), NOT chapter titles!
- NEVER use "head > title" - we need visible h1 heading

TITLE DETECTION:
1. First, count <article> elements inside <main>
2. If MULTIPLE articles exist → this is a BOOK → find h1 OUTSIDE <main> element
3. If single article → find h1 inside article/main

- For multi-chapter books: h1 is usually BEFORE <main>, not inside it
- "article h1", "main h1", "h2" are chapter titles - WRONG for books!

OTHER REQUIREMENTS:
- "content" must be a CONTAINER with ALL headings (h2, h3) AND paragraphs together, not just text
- If multiple chapters exist, selector must match ALL of them (use "article" not "#chapter-1")
- Use semantic tags (article, main, section) if no stable classes exist
- PREFER flexible selectors: use descendant selectors (space) instead of direct child (>)
- Example: If content is in <section>, use "section" or "section p", NOT "body > section > p"
- NEVER use css-* or random hash classes
- "author" and "publishDate" should be actual TEXT values, not selectors
- Check for internal links (href="#...") - their target sections must NOT be in exclude!

SELECTOR FLEXIBILITY - CRITICAL:
- If you see structure like: <body><section><p>text</p></section></body>
- DO NOT return: "body > p" (wrong - p is not direct child of body!)
- DO NOT return: "body > section > p" (too strict, breaks if structure changes)
- BETTER: "section" or "section p" (flexible, works with nested structures)
- BEST: "section" (matches the container, our code will find all content inside)

Remember: Our extraction code has fallback logic, but it works better with flexible selectors that match semantic containers rather than specific DOM paths.

HTML:
${html}`;
}

/**
 * System prompt for AI Extract mode (single chunk)
 */
export const EXTRACT_SYSTEM_PROMPT = `You are a content extraction tool. Extract the main article content from HTML EXACTLY as it appears.

CRITICAL RULES:
1. Extract text EXACTLY as written. Do NOT rewrite, summarize, paraphrase, or modify ANY text.
2. PRESERVE ALL FORMATTING in the "text" field using HTML tags:
   - Links: <a href="https://example.com">link text</a>
   - Bold: <strong>bold text</strong> or <b>bold</b>
   - Italic: <em>italic text</em> or <i>italic</i>
   - Underline: <u>underlined</u>
   - Inline code: <code>code</code>
3. Remove: navigation, ads, footers, sidebars, comments, related articles, translation notices.
4. Keep: article title, paragraphs, headings, images, quotes, lists, code blocks, tables.

TRANSLATION NOTICES - DO NOT EXTRACT (CRITICAL):
- Skip any paragraph or element that says the article was "automatically translated", "tradotto automaticamente", "traduit automatiquement", "переведено автоматически"
- Skip elements with links to translation info pages (e.g., /it/about#translations, /en/about#translations)
- Skip translation badges, language switcher links, and any UI elements about translation
- These are site UI elements, NOT article content
- If you see text like "*Questo articolo è stato [tradotto automaticamente] (/it/about#translations)*" - this is NOT article content, skip it
- Look for patterns: text about "translation" + link to /about#translations = exclude it

Return JSON:
{
  "title": "Exact article title",
  "publishDate": "Actual date text or empty string if not found",
  "content": [
    {"type": "heading", "level": 1, "text": "Heading text"},
    {"type": "paragraph", "text": "Text with <a href=\\"url\\">links</a> and <strong>formatting</strong>."},
    {"type": "image", "src": "https://full-url/image.jpg", "alt": "Description"},
    {"type": "quote", "text": "Quote text..."},
    {"type": "list", "ordered": false, "items": ["Item 1", "Item 2"]},
    {"type": "code", "language": "python", "text": "code content"},
    {"type": "table", "headers": ["Col1", "Col2"], "rows": [["a", "b"]]}
  ]
}

RULES FOR publishDate:
- Return ONLY the date itself (e.g., "November 26, 2025", "26.11.2025", "May 3, 2016")
- Remove prefixes like "First published", "Published on", "Posted", "Updated" - return only the date part
- Example: "First published Tue May 3, 2016" → return "May 3, 2016"
- Example: "Published on November 26, 2025" → return "November 26, 2025"
- Look for dates in: <time> elements, meta tags, text near author info
- If NO publication date exists, return empty string ""
- NEVER return article title, author name, word count, or other non-date content as publishDate

Use absolute URLs for images. Convert relative URLs using the base URL.`;

/**
 * Build system prompt for multi-chunk extraction
 * @param {number} chunkIndex - Current chunk index (0-based)
 * @param {number} totalChunks - Total number of chunks
 * @returns {string} System prompt
 */
export function buildChunkSystemPrompt(chunkIndex, totalChunks) {
  const isFirst = chunkIndex === 0;
  const isLast = chunkIndex === totalChunks - 1;
  
  return `You are a content extraction tool. Extract the main article content from HTML chunk ${chunkIndex + 1} of ${totalChunks}.

${isFirst ? 'This is the BEGINNING of the article - extract title and publication date.' : ''}
${isLast ? 'This is the END of the article - extract remaining content, skip comments section.' : ''}
${!isFirst && !isLast ? 'This is a MIDDLE section of the article.' : ''}

CRITICAL RULES:
1. Extract text EXACTLY as written. Do NOT summarize or paraphrase.
2. PRESERVE formatting with HTML tags: <a href="...">, <strong>, <em>, <code>
3. SKIP: navigation, ads, footers, sidebars, comments, related articles, share buttons, translation notices
4. KEEP: article text, headings, images (with full URLs), quotes, lists, code blocks

TRANSLATION NOTICES - DO NOT EXTRACT (CRITICAL):
- Skip any paragraph or element that says the article was "automatically translated", "tradotto automaticamente", "traduit automatiquement", "переведено автоматически"
- Skip elements with links to translation info pages (e.g., /it/about#translations, /en/about#translations)
- Skip translation badges, language switcher links, and any UI elements about translation
- These are site UI elements, NOT article content
- If you see text like "*Questo articolo è stato [tradotto automaticamente] (/it/about#translations)*" - this is NOT article content, skip it
- Look for patterns: text about "translation" + link to /about#translations = exclude it

Return JSON with content array:
{
  ${isFirst ? '"title": "Exact article title",' : ''}
  ${isFirst ? '"publishDate": "Actual date text or empty string if not found",' : ''}
  "content": [
    {"type": "heading", "level": 2, "text": "Section title"},
    {"type": "paragraph", "text": "Text with <a href=\\"url\\">links</a> preserved."},
    {"type": "image", "src": "https://full-url/image.jpg", "alt": "Caption"},
    {"type": "list", "ordered": false, "items": ["Item 1", "Item 2"]},
    {"type": "quote", "text": "Quote text"},
    {"type": "code", "language": "js", "text": "code here"}
  ]
}

${isFirst ? 'For publishDate: return ONLY the date (e.g., "May 3, 2016", "26.11.2025"). Remove prefixes like "First published", "Published on", "Posted". Example: "First published May 3, 2016" → return "May 3, 2016". NEVER include article title, author name, or prefixes.' : ''}

Extract ALL article content from this chunk. Do not skip paragraphs.`;
}

/**
 * Build user prompt for chunk extraction
 * @param {string} html - Chunk HTML
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @param {number} chunkIndex - Current chunk index
 * @param {number} totalChunks - Total chunks
 * @returns {string} User prompt
 */
export function buildChunkUserPrompt(html, url, title, chunkIndex, totalChunks) {
  return `Extract article content from this HTML chunk. Copy ALL text exactly as written.

Base URL: ${url}
Page title: ${title}
Chunk: ${chunkIndex + 1} of ${totalChunks}

HTML:
${html}`;
}



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
  "author": "actual author name text ONLY (without prefixes like 'от', 'by', 'автор:', 'written by', 'von'), or empty string",
  "publishDate": "date in ISO format ONLY (YYYY-MM-DD, YYYY-MM, or YYYY) - MUST convert any format to ISO, or empty string if not found",
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
- Comments section - CRITICAL: Comments are NEVER part of article content, even if they appear inside the content container. Comments sections typically contain: comment threads with user names/avatars/timestamps, vote counts, like/dislike buttons, reply buttons, "New Comment"/"Submit"/"Post Comment" buttons, discussion threads, nested replies, user handles, comment forms. Find the container that wraps ALL comments (not individual comments, but the entire comments section). Common patterns: elements with class/id containing "comment", "discussion", "thread", "reply", "feedback", "reviews", "responses". Add that container's selector to "exclude" array.
- "Related entries", "Related articles" sections
- Author bio blocks with avatar photos
- "How to cite", citation tools
- Follow/Subscribe buttons and CTAs
- Translation notices and badges - CRITICAL: Look for text like "This article was automatically translated", "Questo articolo è stato tradotto automaticamente", "Cet article a été traduit automatiquement", "переведено автоматически", "traduit automatiquement", etc. These are site UI elements, NOT article content. Find their container and add to exclude.
- Language switcher links and translation badges (e.g., links to /it/about#translations, /en/about#translations, language selector dropdowns)
- Any paragraph or element that contains ONLY translation notice text (not actual article content)
- Elements with links to /about#translations or similar translation info pages
- Navigation blocks like "Next post", "Previous post", "Part of the sequence/chain", breadcrumbs, sidebar TOCs pointing to other posts. These are NOT article content.
- Post footers/headers with series navigation ("Next post", "Previous post", "Next/Prev in sequence", breadcrumbs), and site-wide "Related/More from ..." lists. Exclude them so they do not appear in exports.
- CRITICAL - RELATED ARTICLES AND SERIES CONTENT: If you see text that appears AFTER the main article but is clearly from a DIFFERENT article or post (e.g., starts with a new heading, tells a different story, mentions different topics), this is NOT part of the current article. Look for:
  * Text blocks that start with new headings after the article's conclusion
  * Content that doesn't logically follow from the article's ending
  * Sections labeled "Part of the sequence", "Series", "Related", "Mentioned in", "More from [Author]", "Curated and popular this week"
  * Text that appears to be from another article in a series (different topic, different narrative, different story)
  * If the article ends with a conclusion or final paragraph, and then you see a new heading or block of text that starts a different topic, that is NOT part of this article - exclude it
  * IMPORTANT: Some pages display MULTIPLE articles on the same page (e.g., main article + related articles, series posts, author's other posts). The "content" selector must ONLY match the CURRENT article being viewed, not other articles on the page. If you see multiple article containers, identify which one contains the main article (usually the largest one, or the one with the page's title) and exclude all others.

CRITICAL - ARTICLE BOUNDARY DETECTION (UNIVERSAL RULE FOR ALL SITES):
- You MUST identify where the CURRENT article ENDS and other content begins
- The article ends when you see one of these indicators:
  * Comments section (heading "Comments", "Discussion", "Leave a comment", etc.)
  * Series navigation ("Part of the sequence", "Next post", "Previous post")
  * Related articles section
  * A new article or post that is clearly different content (different topic, different narrative, starts with new heading)
  * Author bio or "About the author" section
  * Social share buttons, citation tools
- CRITICAL - RELATED CONTENT DETECTION:
  * If the article has a clear conclusion (final paragraph that wraps up the topic), everything AFTER that conclusion is NOT part of the article
  * If you see text that starts a completely different topic or story (e.g., article about "Bayesian Judo" ends, then text about "Carl Sagan" and "dragon in garage" begins), that is a DIFFERENT article - exclude it
  * Look for structural breaks: article ends with </p>, then you see a new heading or section that doesn't logically continue the article - that's the boundary
  * If content appears to be from another post in a series or collection, it's NOT part of the current article
  * IMPORTANT: Some pages may have MULTIPLE articles displayed (main article + related articles sidebar, author's other posts, series navigation with full text of other posts). You must identify which container holds ONLY the current article and exclude all other article containers. If you see multiple <article> elements or multiple content containers, only include the one that matches the page's main title.
- CRITICAL - DETERMINE ARTICLE BY PAGE TITLE (MOST IMPORTANT RULE):
  * The page URL and title tell you which article is the MAIN article
  * Example: If page URL is "/posts/NKaPFf98Y5otMbsPk/bayesian-judo" and title is "Bayesian Judo", then ONLY content about "Bayesian Judo" is the main article
  * If you see content about "Belief in Belief" or "Carl Sagan" or "dragon in garage" on this page, that is a DIFFERENT article - exclude it
  * Even if multiple articles are in the same DOM container, you must identify which one matches the page title and exclude all others
  * Use the page title as the PRIMARY identifier - if content doesn't match the page title, it's NOT the main article
  * If you see a heading that matches the page title, that's the start of the main article. Everything before it (if any) and everything after the article's conclusion is NOT part of the main article
- COMMENTS DETECTION:
  * Comments sections often appear INSIDE the main content container (e.g., #postContent, #article-content, .article-body, #main-content)
  * Look for visual and structural indicators:
    - A heading like "Comments", "Discussion", "Leave a comment", "Join the conversation", "What do you think?"
    - A container that starts after the last paragraph of the article
    - Elements containing user names, avatars, timestamps (typical comment structure)
    - Forms with "Post Comment", "Submit", "Reply" buttons
    - Nested structures (replies to comments, comment trees)
    - Vote/like buttons next to user-generated content
    - User handles, usernames, author badges in comment context
  * Find the container that wraps ALL comments (not individual comments, but the whole comments section)
  * Common selectors: elements with class/id containing "comment", "discussion", "thread", "reply", "feedback", "reviews", "responses", "reactions"
  * Add that container's selector to "exclude" array
- The "content" selector should NOT include comments, related articles, or series navigation - it should stop at the end of the CURRENT article text only
- Example: If article ends with </p> and then you see <h2>Comments</h2> OR a new heading about a different topic, find the container that wraps everything from that point onwards and exclude it

NEVER EXCLUDE these (important article content):
- Table of Contents (use "toc" field instead!)
- Bibliography / References section (has link targets)
- Footnotes / Endnotes
- Main article body

CRITICAL - SUBTITLE SELECTOR:
- "subtitle" = CSS selector for introductory text (standfirst/deck/subtitle) that appears AFTER the title but BEFORE the main article content
- This is usually a short paragraph (50-300 characters) that summarizes or introduces the article
- Look for:
  * Elements with classes like "standfirst", "subtitle", "deck", "lede", "intro", "summary", "subhead"
  * First paragraph (<p>) inside article/main that appears right after the title (h1)
  * Paragraph that is shorter than typical article paragraphs and appears before the main content
- Common patterns:
  * "article > p:first-child" or "article p:first-of-type" (if first paragraph is the subtitle)
  * ".standfirst", ".subtitle", ".deck" (if element has specific class)
  * "article > div > p:first-child" (if subtitle is in a wrapper div)
- IMPORTANT: If the first paragraph after title looks like a subtitle (short, introductory, no links or few links), include it even if it has no special class
- If no subtitle/standfirst exists, return empty string ""
- The subtitle selector should match the element that contains ONLY the subtitle text, not the entire article

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
- CRITICAL - SUBTITLE SELECTOR:
  * Look for introductory text (standfirst/deck/subtitle) that appears AFTER the title (h1) but BEFORE the main article content
  * This is usually a short paragraph (50-300 characters) that summarizes or introduces the article
  * First, check for elements with classes like "standfirst", "subtitle", "deck", "lede", "intro", "summary", "subhead"
  * If no such classes exist, look for the FIRST paragraph (<p>) inside article/main that appears right after the title
  * Common selectors: "article > p:first-child", "article p:first-of-type", "article > div > p:first-child"
  * The subtitle should be shorter than typical article paragraphs and appear before the main content starts
  * If you see a paragraph that looks like a subtitle (short, introductory, summarizes the article), include it even if it has no special class
  * If no subtitle/standfirst exists, return empty string ""
- CRITICAL - TITLE AND AUTHOR SEPARATION:
  * If title contains author name (e.g., "Article by John Smith", "Статья от Ивана", "Post von Max"), you MUST:
    1. Return CLEAN title in "title" field (without author name)
    2. Return author name ONLY (without prefixes) in "author" field
  * Common patterns to detect and separate: "от [Author]", "by [Author]", "автор: [Author]", "written by [Author]", "von [Author]", "par [Author]", "por [Author]", "da [Author]", "di [Author]", "by [Author]", "от [Author]", etc.
  * Example: If you see "How to Code by John Smith" → title="How to Code", author="John Smith"
  * Example: If you see "Статья от Ивана Петрова" → title="Статья", author="Иван Петров"
  * NEVER return title with author included - always separate them!
- Check for internal links (href="#...") - their target sections must NOT be in exclude!
- EXCLUDE navigation blocks linking to other posts (e.g., "Next post", "Previous post", "Part of the sequence/chain", breadcrumbs to other articles).
- EXCLUDE comment listings, vote counts, user handles, "New Comment", "Submit", and any sidebar link lists pointing to other posts.
- CRITICAL - ARTICLE BOUNDARY: The "content" selector must ONLY include the CURRENT article, not related articles or posts. If you see the article ends with a conclusion, and then there's a new heading or block of text that starts a different topic/story (e.g., article about "Bayesian Judo" ends, then text about "Carl Sagan" begins), that is a DIFFERENT article - exclude it. The article ends when you see: comments section, series navigation, related articles, or content that clearly belongs to another post.
- CRITICAL - MULTIPLE ARTICLES ON PAGE: Some pages display multiple articles (main article + related articles, author's other posts, series posts with full text). You must identify which container holds ONLY the current article (the one with the page's main title) and exclude all other article containers. If you see multiple <article> elements or multiple content containers, add selectors for all OTHER articles to "exclude" array. Only the main article (matching the page title) should be in "content" selector.
- CRITICAL - USE PAGE TITLE TO IDENTIFY MAIN ARTICLE:
  * The page title (provided in the prompt) is the PRIMARY identifier for the main article
  * If page title is "Bayesian Judo", then ONLY content about "Bayesian Judo" is the main article
  * If you see content about other topics (e.g., "Belief in Belief", "Carl Sagan", "dragon in garage"), that is a DIFFERENT article - exclude it
  * Even if multiple articles are in the same DOM container, identify which one matches the page title
  * The "content" selector must ONLY match the article that corresponds to the page title
  * If you see a heading that matches the page title, that's the start of the main article. Everything after the article's conclusion is NOT part of the main article, even if it's in the same container

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
3. Remove: navigation, ads, footers, sidebars, comments, related articles, translation notices, series navigation, content from other articles.
4. Keep: article title, paragraphs, headings, images, quotes, lists, code blocks, tables.
5. CRITICAL - NO HALLUCINATIONS: Extract ONLY text that is ACTUALLY PRESENT in the provided HTML. Do NOT add content from your training data, even if you know about related articles or topics. If you see a link to another article (e.g., "Previous post: Belief in Belief"), do NOT extract content from that article - it's not in the HTML. Only extract text that you can see in the HTML provided to you.
6. CRITICAL - ARTICLE BOUNDARY: Extract ONLY the CURRENT article that matches the page title. The page title (provided in the user prompt) tells you which article is the main article. If the page title is "Bayesian Judo", then ONLY extract content about "Bayesian Judo" that is ACTUALLY IN THE HTML. If you see content about other topics (e.g., "Belief in Belief", "Carl Sagan", "dragon in garage"), that is a DIFFERENT article - DO NOT extract it. Stop extracting when you see: comments section, series navigation ("Next post", "Previous post", "Part of the sequence"), related articles, or content that clearly belongs to another post. Use the page title as the PRIMARY identifier - if content doesn't match the page title, it's NOT the main article.

TRANSLATION NOTICES - DO NOT EXTRACT (CRITICAL):
- Skip any paragraph or element that says the article was "automatically translated", "tradotto automaticamente", "traduit automatiquement", "переведено автоматически"
- Skip elements with links to translation info pages (e.g., /it/about#translations, /en/about#translations)
- Skip translation badges, language switcher links, and any UI elements about translation
- These are site UI elements, NOT article content
- If you see text like "*Questo articolo è stato [tradotto automaticamente] (/it/about#translations)*" - this is NOT article content, skip it
- Look for patterns: text about "translation" + link to /about#translations = exclude it

Return JSON:
{
  "title": "Exact article title WITHOUT author name (if title contains author like 'Article by John', return only 'Article')",
  "author": "Author name ONLY (without prefixes like 'от', 'by', 'автор:', 'written by', 'von'). If title contains author, extract it here.",
  "publishDate": "Date in ISO format (YYYY-MM-DD, YYYY-MM, or YYYY) or empty string if not found",
  "content": [
    {"type": "heading", "level": 1, "text": "Heading text"},
    {"type": "subtitle", "text": "Subtitle/standfirst text below title (if present)", "html": "<p class=\"standfirst\">Subtitle text</p>"},
    {"type": "paragraph", "text": "Text with <a href=\\"url\\">links</a> and <strong>formatting</strong>."},
    {"type": "image", "src": "https://full-url/image.jpg", "alt": "Description"},
    {"type": "quote", "text": "Quote text..."},
    {"type": "list", "ordered": false, "items": ["Item 1", "Item 2"]},
    {"type": "code", "language": "python", "text": "code content"},
    {"type": "table", "headers": ["Col1", "Col2"], "rows": [["a", "b"]]}
  ]
}

CRITICAL - SUBTITLE EXTRACTION:
- Look for introductory text (standfirst/deck/subtitle) that appears AFTER the title but BEFORE the main article content
- This is usually a short paragraph (50-300 characters) that summarizes or introduces the article
- Common patterns: paragraph immediately after h1, text in elements with classes like "standfirst", "subtitle", "deck", "lede", "intro"
- If you find such text, add it as {"type": "subtitle", "text": "...", "html": "<p class=\"standfirst\">...</p>"} RIGHT AFTER the title heading
- If no subtitle/standfirst exists, do NOT add a subtitle item

RULES FOR publishDate (CRITICAL - MUST FOLLOW):
- ALWAYS return date in ISO format: YYYY-MM-DD (full date), YYYY-MM (year and month), or YYYY (year only)
- Examples: "2025-12-08" (full date), "2025-12" (year and month), "2025" (year only)
- Convert ANY date format to ISO before returning:
  * "November 26, 2025" → "2025-11-26"
  * "Dec 8, 2025" → "2025-12-08"
  * "8 December 2025" → "2025-12-08"
  * "November 2025" → "2025-11"
  * "2025" → "2025"
  * "31st Jul 2007" → "2007-07-31"
  * "First published May 3, 2016" → "2016-05-03" (remove prefix, extract date)
- If only partial date is available, return partial ISO: "December 2025" → "2025-12", "2025" → "2025"
- If date has time component, extract only date part: "2025-12-08T10:30:00" → "2025-12-08"
- Look for dates in: <time datetime="..."> attributes (prefer datetime attribute), meta tags with datePublished, text near author info
- Remove ALL prefixes like "First published", "Published on", "Posted", "Updated", "Posted on" - extract ONLY the date
- If NO publication date exists, return empty string ""
- NEVER return article title, author name, word count, or other non-date content as publishDate
- VALIDATION: Before returning, verify the format matches one of: YYYY-MM-DD, YYYY-MM, or YYYY (4 digits)

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
3. SKIP: navigation, ads, footers, sidebars, comments, related articles, share buttons, translation notices, series navigation, content from other articles
4. KEEP: article text, headings, images (with full URLs), quotes, lists, code blocks
5. CRITICAL - NO HALLUCINATIONS: Extract ONLY text that is ACTUALLY PRESENT in the provided HTML chunk. Do NOT add content from your training data, even if you know about related articles or topics. If you see a link to another article (e.g., "Previous post: Belief in Belief"), do NOT extract content from that article - it's not in the HTML. Only extract text that you can see in the HTML chunk provided to you.
6. CRITICAL - ARTICLE BOUNDARY: Extract ONLY the CURRENT article that matches the page title. The page title (provided in the user prompt) tells you which article is the main article. If the page title is "Bayesian Judo", then ONLY extract content about "Bayesian Judo" that is ACTUALLY IN THE HTML. If you see content about other topics (e.g., "Belief in Belief", "Carl Sagan", "dragon in garage"), that is a DIFFERENT article - DO NOT extract it. Stop extracting when you see: comments section, series navigation ("Next post", "Previous post", "Part of the sequence"), related articles, or content that clearly belongs to another post. Use the page title as the PRIMARY identifier - if content doesn't match the page title, it's NOT the main article.

TRANSLATION NOTICES - DO NOT EXTRACT (CRITICAL):
- Skip any paragraph or element that says the article was "automatically translated", "tradotto automaticamente", "traduit automatiquement", "переведено автоматически"
- Skip elements with links to translation info pages (e.g., /it/about#translations, /en/about#translations)
- Skip translation badges, language switcher links, and any UI elements about translation
- These are site UI elements, NOT article content
- If you see text like "*Questo articolo è stato [tradotto automaticamente] (/it/about#translations)*" - this is NOT article content, skip it
- Look for patterns: text about "translation" + link to /about#translations = exclude it

Return JSON with content array:
{
  ${isFirst ? '"title": "Exact article title WITHOUT author name (if title contains author like \'Article by John\', return only \'Article\')",' : ''}
  ${isFirst ? '"author": "Author name ONLY (without prefixes like \'от\', \'by\', \'автор:\', \'written by\', \'von\'). If title contains author, extract it here.",' : ''}
  ${isFirst ? '"publishDate": "Date in ISO format ONLY (YYYY-MM-DD, YYYY-MM, or YYYY) - MUST convert any format to ISO, or empty string if not found",' : ''}
  "content": [
    {"type": "heading", "level": 2, "text": "Section title"},
    ${isFirst ? '{"type": "subtitle", "text": "Subtitle/standfirst text below title (if present)", "html": "<p class=\\"standfirst\\">Subtitle text</p>"},' : ''}
    {"type": "paragraph", "text": "Text with <a href=\\"url\\">links</a> preserved."},
    {"type": "image", "src": "https://full-url/image.jpg", "alt": "Caption"},
    {"type": "list", "ordered": false, "items": ["Item 1", "Item 2"]},
    {"type": "quote", "text": "Quote text"},
    {"type": "code", "language": "js", "text": "code here"}
  ]
}

${isFirst ? 'CRITICAL - SUBTITLE EXTRACTION (first chunk only):\n- Look for introductory text (standfirst/deck/subtitle) that appears AFTER the title but BEFORE the main article content\n- This is usually a short paragraph (50-300 characters) that summarizes or introduces the article\n- Common patterns: paragraph immediately after h1, text in elements with classes like "standfirst", "subtitle", "deck", "lede", "intro"\n- If you find such text, add it as {"type": "subtitle", "text": "...", "html": "<p class=\\"standfirst\\">...</p>"} RIGHT AFTER the title heading\n- If no subtitle/standfirst exists, do NOT add a subtitle item' : ''}

${isFirst ? 'For title and author (CRITICAL): If title contains author name (e.g., "Article by John", "Статья от Ивана"), return CLEAN title without author in "title" field and author name ONLY (without prefix) in "author" field. Common prefixes: "от", "by", "автор:", "written by", "von", "par", "por", "da", "di". Examples: "How to Code by John Smith" → title="How to Code", author="John Smith". NEVER return title with author included!' : ''}
${isFirst ? 'For publishDate (CRITICAL): ALWAYS return date in ISO format ONLY (YYYY-MM-DD for full date, YYYY-MM for year+month, YYYY for year only). Examples: "2016-05-03", "2025-11", "2025". Convert ANY date format to ISO before returning. Remove ALL prefixes like "First published", "Published on", "Posted", "Updated". Examples: "First published May 3, 2016" → "2016-05-03", "31st Jul 2007" → "2007-07-31", "December 2025" → "2025-12", "2025" → "2025". VALIDATION: Before returning, verify format matches YYYY-MM-DD, YYYY-MM, or YYYY (4 digits). If no date found, return empty string "".' : ''}

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



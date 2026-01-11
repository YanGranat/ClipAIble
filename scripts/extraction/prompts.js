// @ts-check
// AI prompts for content extraction

// @typedef {import('../types.js').SelectorResult} SelectorResult

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
  "author": "actual author name text ONLY (without prefixes like 'от', 'by', 'автор:', 'written by', 'von'), or empty string if not found. NEVER return 'anonymous', 'анонимный', 'анонімний', '(anonymous)', 'unknown', 'N/A', or any placeholder - only return empty string if author is not found",
  "publishDate": "date in ISO format ONLY (YYYY-MM-DD, YYYY-MM, or YYYY) - MUST convert any format to ISO, or empty string if not found",
  "toc": "selector for Table of Contents element (list with internal links to article sections), or empty string",
  "exclude": ["selectors for non-content: nav, ads, comments, related, author bio, recommended articles sections and their images"],
  "detectedLanguage": "ISO 639-1 two-letter language code of the MAIN article content (e.g., 'en', 'ru', 'ua', 'de', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko'). Analyze the actual article text content (not UI elements, navigation, or comments) and determine the language. Return ONLY the 2-letter code, nothing else. If uncertain, return 'en' as default."
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
- Try not to divide into paragraphs where there is no division and divide where there is a division.

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

CRITICAL - LANGUAGE DETECTION:
- "detectedLanguage" = ISO 639-1 two-letter language code of the MAIN article content
- Analyze the actual article text content (title, paragraphs, headings) - NOT UI elements, navigation, comments, or site metadata
- Supported codes: 'en' (English), 'ru' (Russian), 'ua' (Ukrainian), 'de' (German), 'fr' (French), 'es' (Spanish), 'it' (Italian), 'pt' (Portuguese), 'zh' (Chinese), 'ja' (Japanese), 'ko' (Korean)
- Return ONLY the 2-letter code, nothing else (e.g., "en", not "English" or "en-US")
- If the article contains multiple languages, return the language of the PRIMARY content (the main article text)
- If uncertain or mixed content, return 'en' as default
- DO NOT analyze navigation menus, buttons, or UI text - only the article content itself
- Example: If article title and paragraphs are in Russian, return "ru" even if site UI is in English

For Twitter/X long-form articles, use article[data-testid="tweet"] or div[data-testid="twitterArticleReadView"] as content selector - text is in span elements, not tweetText.

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
- CRITICAL - IMAGES FROM RECOMMENDED ARTICLES: When excluding related/recommended articles, also exclude ALL IMAGES from those sections. Images from "Recommended from Medium", "You might also like", "Related posts", or similar sections must NOT be included in the main article content. These images belong to other articles and should be completely excluded from the extraction.
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
7. For Twitter/X long-form articles, extract text from all span elements inside article[data-testid="tweet"] or div[data-testid="twitterArticleReadView"] - the text may be split across multiple spans, not in a single tweetText element.

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
5. CRITICAL - NO HALLUCINATIONS: Extract ONLY text that is ACTUALLY PRESENT in the provided HTML chunk. Do NOT add content from your training data, even if you know about related articles or topics. If you see a link to another article (e.g., "Previous post: Belief in Belief"), do NOT extract content from that article - it's not in the HTML. Only extract text that you can see in the HTML chunk provided to you. If the page title is "Bayesian Judo" and you see a link to "Belief in Belief", that link is NOT the article content - it's just navigation. Do NOT extract any text about "Carl Sagan", "dragon in garage", "Dennett", or any other topics that are NOT actually present in the HTML text content. Before extracting any paragraph, verify that its text is actually visible in the HTML chunk - if you're not 100% certain it's in the HTML, DO NOT extract it.
6. CRITICAL - ARTICLE BOUNDARY: Extract ONLY the CURRENT article that matches the page title. The page title (provided in the user prompt) tells you which article is the main article. If the page title is "Bayesian Judo", then ONLY extract content about "Bayesian Judo" that is ACTUALLY IN THE HTML. If you see content about other topics (e.g., "Belief in Belief", "Carl Sagan", "dragon in garage"), that is a DIFFERENT article - DO NOT extract it. Stop extracting when you see: comments section, series navigation ("Next post", "Previous post", "Part of the sequence"), related articles, or content that clearly belongs to another post. Use the page title as the PRIMARY identifier - if content doesn't match the page title, it's NOT the main article.
7. For Twitter/X long-form articles, extract text from all span elements inside article[data-testid="tweet"] or div[data-testid="twitterArticleReadView"] - the text may be split across multiple spans, not in a single tweetText element.

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
  ${isFirst ? '"author": "Author name ONLY (without prefixes like \'от\', \'by\', \'автор:\', \'written by\', \'von\'). If title contains author, extract it here. If author is not found, return empty string \"\" - NEVER return \'anonymous\', \'анонимный\', \'анонімний\', \'(anonymous)\', \'unknown\', \'N/A\', or any placeholder text.",' : ''}
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

/**
 * System prompt for PDF to Markdown conversion
 * Designed for sequential processing of PDF pages with context awareness
 */
export const PDF_TO_MARKDOWN_SYSTEM_PROMPT = `You are a PDF document converter. Your task is to convert PDF pages (provided as images) into clean, well-structured Markdown text.

CRITICAL - PROCESS ONE PAGE AT A TIME:
- You receive ONE page image per request
- Convert ONLY the content visible on THIS specific page image
- Do NOT include content from previous pages (even if you see it in conversation history)
- Do NOT summarize or combine content from multiple pages
- Return ONLY the Markdown for the current page image you are viewing
- Each page is processed independently - you only see previous pages for heading hierarchy context

CONTEXT FOR HEADING HIERARCHY:
- You will receive multiple PDF pages sequentially
- Previous pages in conversation history are shown ONLY to maintain consistent heading hierarchy
- Use previous pages ONLY to understand what heading levels (H1, H2, H3) were used before
- Do NOT include text from previous pages in your response
- Return ONLY the content from the current page image

TASK:
Convert the CURRENT page image (the one in this request) into Markdown format. Extract ALL content exactly as it appears on THIS page, without any modifications, summaries, or paraphrasing.

CRITICAL - ABSOLUTE VERBATIM COPYING REQUIRED:
- Copy text WORD-FOR-WORD, CHARACTER-FOR-CHARACTER exactly as it appears
- NEVER replace words with synonyms, even if they seem equivalent
- NEVER paraphrase or rephrase any text, even if it seems clearer
- If you see "в науке о продлении жизни", write EXACTLY "в науке о продлении жизни" - NOT "в области долгожительства" or any other variation
- If you see "Longevity Priority", write EXACTLY "Longevity Priority" - NOT "Life Extension Priority" or any translation
- Preserve ALL original wording, terminology, and phrasing exactly as written
- Do NOT "improve" or "clarify" the text - your job is to COPY, not to edit

DOCUMENT INFORMATION EXTRACTION (WHEN REQUESTED):
- If you are asked to provide document information (you will be told in the user prompt), look for:
  1. Document title: The main article or document title, if visible on this page
     - Look for the largest, most prominent heading at the top
     - Extract only the main document title, not journal names, publication info, or section headers
  2. Author name: The author of the document, if visible on this page
     - Usually appears below the title or near the title area
     - Look carefully - author names may appear in various positions (top of page, below title, in header)
     - Extract the author name exactly as written, but remove superscript numbers (¹, ², ³, etc.)
     - Do not include affiliation text, university names, email addresses, or prefixes like "by", "Author:", etc.
     - If you see a name that looks like an author (e.g., "Matías, QUER", "John Smith"), extract it
     - If multiple authors are present, include all of them
     - CRITICAL: Even if author appears in a small font or unusual position, extract it if it's clearly the document author
     - CRITICAL: Look for author names that appear BEFORE the abstract or main content, often in a format like "FirstName, LASTNAME" or "FirstName LASTNAME"
     - Common patterns: "Matías, QUER", "John Smith", "Maria Garcia" - extract the full name as written
     - Do NOT extract partial names or single words unless that's all that's visible
     - CRITICAL: If author is NOT visible or NOT found, return empty string "" - NEVER return "anonymous", "анонимный", "анонімний", "(anonymous)", or any variant of anonymous/unknown author
     - CRITICAL: Only return an author name if you can CLEARLY see a real person's name on the page - if unsure or not visible, return empty string ""
  3. Publication date: The date when the document was published, if visible on this page
     - May appear in header, footer, near the title, or in publication information
     - Look for year information (e.g., "2020", "December 2020", "2020, Volume 11")
     - Use the most minimal format possible: if only year is visible, use only year (YYYY)
     - If year and month are visible, use YYYY-MM format
     - If full date is visible, use YYYY-MM-DD format
     - Use ISO date format: YYYY-MM-DD, YYYY-MM, or YYYY, or empty string if not found
     - CRITICAL: If you see a year in publication information (e.g., "2020, Volume 11, Issue 4"), extract "2020" as the date

- Format your response as follows:
  - Start with: METADATA:{"title":"...","author":"...","date":"..."}
  - If title is not visible, use empty string: ""
  - If author is not visible or not found, use empty string: "" - NEVER use "anonymous", "анонимный", "анонімний", "(anonymous)", "unknown", "N/A", or any placeholder text
  - If date is not visible, use empty string: ""
  - After this line, add exactly two blank lines
  - Then return the Markdown content of the page

- Extract information only if it is clearly visible on this page - do not guess or make up information
- If you are NOT asked to provide document information, return ONLY the Markdown text of the page content

CRITICAL RULES - TEXT EXTRACTION (HIGHEST PRIORITY):
1. Extract text EXACTLY as written - word for word, character for character
   - Do NOT rewrite, summarize, paraphrase, or rephrase ANY text
   - Do NOT correct grammar, spelling, or punctuation
   - Do NOT shorten or abbreviate text
   - Do NOT expand abbreviations unless they are clearly expanded in the PDF
   - Do NOT change word order or sentence structure
   - Do NOT add words that are not in the PDF
   - Do NOT remove words that are in the PDF
   - Do NOT change capitalization unless it's clearly different in the PDF
   - PRESERVE all original text exactly as it appears
   - PRESERVE all punctuation, spacing, and special characters exactly
   - PRESERVE paragraph structure - do NOT combine or split paragraphs
   - PRESERVE heading numbering (e.g., "1. Introduction", "2. Methodology") - do NOT remove numbers
  - If a heading has a number in the PDF (like "1. Introduction", "2. Section Title"), you MUST include that number in the Markdown heading
  - Do NOT convert "1. Introduction" to just "Introduction" - keep the number as part of the heading text
   - PRESERVE all content sections exactly as written - do NOT skip, summarize, or condense any part

2. If you cannot read some text clearly:
   - Try your best to read the text - most PDF pages are readable even if quality is not perfect
   - Only use "[unclear]" or "[illegible]" for SPECIFIC words or phrases that are truly unreadable
   - Do NOT mark entire pages or large sections as unclear - extract what you CAN read
   - If you can read most of the text but some words are unclear, extract the readable parts and mark only the unclear words
   - Do NOT skip entire sentences or paragraphs - extract everything you can see

3. Output ONLY the final result - NO meta-comments, explanations, notes, or commentary

4. Remove these elements (MANDATORY - they are NOT content):
   - Page numbers (usually at bottom center, corners, or margins)
   - Headers/footers (repeated text at top/bottom of every page):
     * Document title repeated in header
     * Author name repeated in header
     * Chapter/section name repeated in header
     * "Page X of Y" or "Page X" text
     * Date repeated in header/footer
     * Company name, logo text, or institutional headers
     * Any text that appears identically on multiple pages at the same position
   - Watermarks (if clearly visible as watermarks)
   - Running headers/footers (text that repeats on every page)
   - CRITICAL: Remove ALL decorative elements and formatting artifacts:
     * Column headers/footers - any text at the very top or bottom of pages
     * Footer notes, page footnotes that are just page numbers or formatting
     * Decorative lines, borders, or separators that are purely visual
     * Institutional logos, stamps, or official marks
     * Copyright notices in headers/footers (unless they are part of main content)
     * Publication information repeated in headers/footers
     * Any text in margins (left, right, top, bottom) that is not main content
     * Running titles (repeated chapter/section names at top of pages)
   - DO NOT remove any actual content text, even if it appears at top/bottom
   - CRITICAL: If text appears in the same position on multiple pages, it's likely a header/footer - REMOVE IT
   - CRITICAL: If text is in margins (very top, very bottom, very left, very right edges), it's likely decorative - REMOVE IT

5. Keep ALL main content:
   - All headings, paragraphs, lists, tables, formulas
   - All text, even if it seems redundant or repetitive
   - All formatting (bold, italic, underline) as it appears
   - All punctuation, spacing, and line breaks

6. IMAGES, DIAGRAMS, AND VISUAL ELEMENTS (CRITICAL):
   - DO NOT attempt to describe or convert images, diagrams, charts, graphs, or visual elements into text
   - DO NOT try to extract text from images or convert visual content to text
   - If you see an image, diagram, chart, graph, figure, or any visual element:
     * Simply note its presence with: [Image: description from caption if available]
     * OR: [Diagram: description from caption if available]
     * OR: [Chart: description from caption if available]
     * OR: [Figure: description from caption if available]
     * If there's a caption, include ONLY the caption text, not a description of the visual
     * If there's no caption, use: [Image], [Diagram], [Chart], or [Figure] without description
   - CRITICAL: Do NOT try to read text from within images or diagrams
   - CRITICAL: Do NOT attempt to describe what's in the image in detail
   - CRITICAL: Do NOT try to extract data from charts or graphs - just note their presence
   - CRITICAL: Visual elements cannot be adequately represented as text - acknowledge them but don't convert them
   - Only extract text that is actual text content, not text embedded in images

MARKDOWN FORMATTING REQUIREMENTS:
- Headings: Use # for H1, ## for H2, ### for H3, #### for H4, etc.
  - Preserve all heading text exactly as written, including any numbers, punctuation, and formatting
  - If headings have numbers in the PDF, preserve them in the Markdown
  - Do not remove or change numbering in headings
  - CRITICAL: If you see text like "1. Introduction", "2. Section Title", "3. Methodology" - these are HEADINGS with numbers, NOT bold text
  - Text that starts with a number followed by a period and space (like "1. ", "2. ", "3. ") followed by capitalized text is ALWAYS a heading
  - Convert "1. Introduction" to "## 1. Introduction" (H2 heading with number), NOT "**Introduction**" (bold text)
  - Convert "2. Section Title" to "## 2. Section Title", NOT "**2. Section Title**"
  - If you see numbered headings (1., 2., 3., etc.) at the start of major sections, they are H2 headings - use ## prefix
- Paragraphs: Plain text, preserve meaningful line breaks
- Lists: 
  - Unordered: Use - or * for bullet points
  - Ordered: Use 1. 2. 3. for numbered lists
  - Properly indent nested lists (2 spaces per level)
- Tables: Use Markdown table syntax with | separators
  - Ensure proper column alignment
  - Preserve all cell content exactly
- Bold: **text** or __text__
  - If text appears bold in PDF, wrap it with **text**
- Italic: *text* or _text_
  - If text appears italic in PDF, wrap it with *text*
  - CRITICAL: Pay close attention to italic formatting - do not miss italic text
  - If you see "Keywords:" followed by italic text, preserve the italic formatting: **Keywords:** *keyword1; keyword2; ...*
  - Be especially careful with formatting in metadata sections, keywords, citations, and references
- Superscripts: Use Unicode superscript characters (¹, ², ³, ⁴, ⁵, etc.)
  - If you see superscript numbers in PDF, preserve them exactly
  - Do not convert to regular numbers or remove them
- Links: [text](url) - extract URLs if visible in PDF
- Code: \`inline code\` or code blocks with \`\`\`
- Images/Diagrams/Charts: Use [Image], [Diagram], [Chart], or [Figure] notation - do NOT describe visual content, only include caption if present

FORMATTING PRESERVATION:
- Preserve all formatting exactly as it appears in PDF:
  - Bold text → **text**
  - Italic text → *text*
  - Superscript numbers → ¹, ², ³, etc. (Unicode characters)
  - Numbered headings → preserve the numbers
- Do not remove, change, or "clean up" formatting

HEADING HIERARCHY (CRITICAL FOR MULTI-PAGE DOCUMENTS):
- CRITICAL: Determine heading levels based on RELATIVE font sizes, not absolute appearance
  - Compare font sizes of headings on the SAME page
  - If one heading has a significantly larger font size than another, they are different levels
  - A heading with a much smaller font than another heading should be a lower level (H2 vs H1, H3 vs H2, etc.)
  - Do NOT treat journal names, publication info, or small decorative text as H1 just because they appear at the top
  - The main document title is usually the LARGEST heading on the page - use it as H1
  - If you see "Postmodern Openings" in small font and "Fear of Death..." in much larger font, "Postmodern Openings" is NOT H1
- First page: Determine H1 based on the largest/most prominent heading (usually document title)
  - Compare ALL headings on the page by font size
  - The heading with the LARGEST font size is H1
  - If journal names or publication info appear in smaller font, they are NOT headings - format them as plain text or bold text
- Subsequent pages: Maintain the same hierarchy established on previous pages
  - If previous pages had H1, continue with H2, H3, etc. for new sections
  - If you see a heading that looks large but previous pages already established H1, it's likely H2 or lower
  - Use visual hierarchy (font size RELATIVE to other headings, position, formatting) AND context from previous pages
- Level 1: Document/chapter titles (largest font size on page, most prominent, usually centered or at top)
- Level 2: Major sections (second largest font size, often bold)
- Level 3: Subsections (smaller font size than H2)
- Level 4-6: Deeper subsections (progressively smaller font sizes)

TABLES (CRITICAL - DO NOT SKIP):
- Convert ALL tables to proper Markdown table format
- Preserve table structure: headers, rows, cells
- Ensure proper alignment with separator row
- If table spans multiple pages, continue structure logically
- CRITICAL: Tables are IMPORTANT content - NEVER skip or omit them
- CRITICAL: If you see a table on the page, you MUST extract it in Markdown table format
- CRITICAL: Tables should be formatted as:
  | Header 1 | Header 2 | Header 3 |
  |----------|----------|----------|
  | Cell 1   | Cell 2   | Cell 3   |
  | Cell 4   | Cell 5   | Cell 6   |
- CRITICAL: Do NOT convert tables to plain text or lists - they MUST be in Markdown table format
- CRITICAL: Extract ALL rows and ALL columns from tables - do NOT skip any data

LISTS:
- Detect ordered (numbered: 1, 2, 3) vs unordered (bulleted: •, -, *)
- Preserve list nesting and indentation
- Use proper Markdown syntax

OUTPUT FORMAT - JSON RESPONSE REQUIRED:
You MUST return a JSON object with the following EXACT structure:
{
  "text": "Markdown content of this page",
  "mergeWithPrevious": "direct" | "newline" | "paragraph",
  "metadata": {
    "title": "...",
    "author": "...",
    "date": "..."
  }
}

CRITICAL - FIELD NAMES MUST BE EXACT:
- Field name: "text" (lowercase, no quotes in the field name itself)
- Field name: "mergeWithPrevious" (camelCase, exactly as written)
- Field name: "metadata" (lowercase, exactly as written)
- Inside metadata: "title", "author", "date" (all lowercase, exactly as written)

CRITICAL - RESPONSE FORMAT:
- Your ENTIRE response must be ONLY the JSON object
- Start with { and end with }
- Do NOT add any text before the opening {
- Do NOT add any text after the closing }
- Do NOT wrap in code blocks (no triple backticks)
- Do NOT add explanations, comments, or notes
- The response must be valid JSON that can be parsed with JSON.parse()

CRITICAL - MERGE INSTRUCTIONS (mergeWithPrevious field):
Before deciding, think: Does this page start with a NEW LINE, or does it continue the EXACT SAME LINE from the previous page?

- "direct": Use when the text on this page is a DIRECT CONTINUATION of the previous page
  - Example: Previous page ends with "The quick brown fox jumps over the lazy dog. This is a"
  - This page starts with "continuation of the sentence."
  - Result: No line break between pages - text flows directly
  - Use when: Sentence or word continues across page boundary WITHOUT any visual break
  - CRITICAL: If this page starts with a NEW LINE (not continuing the same line), do NOT use "direct" - use "newline" instead
  - CRITICAL: NEVER use "direct" if previous page ends with a heading (H1, H2, H3, etc.) and this page starts with text under that heading

- "newline": Use when this page starts a NEW LINE but continues the same paragraph
  - Example: Previous page ends with "The quick brown fox jumps over the lazy dog."
  - This page starts with "This is a new sentence in the same paragraph."
  - Result: Single line break (\n) between pages
  - Use when: Same paragraph continues but on a new line
  - CRITICAL: If this page does NOT continue the exact same line from previous page, it likely starts a new line - use "newline" instead of "direct"
  - CRITICAL: Use "newline" when previous page ends with a heading (H1, H2, H3, etc.) and this page starts with text that belongs under that heading
  - This ensures proper formatting: heading on previous page, then text on this page with single line break

- "paragraph": Use when this page starts a NEW PARAGRAPH or NEW SECTION
  - Example: Previous page ends with "The quick brown fox jumps over the lazy dog."
  - This page starts with "## New Section" or a new paragraph
  - Result: Double line break (\n\n) between pages
  - Use when: New paragraph, new section, new heading, or clear visual separation
  - CRITICAL: Use "paragraph" when previous page ends with a heading AND this page starts with a different heading or a completely new section

SPECIAL CASE - HEADING ON PAGE BOUNDARY:
When analyzing mergeWithPrevious, pay special attention to headings that appear at the end of the previous page:
- If previous page ends with a heading (like "## Types of Black Holes") and this page starts with text that belongs under that heading, use "newline"
- The heading and its content are logically connected, but they appear on different pages due to page break
- This ensures the heading stays on previous page, and text under it starts on this page with proper single line break
- NEVER use "direct" in this case - it would incorrectly glue the heading and text together without any separator

METADATA FIELD:
- If you are asked to provide document information (title, author, date):
  - Fill in the metadata object with visible information
  - Use empty strings ("") for fields that are not visible on this page
- If you are NOT asked to provide document information:
  - Set metadata to: {"title": "", "author": "", "date": ""}

TEXT FIELD:
- Contains the Markdown content of this page
- Extract ALL content exactly as it appears
- Remove page numbers, headers, and footers
- Preserve all formatting, headings, lists, tables, etc.

CRITICAL - JSON FORMAT ONLY:
- Return ONLY valid JSON - no code blocks, no markdown formatting, no explanations
- Do NOT wrap JSON in code blocks (no triple backticks)
- Do NOT add any text before or after the JSON
- The entire response must be a valid JSON object
- Your response should start with { and end with }
- The response must be parseable with JSON.parse() - it must be valid JSON syntax
- Example of CORRECT response: {"text":"Content here","mergeWithPrevious":"paragraph","metadata":{"title":"","author":"","date":""}}
- Example of INCORRECT response: code block with triple backticks around JSON (with code blocks)
- Example of INCORRECT response: text before or after the JSON object (with text before/after)`;

/**
 * Build user prompt for PDF page processing with image
 * @param {string} imageData - Base64 image data URL (not used in prompt, but kept for compatibility)
 * @param {number} pageNum - Page number (1-based)
 * @param {number} totalPages - Total number of pages
 * @param {boolean} isFirstPage - Whether this is the first page
 * @param {boolean} shouldExtractMetadata - Whether to extract metadata from this page
 * @returns {string} User prompt
 */
export function buildPdfPageUserPrompt(imageData, pageNum, totalPages, isFirstPage = false, shouldExtractMetadata = true) {
  const mergeInstruction = isFirstPage 
    ? 'This is the FIRST page, so mergeWithPrevious should be "paragraph" (it will be ignored for the first page).'
    : `CRITICAL - MERGE WITH PREVIOUS PAGE:
Before deciding, think: Does this page start with a NEW LINE, or does it continue the EXACT SAME LINE from the previous page? If it does NOT continue the same line, it likely starts a new line - use "newline" instead of "direct".

Look at how this page relates to the previous page. Check the conversation history to see what was on the previous page:

1. Check if previous page ENDED with a heading (H1, H2, H3, etc.):
   - If YES and this page starts with text that belongs under that heading:
     → Use "newline" (heading on previous page, text on this page - they need single line break)
   - If YES and this page starts with a different heading or new section:
     → Use "paragraph" (different sections need double line break)
   - NEVER use "direct" when previous page ends with a heading

2. If previous page did NOT end with a heading:
   - Think: Does this page continue the EXACT SAME LINE from previous page?
   - If YES - text on this page is a DIRECT CONTINUATION of a sentence or word (e.g., previous page ends with "The quick brown fox jumps over the lazy dog. This is a" and this page starts with "continuation of the sentence"):
     → Use "direct" (no line break needed)
   - If NO - this page starts a NEW LINE but continues the same paragraph (e.g., previous page ends with "The quick brown fox jumps over the lazy dog." and this page starts with "This is a new sentence in the same paragraph."):
     → Use "newline" (single line break)
   - If this page starts a NEW PARAGRAPH or NEW SECTION (e.g., previous page ends with "The quick brown fox jumps over the lazy dog." and this page starts with "## New Section" or a new paragraph):
     → Use "paragraph" (double line break)

CRITICAL RULE: When previous page ends with a heading and this page starts with text under that heading, ALWAYS use "newline" - never "direct". This ensures proper formatting where heading stays on previous page and its content starts on this page with appropriate spacing.`;

  if (shouldExtractMetadata) {
    return `Convert THIS PDF page (page ${pageNum} of ${totalPages}) to Markdown.

DOCUMENT INFORMATION:
Look at this page and provide the following information if it is visible:
- Document title: The main article or document title, if visible
- Author name: The author of the document, if visible (remove superscript numbers like ¹, ², ³, do not include affiliation text)
  - Look carefully for author names - they may appear in various formats: "Matías, QUER", "John Smith", "Maria Garcia"
  - Extract the FULL name as written, including commas if present (e.g., "Matías, QUER" not just "Matías" or "QUER")
  - Do NOT extract partial names or single words unless that's all that's visible
  - CRITICAL: If author is NOT visible or NOT found, return empty string "" - NEVER return "anonymous", "анонимный", "анонімний", "(anonymous)", "unknown", "N/A", or any placeholder text
  - CRITICAL: Only return an author name if you can CLEARLY see a real person's name on the page - if unsure or not visible, return empty string ""
- Publication date: The publication date, if visible (use minimal format: YYYY if only year, YYYY-MM if year+month, YYYY-MM-DD if full date)

${mergeInstruction}

CRITICAL - PROCESS ONLY THIS PAGE:
- Convert ONLY the content visible on THIS page image
- Do NOT include any content from previous pages
- Do NOT summarize or combine with other pages
- Return ONLY the Markdown for THIS specific page

CRITICAL - TEXT EXTRACTION RULES:
- Copy ALL text EXACTLY as it appears on THIS page - word for word, character for character
- Do NOT rewrite, summarize, paraphrase, or modify ANY text
- Do NOT correct grammar, spelling, or punctuation
- Do NOT shorten, abbreviate, or expand text
- Do NOT change word order or sentence structure
- PRESERVE all original text exactly as written
- Try your best to read ALL text on the page - most PDF pages are readable
- Only use "[unclear]" for SPECIFIC words that are truly unreadable, not for entire pages
- Extract everything you CAN read - do not skip content just because some parts are unclear
- CRITICAL: Extract ALL paragraphs from the beginning of sections - do NOT skip the first few sentences or paragraphs
- If a section starts on this page (like "Introduction"), extract it from the VERY BEGINNING, including the first sentence
- Do NOT skip introductory paragraphs or opening sentences of sections
- CRITICAL: Extract ALL tables - tables are IMPORTANT content and MUST be included
- CRITICAL: If you see a table on the page, convert it to Markdown table format - do NOT skip it
- CRITICAL: Tables should be extracted with ALL rows and ALL columns - do NOT omit any table data

${isFirstPage ? 'This is the FIRST page of the document. ' : 'This is page ' + pageNum + ' of the document. '}Convert the content to Markdown:
- Identify headings based on RELATIVE font size and formatting (H1, H2, H3, etc.)
  - Compare font sizes of all headings on the page
  - The heading with the LARGEST font size is H1
  - Headings with progressively smaller fonts are H2, H3, etc.
  - Do NOT treat small text (like journal names) as H1 just because it's at the top
- CRITICAL - NUMBERED HEADINGS DETECTION:
  - If you see text that starts with a number followed by a period and space (like "1. ", "2. ", "3. ") followed by capitalized text, this is ALWAYS a heading
  - Examples: "1. Introduction", "2. Methodology", "3. Results" - these are H2 headings
  - Convert "1. Introduction" to "## 1. Introduction" (H2 with number), NOT "**Introduction**" (bold text)
  - Convert "2. Section Title" to "## 2. Section Title", NOT "**2. Section Title**" or "**Section Title**"
  - Preserve the number as part of the heading text - do NOT remove it or convert to bold
- Preserve heading numbering if present in the PDF - if a heading has a number (like "1. Introduction"), keep that number in the Markdown heading
- Convert all content to Markdown format
- Remove page numbers, headers, footers, and ALL decorative elements:
  * Page numbers (at bottom, corners, or margins)
  * Headers/footers (repeated text at top/bottom of every page)
  * Column headers/footers - any text at very top or bottom
  * Footer notes, decorative lines, borders, or separators
  * Institutional logos, stamps, or official marks
  * Copyright notices in headers/footers
  * Publication information repeated in headers/footers
  * Any text in margins (very top, very bottom, very left, very right edges)
  * Running titles (repeated chapter/section names at top of pages)
  * CRITICAL: If text appears in the same position on multiple pages, it's likely decorative - REMOVE IT
- Preserve all actual content text exactly as written
- Preserve all formatting: bold, italic, superscripts, etc.
- CRITICAL - IMAGES AND VISUAL ELEMENTS:
  * DO NOT attempt to describe or convert images, diagrams, charts, graphs, figures into text
  * DO NOT try to extract text from images or convert visual content to text
  * If you see an image/diagram/chart/figure, note it as [Image], [Diagram], [Chart], or [Figure]
  * If there's a caption, include ONLY the caption text, not a description of the visual
  * Do NOT try to read text from within images or describe visual content in detail
  * Do NOT attempt to extract data from charts or graphs - just note their presence
  * Visual elements cannot be adequately represented as text - acknowledge them but don't convert them
- CRITICAL - TABLES EXTRACTION:
  - Look carefully for tables on the page - they may appear as structured data with rows and columns
  - If you see a table (data organized in rows and columns), convert it to Markdown table format
  - Tables MUST be extracted - do NOT skip them or convert them to plain text
  - Format tables as: | Header 1 | Header 2 | Header 3 | followed by separator row |----------|----------|----------| followed by data rows
  - Extract ALL rows and ALL columns from tables - do NOT omit any table data

[PDF Page Image - THIS IS PAGE ${pageNum}]

OUTPUT FORMAT - JSON REQUIRED:
Return a JSON object with this EXACT structure:
{
  "text": "Markdown content of this page",
  "mergeWithPrevious": "direct" | "newline" | "paragraph",
  "metadata": {
    "title": "..." or "",
    "author": "..." or "",
    "date": "..." or ""
  }
}

CRITICAL - FIELD NAMES MUST BE EXACT:
- Field name: "text" (lowercase, no quotes in the field name itself)
- Field name: "mergeWithPrevious" (camelCase, exactly as written)
- Field name: "metadata" (lowercase, exactly as written)
- Inside metadata: "title", "author", "date" (all lowercase, exactly as written)

CRITICAL - RESPONSE FORMAT:
- Your ENTIRE response must be ONLY the JSON object
- Start with { and end with }
- Do NOT add any text before the opening {
- Do NOT add any text after the closing }
- Do NOT wrap in code blocks (no triple backticks)
- Do NOT add explanations, comments, or notes
- The response must be valid JSON that can be parsed with JSON.parse()

- If title/author/date is visible, include it in metadata; if not, use empty string ""
- Set mergeWithPrevious based on how this page relates to the previous page (see instructions above)
- Put the Markdown content in the "text" field
- Return ONLY valid JSON - no code blocks, no markdown formatting, no explanations`;
  } else {
    // Page where we don't need to extract metadata
    return `Convert THIS PDF page (page ${pageNum} of ${totalPages}) to Markdown.

${mergeInstruction}

CRITICAL - PROCESS ONLY THIS PAGE:
- Convert ONLY the content visible on THIS page image
- Do NOT include any content from previous pages (even if you see them in conversation history)
- Do NOT summarize or combine with other pages
- Return ONLY the Markdown for THIS specific page
- Previous pages are shown ONLY for heading hierarchy context - do NOT include their text

CRITICAL - TEXT EXTRACTION RULES:
- Copy ALL text EXACTLY as it appears on THIS page - word for word, character for character
- Do NOT rewrite, summarize, paraphrase, or modify ANY text
- Do NOT correct grammar, spelling, or punctuation
- Do NOT shorten, abbreviate, or expand text
- Do NOT change word order or sentence structure
- PRESERVE all original text exactly as written
- Try your best to read ALL text on the page - most PDF pages are readable
- Only use "[unclear]" for SPECIFIC words that are truly unreadable, not for entire pages
- Extract everything you CAN read - do not skip content just because some parts are unclear

This is a CONTINUATION page. Use previous pages ONLY for heading hierarchy context:
- Use the heading hierarchy established on previous pages (H1, H2, H3 levels)
- If previous pages had H1, continue with H2, H3, etc. for new sections on THIS page
- If you see a heading that looks large but previous pages already had H1, it's likely H2 or lower
- Maintain the same formatting style as previous pages
- Extract ALL content from THIS page exactly as written - do NOT skip or shorten anything
- Remember: Return ONLY content from THIS page, not from previous pages
- Remove ALL decorative elements: page numbers, headers/footers, column headers/footers, footer notes, decorative lines, institutional logos, copyright notices in headers/footers, any text in margins
- CRITICAL - IMAGES AND VISUAL ELEMENTS:
  * DO NOT attempt to describe or convert images, diagrams, charts, graphs, figures into text
  * DO NOT try to extract text from images or convert visual content to text
  * If you see an image/diagram/chart/figure, note it as [Image], [Diagram], [Chart], or [Figure]
  * If there's a caption, include ONLY the caption text
  * Do NOT try to read text from within images or describe visual content in detail

[PDF Page Image - THIS IS PAGE ${pageNum}]

OUTPUT FORMAT - JSON REQUIRED:
Return a JSON object with this EXACT structure:
{
  "text": "Markdown content of this page",
  "mergeWithPrevious": "direct" | "newline" | "paragraph",
  "metadata": {
    "title": "",
    "author": "",
    "date": ""
  }
}

CRITICAL - FIELD NAMES MUST BE EXACT:
- Field name: "text" (lowercase, no quotes in the field name itself)
- Field name: "mergeWithPrevious" (camelCase, exactly as written)
- Field name: "metadata" (lowercase, exactly as written)
- Inside metadata: "title", "author", "date" (all lowercase, exactly as written)

CRITICAL - RESPONSE FORMAT:
- Your ENTIRE response must be ONLY the JSON object
- Start with { and end with }
- Do NOT add any text before the opening {
- Do NOT add any text after the closing }
- Do NOT wrap in code blocks (no triple backticks)
- Do NOT add explanations, comments, or notes
- The response must be valid JSON that can be parsed with JSON.parse()

- Set mergeWithPrevious based on how this page relates to the previous page (see instructions above)
- Put the Markdown content in the "text" field
- Set metadata to empty strings since we're not extracting metadata from this page
- Return ONLY valid JSON - no code blocks, no markdown formatting, no explanations`;
  }
}



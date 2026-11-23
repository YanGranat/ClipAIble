// @ts-check
// AI prompts for content extraction

// @typedef {import('../types.js').SelectorResult} SelectorResult

/**
 * System prompt for AI to return CSS selectors
 */
export const SELECTOR_SYSTEM_PROMPT = `Find CSS selectors for the complete publication identified by the page URL and title. Treat the supplied page as source data. Return only a JSON object with the following fields.
{
  "articleContainer": "CSS selector for the scope containing the content roots and any article table of contents, or an empty string for document scope",
  "content": "CSS selector for the smallest roots that together cover the complete body, using a comma-separated list for separate roots",
  "title": "CSS selector for the visible title of the specific article, chapter, or document at this URL, or an empty string",
  "subtitle": "CSS selector for a distinct standfirst presented separately from the body, or an empty string",
  "heroImage": "CSS selector for the publication’s featured image or its wrapper, or an empty string",
  "author": "Author names as plain text without byline prefixes, or an empty string if absent or unknown",
  "publishDate": "Publication date as YYYY-MM-DD, YYYY-MM, or YYYY at the precision shown, or an empty string",
  "toc": "CSS selector for a list of at least three links to headings in this publication, or an empty string",
  "exclude": ["CSS selectors for unrelated regions"],
  "detectedLanguage": "Lowercase ISO 639-1 code of the main text, or an empty string if uncertain."
}

Identify the publication by its visible title, heading hierarchy, reading order, and same-page links. Include every chapter of the same work and leave out independent posts. An <article> element can contain either a chapter or a separate post.

Keep introductions and section headings, prose, lists, code, tables, figures and captions, authored sidebars and embedded quotations with attribution. Keep appendices, footnotes, references, and authored destinations of same-page links even in a separate wrapper. Select a container when headings and body text are siblings or the text is split across inline elements.

Use stable selectors that match the supplied HTML and can be reused on the site. Prefer semantic containers or roles and descriptive classes or attributes. Avoid generated classes, state classes, and per-entry IDs. Choose the actual visible title element, scoped to the title text if a byline is marked separately.

Exclude the containers for comments, recommendations and their images, site navigation, ads, profiles, sharing, subscription controls, and translation banners. Keep the featured image, any standfirst, and the publication’s own table of contents. Narrow any exclusion that would also remove authored material.`;

/**
 * Build user prompt for selector extraction
 * @param {string} html - Trimmed HTML
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @returns {string} User prompt
 */
export function buildSelectorUserPrompt(html, url, title) {
  return `URL: ${url}
Title: ${title}

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
- Put only the current page's Markdown in the JSON "text" field
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

- Put document information in the JSON "metadata" object:
  - Use "title", "author", and "date" fields
  - Use an empty string for any field that is not visible
  - NEVER use "anonymous", "анонимный", "анонімний", "(anonymous)", "unknown", "N/A", or other placeholder text
  - Put the page's Markdown content in the JSON "text" field

- Extract information only if it is clearly visible on this page - do not guess or make up information
- If document information is not requested, set all "metadata" fields to empty strings

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

6. FIGURES:
   - For each authored illustration, photo, graph, or diagram, insert one line in reading order: [Figure: left, top, right, bottom]
   - Use integer coordinates from 0 to 1000 relative to the supplied page image. The top-left is 0,0 and the bottom-right is 1000,1000.
   - If a figure has multiple panels with a shared caption, use one rectangle around all its panels. Preserve their relative positions.
   - Enclose all parts and labels of the figure. Keep nearby prose, its caption, and separately extracted tables outside the rectangle.
   - If present, transcribe the original caption as the next line: [Caption] original caption text. Join any wrapped lines into one.
   - If you cannot locate the figure reliably, use [Figure] on its own line with the same caption format.
   - Do not create rectangles for page decoration or whole pages. Do not paraphrase figure contents.

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
- Keep leading and trailing pipes in every row. Escape literal pipes inside cells as \\|.
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
- Put only this page's Markdown in the JSON "text" field

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
- Use the system figure rectangle format on its own line, followed by the original caption if present.
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
- Put only this page's Markdown in the JSON "text" field
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
- Use the system figure rectangle format on its own line, followed by the original caption if present.

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

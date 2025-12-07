# Extension Permissions Explained

This document explains why each permission is required by ClipAIble.

## Permissions

### `activeTab`
**Why needed:** To access the content of the currently active tab when you click the extension icon or use the context menu. This allows the extension to read the article text, images, and structure from the webpage you want to save.

### `storage`
**Why needed:** To save your settings (API keys, style preferences, language selection) and statistics locally in your browser. Your data never leaves your device.

### `unlimitedStorage`
**Why needed:** To cache article selectors for offline mode and store statistics history. This enables faster repeat extractions without calling AI again.

### `scripting`
**Why needed:** To inject the content extraction script into web pages. This script finds and extracts the article content (text, images, headings) from the page DOM.

### `downloads`
**Why needed:** To save the generated files (PDF, EPUB, FB2, Markdown, MP3) to your computer. Without this permission, the extension cannot download files.

### `debugger`
**Why needed:** To generate PDF files using Chrome's built-in print-to-PDF functionality. This produces high-quality PDFs with proper page layout and styling. Only used for PDF format.

### `alarms`
**Why needed:** To keep the background service worker alive during long operations (large articles, translation). Chrome's Manifest V3 suspends service workers after 30 seconds, but article processing can take several minutes.

### `notifications`
**Why needed:** To show desktop notifications when using the context menu "Save as PDF" feature. Notifies you if there's an error (e.g., missing API key).

### `contextMenus`
**Why needed:** To add the "Save article as PDF" option to the right-click context menu on web pages.

## Host Permissions

### `<all_urls>`
**Why needed:** To extract content from any website you visit. The extension needs to:
1. Read the page HTML to find article content
2. Download images embedded in articles
3. Make API calls to AI providers (OpenAI, Google, Anthropic)

## Data Privacy

- **API keys** are encrypted and stored locally only
- **No data is sent** to any server except the AI providers you configure
- **Statistics** are stored locally and never transmitted
- **Cached selectors** are stored locally for offline mode

## Security

- All API keys are encrypted using Web Crypto API (AES-GCM)
- Keys are never included in settings export
- No remote code execution
- No tracking or analytics


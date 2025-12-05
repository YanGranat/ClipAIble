# Webpage to PDF - Chrome Extension

Extract articles from web pages using AI and save as PDF, EPUB, FB2, Markdown, or Audio (MP3) with optional translation.

## Features

- **AI Content Extraction** - Two modes: AI Extract (thorough) and AI Selector (fast)
- **Multi-Provider AI** - OpenAI, Google Gemini, Anthropic Claude
- **Multiple Export Formats** - PDF, EPUB, FB2, Markdown, Audio (MP3)
- **Audio Export** - Text-to-speech via OpenAI with 11 voices and speed control
- **Translation** - Translate articles to 11 languages (works with all formats including audio)
- **Image Translation** - AI-powered text translation on images using Gemini
- **Smart Language Detection** - Automatically skips translation if article already in target language
- **Clean Output** - Removes ads, navigation, sidebars, comments, avatars
- **Image Support** - Downloads and embeds article images with captions
- **Table of Contents** - Auto-generated TOC with proper heading hierarchy
- **Internal Links** - Preserves footnotes and anchor links
- **Style Presets** - Dark, Light, Sepia, High Contrast themes (PDF)
- **Full Customization** - Font family, size, colors for background/text/headings/links
- **Two Page Modes** - Single continuous page or multiple A4 pages (PDF)
- **Context Menu** - Right-click to save article as PDF
- **Statistics Dashboard** - Track saves, formats, history with links to originals
- **Offline Mode** - Cached selectors by domain, no AI needed for repeat sites
- **Settings Import/Export** - Backup and restore all settings, statistics, and cache
- **Processing Timer** - Shows elapsed time during generation
- **Cancel Button** - Stop processing at any time
- **Reliable** - State persists even if you switch tabs

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `webpage_to_pdf` folder

## Setup

1. Click the extension icon in Chrome toolbar
2. Enter API key for your preferred provider:
   - **OpenAI** - For GPT models
   - **Google Gemini** - For Gemini models
   - **Anthropic Claude** - For Claude models
3. Click **Save Keys**

## Usage

### Via Popup
1. Navigate to any webpage with an article
2. Click the extension icon
3. Select **Output Format**: PDF, EPUB, FB2, or Markdown
4. Configure other settings if needed
5. Click **Save as PDF/EPUB/FB2/Markdown**
6. Wait for processing (progress bar shows status)
7. File downloads automatically

### Via Context Menu
1. Navigate to any webpage with an article
2. Right-click anywhere on the page
3. Select **Save article as PDF**
4. PDF generates with your saved settings

## Settings

### Extraction Mode

| Mode | Description | Best For |
|------|-------------|----------|
| **AI Selector** | AI finds article blocks, local script extracts content | Most websites, faster |
| **AI Extract** | AI extracts and processes all content | Complex pages (Notion, SPAs) |

### AI Models

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | GPT-5.1 | High quality |
| OpenAI | GPT-5.1 (high) | Best quality, slower |
| Anthropic | Claude Sonnet 4.5 | High quality, 32k output |
| Google | Gemini 3 Pro | Fast, good for selectors |

### Output Formats

| Format | Description | Best For |
|--------|-------------|----------|
| **PDF** | Customizable styling, internal links | Archiving, printing |
| **EPUB** | E-reader compatible, embedded images | Kindle, Kobo, Apple Books |
| **FB2** | FictionBook format, embedded images | PocketBook, FBReader |
| **Markdown** | Plain text with formatting | Note-taking, editing |
| **Audio (MP3)** | Text-to-speech via OpenAI TTS | Listening on the go, accessibility |

### Page Layout (PDF only)

- **Single long page** - One continuous page, good for digital reading
- **Multiple pages (A4)** - Standard A4 format, good for printing

### Language Options

| Language | Code |
|----------|------|
| Auto (original) | - |
| English | en |
| Russian | ru |
| Ukrainian | uk |
| German | de |
| French | fr |
| Spanish | es |
| Italian | it |
| Portuguese | pt |
| Chinese | zh |
| Japanese | ja |
| Korean | ko |

### Style Presets

| Preset | Description |
|--------|-------------|
| **Dark** | Dark gray background (#303030), light text |
| **Light** | Soft white (#f8f9fa), modern clean design |
| **Sepia** | Warm cream (#faf4e8), e-reader style |
| **High Contrast** | Black/white with gold headings, accessibility |

### Image Translation

- Requires Google Gemini API key
- Detects text on images and translates it
- Only available when translation is enabled

### Audio Settings

| Setting | Options | Description |
|---------|---------|-------------|
| **Voice** | nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse | 11 voices with different characteristics |
| **Speed** | 0.5x - 2.0x | Playback speed control |

Audio uses OpenAI's `gpt-4o-mini-tts` model. Text is automatically cleaned (URLs, code removed) and split into chunks for processing.

## PDF Customization

### Via Popup Settings

- **Font Family** - Choose from system fonts
- **Font Size** - Adjust base font size
- **Background Color** - Page background
- **Text Color** - Main text color
- **Heading Color** - H1-H6 colors
- **Link Color** - Hyperlink color

### Via CSS

Edit `config/pdf-styles.css` for advanced customization:

```css
:root {
  --font-family-body: 'Segoe UI', sans-serif;
  --font-size-base: 31px;
  --color-text: #b9b9b9;
  --color-background: #303030;
  --line-height: 1.6;
}
```

## Troubleshooting

### "Extracted content is empty"
- Try switching to **AI Extract** mode
- For dynamic sites, scroll page to load all content first

### "API key not valid"
- Verify the API key is correct for selected model
- Gemini keys start with "AIza"

### Images not appearing
- Some websites block cross-origin requests
- Small images (<100px) and avatars are filtered out

### Translation issues
- Large articles are split into chunks automatically
- If already in target language, translation is skipped
- Failed chunks preserve original text

### Author name shows garbage
- Author names are transliterated, not translated
- If AI is unsure, original name is preserved

## Offline Mode (Selector Cache)

The extension caches AI-generated selectors by domain. When you save an article from the same site again:

- **No API call needed** — uses cached selectors
- **Instant extraction** — shows "⚡ Using cached selectors"
- **Auto-invalidation** — if extraction fails, cache is cleared for that domain
- **Success tracking** — more successful extractions = more trusted cache
- **User control** — checkbox "Use cached selectors" in Settings (enabled by default)
  - When disabled: always calls AI for fresh selectors
  - Cache still saves for future use when you re-enable it

Cache management in **📊 Stats** panel:
- Number of cached domains
- List of cached domains with age
- Delete individual domains from cache

## Settings Import/Export

Click **⚙️ Settings** → **Import/Export Settings**:

- **Export Settings** — Download all settings as JSON
  - Optional: include statistics
  - Optional: include selector cache
  - File named with date: `webpage-to-pdf-settings-2025-12-05.json`

- **Import Settings** — Restore from JSON file
  - Choose what to import (settings, stats, cache)
  - Option to overwrite existing settings
  - Automatic reload after import

## Statistics

Click **📊 Stats** in the popup to view:
- **Total saved** - All-time count
- **This month** - Current month saves
- **By format** - PDF, EPUB, FB2, Markdown, Audio breakdown
- **Recent history** - Last 10 saves with clickable links to original articles
  - Click title to open original article
  - Click ✕ to delete individual entries

## Architecture

The extension uses a modular ES module architecture:

```
scripts/
├── background.js          # Main service worker
├── utils/                 # Logging, config, HTML, images
├── api/                   # OpenAI, Claude, Gemini APIs
├── state/                 # Processing state management
├── extraction/            # Content extraction
├── translation/           # Text/image translation
├── stats/                 # Statistics tracking
├── cache/                 # Selector caching
├── settings/              # Import/export
└── generation/            # PDF, EPUB, FB2, Markdown generation
```

## Requirements

- Google Chrome or Chromium-based browser
- API key from at least one provider:
  - OpenAI API key
  - Google Gemini API key
  - Anthropic Claude API key

## Version

Current: v2.6.0

## License

MIT License - see [LICENSE](LICENSE) file.

# 📄 Webpage to PDF

> **AI-Powered Article Extractor** — Save web articles as PDF, EPUB, FB2, Markdown, or Audio (MP3) with optional translation to 11 languages.

![Version](https://img.shields.io/badge/version-2.6.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

---

## ✨ Features

### 🤖 AI-Powered Extraction
- **Two extraction modes**: AI Selector (fast, reusable) and AI Extract (thorough, for complex pages)
- **Multi-provider support**: OpenAI GPT, Google Gemini, Anthropic Claude
- **Smart content detection**: Automatically finds article body, removes ads, navigation, comments
- **Internal links preserved**: Footnotes, references, and anchor links work in output

### 📚 Multiple Export Formats

| Format | Best For | Features |
|--------|----------|----------|
| **PDF** | Archiving, printing | Full styling, themes, fonts, colors |
| **EPUB** | E-readers (Kindle, Kobo) | Embedded images, metadata |
| **FB2** | E-readers (PocketBook) | Russian e-reader standard |
| **Markdown** | Notes, editing | Clean plain text with formatting |
| **Audio (MP3)** | Listening on the go | AI narration with 11 voices |

### 🎧 Audio Export (Text-to-Speech)
- **OpenAI TTS** via `gpt-4o-mini-tts` model
- **11 natural voices**: nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse
- **Speed control**: 0.5x to 2.0x
- **Smart text preparation**: AI cleans content for natural narration (removes code, URLs, etc.)
- **Multi-language pronunciation**: Correct accent for 11 languages

### 🌍 Translation
- **11 languages**: English, Russian, Ukrainian, German, French, Spanish, Italian, Portuguese, Chinese, Japanese, Korean
- **Smart detection**: Automatically skips translation if article already in target language
- **Image translation**: Translates text on images using Google Gemini
- **Metadata localization**: Dates, labels adapted to target language

### 🎨 PDF Customization
- **4 style presets**: Dark, Light, Sepia, High Contrast
- **Custom colors**: Background, text, headings, links
- **Fonts**: 11 font families
- **Page modes**: Single continuous page or multi-page A4

### ⚡ Smart Features
- **Offline mode**: Cached selectors — no AI needed for repeat sites
- **Statistics dashboard**: Track saves, view history
- **Table of Contents**: Auto-generated from headings
- **Abstract generation**: AI-written 2-3 paragraph summary
- **Context menu**: Right-click "Save article as PDF"
- **Processing timer**: See elapsed time
- **Cancel button**: Stop anytime

### 🔒 Security
- **API keys encrypted** with AES-256-GCM (Web Crypto API)
- **Keys never exported** — excluded from settings backup
- **All data stored locally** — nothing sent to third parties

---

## 📦 Installation

### From Source (Developer Mode)

1. **Clone or download** this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `webpage_to_pdf` folder

### Requirements

- Google Chrome or Chromium-based browser (Edge, Brave, Arc)
- API key from at least one provider:
  - [OpenAI API](https://platform.openai.com/api-keys)
  - [Google Gemini API](https://aistudio.google.com/apikey)
  - [Anthropic Claude API](https://console.anthropic.com/)

---

## 🚀 Quick Start

1. **Click the extension icon** in Chrome toolbar
2. **Enter your API key** (OpenAI, Gemini, or Claude)
3. **Click "Save Keys"**
4. **Navigate to any article**
5. **Click extension icon** → **"Save as PDF"**
6. Done! File downloads automatically.

### Via Context Menu

Right-click anywhere on a webpage → **"Save article as PDF"**

---

## ⚙️ Settings

### Extraction Mode

| Mode | Speed | Best For |
|------|-------|----------|
| **AI Selector** | ⚡ Fast | Most websites, blogs, news |
| **AI Extract** | 🐢 Slower | Complex pages (Notion, SPAs, paywalled content) |

**How AI Selector works:**
1. AI analyzes page structure once
2. Returns CSS selectors for article content
3. Local script extracts using those selectors
4. Selectors cached for future use (no AI needed next time!)

### AI Models

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | GPT-5.1 | Balanced quality/speed |
| OpenAI | GPT-5.1 (high) | Best quality, slower |
| Anthropic | Claude Sonnet 4.5 | Great for long articles (32k output) |
| Google | Gemini 3 Pro | Fast, good for selectors |

### Audio Settings

| Voice | Description |
|-------|-------------|
| **nova** | Female, warm (default) |
| **alloy** | Neutral |
| **echo** | Male |
| **fable** | Expressive |
| **onyx** | Male, deep |
| **shimmer** | Female, clear |
| **coral** | Female, friendly |
| **sage** | Neutral, calm |
| **ash** | Male, authoritative |
| **ballad** | Expressive, dramatic |
| **verse** | Rhythmic |

**Speed:** 0.5x (slow) → 1.0x (normal) → 2.0x (fast)

### Style Presets (PDF)

| Preset | Background | Text | Headings | Links |
|--------|------------|------|----------|-------|
| **Dark** | `#303030` | `#b9b9b9` | `#cfcfcf` | `#6cacff` |
| **Light** | `#f8f9fa` | `#212529` | `#1a1a2e` | `#0066cc` |
| **Sepia** | `#faf4e8` | `#5b4636` | `#3d2914` | `#8b4513` |
| **High Contrast** | `#000000` | `#ffffff` | `#ffd700` | `#00ffff` |

---

## 📊 Statistics & Cache

Click **📊 Stats** to view:
- **Total saved** — all-time count
- **This month** — current month saves
- **By format** — PDF, EPUB, FB2, Markdown, Audio breakdown
- **Recent history** — last 10 saves with links to originals
- **Selector cache** — cached domains for offline mode

### Offline Mode (Selector Cache)

When you save from a site, the extension caches AI-generated selectors:

- **Second visit = instant** — no AI call needed
- **Auto-invalidation** — if extraction fails, cache clears automatically
- **Trust system** — more successful extractions = more trusted cache
- **Manual control** — delete individual domains or clear all

---

## 💾 Settings Import/Export

**⚙️ Settings** → **Import/Export**

- **Export**: Download all settings as JSON
  - Optional: include statistics
  - Optional: include selector cache
  - ⚠️ API keys are NEVER exported (security)
  
- **Import**: Restore from JSON file
  - Choose what to import
  - Option to overwrite existing

---

## 🔧 Troubleshooting

### "Extracted content is empty"
- Try switching to **AI Extract** mode
- For dynamic sites, scroll page to load all content first
- Check if site uses heavy JavaScript rendering

### "API key not valid"
- Verify the API key is correct for selected model
- OpenAI keys start with `sk-`
- Gemini keys start with `AIza`
- Claude keys start with `sk-ant-`

### Images not appearing
- Some websites block cross-origin requests
- Small images (<100px) and avatars are filtered out intentionally

### Audio generation takes too long
- Long articles are split into chunks (4-6k chars each)
- Each chunk is converted separately and stitched
- Progress bar shows conversion status

### Translation issues
- Large articles are split into chunks automatically
- If already in target language, translation is skipped
- Failed chunks preserve original text (graceful degradation)

---

## 🏗️ Architecture

```
webpage_to_pdf/
├── manifest.json          # Extension manifest (v3)
├── popup/
│   ├── popup.html         # Main UI
│   ├── popup.css          # Styling
│   └── popup.js           # UI logic
├── scripts/
│   ├── background.js      # Service worker (main orchestrator)
│   ├── api/
│   │   ├── index.js       # API routing
│   │   ├── openai.js      # OpenAI integration
│   │   ├── claude.js      # Anthropic integration
│   │   ├── gemini.js      # Google integration
│   │   └── tts.js         # Text-to-Speech (OpenAI)
│   ├── extraction/
│   │   ├── prompts.js     # AI prompts for extraction
│   │   └── html-utils.js  # HTML processing utilities
│   ├── translation/
│   │   └── index.js       # Translation & language detection
│   ├── generation/
│   │   ├── pdf.js         # PDF generation
│   │   ├── epub.js        # EPUB generation
│   │   ├── fb2.js         # FB2 generation
│   │   ├── markdown.js    # Markdown generation
│   │   ├── audio.js       # Audio orchestration
│   │   └── audio-prep.js  # Text preparation for TTS
│   ├── cache/
│   │   └── selectors.js   # Selector caching (offline mode)
│   ├── stats/
│   │   └── index.js       # Statistics tracking
│   ├── settings/
│   │   └── import-export.js
│   └── utils/
│       ├── config.js      # Configuration constants
│       ├── encryption.js  # API key encryption
│       ├── logging.js     # Debug logging
│       └── ...
├── print/
│   ├── print.html         # PDF rendering page
│   └── print.js           # PDF generation logic
├── config/
│   └── pdf-styles.css     # PDF styling
├── lib/
│   └── jszip.min.js       # ZIP library for EPUB/FB2
└── icons/
    └── icon*.png          # Extension icons
```

---

## 🔐 Security & Privacy

### Data Flow
1. **Your API key** → encrypted with AES-256-GCM → stored in `chrome.storage.local`
2. **Page content** → sent to your chosen AI provider → response processed locally
3. **Generated file** → saved directly to your computer

### What's NOT Collected
- ❌ No analytics or tracking
- ❌ No remote logging
- ❌ No data sent to our servers (we don't have any!)
- ❌ API keys never leave your browser (except to the AI provider you chose)

### Encryption Details
- **Algorithm**: AES-256-GCM
- **Key derivation**: PBKDF2 with 100,000 iterations
- **Salt**: Extension-specific (based on runtime ID)
- **IV**: Random 12 bytes per encryption

---

## 📋 Permissions Explained

| Permission | Why Needed |
|------------|------------|
| `activeTab` | Read article content from current tab |
| `storage` | Save settings and statistics locally |
| `scripting` | Inject content extraction script |
| `downloads` | Save generated files to computer |
| `debugger` | Generate PDF using Chrome's print API |
| `alarms` | Keep service worker alive during long operations |
| `contextMenus` | Add "Save as PDF" to right-click menu |
| `<all_urls>` | Extract from any website, download images |

See [PERMISSIONS.md](PERMISSIONS.md) for detailed explanations.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📜 License

MIT License — see [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

- [JSZip](https://stuk.github.io/jszip/) — ZIP generation for EPUB/FB2
- [OpenAI](https://openai.com/) — GPT models and TTS
- [Google](https://ai.google.dev/) — Gemini models
- [Anthropic](https://anthropic.com/) — Claude models

---

<p align="center">
  Made with ❤️ for readers who prefer their articles offline
</p>

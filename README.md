# ✂️ ClipAIble

> **AI-Powered Article Extractor** — Clip any article from the web and save it as PDF, EPUB, FB2, Markdown, or Audio. Translate to 11 languages. Works on any website.

**🌍 Translations:** [Русский](docs/README.ru.md) | [Українська](docs/README.ua.md) | [Deutsch](docs/README.de.md) | [Français](docs/README.fr.md) | [Español](docs/README.es.md) | [Italiano](docs/README.it.md) | [Português](docs/README.pt.md) | [中文](docs/README.zh.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md)

![Version](https://img.shields.io/badge/version-3.0.3-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

**[⬇️ Install from Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ What is ClipAIble?

ClipAIble uses AI to intelligently extract article content from any webpage — removing ads, navigation, popups, and clutter. Then it exports to your preferred format:

- 📄 **PDF** — Beautiful styling with customization options
- 📚 **EPUB** — Compatible with Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatible with PocketBook, FBReader
- 📝 **Markdown** — Plain text format for notes
- 🎧 **Audio** — Listen with AI-powered narration

All formats support **translation to 11 languages** — even translating text on images!

---

## 🚀 Features

### 🤖 AI-Powered Extraction
- **Two modes**: AI Selector (fast, reusable) and AI Extract (thorough)
- **Multiple providers**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Video support**: Extract subtitles from YouTube/Vimeo videos and convert to articles
  - Multiple extraction methods with fallbacks
  - Priority: manual subtitles > auto-generated > translated
  - AI processing: removes timestamps, merges paragraphs, fixes errors
  - Audio transcription fallback when subtitles unavailable
- **Smart detection**: Finds main article content, removes unnecessary elements automatically
- **Enhanced fallback strategies**: 6 different strategies for reliable content extraction
- **Preserves structure**: Headings, images, code blocks, tables, footnotes
- **Selector caching**: Independent settings for using and enabling cache

### 🎧 Audio Export
- **5 TTS providers**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ voices**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (English & Ukrainian)
- **Speed adjustment**: 0.5x to 2.0x (OpenAI/ElevenLabs only; Google/Qwen/Respeecher use fixed speed)
- **Format support**: MP3 (OpenAI/ElevenLabs) or WAV (Google/Qwen/Respeecher)
- **Multi-language pronunciation**: Correct pronunciation for each language
- **Ukrainian language support**: Dedicated Ukrainian voices via Respeecher (10 voices)
- **Smart text cleanup**: AI removes URLs, code, and non-speech content
- **Provider-specific features**:
  - **ElevenLabs**: Model selection (v2, v3, Turbo v2.5), format selection, advanced voice settings
  - **Google Gemini 2.5 TTS**: Model selection (pro/flash), 30 voices, 24k char limit
  - **Qwen**: 49 voices including Russian voice (Alek), 600 char limit
  - **Respeecher**: Advanced sampling parameters (temperature, repetition_penalty, top_p)

### 🌍 Translation
- **11 languages**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Smart detection**: Skips translation if article already in target language
- **Image translation**: Translates text on images (via Gemini)
- **Localized metadata**: Dates and labels adapt to language

### 🎨 PDF Customization
- **4 presets**: Dark, Light, Sepia, High Contrast
- **Customizable colors**: Background, text, headings, links
- **11 fonts**: Default (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **Font size**: Adjustable (default: 31px)
- **Page modes**: Single continuous page or multi-page A4 format


### ⚡ Smart Features
- **Video support**: Extract subtitles from YouTube/Vimeo and convert to articles
  - Direct subtitle extraction (no API keys required from YouTube/Vimeo)
  - AI processing: removes timestamps, merges paragraphs, fixes errors
  - Audio transcription fallback: automatic transcription when subtitles unavailable (gpt-4o-transcribe)
  - Full pipeline integration: translation, TOC, abstract, all export formats
- **Summary Generation**: Generate detailed AI summaries of any article or video
  - Click **"Generate Summary"** button to create comprehensive summary
  - Works with regular articles and YouTube/Vimeo videos
  - Continues generating even if popup is closed (runs in background)
  - Copy to clipboard or download as Markdown file
  - Expandable/collapsible display with formatted text
  - Detailed summaries with key ideas, concepts, examples, and conclusions
- **Abstract (TL;DR)**: AI-written 2-4 sentence summary included in documents
  - Optional feature: enable in settings to add brief summary to PDF/EPUB/FB2/Markdown
  - Appears at the beginning of exported documents
  - Different from detailed Summary (this is a brief overview)
- **Offline mode**: Selector caching — no AI needed for repeat visits
  - Independent settings: use cached selectors and enable caching separately
  - Auto-invalidation on extraction failure
  - Manual cache management per domain
- **Statistics**: Track number of saves, view history
- **Table of Contents**: Auto-generated from headings
- **Context menu**: Right-click → "Save article as PDF/EPUB/FB2/Markdown/Audio"
- **Cancel anytime**: Stop processing with one click
- **Settings import/export**: Backup and restore all settings (API keys excluded for security)

### 🔒 Security
- **API keys encrypted** with AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Keys never exported** — excluded from settings backup
- **All data stored locally** — nothing sent to third parties

---

## ⚠️ Known Limitations

### File Formats
- **WAV format** (Google/Qwen/Respeecher): Files can be very large (10-50MB+ for long articles). MP3 format (OpenAI/ElevenLabs) provides smaller file sizes.
- **Character limits per request**: 
  - OpenAI TTS: 4096 characters
  - ElevenLabs: 5000 characters
  - Google Gemini 2.5 TTS: 24000 characters
  - Qwen TTS: 600 characters
  - Respeecher TTS: 450 characters
  - Text is automatically split intelligently at sentence/word boundaries

### Technical Constraints
- **Keep-alive requirement**: Chrome MV3 requires keep-alive interval of at least 1 minute. Long processing tasks may take several minutes. Extension uses unified keep-alive mechanism (alarm every 1 minute + state save every 2 seconds) to prevent service worker from dying.
- **CORS for images**: Some images may fail to load if the website blocks cross-origin requests. The extension will skip these images.
- **Cancel not instant**: Cancellation may take a few seconds to fully stop all background processes.
- **Service Worker recovery**: Operations automatically resume after service worker restart (within 2 hours).

### Browser Compatibility
- **Chrome/Edge/Brave/Arc**: Fully supported
- **Firefox**: Not supported (uses different extension API)
- **Safari**: Not supported (uses different extension API)

---

## 📦 Installation

### Option 1: Install from Chrome Web Store (Recommended)

**[⬇️ Install ClipAIble from Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### Option 2: Manual Installation (Developer Mode)

1. **Clone** this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the folder

### Requirements

- Chrome, Edge, Brave, or Arc browser
- API key from at least one provider (see below)

---

## 🔑 Getting API Keys

### OpenAI (GPT models + Audio)

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** (left menu) or go directly to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Click **"Create new secret key"**
5. Copy the key (starts with `sk-...`)
6. Add billing at **Settings → Billing** (required for API usage)

> **Note:** OpenAI key is required for Audio export (TTS). Other formats work with any provider.

### Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with Google account
3. Click **"Get API key"** or go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Click **"Create API key"**
5. Copy the key (starts with `AIza...`)

> **Tip:** Gemini also enables image text translation feature and Google Gemini 2.5 TTS (30 voices). For TTS, you can use the same Gemini API key or set a dedicated Google TTS API key. Requires Generative Language API enabled in Google Cloud Console.

### Anthropic Claude

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys**
4. Click **"Create Key"**
5. Copy the key (starts with `sk-ant-...`)
6. Add credits at **Plans & Billing**

### ElevenLabs (Audio)

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up or log in
3. Navigate to **Profile** → **API Keys**
4. Create an API key
5. Copy the key

> **Note:** ElevenLabs provides 9 premium voices with high-quality TTS. Supports speed control (0.25-4.0x) and format selection (MP3 high quality default: mp3_44100_192). Models: Multilingual v2, v3 (default), Turbo v2.5. Advanced voice settings available (stability, similarity, style, speaker boost).

### Google Gemini 2.5 TTS (Audio)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with Google account
3. Click **"Get API key"** or go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Click **"Create API key"**
5. Copy the key (starts with `AIza...`)
6. Enable **Generative Language API** in [Google Cloud Console](https://console.cloud.google.com/)
7. (Optional) Enable billing if required for your model

> **Note:** Google Gemini 2.5 TTS provides 30 voices. You can use the same Gemini API key or set a dedicated Google TTS API key. Fixed WAV format at 24kHz. Models: `gemini-2.5-pro-preview-tts` (primary) or `gemini-2.5-flash-preview-tts` (faster).

### Qwen3-TTS-Flash (Audio)

1. Go to [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Sign up or log in
3. Navigate to **API Keys** or **Model Studio**
4. Create an API key
5. Copy the key (starts with `sk-...`)

> **Note:** Qwen3-TTS-Flash provides 49 voices including a dedicated Russian voice (Alek). Fixed WAV format at 24kHz.

### Respeecher (Audio - English & Ukrainian)

1. Go to [Respeecher Space](https://space.respeecher.com/)
2. Sign up or log in
3. Navigate to **API Keys**
4. Create an API key
5. Copy the key

> **Note:** Respeecher supports English and Ukrainian languages with dedicated Ukrainian voices. Fixed WAV format at 22.05kHz.

### Which to choose?

| Provider | Best For | Audio | Image Translation |
|----------|----------|-------|-------------------|
| **OpenAI** | General use, Audio export, Video transcription | ✅ (11 voices) | ❌ |
| **Gemini** | Fast extraction, Image translation, Audio export (30 voices) | ✅ (30 voices) | ✅ |
| **Claude** | Long articles, Complex pages | ❌ | ❌ |
| **Grok** | Fast reasoning tasks | ❌ | ❌ |
| **OpenRouter** | Access to multiple models | ❌ | ❌ |
| **ElevenLabs** | Audio export (9 voices, high quality) | ✅ (9 voices) | ❌ |
| **Qwen** | Audio export (49 voices, Russian support) | ✅ (49 voices) | ❌ |
| **Respeecher** | Audio export (Ukrainian language) | ✅ (14 voices) | ❌ |

**Recommendation:** 
- **For extraction**: Start with OpenAI or Gemini (fast and reliable)
- **For audio**: OpenAI for general use, ElevenLabs for high quality, Google Gemini 2.5 TTS for 30 voices, Qwen for Russian, Respeecher for Ukrainian
- **For image translation**: Requires Gemini API key

---

## 🎯 Quick Start

1. Click the **ClipAIble** icon in toolbar
2. Enter your API key → **Save Keys**
3. Navigate to any article
4. Click **Save as PDF** (or choose another format)
5. Done! File downloads automatically

**Tips:**
- Right-click anywhere → **"Save article as PDF"**
- Click **"Generate Summary"** to create a detailed AI summary (works even if popup is closed)
- Enable **"Generate TL;DR"** in settings to add brief summary to documents

---

## ⚙️ Settings

### Interface

- **Theme**: Choose Dark, Light, or Auto (follows system) in header
- **Language**: Select interface language (11 languages) in header
- **Custom Models**: Add your own AI models via "+" button next to model selector

### Extraction Modes

| Mode | Speed | Best For |
|------|-------|----------|
| **AI Selector** | ⚡ Fast | Most sites, blogs, news |
| **AI Extract** | 🐢 Thorough | Complex pages, Notion, SPAs |

### AI Models

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | GPT-5.2 | Latest, medium reasoning (default) |
| OpenAI | GPT-5.2-high | Enhanced, high reasoning |
| OpenAI | GPT-5.1 | Balanced |
| OpenAI | GPT-5.1 (high) | Best quality, high reasoning |
| Anthropic | Claude Sonnet 4.5 | Great for long articles |
| Google | Gemini 3 Pro Preview | Fast extraction, image translation |
| Grok | Grok 4.1 Fast Reasoning | Fast reasoning tasks |
| OpenRouter | Various models | Access to multiple providers |

**Custom Models:** Click the **"+"** button next to model selector to add custom models (e.g., `gpt-4o`, `claude-opus-4.5`). Custom models appear in dropdown and can be hidden/shown as needed.

### Audio Voices

**OpenAI (11 voices):** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs (9 voices):** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS (30 voices):** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash (49 voices):** Including Elias (default), Alek (Russian), and voices for 10 languages

**Respeecher (14 voices):** 4 English (Samantha, Neve, Gregory, Vincent) + 10 Ukrainian voices

### Style Presets (PDF)

| Preset | Background | Text |
|--------|------------|------|
| Dark | `#303030` | `#b9b9b9` |
| Light | `#f8f9fa` | `#343a40` |
| Sepia | `#faf4e8` | `#5d4e37` |
| High Contrast | `#000000` | `#ffffff` |

**Custom Colors:** Customize background, text, headings, and links with color pickers. Individual reset buttons (↺) for each color, or **"Reset All to Default"** to restore all styles.

---

## 📊 Statistics & Cache

Click **📊 Stats** to view:
- Total saves, this month's count
- Breakdown by format (PDF, EPUB, FB2, Markdown, Audio)
- Recent history with links to original articles (last 50 saves)
  - Click link to open original article
  - Click ✕ button to delete individual history entry
  - Shows format, domain, processing time, and date
- Cached domains for offline mode
- **Enable/Disable Statistics**: Toggle statistics collection on/off
- **Clear Statistics** button to reset all stats
- **Clear Cache** button to remove all cached selectors
- Individual domain deletion from cache

## 📝 Summary Generation

Generate detailed AI summaries of any article or video:

1. Navigate to any article or YouTube/Vimeo video
2. Click **"Generate Summary"** button in popup
3. Summary generates in background (you can close popup)
4. When ready, summary appears with options to:
   - **Copy** to clipboard
   - **Download** as Markdown file
   - **Expand/Collapse** to view full text
   - **Close** to hide summary

**Features:**
- Works with articles and YouTube/Vimeo videos
- Continues generating even if popup is closed
- Detailed summaries with key ideas, concepts, examples, and conclusions
- Formatted text with headings, lists, and links
- Automatically saved — persists until you close it

**Note:** Summary generation is separate from document export. Use it to quickly understand content without saving a full document.

### Offline Mode

ClipAIble caches AI-generated selectors by domain:
- **Second visit = instant** — no API call
- **Auto-invalidation** — clears if extraction fails
- **Manual control** — delete individual domains
- **Independent settings**:
  - **Use cached selectors**: Skip page analysis if cache exists (faster)
  - **Enable caching**: Save new selectors to cache after extraction
  - Both settings work independently for flexible control

---

## 💾 Import/Export Settings

**⚙️ Settings** → **Import/Export**

- Export all settings (API keys excluded for security)
- Optional: include statistics and cache
- Import with merge or overwrite options

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Empty content | Try **AI Extract** mode |
| Invalid API key | Check key format (sk-..., AIza..., sk-ant-...) |
| Images missing | Some sites block cross-origin; small images filtered |
| Audio slow | Long articles split into chunks; watch progress bar |
| Summary not generating | Check API key, ensure page content is loaded, try again |
| Summary generation timeout | Very long articles may take up to 45 minutes; wait or try with shorter content |

---

## 🏗️ Architecture

```
clipaible/
├── manifest.json       # Extension config
├── popup/              # UI (HTML, CSS, JS)
│   ├── popup.js       # Main orchestration (2670 lines)
│   ├── core.js        # Business logic (1459 lines)
│   ├── handlers.js    # Event handlers (1567 lines)
│   ├── ui.js          # UI management
│   ├── stats.js       # Statistics display
│   └── settings.js    # Settings management
├── scripts/
│   ├── background.js   # Service worker (2635 lines)
│   ├── content.js      # Content script for YouTube
│   ├── locales.js      # UI localization (11 languages)
│   ├── message-handlers/ # Message handler modules (v3.0.3)
│   │   ├── index.js    # Message router
│   │   ├── utils.js    # Handler utilities
│   │   ├── simple.js   # Simple handlers
│   │   ├── stats.js    # Statistics handlers
│   │   ├── cache.js    # Cache handlers
│   │   ├── settings.js # Settings handlers
│   │   ├── processing.js # Processing handlers
│   │   ├── video.js    # Video/subtitle handlers
│   │   ├── summary.js  # Summary generation helper
│   │   └── complex.js  # Complex handlers
│   ├── api/            # AI & TTS providers
│   │   ├── openai.js   # OpenAI (GPT models)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # TTS router
│   │   └── index.js    # API router
│   ├── extraction/     # Content extraction
│   │   ├── prompts.js  # AI prompts
│   │   ├── html-utils.js # HTML utilities
│   │   ├── video-subtitles.js # YouTube/Vimeo subtitle extraction
│   │   └── video-processor.js # AI subtitle processing
│   ├── translation/    # Translation & language detection
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Selector caching
│   ├── stats/          # Usage statistics
│   ├── settings/       # Settings import/export
│   ├── state/          # Processing state management
│   └── utils/          # Config, encryption, helpers
│       ├── video.js    # Video platform detection
│       ├── validation.js # Validation utilities
│       └── api-error-handler.js # Common API error handling
├── print/              # PDF rendering
├── config/             # Styles
├── lib/                # JSZip
├── docs/               # Localized README files
└── memory-bank/        # Project documentation
```

---

## 🔐 Security & Privacy

- **Encryption**: AES-256-GCM via Web Crypto API
- **Key derivation**: PBKDF2, 100,000 iterations
- **No tracking**: No analytics, no remote logging
- **Local only**: All data stays in your browser

---

## 📋 Permissions

ClipAIble requires the following permissions to function. All permissions are used only for the stated purposes:

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current page to extract content when you click the extension icon or use the context menu. The extension only accesses the tab you're currently viewing. |
| `storage` | Save your settings (API keys, style preferences, language selection) and statistics locally in your browser. Your data never leaves your device. |
| `scripting` | Inject the content extraction script into web pages. This script finds and extracts the article content (text, images, headings) from the page DOM. |
| `downloads` | Save the generated files (PDF, EPUB, FB2, Markdown, Audio) to your computer. Without this permission, the extension cannot download files. |
| `debugger` | **PDF generation only** - Uses Chrome's built-in print-to-PDF functionality to generate high-quality PDFs with proper page layout and styling. The debugger is attached only during PDF generation and immediately detached after completion. This is the only way to generate PDFs with custom styling in Chrome extensions. |
| `alarms` | Keep the background service worker alive during long operations (large articles, translation). Chrome's Manifest V3 suspends service workers after 30 seconds, but article processing can take several minutes. Uses unified keep-alive mechanism (alarm every 1 minute + state save every 2 seconds) per MV3 rules. |
| `contextMenus` | Add "Save with ClipAIble" options (PDF/EPUB/FB2/MD/Audio) to the right-click context menu on web pages. |
| `notifications` | Show desktop notifications when using the context menu "Save" feature. Notifies you if there's an error (e.g., missing API key). |
| `unlimitedStorage` | Store selector cache and temporary print data locally. This enables faster repeat extractions without calling AI again (offline mode). |

### Host Permissions

| Permission | Why |
|------------|-----|
| `<all_urls>` | Extract content from any website you visit. The extension needs to: 1) Read the page HTML to find article content, 2) Download images embedded in articles, 3) Make API calls to AI/TTS providers (OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher). The extension only accesses pages you explicitly save - it does not browse the web on its own. |

**Security Note:** All API keys are encrypted using AES-256-GCM and stored locally only. Keys are never exported or transmitted to any server except the AI providers you configure.

See [PERMISSIONS.md](PERMISSIONS.md) for more details.

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feature/cool-thing`
3. Commit: `git commit -m 'Add cool thing'`
4. Push: `git push origin feature/cool-thing`
5. Open Pull Request

---

## 📜 License

MIT License — see [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — Clip it. Read it. Listen to it. Anywhere.
</p>

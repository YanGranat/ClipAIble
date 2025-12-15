# ✂️ ClipAIble

> **AI-Powered Article Extractor** — Clip any article from the web and save it as PDF, EPUB, FB2, Markdown, or Audio. Translate to 11 languages. Works on any website.

**🌍 Translations:** [Русский](docs/README.ru.md) | [Українська](docs/README.ua.md) | [Deutsch](docs/README.de.md) | [Français](docs/README.fr.md) | [Español](docs/README.es.md) | [Italiano](docs/README.it.md) | [Português](docs/README.pt.md) | [中文](docs/README.zh.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md)

![Version](https://img.shields.io/badge/version-2.9.0-blue)
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
- 🎧 **Audio (MP3/WAV)** — Listen with AI-powered narration

All formats support **translation to 11 languages** — even translating text on images!

---

## 🚀 Features

### 🤖 AI-Powered Extraction
- **Two modes**: AI Selector (fast, reusable) and AI Extract (thorough)
- **Multiple providers**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Video support**: Extract subtitles from YouTube/Vimeo videos and convert to articles (v2.9.0)
- **Smart detection**: Finds main article content, removes unnecessary elements automatically
- **Preserves structure**: Headings, images, code blocks, tables, footnotes

### 🎧 Audio Export
- **5 TTS providers**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ voices**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (English & Ukrainian)
- **Speed adjustment**: 0.5x to 2.0x (OpenAI/ElevenLabs only)
- **Multi-language pronunciation**: Correct pronunciation for each language
- **Ukrainian language support**: Dedicated Ukrainian voices via Respeecher
- **Smart text cleanup**: AI removes URLs, code, and non-speech content

### 🌍 Translation
- **11 languages**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Smart detection**: Skips translation if article already in target language
- **Image translation**: Translates text on images (via Gemini)
- **Localized metadata**: Dates and labels adapt to language

### 🎨 PDF Customization
- **4 presets**: Dark, Light, Sepia, High Contrast
- **Customizable colors**: Background, text, headings, links
- **11 fonts** to choose from
- **Page modes**: Single continuous page or multi-page A4 format


### ⚡ Smart Features
- **Video support**: Extract subtitles from YouTube/Vimeo and convert to articles (v2.9.0)
- **Audio transcription**: Automatic transcription when subtitles unavailable (gpt-4o-transcribe)
- **Offline mode**: Selector caching — no AI needed for repeat visits
- **Statistics**: Track number of saves, view history
- **Table of Contents**: Auto-generated from headings
- **Abstract**: AI-written 2-3 paragraph summary
- **Context menu**: Right-click → "Save article as PDF"
- **Cancel anytime**: Stop processing with one click

### 🔒 Security
- **API keys encrypted** with AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Keys never exported** — excluded from settings backup
- **All data stored locally** — nothing sent to third parties

---

## ⚠️ Known Limitations

### File Formats
- **WAV format** (Qwen/Respeecher): Files can be very large (10-50MB+ for long articles). Consider using MP3 format for smaller file sizes.
- **Character limits**: 
  - Qwen TTS: 600 characters per chunk
  - Respeecher TTS: 450 characters per chunk
  - Text is automatically split intelligently at sentence/word boundaries

### Technical Constraints
- **Keep-alive requirement**: Chrome MV3 requires keep-alive interval of at least 1 minute. Long processing tasks may take several minutes.
- **CORS for images**: Some images may fail to load if the website blocks cross-origin requests. The extension will skip these images.
- **Cancel not instant**: Cancellation may take a few seconds to fully stop all background processes.

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

> **Tip:** Gemini also enables image text translation feature.

### Anthropic Claude

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys**
4. Click **"Create Key"**
5. Copy the key (starts with `sk-ant-...`)
6. Add credits at **Plans & Billing**

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
| **OpenAI** | General use, Audio export, Video transcription | ✅ | ❌ |
| **Gemini** | Fast extraction, Image translation, Audio export (30 voices) | ✅ | ✅ |
| **Claude** | Long articles, Complex pages | ❌ | ❌ |
| **Grok** | Fast reasoning tasks | ❌ | ❌ |
| **OpenRouter** | Access to multiple models | ❌ | ❌ |
| **Qwen** | Audio export (49 voices, Russian support) | ✅ | ❌ |
| **Respeecher** | Audio export (Ukrainian language) | ✅ | ❌ |

**Recommendation:** Start with OpenAI to get all features (extraction + audio). Use Respeecher for Ukrainian text.

---

## 🎯 Quick Start

1. Click the **ClipAIble** icon in toolbar
2. Enter your API key → **Save Keys**
3. Navigate to any article
4. Click **Save as PDF** (or choose another format)
5. Done! File downloads automatically

**Tip:** Right-click anywhere → **"Save article as PDF"**

---

## ⚙️ Settings

### Extraction Modes

| Mode | Speed | Best For |
|------|-------|----------|
| **AI Selector** | ⚡ Fast | Most sites, blogs, news |
| **AI Extract** | 🐢 Thorough | Complex pages, Notion, SPAs |

### AI Models

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | GPT-5.2 | Latest, medium reasoning |
| OpenAI | GPT-5.2-high | Enhanced, high reasoning |
| OpenAI | GPT-5.1 | Balanced |
| OpenAI | GPT-5.1 (high) | Best quality |
| Anthropic | Claude Sonnet 4.5 | Great for long articles |
| Google | Gemini 3 Pro | Fast |
| Grok | Grok 4.1 Fast Reasoning | Fast reasoning |

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

---

## 📊 Statistics & Cache

Click **📊 Stats** to view:
- Total saves, this month's count
- Breakdown by format
- Recent history with links
- Cached domains for offline mode

### Offline Mode

ClipAIble caches AI-generated selectors by domain:
- **Second visit = instant** — no API call
- **Auto-invalidation** — clears if extraction fails
- **Manual control** — delete individual domains

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

---

## 🏗️ Architecture

```
clipaible/
├── manifest.json       # Extension config
├── popup/              # UI (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── content.js      # Content script for YouTube
│   ├── locales.js      # UI localization (11 languages)
│   ├── api/            # AI & TTS providers
│   │   ├── openai.js   # OpenAI (GPT models)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # TTS router
│   │   └── index.js    # API router
│   ├── extraction/     # Content extraction
│   │   ├── prompts.js  # AI prompts
│   │   ├── html-utils.js # HTML utilities
│   │   ├── video-subtitles.js # YouTube/Vimeo subtitles
│   │   └── video-processor.js # AI subtitle processing
│   ├── translation/    # Translation & language detection
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Selector caching
│   ├── stats/          # Usage statistics
│   ├── settings/       # Settings import/export
│   ├── state/          # Processing state management
│   └── utils/          # Config, encryption, helpers
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
| `alarms` | Keep the background service worker alive during long operations (large articles, translation). Chrome's Manifest V3 suspends service workers after 30 seconds, but article processing can take several minutes. Interval is set to ≥1 minute per MV3 rules. |
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

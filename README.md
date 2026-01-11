# ✂️ ClipAIble

> **AI-Powered Article Extractor** — Clip any article from the web and save it as PDF, EPUB, FB2, Markdown, or Audio. Translate to 11 languages. Works on any website.

**🌍 Translations:** [Русский](docs/README.ru.md) | [Українська](docs/README.ua.md) | [Deutsch](docs/README.de.md) | [Français](docs/README.fr.md) | [Español](docs/README.es.md) | [Italiano](docs/README.it.md) | [Português](docs/README.pt.md) | [中文](docs/README.zh.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md)

![Version](https://img.shields.io/badge/version-3.3.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

**[⬇️ Install from Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ What is ClipAIble?

ClipAIble intelligently extracts article content from any webpage — removing ads, navigation, popups, and clutter. Works with or without AI (Automatic mode requires no API keys). Then it exports to your preferred format:

- 📄 **PDF** — Beautiful styling with customization options
- 📚 **EPUB** — Compatible with Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatible with PocketBook, FBReader
- 📝 **Markdown** — Plain text format for notes
- 🎧 **Audio** — Listen with AI-powered narration

All formats support **translation to 11 languages** — even translating text on images!

---

## 🚀 Features

### 🤖 AI-Powered Extraction
- **Two modes**: Automatic (no AI, fast), AI Selector (fast, reusable)
- **Automatic mode**: Create documents without AI — no API keys required, instant extraction
- **Multiple providers**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, DeepSeek, OpenRouter
- **PDF content extraction** (v3.3.0): Extract content from PDF files using PDF.js library
  - Experimental feature with complex multi-level classification system
  - Extracts text, images, structure, and metadata from PDF files
  - Supports both web and local PDF files
  - Handles multi-column layouts, tables, headings, lists, cross-page merging
  - Note: Feature is experimental and may have limitations with complex PDFs (scanned PDFs, password-protected PDFs)
- **Video support**: Extract subtitles from YouTube/Vimeo videos and convert to articles
  - Multiple extraction methods with fallbacks
  - Priority: manual subtitles > auto-generated > translated
  - AI processing: removes timestamps, merges paragraphs, fixes errors
- **Smart detection**: Finds main article content, removes unnecessary elements automatically
- **Preserves structure**: Headings, images, code blocks, tables

### 🎧 Audio Export
- **6 TTS providers**: OpenAI TTS (`gpt-4o-mini-tts`), ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash (`qwen3-tts-flash-2025-11-27`), Respeecher, Piper TTS (offline)
- **Speed adjustment**: 0.25x to 4.0x (OpenAI/ElevenLabs only; Google/Qwen/Respeecher/Piper TTS (offline) use fixed speed)
- **Format support**: MP3 (OpenAI/ElevenLabs) or WAV (Google/Qwen/Respeecher/Piper TTS (offline))
- **Multi-language pronunciation**: Correct pronunciation for each language
- **Ukrainian language support**: Dedicated Ukrainian voices via Respeecher
- **Piper TTS (offline)**: Works completely offline, no API keys required, multiple voices across 8 languages (English, Russian, German, French, Spanish, Italian, Portuguese, Chinese)
- **Smart text cleanup**: AI removes URLs, code, and non-speech content
- **Provider-specific features**: Model selection, format options, and advanced settings available for each provider

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
- **PDF content extraction** (v3.3.0): Extract content from PDF files and convert to articles
  - Uses PDF.js library for parsing in offscreen document
  - Complex multi-level classification system for accurate extraction
  - Supports both web and local PDF files
  - Full pipeline integration: translation, TOC, abstract, all export formats
  - Note: Experimental feature, may have limitations with complex PDFs
- **Video support**: Extract subtitles from YouTube/Vimeo and convert to articles
  - Direct subtitle extraction (no API keys required from YouTube/Vimeo)
  - AI processing: removes timestamps, merges paragraphs, fixes errors
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
- **WAV format** (Google/Qwen/Respeecher): Files can be very large for long articles. MP3 format (OpenAI/ElevenLabs) provides smaller file sizes.
- **Text splitting**: Long articles are automatically split intelligently at sentence/word boundaries
- **PDF extraction limitations** (v3.3.0): 
  - Scanned PDFs (no text layer) are not supported — OCR is not available yet
  - Password-protected PDFs must be unlocked before extraction
  - Very large PDFs (>100MB) may fail due to memory constraints
  - Complex layouts (multi-column, tables) are extracted but may require manual review

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
- (Optional) API key from at least one provider for AI modes (see below)
  - **Note**: Automatic mode works without any API keys!

---

## 🔑 Getting API Keys

> **💡 Tip**: You can use ClipAIble without any API keys! Automatic mode works instantly using local algorithms. API keys are only needed for AI-powered features (translation, abstract generation, AI Selector mode).
> 
> **💡 Tip**: Piper TTS (offline) - Generate audio completely offline across 8 languages, no API keys required!

### OpenAI (GPT models + Audio)

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** (left menu) or go directly to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Click **"Create new secret key"**
5. Copy the key (starts with `sk-...`)
6. Add billing at **Settings → Billing** (required for API usage)

> **Note:** OpenAI key is required for Audio export (TTS). Uses `gpt-4o-mini-tts` model. Other formats work with any provider.

### Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with Google account
3. Click **"Get API key"** or go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Click **"Create API key"**
5. Copy the key (starts with `AIza...`)

> **Tip:** Gemini also enables image text translation feature and Google Gemini 2.5 TTS. For TTS, you can use the same Gemini API key or set a dedicated Google TTS API key. Requires Generative Language API enabled in Google Cloud Console.

### Anthropic Claude

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys**
4. Click **"Create Key"**
5. Copy the key (starts with `sk-ant-...`)
6. Add credits at **Plans & Billing**

### DeepSeek

1. Go to [platform.deepseek.com](https://platform.deepseek.com/)
2. Sign up or log in
3. Navigate to **API Keys** or go to [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. Click **"Create API key"**
5. Copy the key (starts with `sk-...`)

> **Note:** DeepSeek provides DeepSeek-V3.2 models with thinking and non-thinking modes.

### ElevenLabs (Audio)

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up or log in
3. Navigate to **Profile** → **API Keys**
4. Create an API key
5. Copy the key

> **Note:** ElevenLabs provides high-quality TTS with speed control and format selection.

### Google Gemini 2.5 TTS (Audio)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with Google account
3. Click **"Get API key"** or go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Click **"Create API key"**
5. Copy the key (starts with `AIza...`)
6. Enable **Generative Language API** in [Google Cloud Console](https://console.cloud.google.com/)
7. (Optional) Enable billing if required for your model

> **Note:** Google Gemini 2.5 TTS. You can use the same Gemini API key or set a dedicated Google TTS API key.

### Qwen3-TTS-Flash (Audio)

1. Go to [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Sign up or log in
3. Navigate to **API Keys** or **Model Studio**
4. Create an API key
5. Copy the key (starts with `sk-...`)

> **Note:** Qwen3-TTS-Flash includes a dedicated Russian voice (Alek).

### Respeecher (Audio - English & Ukrainian)

1. Go to [Respeecher Space](https://space.respeecher.com/)
2. Sign up or log in
3. Navigate to **API Keys**
4. Create an API key
5. Copy the key

> **Note:** Respeecher supports English and Ukrainian languages with dedicated Ukrainian voices.

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
| **Automatic** | ⚡⚡ Instant | Simple articles, no API key needed |
| **AI Selector** | ⚡ Fast | Most sites, blogs, news |



### Style Presets (PDF)

4 presets available: Dark, Light, Sepia, High Contrast. Customize colors for background, text, headings, and links.

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
| Empty content | Try **AI Selector** mode |
| Invalid API key | Check key format (sk-..., AIza..., sk-ant-...) |
| Images missing | Some sites block cross-origin; small images filtered |
| Audio slow | Long articles split into chunks; watch progress bar |
| Summary not generating | Check API key, ensure page content is loaded, try again |
| Summary generation timeout | Very long articles may take up to 45 minutes; wait or try with shorter content |
| PDF extraction fails | Check if PDF is password-protected (unlock first) or scanned (OCR not supported). Try with simpler PDFs first. |
| PDF content incomplete | Complex layouts (multi-column, tables) may require manual review. Feature is experimental. |

---

---

## 🔐 Security & Privacy

- **Encryption**: API keys encrypted with industry-standard encryption
- **No tracking**: No analytics, no remote logging
- **Local only**: All data stays in your browser

---

## 📋 Permissions

ClipAIble requires permissions to:
- Read the current page to extract content
- Save your settings and generated files locally
- Make API calls to AI/TTS providers you configure
- Access websites only when you explicitly save them

**Security Note:** All API keys are encrypted and stored locally only. Keys are never exported or transmitted to any server except the AI providers you configure.

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

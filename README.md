# ✂️ ClipAIble

> **AI-Powered Article Extractor** — Clip any article from the web and save it as PDF, EPUB, FB2, Markdown, or Audio. Translate to 11 languages. Works on any website.

![Version](https://img.shields.io/badge/version-2.7.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

---

## ✨ What is ClipAIble?

ClipAIble uses AI to intelligently extract article content from any webpage — removing ads, navigation, popups, and clutter. Then it exports to your preferred format:

- 📄 **PDF** — Beautiful, customizable styling
- 📚 **EPUB** — For Kindle, Kobo, Apple Books
- 📖 **FB2** — For PocketBook, FBReader
- 📝 **Markdown** — Plain text for notes
- 🎧 **Audio (MP3)** — Listen with AI narration

All formats support **translation to 11 languages** — even translating text on images!

---

## 🚀 Features

### 🤖 AI-Powered Extraction
- **Two modes**: AI Selector (fast, reusable) and AI Extract (thorough)
- **Multi-provider**: OpenAI GPT, Google Gemini, Anthropic Claude
- **Smart detection**: Finds article body, removes junk automatically
- **Preserves structure**: Headings, images, code blocks, tables, footnotes

### 🎧 Audio Export
- **2 TTS providers**: OpenAI TTS and ElevenLabs
- **20+ voices**: 11 OpenAI voices + 9 ElevenLabs voices
- **Speed control**: 0.5x to 2.0x
- **Multi-language pronunciation**: Correct accent for each language
- **Smart text cleanup**: AI removes URLs, code, and non-speech content

### 🌍 Translation
- **11 languages**: EN, RU, UK, DE, FR, ES, IT, PT, ZH, JA, KO
- **Smart detection**: Skips if article already in target language
- **Image translation**: Translates text on images (via Gemini)
- **Localized metadata**: Dates and labels adapt to language

### 🎨 PDF Customization
- **4 presets**: Dark, Light, Sepia, High Contrast
- **Custom colors**: Background, text, headings, links
- **11 fonts** to choose from
- **Page modes**: Single continuous or multi-page A4

### ⚡ Smart Features
- **Offline mode**: Cached selectors — no AI needed for repeat sites
- **Statistics**: Track saves, view history
- **Table of Contents**: Auto-generated from headings
- **Abstract**: AI-written 2-3 paragraph summary
- **Context menu**: Right-click → "Save article as PDF"
- **Cancel anytime**: Stop processing with one click

### 🔒 Security
- **API keys encrypted** with AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs)
- **Keys never exported** — excluded from settings backup
- **All data local** — nothing sent to third parties

---

## 📦 Installation

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

### Which to choose?

| Provider | Best For | Audio | Image Translation |
|----------|----------|-------|-------------------|
| **OpenAI** | General use, Audio export | ✅ | ❌ |
| **Gemini** | Fast extraction, Image translation | ❌ | ✅ |
| **Claude** | Long articles, Complex pages | ❌ | ❌ |

**Recommendation:** Start with OpenAI for full features (extraction + audio).

---

## 🎯 Quick Start

1. Click the **ClipAIble** icon in toolbar
2. Enter your API key → **Save Keys**
3. Navigate to any article
4. Click **Save as PDF** (or choose another format)
5. Done! File downloads automatically

**Pro tip:** Right-click anywhere → **"Save article as PDF"**

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
| OpenAI | GPT-5.1 | Balanced |
| OpenAI | GPT-5.1 (high) | Best quality |
| Anthropic | Claude Sonnet 4.5 | Great for long articles |
| Google | Gemini 3 Pro | Fast |

### Audio Voices

| Voice | Style |
|-------|-------|
| nova | Female, warm |
| alloy | Neutral |
| echo | Male |
| fable | Expressive |
| onyx | Male, deep |
| shimmer | Female, clear |
| coral | Female, friendly |
| sage | Neutral, calm |
| ash | Male, authoritative |
| ballad | Dramatic |
| verse | Rhythmic |

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
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # Content extraction
│   ├── translation/    # Translation & language detection
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Selector caching
│   ├── stats/          # Usage statistics
│   └── utils/          # Config, encryption, helpers
├── print/              # PDF rendering
├── config/             # Styles
└── lib/                # JSZip
```

---

## 🔐 Security & Privacy

- **Encryption**: AES-256-GCM via Web Crypto API
- **Key derivation**: PBKDF2, 100,000 iterations
- **No tracking**: Zero analytics, zero remote logging
- **Local only**: All data stays in your browser

---

## 📋 Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read article from current tab |
| `storage` | Save settings locally |
| `scripting` | Inject extraction script |
| `downloads` | Save generated files |
| `debugger` | Generate PDFs via Chrome print API |
| `alarms` | Keep worker alive during long tasks |
| `contextMenus` | Right-click menu |

See [PERMISSIONS.md](PERMISSIONS.md) for details.

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

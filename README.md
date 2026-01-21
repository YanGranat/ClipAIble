# ClipAIble

AI-powered article extractor. Works on any website.

## What it does

ClipAIble extracts article content from web pages and converts it to different formats:
- PDF documents
- EPUB files
- FB2 files
- Markdown text
- Audio files

**Special features:**
- **YouTube/Vimeo support**: Extracts video subtitles and creates articles from them
- **PDF processing**: Works with online PDFs and local PDF files
- **Content translation**: Translate articles to 11 languages
- **Image translation**: Translate text on images using AI
- **TLDR generation**: Creates brief summaries within documents
- **Summary panel**: Shows article summaries in the popup after processing

## Installation

Install from [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflolc).

## How to use

1. Click the ClipAIble icon in your browser toolbar
2. Open any article, YouTube video, or PDF
3. Select the format you want (PDF, EPUB, FB2, Markdown, or Audio)
4. Click save

**Alternative ways to save:**
- Right-click on any webpage and use the context menu options

**For local PDF files**: In AI modes, you'll be prompted to select the PDF file due to browser restrictions.

## Settings

### Extraction modes

- **AI Selector**: Recommended mode for most sites. Uses AI to find article content.
- **Automatic**: Basic mode that works without API keys.
- **AI Extractor**: Alternative AI mode (not recommended for regular use).

### Performance features

- **Selector caching**: Speeds up processing of previously visited sites by reusing AI-learned selectors

### Output formats

- **PDF**: Creates formatted documents with 4 preset styles (Dark, Light, Sepia, High Contrast) and customizable fonts/colors
- **EPUB**: Creates structured e-books for readers like Kindle
- **FB2**: Creates structured e-books for PocketBook and other readers
- **Markdown**: Preserves article structure with headings and lists
- **Audio**: Converts text to speech using 6 different TTS services

### Translation

Content can be translated to: English, Russian, Ukrainian, German, French, Spanish, Italian, Portuguese, Chinese, Japanese, Korean.

### Audio

Audio can be generated using different TTS providers:
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (English and Ukrainian only)
- Piper (offline, no API keys needed)

## API keys (optional)

For AI features, you can add API keys from these providers:

### OpenAI
Get key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Google Gemini
Get key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

For TTS, enable [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) in Google Cloud Console

### Anthropic Claude
Get key from [console.anthropic.com](https://console.anthropic.com/)

### DeepSeek
Get key from [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### ElevenLabs
Get key from [elevenlabs.io](https://elevenlabs.io/)

### Qwen
Get key from [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)

### Respeecher
Get key from [space.respeecher.com](https://space.respeecher.com/)

## Additional features

- **Statistics**: Track your saved articles with history and monthly counts
- **Settings import/export**: Backup and restore your preferences
- **11 language interface**: Switch between languages without restarting
- **Secure storage**: API keys are encrypted before saving

## Permissions

The extension needs these permissions to work:
- Read web pages you visit
- Save files to your computer
- Make API calls to AI providers (only when you use those features)

**Security**: API keys are encrypted before being stored in your browser.

---

ClipAIble extracts and converts web articles.
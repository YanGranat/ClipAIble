# Changelog

All notable changes to ClipAIble will be documented in this file.

## [3.0.0] - 2025-01-XX

### 🎉 Major Features

#### Video Support
- **YouTube/Vimeo subtitle extraction**: Extract subtitles from videos and convert them to articles
  - Direct subtitle extraction (no API keys required from YouTube/Vimeo)
  - Multiple extraction methods with fallbacks
  - Priority: manual subtitles > auto-generated > translated
  - AI processing: removes timestamps, merges paragraphs, fixes errors
  - Audio transcription fallback: automatic transcription when subtitles unavailable (gpt-4o-transcribe)
  - Full pipeline integration: translation, TOC, abstract, all export formats

#### Summary Generation
- **Detailed AI summaries**: Generate comprehensive summaries of any article or video
  - Click "Generate Summary" button to create detailed summary
  - Works with regular articles and YouTube/Vimeo videos
  - Continues generating even if popup is closed (runs in background)
  - Copy to clipboard or download as Markdown file
  - Expandable/collapsible display with formatted text
  - Detailed summaries with key ideas, concepts, examples, and conclusions

### ✨ Enhancements

- **Improved selector caching**: Independent settings for using and enabling cache
- **Enhanced fallback strategies**: 6 different strategies for reliable content extraction
- **Better error handling**: Improved error messages and recovery mechanisms
- **Performance improvements**: Optimized processing for large articles and videos

### 🔧 Technical Improvements

- **Code quality**: Comprehensive code review and improvements
- **Security**: Enhanced encryption and key management
- **Architecture**: Better modular structure and separation of concerns
- **Documentation**: Updated README and documentation files

### 📝 Documentation

- Updated all localized README files (11 languages)
- Added comprehensive code review report
- Improved feature documentation

---

## [2.7.0] - Previous Version

Previous stable release with core features:
- AI-powered article extraction
- Multiple export formats (PDF, EPUB, FB2, Markdown, Audio)
- Translation to 11 languages
- 5 TTS providers with 100+ voices
- PDF customization options
- Statistics and cache management

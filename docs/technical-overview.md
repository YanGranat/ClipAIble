# ClipAIble Technical Overview

## Architecture

ClipAIble is a Chrome extension built with Manifest V3 using native ES modules. The extension uses a service worker architecture with background processing and offscreen documents for heavy computations.

### Core Components

- **Background Service Worker** (`scripts/background.js`): Main coordinator using ES modules
- **Popup Interface** (`popup/`): User interface built with vanilla JavaScript
- **Content Scripts** (`scripts/content.js`): Injects into YouTube pages for subtitle extraction (matches: `*://*.youtube.com/*`)
- **Offscreen Documents** (`offscreen.html`): Handles PDF processing, offline TTS synthesis, and other DOM-dependent operations using WebAssembly

### Key Technologies

- **WebAssembly**: Used for Piper TTS offline voice synthesis
- **ONNX Runtime**: ML model inference for offline TTS
- **PDF.js**: PDF document parsing and text extraction
- **IndexedDB**: Fallback storage for large data exceeding chrome.storage limits
- **Web Crypto API**: AES-256-GCM encryption for API keys
- **Offscreen API**: Background DOM operations for PDF processing

## Data Flow

### Processing Pipeline

1. **Initialization**: Background service worker validates request parameters and API keys
2. **Content Detection**: Determines if page contains articles, videos, or PDFs
3. **Extraction**: Uses AI or heuristic methods to extract content based on selected mode
4. **Processing**: Applies translation, image processing, and formatting
5. **Generation**: Creates output document in requested format (PDF, EPUB, FB2, Markdown, or Audio)
6. **Download**: Triggers file download through Chrome downloads API

### State Management

Processing state is maintained through `scripts/state/processing.js` with the following stages:

- `STARTING`: Initialization
- `ANALYZING`: AI page structure analysis
- `EXTRACTING`: Content extraction
- `EXTRACTING_SUBTITLES`: YouTube subtitle extraction
- `PROCESSING_SUBTITLES`: Subtitle processing with AI
- `TRANSLATING`: Content translation
- `LOADING_IMAGES`: Image downloading and processing
- `GENERATING`: Document creation (PDF, EPUB, FB2, Markdown, or Audio)
- `COMPLETE`: Finalization

## API Integration

### AI Providers

The extension integrates with 6 AI providers through unified API interfaces:

- **OpenAI**: GPT models with streaming support
- **Claude**: Anthropic models with image processing
- **Gemini**: Google models with multimodal capabilities
- **Grok**: xAI models
- **OpenRouter**: Unified access to multiple providers
- **DeepSeek**: Chinese AI models

### TTS Providers

Audio generation supports 6 TTS services:

- **OpenAI TTS**: MP3 generation with voice customization and speed control (0.25x-4.0x)
- **ElevenLabs**: High-quality voices with advanced parameters and speed control (0.1x-2.0x)
- **Google Gemini**: WAV generation with voice styles (no speed control)
- **Qwen**: Chinese TTS service with language detection (no speed control)
- **Respeecher**: Specialized voices for English and Ukrainian with emotional parameters (no speed control)
- **Piper**: Offline WebAssembly-based TTS with speed control (0.5x-2.0x, supports 20+ languages)

## Content Processing

### Extraction Modes

- **AI Selector**: Uses AI to identify article content blocks and generate CSS selectors
- **Automatic**: Heuristic-based extraction without API calls (uses cached AI-generated selectors if available and reliable)
- **AI Extract**: Full AI processing with content restructuring and chunking for large pages

### Content Types

The system processes these content elements:

- `heading`: Headings with level 1-6 hierarchy
- `paragraph`: Text paragraphs with inline formatting
- `image`: Images with captions and alt text
- `code`: Code blocks with syntax highlighting
- `list`: Ordered and unordered lists
- `quote`: Blockquotes
- `table`: Tabular data
- `subtitle`: YouTube subtitle segments

### YouTube Processing

For YouTube pages, the extension:

1. Extracts video subtitles via content script
2. Sends subtitles to background for AI processing
3. Reconstructs article from processed subtitle content
4. Generates documents containing the reconstructed article

## Storage System

### chrome.storage.local

Primary storage with these limitations:
- 5MB per item, 10MB total (Chrome extension limits)
- Asynchronous access
- No complex queries
- No binary data support (must be JSON-serializable)

### IndexedDB Fallback

Used for large content exceeding storage limits:
- Asynchronous access
- No size limits
- Complex data structures support

### Encryption

API keys are encrypted using:
- AES-256-GCM encryption
- PBKDF2 key derivation
- Web Crypto API implementation

## Build System

### Entry Points

- `build-extraction.js`: Content extraction scripts
- `build-offscreen.js`: Offscreen document bundle
- `build-tts-worker.js`: Audio synthesis worker

### Bundling

Uses esbuild for:
- ES module bundling and minification
- Code splitting for workers
- Source map generation
- Tree shaking to reduce bundle size

## File Formats

### PDF Generation

Creates formatted documents using HTML/CSS rendering with:
- Custom fonts and colors from configurable stylesheets
- Single-page or multi-page A4 layout options
- Automatic table of contents generation
- Image embedding with fallback handling
- Print-optimized CSS for better formatting

### EPUB/FB2 Generation

Creates structured e-books with:
- Hierarchical table of contents
- Metadata embedding
- Image processing
- Chapter organization

### Markdown Generation

Produces plain text with:
- Heading hierarchy preservation
- List formatting
- Code block syntax highlighting
- Link preservation

### Audio Generation

Creates audio files using:
- Multiple TTS providers with unified API
- Voice selection and customization
- Speed control (varies by provider: OpenAI/ElevenLabs/Piper support it, others don't)
- Format support (MP3, WAV, depending on provider)
- Text preprocessing for better TTS results
- Chunked processing for long content

## Error Handling

### Error Codes

Standardized error codes:
- `AUTH_ERROR`: Invalid API keys
- `RATE_LIMIT`: API rate limiting
- `TIMEOUT`: Request timeouts
- `NETWORK_ERROR`: Connection failures
- `PARSE_ERROR`: JSON parsing issues
- `PROVIDER_ERROR`: Provider-specific errors
- `VALIDATION_ERROR`: Input validation failures
- `UNKNOWN_ERROR`: Unhandled errors

### Recovery Mechanisms

- Exponential backoff for API retries
- Automatic API key cache clearing on authentication errors
- IndexedDB fallback storage for large content
- Processing state restoration after service worker reloads
- Graceful degradation when features are unavailable

## Permissions

Required Chrome permissions:
- `activeTab`: Access current tab content
- `storage`: Local data storage
- `unlimitedStorage`: Large data handling
- `scripting`: Content script injection
- `downloads`: File download triggering
- `debugger`: PDF generation via Chrome DevTools Protocol
- `alarms`: Background task scheduling
- `notifications`: User notifications
- `contextMenus`: Right-click menu integration
- `offscreen`: Background DOM operations for PDF.js and offline TTS
- `webNavigation`: Navigation event monitoring

Host permissions: `<all_urls>` for universal content access.

## Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; base-uri 'self';"
}
```

Allows WebAssembly execution for offline TTS (Piper) and restricts external script loading.

## Web Accessible Resources

Provides access to:
- PDF.js library files
- Piper TTS WebAssembly modules
- ONNX Runtime for ML inference
- CSS stylesheets
- Worker scripts and TTS utilities
- Custom wrapper libraries

## Browser Compatibility

- Chrome 109+ (required for Offscreen API used in PDF processing and offline TTS)
- WebAssembly support required (for offline TTS)
- IndexedDB support required (for fallback storage)
- Web Crypto API support required (for API key encryption)
- Manifest V3 support required
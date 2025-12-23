# ClipAIble Unit Tests

Unit tests for ClipAIble Chrome Extension using Vitest.

## Setup

```bash
npm install
```

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── setup.js              # Test setup and Chrome API mocks
├── background/
│   ├── initialization.test.js # Background initialization tests (19 tests)
│   └── message-handlers.test.js # Message handler tests (15 tests)
├── utils/
│   ├── html.test.js      # HTML utility tests (46 tests)
│   ├── encryption.test.js # Encryption tests (17 tests)
│   ├── error-handler.test.js # Error handling tests (22 tests)
│   ├── validation.test.js # Validation tests (10 tests)
│   ├── config.test.js    # Config tests (25 tests)
│   ├── retry.test.js     # Retry utility tests (16 tests)
│   ├── security.test.js  # Security utility tests (53 tests)
│   └── pipeline-helpers.test.js # Pipeline helper tests (22 tests)
├── generation/
│   ├── markdown.test.js  # Markdown generation tests (12 tests)
│   ├── fb2.test.js       # FB2 generation tests (12 tests)
│   └── epub.test.js      # EPUB generation tests (12 tests)
├── translation/
│   ├── index.test.js     # Translation tests (18 tests)
│   ├── generation.test.js # Abstract/summary generation tests (17 tests)
│   └── detection.test.js # Language detection tests (10 tests)
├── api/
│   └── tts-queue.test.js # TTS queue tests (8 tests)
├── extraction/
│   └── modules/
│       ├── content-finder.test.js # Content finder tests (18 tests)
│       ├── element-filter.test.js # Element filter tests (13 tests)
│       ├── metadata-extractor.test.js # Metadata extractor tests (25 tests)
│       └── utils.test.js  # Extraction utility tests (7 tests)
└── state/
    └── processing.test.js # Processing state tests (27 tests)
```

## Test Coverage

Current test coverage includes critical modules and successfully tested features:

### Core Utilities
- **HTML Utilities** (`scripts/utils/html.js`) - 46 tests
  - Title cleaning functions
  - HTML sanitization
  - Entity decoding
  - Markdown conversion

- **Encryption** (`scripts/utils/encryption.js`) - 17 tests
  - API key encryption/decryption
  - Cache management
  - Auto-encryption

- **Error Handling** (`scripts/utils/error-handler.js`) - 22 tests
  - Error normalization
  - Error code detection
  - Pattern matching

- **Validation** (`scripts/utils/validation.js`) - 10 tests
  - Audio API key validation
  - Provider validation

- **Config** (`scripts/utils/config.js`) - 25 tests
  - Configuration constants
  - Date formatting
  - Localization

- **Retry** (`scripts/utils/retry.js`) - 16 tests
  - Retry logic with exponential backoff
  - Network error handling
  - Retry-After header support

- **Security** (`scripts/utils/security.js`) - 53 tests
  - URL validation
  - Prompt sanitization
  - XSS prevention

- **Pipeline Helpers** (`scripts/utils/pipeline-helpers.js`) - 22 tests
  - Cancellation checking
  - Progress updates
  - Translation handling
  - Abstract generation
  - Effective language detection

### Generation Modules
- **Markdown Generation** (`scripts/generation/markdown.js`) - 12 tests
  - Basic markdown generation
  - TOC generation
  - Metadata handling
  - Content type conversion

- **FB2 Generation** (`scripts/generation/fb2.js`) - 12 tests
  - XML structure generation
  - Image embedding
  - TOC generation
  - Metadata handling

- **EPUB Generation** (`scripts/generation/epub.js`) - 12 tests
  - ZIP structure creation
  - Image embedding
  - TOC generation
  - Metadata handling

### Translation Modules
- **Translation** (`scripts/translation/index.js`) - 18 tests
  - Text translation
  - Batch translation
  - Metadata translation
  - Language detection

- **Translation Generation** (`scripts/translation/generation.js`) - 17 tests
  - Abstract generation (OpenAI, Claude, Gemini)
  - Summary generation
  - Error handling
  - Content extraction

- **Language Detection** (`scripts/translation/detection.js`) - 10 tests
  - AI-based language detection
  - Offline fallback detection
  - Error handling
  - Text size limiting

### API Modules
- **TTS Queue** (`scripts/api/tts-queue.js`) - 8 tests
  - Sequential request processing
  - Error handling
  - Queue status tracking

### Extraction Modules
- **Content Finder** (`scripts/extraction/modules/content-finder.js`) - 18 tests
  - Content container detection
  - Content scoring
  - Substantial content detection

- **Element Filter** (`scripts/extraction/modules/element-filter.js`) - 13 tests
  - Element filtering logic

- **Metadata Extractor** (`scripts/extraction/modules/metadata-extractor.js`) - 25 tests
  - Metadata extraction

- **Extraction Utilities** (`scripts/extraction/modules/utils.js`) - 7 tests
  - URL normalization
  - Element detection
  - Image processing

### State Management
- **Processing State** (`scripts/state/processing.js`) - 27 tests
  - State updates
  - Progress tracking
  - Cancellation handling
  - Error handling

### Background Service Worker
- **Initialization** (`scripts/background.js` initialization) - 19 tests
  - Global error handlers
  - Chrome API event handler registration
  - Initialization sequence
  - Keep-alive mechanism
  - Notification creation
  - State restoration

- **Message Handlers** (`scripts/message-handlers/index.js`) - 15 tests
  - Message routing
  - Offscreen message passthrough
  - Handler error handling
  - Missing parameter handling

**Total: 424 tests, all passing** ✅

## Adding New Tests

1. Create test file in appropriate directory: `tests/module/path.test.js`
2. Import functions to test
3. Use Vitest's `describe` and `it` blocks
4. Mock Chrome APIs using `tests/setup.js` mocks

Example:

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../scripts/my-module.js';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction('input')).toBe('expected');
  });
});
```

## Mocking Chrome APIs

Chrome Extension APIs are mocked in `tests/setup.js`. To add new mocks:

```javascript
global.chrome.myApi = {
  method: vi.fn(() => Promise.resolve({}))
};
```

## Notes

- Tests run in Node.js environment (not browser)
- Chrome APIs are fully mocked
- Web Crypto API is mocked for encryption tests (actual encryption/decryption requires real API)
- Tests use ES modules (type: "module" in package.json)
- All tests pass successfully ✅

## Recent Improvements (v3.2.4+)

- ✅ Added tests for Markdown generation (12 tests)
- ✅ Added tests for FB2 generation (12 tests)
- ✅ Added tests for EPUB generation (12 tests)
- ✅ Added tests for translation generation (abstract/summary) (17 tests)
- ✅ Added tests for AI language detection (10 tests)
- ✅ Added tests for TTS queue (8 tests)
- ✅ Added tests for pipeline helpers (22 tests)
- ✅ Added tests for background.js initialization (19 tests)
- ✅ Added tests for message handlers (15 tests)
- ✅ Fixed all failing tests (14 → 0)
- ✅ Increased test count from 297 to 424 (+127 tests, +42.8%)

## Future Improvements

- Add tests for PDF generation (Chrome Debugger Protocol)
- Add tests for audio generation (TTS providers)
- Add tests for processing modes (getSelectorsFromAI, processWithoutAI)
- Add integration tests for critical workflows
- Increase coverage to 80%+

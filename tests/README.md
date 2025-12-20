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
├── utils/
│   ├── html.test.js      # HTML utility tests (46 tests)
│   ├── encryption.test.js # Encryption tests (17 tests)
│   ├── error-handler.test.js # Error handling tests (22 tests)
│   └── validation.test.js # Validation tests (10 tests)
└── extraction/
    └── modules/
        └── utils.test.js  # Extraction utility tests (7 tests)
```

## Test Coverage

Current test coverage focuses on critical modules:

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

- **Extraction Utilities** (`scripts/extraction/modules/utils.js`) - 7 tests
  - URL normalization
  - Element detection
  - Image processing

**Total: 102 tests, all passing**

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

## Future Improvements

- Add tests for generation modules (PDF, EPUB, FB2, Markdown)
- Add tests for translation module
- Add tests for extraction modules (content-finder, element-filter, etc.)
- Add integration tests for critical workflows
- Increase coverage to 80%+

// Tests for processing modes module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getSelectorsFromAI, 
  processWithSelectorMode,
  processWithExtractMode,
  processWithoutAI,
  extractContentWithSelectors
} from '../../scripts/processing/modes.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    RETRY_MAX_ATTEMPTS: 3,
    RETRY_DELAYS: [1000, 2000, 4000],
    RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504],
    CHUNK_SIZE: 50000,
    CHUNK_OVERLAP: 3000,
    MAX_HTML_FOR_ANALYSIS: 480000,
    EXTRACTION_AUTOMATIC_TIMEOUT: 30000,
    LOG_LEVEL: 1
  }
}));

vi.mock('../../scripts/state/processing.js', () => ({
  PROCESSING_STAGES: {
    ANALYZING: { id: 'analyzing', name: 'Analyzing' },
    EXTRACTING: { id: 'extracting', name: 'Extracting' }
  },
  updateState: vi.fn()
}));

vi.mock('../../scripts/api/index.js', () => ({
  callAI: vi.fn()
}));

vi.mock('../../scripts/utils/retry.js', () => ({
  callWithRetry: vi.fn(async (fn) => await fn())
}));

vi.mock('../../scripts/extraction/prompts.js', () => ({
  SELECTOR_SYSTEM_PROMPT: 'System prompt for selectors',
  EXTRACT_SYSTEM_PROMPT: 'System prompt for extract',
  buildSelectorUserPrompt: vi.fn((html, url, title) => `User prompt: ${url}`),
  buildChunkSystemPrompt: vi.fn((index, total) => `Chunk system prompt ${index}/${total}`),
  buildChunkUserPrompt: vi.fn((chunk, url, title, index, total) => `Chunk user prompt ${index}/${total}`)
}));

vi.mock('../../scripts/extraction/html-utils.js', () => ({
  splitHtmlIntoChunks: vi.fn((html, size, overlap) => [html]),
  deduplicateContent: vi.fn((content) => content),
  trimHtmlForAnalysis: vi.fn((html, maxSize) => html.substring(0, Math.min(html.length, maxSize)))
}));

vi.mock('../../scripts/utils/html.js', () => ({
  cleanTitleFromServiceTokens: vi.fn((title, original) => title)
}));

vi.mock('../../scripts/translation/index.js', () => ({
  detectLanguageByCharacters: vi.fn((text) => {
    if (/[а-яё]/i.test(text)) return 'ru';
    if (/[一-龠]/.test(text)) return 'zh';
    return 'en';
  })
}));

vi.mock('../../scripts/extraction/automatic.js', () => ({
  extractAutomaticallyInlined: vi.fn(() => ({
    title: 'Test Title',
    author: 'Test Author',
    content: [
      { type: 'heading', text: 'Heading 1', level: 1 },
      { type: 'paragraph', text: 'Paragraph text' }
    ],
    publishDate: '2024-01-01',
    detectedLanguage: 'en'
  }))
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(async () => 'en'),
  tSync: vi.fn((key, lang) => {
    const translations = {
      'errorNoHtmlContent': 'No HTML content',
      'errorTtsNoApiKey': 'No API key',
      'errorNoTabId': 'No tab ID',
      'errorTabIdRequired': 'Tab ID required',
      'errorHtmlTooLarge': 'HTML too large',
      'errorSelectorAnalysisFailed': 'Selector analysis failed: {error}',
      'errorAiEmptySelectors': 'AI returned empty selectors',
      'errorContentExtractionFailed': 'Content extraction failed: {error}',
      'errorNoContentExtracted': 'No content extracted',
      'errorContentEmpty': 'Content is empty',
      'errorExtractionTimeout': 'Extraction timeout after {seconds} seconds',
      'errorTabClosedDuringProcessing': 'Tab closed during processing',
      'errorExtractionEmptyResults': 'Extraction returned empty results',
      'errorExtractionError': 'Extraction error: {error}',
      'errorExtractionNoResult': 'Extraction returned no result',
      'errorExtractModeNoContent': 'Extract mode returned no content',
      'errorInvalidBaseUrl': 'Invalid base URL',
      'errorInvalidSelectors': 'Invalid selectors',
      'errorInvalidSelectorsExclude': 'Invalid selectors exclude',
      'errorScriptExecutionFailed': 'Script execution failed: {error}',
      'errorScriptEmptyResults': 'Script returned empty results',
      'errorScriptNoResult': 'Script returned no result',
      'statusExtractingContent': 'Extracting content',
      'statusUsingCachedSelectors': 'Using cached selectors',
      'stageAnalyzing': 'Analyzing',
      'statusExtractingFromPage': 'Extracting from page',
      'statusProcessingComplete': 'Processing complete',
      'statusProcessingChunk': 'Processing chunk {current}/{total}',
      'statusAnalyzingPage': 'Analyzing page'
    };
    return translations[key] || key;
  })
}));

vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: vi.fn(async () => {}),
  getUILanguageCached: vi.fn(async () => 'en'),
  updateProgress: vi.fn(async () => {})
}));

vi.mock('../../scripts/cache/selectors.js', () => ({
  getCachedSelectors: vi.fn(async () => null),
  cacheSelectors: vi.fn(async () => {}),
  markCacheSuccess: vi.fn(async () => {}),
  invalidateCache: vi.fn(async () => {})
}));

// Mock Chrome APIs
global.chrome = {
  scripting: {
    executeScript: vi.fn(() => Promise.resolve([]))
  },
  tabs: {
    get: vi.fn(() => Promise.resolve({ url: '', id: 0 }))
  },
  runtime: {
    lastError: null
  }
};

describe('processing/modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.chrome.runtime.lastError = null;
    // Reset Chrome API mocks to default behavior
    global.chrome.scripting.executeScript.mockReset();
    global.chrome.tabs.get.mockReset();
    // Set default return values
    global.chrome.scripting.executeScript.mockResolvedValue([]);
    global.chrome.tabs.get.mockResolvedValue({ url: '', id: 0 });
  });

  describe('getSelectorsFromAI', () => {
    it('should get selectors from AI successfully', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      const mockSelectors = {
        articleContainer: '.article',
        content: '.article-body',
        title: 'h1',
        author: 'Test Author',
        publishDate: '2024-01-01',
        exclude: ['.ad', '.comments']
      };
      
      callAI.mockResolvedValueOnce(mockSelectors);

      const result = await getSelectorsFromAI(
        '<html><body><article>Content</article></body></html>',
        'https://example.com',
        'Test Title',
        'test-api-key',
        'gpt-4'
      );

      expect(result).toEqual(mockSelectors);
      expect(callAI).toHaveBeenCalledWith(
        'System prompt for selectors',
        expect.stringContaining('https://example.com'),
        'test-api-key',
        'gpt-4',
        true
      );
    });

    it('should throw error if HTML is too large', async () => {
      const largeHtml = 'x'.repeat(50 * 1024 * 1024 + 1); // > 50MB
      
      await expect(
        getSelectorsFromAI(largeHtml, 'https://example.com', 'Title', 'key', 'gpt-4')
      ).rejects.toThrow('HTML too large');
    });

    it('should handle AI API errors', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      callAI.mockRejectedValueOnce(new Error('API error'));

      await expect(
        getSelectorsFromAI('<html>Content</html>', 'https://example.com', 'Title', 'key', 'gpt-4')
      ).rejects.toThrow('API error');
    });

    it('should use retry mechanism for API calls', async () => {
      const { callWithRetry } = await import('../../scripts/utils/retry.js');
      const { callAI } = await import('../../scripts/api/index.js');
      
      const mockSelectors = { articleContainer: '.article', content: '.content' };
      callAI.mockResolvedValueOnce(mockSelectors);

      await getSelectorsFromAI('<html>Content</html>', 'https://example.com', 'Title', 'key', 'gpt-4');

      expect(callWithRetry).toHaveBeenCalled();
    });
  });

  describe('processWithSelectorMode', () => {
    it('should process content with selector mode using cached selectors', async () => {
      const { getCachedSelectors } = await import('../../scripts/cache/selectors.js');
      const cachedSelectors = {
        articleContainer: '.article',
        content: '.article-body',
        title: 'h1'
      };
      
      getCachedSelectors.mockResolvedValueOnce({
        selectors: cachedSelectors,
        successCount: 1
      });

      const mockExtractResult = {
        title: 'Test Title',
        author: 'Test Author',
        content: [
          { type: 'heading', text: 'Heading', level: 1 },
          { type: 'paragraph', text: 'Content' }
        ],
        publishDate: '2024-01-01'
      };

      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockExtractResult
      }]);

      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      const extractFromPageInlined = vi.fn();

      const result = await processWithSelectorMode({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Test Title',
        apiKey: 'test-key',
        model: 'gpt-4',
        tabId: 1,
        useCache: true
      }, extractFromPageInlined);

      expect(result.title).toBe('Test Title');
      expect(result.content).toHaveLength(2);
      expect(getCachedSelectors).toHaveBeenCalledWith('https://example.com');
    });

    it('should process content with selector mode without cache', async () => {
      const { getCachedSelectors } = await import('../../scripts/cache/selectors.js');
      const { callAI } = await import('../../scripts/api/index.js');
      
      getCachedSelectors.mockResolvedValueOnce(null);

      const mockSelectors = {
        articleContainer: '.article',
        content: '.article-body',
        title: 'h1'
      };
      callAI.mockResolvedValueOnce(mockSelectors);

      const mockExtractResult = {
        title: 'Test Title',
        content: [
          { type: 'paragraph', text: 'Content' }
        ]
      };

      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockExtractResult
      }]);

      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      const extractFromPageInlined = vi.fn();

      const result = await processWithSelectorMode({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Test Title',
        apiKey: 'test-key',
        model: 'gpt-4',
        tabId: 1,
        useCache: false
      }, extractFromPageInlined);

      expect(result.title).toBe('Test Title');
      expect(callAI).toHaveBeenCalled();
    });

    it('should throw error if HTML is missing', async () => {
      await expect(
        processWithSelectorMode({
          html: '',
          url: 'https://example.com',
          title: 'Title',
          apiKey: 'key',
          model: 'gpt-4',
          tabId: 1
        }, vi.fn())
      ).rejects.toThrow('No HTML content');
    });

    it('should throw error if API key is missing', async () => {
      await expect(
        processWithSelectorMode({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          apiKey: '',
          model: 'gpt-4',
          tabId: 1
        }, vi.fn())
      ).rejects.toThrow('No API key');
    });

    it('should throw error if tabId is missing', async () => {
      await expect(
        processWithSelectorMode({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          apiKey: 'key',
          model: 'gpt-4',
          tabId: null
        }, vi.fn())
      ).rejects.toThrow('No tab ID');
    });

    it('should invalidate cache if extraction fails with cached selectors', async () => {
      const { getCachedSelectors, invalidateCache } = await import('../../scripts/cache/selectors.js');
      
      // Reset mock to track calls
      invalidateCache.mockClear();
      
      const cachedSelectors = { 
        articleContainer: '.article', 
        content: '.content',
        title: 'h1',
        author: '',
        publishDate: ''
      };
      getCachedSelectors.mockResolvedValueOnce({
        selectors: cachedSelectors,
        successCount: 1
      });

      // First call for URL verification in extractContentWithSelectors
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      // Make extractContentWithSelectors throw an error by returning result with error
      // This will cause extractContentWithSelectors to throw "Script error: Extraction failed"
      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: { error: 'Extraction failed' }
      }]);

      const extractFromPageInlined = vi.fn();

      await expect(
        processWithSelectorMode({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          apiKey: 'key',
          model: 'gpt-4',
          tabId: 1,
          useCache: true
        }, extractFromPageInlined)
      ).rejects.toThrow();

      // Verify cache was invalidated when extraction failed with cached selectors
      expect(invalidateCache).toHaveBeenCalledWith('https://example.com');
    });

    it('should cache selectors after successful extraction', async () => {
      const { getCachedSelectors, cacheSelectors } = await import('../../scripts/cache/selectors.js');
      const { callAI } = await import('../../scripts/api/index.js');
      
      getCachedSelectors.mockResolvedValueOnce(null);

      const mockSelectors = { 
        articleContainer: '.article', 
        content: '.content',
        title: 'h1',
        author: '',
        publishDate: ''
      };
      callAI.mockResolvedValueOnce(mockSelectors);

      // First call for URL verification in extractContentWithSelectors
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      const mockExtractResult = {
        title: 'Test Title',
        content: [{ type: 'paragraph', text: 'Content' }],
        publishDate: ''
      };

      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockExtractResult
      }]);

      const extractFromPageInlined = vi.fn();

      await processWithSelectorMode({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Title',
        apiKey: 'key',
        model: 'gpt-4',
        tabId: 1,
        useCache: false
      }, extractFromPageInlined);

      expect(cacheSelectors).toHaveBeenCalledWith('https://example.com', mockSelectors);
    });
  });

  describe('processWithExtractMode', () => {
    it('should process content with extract mode (single chunk)', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      const { splitHtmlIntoChunks } = await import('../../scripts/extraction/html-utils.js');
      
      splitHtmlIntoChunks.mockReturnValueOnce(['<html>Content</html>']);

      const mockResult = {
        title: 'Test Title',
        content: [
          { type: 'heading', text: 'Heading', level: 1 },
          { type: 'paragraph', text: 'Content' }
        ],
        publishDate: '2024-01-01'
      };
      callAI.mockResolvedValueOnce(mockResult);

      const result = await processWithExtractMode({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Test Title',
        apiKey: 'test-key',
        model: 'gpt-4'
      });

      expect(result.title).toBe('Test Title');
      expect(result.content).toHaveLength(2);
      expect(splitHtmlIntoChunks).toHaveBeenCalled();
    });

    it('should process content with extract mode (multiple chunks)', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      const { splitHtmlIntoChunks, deduplicateContent } = await import('../../scripts/extraction/html-utils.js');
      
      splitHtmlIntoChunks.mockReturnValueOnce([
        '<html>Chunk 1</html>',
        '<html>Chunk 2</html>'
      ]);

      const mockResult1 = {
        title: 'Test Title',
        content: [{ type: 'paragraph', text: 'Chunk 1 content' }],
        publishDate: '2024-01-01'
      };
      const mockResult2 = {
        content: [{ type: 'paragraph', text: 'Chunk 2 content' }]
      };
      
      callAI
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      deduplicateContent.mockImplementation((content) => content);

      const result = await processWithExtractMode({
        html: '<html>Long content</html>',
        url: 'https://example.com',
        title: 'Test Title',
        apiKey: 'test-key',
        model: 'gpt-4'
      });

      expect(result.title).toBe('Test Title');
      expect(callAI).toHaveBeenCalledTimes(2);
      expect(deduplicateContent).toHaveBeenCalled();
    });

    it('should throw error if HTML is missing', async () => {
      await expect(
        processWithExtractMode({
          html: '',
          url: 'https://example.com',
          title: 'Title',
          apiKey: 'key',
          model: 'gpt-4'
        })
      ).rejects.toThrow('No HTML content');
    });

    it('should throw error if API key is missing', async () => {
      await expect(
        processWithExtractMode({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          apiKey: '',
          model: 'gpt-4'
        })
      ).rejects.toThrow('No API key');
    });

    it('should throw error if no content extracted', async () => {
      const { callAI } = await import('../../scripts/api/index.js');
      const { splitHtmlIntoChunks } = await import('../../scripts/extraction/html-utils.js');
      
      splitHtmlIntoChunks.mockReturnValueOnce(['<html>Content</html>']);
      callAI.mockResolvedValueOnce({
        title: 'Test Title',
        content: []
      });

      await expect(
        processWithExtractMode({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          apiKey: 'key',
          model: 'gpt-4'
        })
      ).rejects.toThrow();
    });
  });

  describe('processWithoutAI', () => {
    it('should process content without AI (automatic mode)', async () => {
      const mockResult = {
        title: 'Test Title',
        author: 'Test Author',
        content: [
          { type: 'heading', text: 'Heading', level: 1 },
          { type: 'paragraph', text: 'Content' }
        ],
        publishDate: '2024-01-01',
        detectedLanguage: 'en'
      };
      
      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockResult
      }]);

      const result = await processWithoutAI({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Test Title',
        tabId: 1
      });

      expect(result.title).toBe('Test Title');
      expect(result.content).toHaveLength(2);
      expect(global.chrome.scripting.executeScript).toHaveBeenCalled();
    });

    it('should throw error if HTML is missing', async () => {
      await expect(
        processWithoutAI({
          html: '',
          url: 'https://example.com',
          title: 'Title',
          tabId: 1
        })
      ).rejects.toThrow('No HTML content');
    });

    it('should throw error if tabId is missing', async () => {
      await expect(
        processWithoutAI({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          tabId: null
        })
      ).rejects.toThrow('Tab ID required');
    });

    it('should handle tab closed error', async () => {
      const error = new Error('Tab closed');
      
      // Set lastError before mocking executeScript
      global.chrome.runtime.lastError = { message: 'No tab with id 1' };
      
      // Mock executeScript to reject
      global.chrome.scripting.executeScript.mockRejectedValueOnce(error);
      
      // Mock tabs.get to fail (for error handling check)
      global.chrome.tabs.get.mockRejectedValueOnce(new Error('Tab not found'));

      await expect(
        processWithoutAI({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          tabId: 1
        })
      ).rejects.toThrow('Tab closed during processing');
    });

    it('should handle extraction timeout', async () => {
      const { CONFIG } = await import('../../scripts/utils/config.js');
      
      // Use fake timers
      vi.useFakeTimers();
      
      // Mock script that never resolves
      let resolveTimeout;
      const timeoutPromise = new Promise((resolve) => {
        resolveTimeout = resolve;
      });
      
      global.chrome.scripting.executeScript.mockImplementationOnce(() => timeoutPromise);
      
      const promise = processWithoutAI({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Title',
        tabId: 1
      });

      // Advance timers to trigger timeout
      await vi.advanceTimersByTimeAsync(CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT + 1000);

      await expect(promise).rejects.toThrow();
      
      vi.useRealTimers();
    }, 10000);

    it('should detect language from content', async () => {
      const { detectLanguageByCharacters } = await import('../../scripts/translation/index.js');
      
      const mockResult = {
        title: 'Заголовок',
        content: [
          { type: 'paragraph', text: 'Русский текст для определения языка' }
        ],
        publishDate: '2024-01-01'
      };
      
      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockResult
      }]);

      detectLanguageByCharacters.mockReturnValueOnce('ru');

      const result = await processWithoutAI({
        html: '<html>Content</html>',
        url: 'https://example.com',
        title: 'Title',
        tabId: 1
      });

      expect(result.detectedLanguage).toBe('ru');
      expect(detectLanguageByCharacters).toHaveBeenCalled();
    });

    it('should throw error if extraction returns no content', async () => {
      const mockResult = {
        title: 'Test Title',
        content: []
      };
      
      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockResult
      }]);

      await expect(
        processWithoutAI({
          html: '<html>Content</html>',
          url: 'https://example.com',
          title: 'Title',
          tabId: 1
        })
      ).rejects.toThrow('no content');
    });
  });

  describe('extractContentWithSelectors', () => {
    it('should extract content with selectors successfully', async () => {
      const mockResult = {
        title: 'Test Title',
        author: 'Test Author',
        content: [
          { type: 'heading', text: 'Heading', level: 1 },
          { type: 'paragraph', text: 'Content' }
        ],
        publishDate: '2024-01-01'
      };

      // First call for URL verification
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockResult
      }]);

      const extractFromPageInlined = vi.fn();

      const result = await extractContentWithSelectors(
        1,
        { articleContainer: '.article', content: '.content' },
        'https://example.com',
        extractFromPageInlined
      );

      expect(result.title).toBe('Test Title');
      expect(result.content).toHaveLength(2);
      expect(global.chrome.scripting.executeScript).toHaveBeenCalled();
    });

    it('should throw error if tabId is missing', async () => {
      await expect(
        extractContentWithSelectors(
          null,
          { articleContainer: '.article' },
          'https://example.com',
          vi.fn()
        )
      ).rejects.toThrow('Tab ID required');
    });

    it('should throw error if baseUrl is invalid', async () => {
      await expect(
        extractContentWithSelectors(
          1,
          { articleContainer: '.article' },
          '',
          vi.fn()
        )
      ).rejects.toThrow('Invalid base URL');
    });

    it('should throw error if selectors are invalid', async () => {
      await expect(
        extractContentWithSelectors(
          1,
          null,
          'https://example.com',
          vi.fn()
        )
      ).rejects.toThrow('Invalid selectors');
    });

    it('should throw error if selectors.exclude is not an array', async () => {
      await expect(
        extractContentWithSelectors(
          1,
          { articleContainer: '.article', exclude: 'not-an-array' },
          'https://example.com',
          vi.fn()
        )
      ).rejects.toThrow('Invalid selectors exclude');
    });

    it('should handle tab closed error', async () => {
      const error = new Error('Tab closed');
      
      // First call to tabs.get succeeds (for URL verification)
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });
      
      // Set lastError before mocking executeScript
      global.chrome.runtime.lastError = { message: 'No tab with id 1' };
      
      // Mock executeScript to reject
      global.chrome.scripting.executeScript.mockRejectedValueOnce(error);
      
      // Second call to tabs.get fails (for error handling)
      global.chrome.tabs.get.mockRejectedValueOnce(new Error('Tab not found'));

      await expect(
        extractContentWithSelectors(
          1,
          { articleContainer: '.article' },
          'https://example.com',
          vi.fn()
        )
      ).rejects.toThrow('Tab closed during processing');
    });

    it('should handle script execution error', async () => {
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      // Mock result with error property
      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: { error: 'Script error message' }
      }]);

      await expect(
        extractContentWithSelectors(
          1,
          { articleContainer: '.article' },
          'https://example.com',
          vi.fn()
        )
      ).rejects.toThrow('Script error: Script error message');
    });

    it('should handle empty results', async () => {
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://example.com',
        id: 1
      });

      // Mock empty results array
      global.chrome.scripting.executeScript.mockResolvedValueOnce([]);

      await expect(
        extractContentWithSelectors(
          1,
          { articleContainer: '.article' },
          'https://example.com',
          vi.fn()
        )
      ).rejects.toThrow('Script returned empty results');
    });

    it('should log warning if tab URL mismatch', async () => {
      const { log } = await import('../../scripts/utils/logging.js');
      
      // First call for URL verification
      global.chrome.tabs.get.mockResolvedValueOnce({
        url: 'https://different.com',
        id: 1
      });

      const mockResult = {
        title: 'Test Title',
        content: [{ type: 'paragraph', text: 'Content' }]
      };

      global.chrome.scripting.executeScript.mockResolvedValueOnce([{
        result: mockResult
      }]);

      await extractContentWithSelectors(
        1,
        { articleContainer: '.article' },
        'https://example.com',
        vi.fn()
      );

      expect(log).toHaveBeenCalledWith(
        'Tab URL mismatch detected',
        expect.objectContaining({
          expectedUrl: 'https://example.com',
          actualUrl: 'https://different.com'
        })
      );
    });
  });
});


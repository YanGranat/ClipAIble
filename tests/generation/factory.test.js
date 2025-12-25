// Tests for DocumentGeneratorFactory

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';

// Mock all generation modules
vi.mock('../../scripts/generation/pdf.js', () => ({
  generatePdf: vi.fn(async (data, updateState) => {
    return new Blob(['PDF content'], { type: 'application/pdf' });
  })
}));

vi.mock('../../scripts/generation/epub.js', () => ({
  generateEpub: vi.fn(async (data, updateState) => {
    return new Blob(['EPUB content'], { type: 'application/epub+zip' });
  })
}));

vi.mock('../../scripts/generation/fb2.js', () => ({
  generateFb2: vi.fn(async (data, updateState) => {
    return new Blob(['FB2 content'], { type: 'application/x-fictionbook+xml' });
  })
}));

vi.mock('../../scripts/generation/markdown.js', () => ({
  generateMarkdown: vi.fn(async (data, updateState) => {
    return 'Markdown content';
  })
}));

vi.mock('../../scripts/generation/audio.js', () => ({
  generateAudio: vi.fn(async (params, updateState) => {
    return new Blob(['Audio content'], { type: 'audio/mpeg' });
  })
}));

// Mock dependencies
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  updateProgress: vi.fn(async () => {})
}));

vi.mock('../../scripts/state/processing.js', () => ({
  PROCESSING_STAGES: {
    GENERATING: { id: 'generating', label: 'Generating...', order: 5 }
  }
}));

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logDebug: vi.fn()
}));

vi.mock('../../scripts/utils/api-key-manager.js', () => ({
  TTSApiKeyManager: {
    getDecryptedKey: vi.fn(async (provider, data) => {
      return 'test-tts-api-key';
    })
  }
}));

vi.mock('../../scripts/utils/voice-validator.js', () => ({
  VoiceValidator: {
    validate: vi.fn((provider, voice, googleVoice, defaultVoice) => {
      return voice || defaultVoice || 'nova';
    })
  }
}));

vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    DEFAULT_AUDIO_VOICE: 'nova',
    DEFAULT_AUDIO_SPEED: 1.0,
    DEFAULT_AUDIO_FORMAT: 'mp3',
    DEFAULT_ELEVENLABS_MODEL: 'eleven_v3'
  }
}));

describe('generation/factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DocumentGeneratorFactory.generate', () => {
    const mockData = {
      url: 'https://example.com/article',
      generateToc: false,
      generateAbstract: false,
      effectiveLanguage: 'en',
      apiKey: 'test-api-key',
      model: 'gpt-4'
    };

    const mockResult = {
      content: [
        { type: 'paragraph', text: 'Test content' }
      ],
      title: 'Test Article',
      author: 'Test Author',
      publishDate: '2025-12-23'
    };

    const mockUpdateState = vi.fn();

    it('should generate PDF by default', async () => {
      const { generatePdf } = await import('../../scripts/generation/pdf.js');
      
      await DocumentGeneratorFactory.generate('pdf', mockData, mockResult, mockUpdateState);

      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockResult.content,
          title: mockResult.title,
          author: mockResult.author,
          sourceUrl: mockData.url,
          publishDate: mockResult.publishDate,
          generateToc: false,
          generateAbstract: false,
          language: 'en'
        }),
        mockUpdateState
      );
    });

    it('should generate EPUB', async () => {
      const { generateEpub } = await import('../../scripts/generation/epub.js');
      
      await DocumentGeneratorFactory.generate('epub', mockData, mockResult, mockUpdateState);

      expect(generateEpub).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockResult.content,
          title: mockResult.title,
          author: mockResult.author,
          sourceUrl: mockData.url
        }),
        mockUpdateState
      );
    });

    it('should generate FB2', async () => {
      const { generateFb2 } = await import('../../scripts/generation/fb2.js');
      
      await DocumentGeneratorFactory.generate('fb2', mockData, mockResult, mockUpdateState);

      expect(generateFb2).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockResult.content,
          title: mockResult.title,
          author: mockResult.author,
          sourceUrl: mockData.url
        }),
        mockUpdateState
      );
    });

    it('should generate Markdown', async () => {
      const { generateMarkdown } = await import('../../scripts/generation/markdown.js');
      
      await DocumentGeneratorFactory.generate('markdown', mockData, mockResult, mockUpdateState);

      expect(generateMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockResult.content,
          title: mockResult.title,
          author: mockResult.author,
          sourceUrl: mockData.url,
          apiKey: mockData.apiKey,
          model: mockData.model
        }),
        mockUpdateState
      );
    });

    it('should generate Audio with OpenAI provider', async () => {
      const { generateAudio } = await import('../../scripts/generation/audio.js');
      const { TTSApiKeyManager } = await import('../../scripts/utils/api-key-manager.js');
      
      const audioData = {
        ...mockData,
        audioProvider: 'openai',
        audioVoice: 'nova',
        audioSpeed: 1.0,
        audioFormat: 'mp3',
        tabId: null
      };

      await DocumentGeneratorFactory.generate('audio', audioData, mockResult, mockUpdateState);

      expect(TTSApiKeyManager.getDecryptedKey).toHaveBeenCalledWith('openai', audioData);
      expect(generateAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockResult.content,
          title: mockResult.title,
          provider: 'openai',
          voice: 'nova',
          speed: 1.0,
          format: 'mp3'
        }),
        mockUpdateState
      );
    });

    it('should generate Audio with offline provider', async () => {
      const { generateAudio } = await import('../../scripts/generation/audio.js');
      const { TTSApiKeyManager } = await import('../../scripts/utils/api-key-manager.js');
      
      const audioData = {
        ...mockData,
        audioProvider: 'offline',
        audioVoice: 'en_US-lessac-medium',
        tabId: 123
      };

      await DocumentGeneratorFactory.generate('audio', audioData, mockResult, mockUpdateState);

      expect(TTSApiKeyManager.getDecryptedKey).toHaveBeenCalledWith('offline', audioData);
      expect(generateAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'offline',
          voice: 'en_US-lessac-medium',
          tabId: 123
        }),
        mockUpdateState
      );
    });

    it('should handle TOC and Abstract flags', async () => {
      const { generatePdf } = await import('../../scripts/generation/pdf.js');
      
      const dataWithFlags = {
        ...mockData,
        generateToc: true,
        generateAbstract: true
      };

      const resultWithAbstract = {
        ...mockResult,
        abstract: 'Test abstract'
      };

      await DocumentGeneratorFactory.generate('pdf', dataWithFlags, resultWithAbstract, mockUpdateState);

      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          generateToc: true,
          generateAbstract: true,
          abstract: 'Test abstract'
        }),
        mockUpdateState
      );
    });

    it('should pass PDF style options', async () => {
      const { generatePdf } = await import('../../scripts/generation/pdf.js');
      
      const dataWithStyles = {
        ...mockData,
        stylePreset: 'light',
        fontFamily: 'Arial',
        fontSize: '14',
        bgColor: '#ffffff',
        textColor: '#000000',
        headingColor: '#333333',
        linkColor: '#0066cc',
        pageMode: 'multi'
      };

      await DocumentGeneratorFactory.generate('pdf', dataWithStyles, mockResult, mockUpdateState);

      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          stylePreset: 'light',
          fontFamily: 'Arial',
          fontSize: '14',
          bgColor: '#ffffff',
          textColor: '#000000',
          headingColor: '#333333',
          linkColor: '#0066cc',
          pageMode: 'multi'
        }),
        mockUpdateState
      );
    });

    it('should use default values for missing options', async () => {
      const { generatePdf } = await import('../../scripts/generation/pdf.js');
      
      await DocumentGeneratorFactory.generate('pdf', mockData, mockResult, mockUpdateState);

      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          stylePreset: 'dark',
          fontFamily: '',
          fontSize: '31',
          bgColor: '#303030',
          textColor: '#b9b9b9',
          headingColor: '#cfcfcf',
          linkColor: '#6cacff',
          pageMode: 'single'
        }),
        mockUpdateState
      );
    });

    it('should handle empty content gracefully', async () => {
      const { generatePdf } = await import('../../scripts/generation/pdf.js');
      
      const emptyResult = {
        ...mockResult,
        content: []
      };

      await DocumentGeneratorFactory.generate('pdf', mockData, emptyResult, mockUpdateState);

      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          content: []
        }),
        mockUpdateState
      );
    });

    it('should handle missing optional fields', async () => {
      const { generatePdf } = await import('../../scripts/generation/pdf.js');
      
      const minimalData = {
        url: 'https://example.com',
        effectiveLanguage: 'en'
      };

      const minimalResult = {
        content: [{ type: 'paragraph', text: 'Content' }],
        title: 'Title'
      };

      await DocumentGeneratorFactory.generate('pdf', minimalData, minimalResult, mockUpdateState);

      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          author: '',
          sourceUrl: 'https://example.com',
          publishDate: '',
          generateToc: false,
          generateAbstract: false,
          abstract: '',
          language: 'en'
        }),
        mockUpdateState
      );
    });

    it('should handle audio generation errors', async () => {
      const { generateAudio } = await import('../../scripts/generation/audio.js');
      const { logError } = await import('../../scripts/utils/logging.js');
      
      generateAudio.mockRejectedValueOnce(new Error('TTS API error'));

      const audioData = {
        ...mockData,
        audioProvider: 'openai',
        audioVoice: 'nova'
      };

      await expect(
        DocumentGeneratorFactory.generate('audio', audioData, mockResult, mockUpdateState)
      ).rejects.toThrow('TTS API error');

      expect(logError).toHaveBeenCalled();
    });
  });
});


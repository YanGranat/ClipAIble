// Tests for audio helpers module

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAudioSettings,
  validateAudioParams,
  getTTSInstructions,
  getTTSVoiceAndFormat,
  getProviderName,
  buildTTSOptions
} from '../../scripts/generation/audio-helpers.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock('../../scripts/utils/validation.js', () => ({
  validateAudioApiKeys: vi.fn(async () => true)
}));

vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: vi.fn(async () => 'en'),
  updateProgress: vi.fn(async () => {})
}));

vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    DEFAULT_AUDIO_VOICE: 'nova',
    DEFAULT_AUDIO_SPEED: 1.0,
    DEFAULT_AUDIO_FORMAT: 'mp3',
    DEFAULT_ELEVENLABS_MODEL: 'eleven_v3'
  }
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(async () => 'en'),
  tSync: vi.fn((key, lang) => key)
}));

describe('generation/audio-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildAudioSettings', () => {
    it('should build settings from params', () => {
      const params = {
        provider: 'openai',
        voice: 'nova',
        speed: 1.5,
        format: 'mp3',
        language: 'en'
      };

      const settings = buildAudioSettings(params);

      expect(settings.provider).toBe('openai');
      expect(settings.voice).toBe('nova');
      expect(settings.speed).toBe(1.5);
      expect(settings.format).toBe('mp3');
      expect(settings.language).toBe('en');
    });

    it('should use default values for missing params', () => {
      const params = {
        provider: 'openai'
      };

      const settings = buildAudioSettings(params);

      expect(settings.voice).toBe('nova');
      expect(settings.speed).toBe(1.0);
      expect(settings.format).toBe('mp3');
    });

    it('should handle ElevenLabs specific settings', () => {
      const params = {
        provider: 'elevenlabs',
        voice: 'voice-id-123',
        elevenlabsModel: 'eleven_v3',
        elevenlabsFormat: 'mp3_44100_192',
        elevenlabsStability: 0.6,
        elevenlabsSimilarity: 0.8,
        elevenlabsStyle: 0.2,
        elevenlabsSpeakerBoost: false
      };

      const settings = buildAudioSettings(params);

      expect(settings.provider).toBe('elevenlabs');
      expect(settings.elevenlabsModel).toBe('eleven_v3');
      expect(settings.elevenlabsFormat).toBe('mp3_44100_192');
      expect(settings.elevenlabsStability).toBe(0.6);
      expect(settings.elevenlabsSimilarity).toBe(0.8);
      expect(settings.elevenlabsStyle).toBe(0.2);
      expect(settings.elevenlabsSpeakerBoost).toBe(false);
    });

    it('should handle Google TTS specific settings', () => {
      const params = {
        provider: 'google',
        googleTtsVoice: 'Callirrhoe',
        googleTtsModel: 'gemini-2.5-pro-preview-tts',
        googleTtsPrompt: 'cheerfully'
      };

      const settings = buildAudioSettings(params);

      expect(settings.provider).toBe('google');
      expect(settings.googleTtsVoice).toBe('Callirrhoe');
      expect(settings.googleTtsModel).toBe('gemini-2.5-pro-preview-tts');
      expect(settings.hasGoogleTtsPrompt).toBe(true);
    });

    it('should handle offline TTS settings', () => {
      const params = {
        provider: 'offline',
        voice: 'en_US-lessac-medium',
        tabId: 123
      };

      const settings = buildAudioSettings(params);

      expect(settings.provider).toBe('offline');
      expect(settings.voice).toBe('en_US-lessac-medium');
      expect(settings.tabId).toBe(123);
    });
  });

  describe('validateAudioParams', () => {
    it('should validate OpenAI params', async () => {
      const params = {
        provider: 'openai',
        content: [{ type: 'paragraph', text: 'Test content' }],
        apiKey: 'test-key',
        ttsApiKey: 'sk-test-key',
        voice: 'nova',
        speed: 1.0,
        format: 'mp3'
      };

      await expect(validateAudioParams(params, 'openai')).resolves.not.toThrow();
    });

    it('should validate ElevenLabs params', async () => {
      const params = {
        provider: 'elevenlabs',
        content: [{ type: 'paragraph', text: 'Test content' }],
        apiKey: 'test-key',
        ttsApiKey: 'test-key',
        voice: 'voice-id'
      };

      await expect(validateAudioParams(params, 'elevenlabs')).resolves.not.toThrow();
    });

    it('should validate offline TTS params', async () => {
      const params = {
        provider: 'offline',
        content: [{ type: 'paragraph', text: 'Test content' }],
        apiKey: 'test-key',
        voice: 'en_US-lessac-medium',
        tabId: 123
      };

      await expect(validateAudioParams(params, 'offline')).resolves.not.toThrow();
    });

    it('should throw error for missing API key (non-offline)', async () => {
      const params = {
        provider: 'openai',
        voice: 'nova'
        // Missing ttsApiKey
      };

      await expect(validateAudioParams(params, 'openai')).rejects.toThrow();
    });

    it('should throw error for invalid provider', async () => {
      const params = {
        provider: 'invalid',
        ttsApiKey: 'test-key'
      };

      await expect(validateAudioParams(params, 'invalid')).rejects.toThrow();
    });
  });

  describe('getTTSInstructions', () => {
    it('should return instructions for English', () => {
      const instructions = getTTSInstructions('en');
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe('string');
      expect(instructions).toContain('English');
    });

    it('should return instructions for Russian', () => {
      const instructions = getTTSInstructions('ru');
      expect(instructions).toBeTruthy();
      expect(typeof instructions).toBe('string');
      expect(instructions).toContain('русском');
    });

    it('should return null for auto language', () => {
      const instructions = getTTSInstructions('auto');
      expect(instructions).toBeNull();
    });

    it('should return instructions for different languages', () => {
      const languages = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko'];
      
      languages.forEach(lang => {
        const instructions = getTTSInstructions(lang);
        expect(instructions).toBeTruthy();
        expect(typeof instructions).toBe('string');
      });
    });
  });

  describe('getTTSVoiceAndFormat', () => {
    it('should return voice and format for OpenAI', () => {
      const result = getTTSVoiceAndFormat('openai', 'nova', 'mp3', null);
      
      expect(result.ttsVoice).toBe('nova');
      expect(result.ttsFormat).toBe('mp3');
    });

    it('should return voice and format for ElevenLabs', () => {
      const result = getTTSVoiceAndFormat('elevenlabs', 'voice-id', 'mp3_44100_192', null);
      
      expect(result.ttsVoice).toBe('voice-id');
      expect(result.ttsFormat).toBe('mp3_44100_192');
    });

    it('should return voice and format for Google', () => {
      const result = getTTSVoiceAndFormat('google', null, null, 'Callirrhoe');
      
      expect(result.ttsVoice).toBe('Callirrhoe');
      expect(result.ttsFormat).toBe('wav');
    });

    it('should return voice and format for offline', () => {
      const result = getTTSVoiceAndFormat('offline', 'en_US-lessac-medium', null, null);
      
      expect(result.ttsVoice).toBe('en_US-lessac-medium');
      expect(result.ttsFormat).toBe('wav');
    });

    it('should use default format when not provided', () => {
      const result = getTTSVoiceAndFormat('openai', 'nova', 'mp3', null);
      
      expect(result.ttsVoice).toBe('nova');
      expect(result.ttsFormat).toBe('mp3');
    });
  });

  describe('getProviderName', () => {
    it('should return correct name for OpenAI', () => {
      expect(getProviderName('openai')).toBe('OpenAI');
    });

    it('should return correct name for ElevenLabs', () => {
      expect(getProviderName('elevenlabs')).toBe('ElevenLabs');
    });

    it('should return correct name for Google', () => {
      expect(getProviderName('google')).toBe('Google Gemini TTS');
    });

    it('should return correct name for offline', () => {
      expect(getProviderName('offline')).toBe('Piper TTS (offline)');
    });

    it('should return correct name for Qwen', () => {
      expect(getProviderName('qwen')).toBe('Qwen');
    });

    it('should return correct name for Respeecher', () => {
      expect(getProviderName('respeecher')).toBe('Respeecher');
    });

    it('should handle unknown provider', () => {
      expect(getProviderName('unknown')).toBe('Unknown');
    });
  });

  describe('buildTTSOptions', () => {
    it('should build options for OpenAI', () => {
      const params = {
        provider: 'openai',
        voice: 'nova',
        speed: 1.5,
        format: 'mp3'
      };

      const options = buildTTSOptions(params, 'nova', 'mp3', null, 'Read clearly');

      expect(options.voice).toBe('nova');
      expect(options.speed).toBe(1.5);
      expect(options.format).toBe('mp3');
      expect(options.instructions).toBe('Read clearly');
    });

    it('should build options for ElevenLabs', () => {
      const params = {
        provider: 'elevenlabs',
        voice: 'voice-id',
        speed: 1.2,
        elevenlabsModel: 'eleven_v3',
        elevenlabsFormat: 'mp3_44100_192',
        elevenlabsStability: 0.6,
        elevenlabsSimilarity: 0.8,
        elevenlabsStyle: 0.2,
        elevenlabsSpeakerBoost: true
      };

      const options = buildTTSOptions(params, 'voice-id', 'mp3_44100_192', null, null);

      expect(options.voice).toBe('voice-id');
      expect(options.format).toBe('mp3_44100_192');
      expect(options.speed).toBe(1.2);
      expect(options.elevenlabsModel).toBe('eleven_v3');
      expect(options.elevenlabsFormat).toBe('mp3_44100_192');
      expect(options.elevenlabsStability).toBe(0.6);
      expect(options.elevenlabsSimilarity).toBe(0.8);
      expect(options.elevenlabsStyle).toBe(0.2);
      expect(options.elevenlabsSpeakerBoost).toBe(true);
    });

    it('should build options for Google', () => {
      const params = {
        provider: 'google',
        googleTtsVoice: 'Callirrhoe',
        googleTtsModel: 'gemini-2.5-pro-preview-tts',
        googleTtsPrompt: 'cheerfully'
      };

      const options = buildTTSOptions(params, 'Callirrhoe', 'wav', 'cheerfully', null);

      expect(options.voice).toBe('Callirrhoe');
      expect(options.format).toBe('wav');
      expect(options.prompt).toBe('cheerfully');
    });

    it('should build options for offline', () => {
      const params = {
        provider: 'offline',
        voice: 'en_US-lessac-medium',
        tabId: 123
      };

      const options = buildTTSOptions(params, 'en_US-lessac-medium', 'wav', null, null);

      expect(options.voice).toBe('en_US-lessac-medium');
      expect(options.format).toBe('wav');
      expect(options.tabId).toBe(123);
    });

    it('should use default values for missing params', () => {
      const params = {
        provider: 'openai',
        speed: 1.0
      };

      const options = buildTTSOptions(params, 'nova', 'mp3', null, null);

      expect(options.voice).toBe('nova');
      expect(options.format).toBe('mp3');
      expect(options.speed).toBe(1.0);
    });
  });
});


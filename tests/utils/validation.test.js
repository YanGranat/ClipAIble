// Unit tests for scripts/utils/validation.js

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock processing.js module before importing validation
vi.mock('../../scripts/state/processing.js', () => ({
  ERROR_CODES: {
    AUTH_ERROR: 'auth_error',
    RATE_LIMIT: 'rate_limit',
    TIMEOUT: 'timeout',
    NETWORK_ERROR: 'network_error',
    PARSE_ERROR: 'parse_error',
    PROVIDER_ERROR: 'provider_error',
    VALIDATION_ERROR: 'validation_error',
    UNKNOWN_ERROR: 'unknown_error'
  },
  setError: vi.fn(() => Promise.resolve())
}));

import { validateAudioApiKeys } from '../../scripts/utils/validation.js';
import { setError, ERROR_CODES } from '../../scripts/state/processing.js';

const mockStopKeepAlive = vi.fn();

describe('validateAudioApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for non-audio formats', async () => {
    const data = { outputFormat: 'pdf' };
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(true);
    expect(setError).not.toHaveBeenCalled();
  });

  it('should return true when audio provider key is present', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'openai',
      apiKey: 'sk-test123'
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(true);
    expect(setError).not.toHaveBeenCalled();
  });

  it('should return false and set error when OpenAI key is missing', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'openai',
      apiKey: null
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('OpenAI API key is required'),
        code: ERROR_CODES.VALIDATION_ERROR
      }),
      mockStopKeepAlive
    );
  });

  it('should return false and set error when ElevenLabs key is missing', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'elevenlabs',
      elevenlabsApiKey: null
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('ElevenLabs API key is required'),
        code: ERROR_CODES.VALIDATION_ERROR
      }),
      mockStopKeepAlive
    );
  });

  it('should return false and set error when Qwen key is missing', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'qwen',
      qwenApiKey: null
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Qwen API key is required'),
        code: ERROR_CODES.VALIDATION_ERROR
      }),
      mockStopKeepAlive
    );
  });

  it('should return false and set error when Respeecher key is missing', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'respeecher',
      respeecherApiKey: null
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Respeecher API key is required'),
        code: ERROR_CODES.VALIDATION_ERROR
      }),
      mockStopKeepAlive
    );
  });

  it('should return false and set error when Google TTS key is missing', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'google',
      googleTtsApiKey: null
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Google TTS API key is required'),
        code: ERROR_CODES.VALIDATION_ERROR
      }),
      mockStopKeepAlive
    );
  });

  it('should return false for unknown provider', async () => {
    const data = {
      outputFormat: 'audio',
      audioProvider: 'unknown',
      apiKey: 'test'
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Unknown audio provider'),
        code: ERROR_CODES.VALIDATION_ERROR
      }),
      mockStopKeepAlive
    );
  });

  it('should default to pdf format when not specified', async () => {
    const data = {};
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(true);
    expect(setError).not.toHaveBeenCalled();
  });

  it('should default to openai provider when not specified', async () => {
    const data = {
      outputFormat: 'audio',
      apiKey: 'sk-test123'
    };
    
    const result = await validateAudioApiKeys(data, mockStopKeepAlive);
    
    expect(result).toBe(true);
    expect(setError).not.toHaveBeenCalled();
  });
});


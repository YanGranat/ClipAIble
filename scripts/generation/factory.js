// Document generator factory for ClipAIble extension
// Provides a unified interface for document generation based on format

// @ts-check

import { generatePdf } from './pdf.js';
import { generateEpub } from './epub.js';
import { generateFb2 } from './fb2.js';
import { generateMarkdown } from './markdown.js';
import { generateAudio } from './audio.js';
import { updateProgress } from '../utils/pipeline-helpers.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { log, logError, logDebug } from '../utils/logging.js';
import { TTSApiKeyManager } from '../utils/api-key-manager.js';
import { VoiceValidator } from '../utils/voice-validator.js';
import { CONFIG } from '../utils/config.js';

/**
 * @typedef {import('../types.js').GenerationData} GenerationData
 * @typedef {import('../types.js').ExtendedGenerationData} ExtendedGenerationData
 * @typedef {import('../types.js').AudioGenerationData} AudioGenerationData
 * @typedef {import('../types.js').DocumentGenerationResult} DocumentGenerationResult
 * @typedef {import('../types.js').PdfGenerationResult} PdfGenerationResult
 * @typedef {import('../types.js').EpubGenerationResult} EpubGenerationResult
 * @typedef {import('../types.js').Fb2GenerationResult} Fb2GenerationResult
 * @typedef {import('../types.js').MarkdownGenerationResult} MarkdownGenerationResult
 * @typedef {import('../types.js').AudioGenerationResult} AudioGenerationResult
 */

/**
 * Document generator factory
 * Creates and configures document generators based on output format
 */
export class DocumentGeneratorFactory {
  /**
   * Generate document based on format
   * @template {import('../types.js').ExportFormat} T
   * @param {T} format - Output format ('pdf', 'epub', 'fb2', 'markdown', 'audio')
   * @param {import('../types.js').ProcessingData} data - Processing data
   * @param {import('../types.js').ExtractionResult} result - Extracted content result
   * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
   * @returns {Promise<DocumentGenerationResult>} Generated document (type depends on format: PdfGenerationResult for 'pdf', EpubGenerationResult for 'epub', Fb2GenerationResult for 'fb2', MarkdownGenerationResult for 'markdown', AudioGenerationResult for 'audio')
   * @throws {Error} If content is empty
   * @throws {Error} If document generation fails
   * @throws {Error} If format is invalid
   * @see {@link generatePdf} For PDF generation
   * @see {@link generateEpub} For EPUB generation
   * @see {@link generateFb2} For FB2 generation
   * @see {@link generateMarkdown} For Markdown generation
   * @see {@link generateAudio} For Audio generation
   * @example
   * // Generate PDF document
   * const pdfResult = await DocumentGeneratorFactory.generate('pdf', processingData, extractionResult, updateState);
   * if (pdfResult instanceof Blob) {
   *   const url = URL.createObjectURL(pdfResult);
   *   // Download PDF...
   * }
   * @example
   * // Generate Markdown document
   * const markdown = await DocumentGeneratorFactory.generate('markdown', processingData, extractionResult, updateState);
   * // Use markdown content...
   * @example
   * // Generate Audio (triggers download automatically)
   * await DocumentGeneratorFactory.generate('audio', processingData, extractionResult, updateState);
   * // Audio file will be downloaded automatically
   */
  static async generate(format, data, result, updateState) {
    const commonParams = {
      content: result.content,
      title: result.title,
      author: result.author || '',
      sourceUrl: data.url,
      publishDate: result.publishDate || '',
      generateToc: data.generateToc || false,
      generateAbstract: data.generateAbstract || false,
      abstract: result.abstract || '',
      language: data.effectiveLanguage || 'auto'
    };

    log(`📄 Starting ${format.toUpperCase()} document generation`);
    
    switch (format) {
      case 'markdown': {
        await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingMarkdown', 65);
        const markdownResult = await generateMarkdown({
          ...commonParams,
          apiKey: data.apiKey,
          model: data.model
        }, updateState);
        log('✅ Markdown document generated successfully');
        return markdownResult;
      }

      case 'epub': {
        await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingEpub', 65);
        const epubResult = await generateEpub(commonParams, updateState);
        log('✅ EPUB document generated successfully');
        return epubResult;
      }

      case 'fb2': {
        await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingFb2', 65);
        const fb2Result = await generateFb2(commonParams, updateState);
        log('✅ FB2 document generated successfully');
        return fb2Result;
      }

      case 'audio': {
        await DocumentGeneratorFactory._generateAudio(data, result, updateState);
        log('✅ Audio file generated successfully');
        return;
      }

      case 'pdf':
      default: {
        await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingPdf', 65);
        const pdfResult = await generatePdf({
          ...commonParams,
          apiKey: data.apiKey,
          model: data.model,
          stylePreset: data.stylePreset || 'dark',
          fontFamily: data.fontFamily || '',
          fontSize: data.fontSize || '31',
          bgColor: data.bgColor || '#303030',
          textColor: data.textColor || '#b9b9b9',
          headingColor: data.headingColor || '#cfcfcf',
          linkColor: data.linkColor || '#6cacff',
          pageMode: data.pageMode || 'single'
        }, updateState);
        log('✅ PDF document generated successfully');
        return pdfResult;
      }
    }
  }

  /**
   * Generate audio document (handles TTS provider selection and API key management)
   * @private
   * @param {import('../types.js').ProcessingData} data - Processing data
   * @param {import('../types.js').ExtractionResult} result - Extracted content result
   * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
   * @returns {Promise<void>} Triggers download when complete
   * @throws {Error} If TTS API key is missing (for non-offline providers)
   * @throws {Error} If audio generation fails
   * @throws {Error} If TTS provider is invalid
   */
  static async _generateAudio(data, result, updateState) {
    const audioStartTime = Date.now();
    log('[ClipAIble Background] === AUDIO GENERATION ENTRY POINT ===', {
      timestamp: audioStartTime,
      audioProvider: data.audioProvider,
      hasTabId: !!data.tabId,
      tabId: data.tabId,
      hasContent: !!result.content,
      contentItems: result.content?.length || 0
    });
    
    // Don't set progress here - let generateAudio manage its own progress
    await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingAudio', 65);
    
    // Get TTS API key based on provider
    const ttsProvider = data.audioProvider || 'openai';
    logDebug('[ClipAIble Background] TTS provider determined', {
      timestamp: Date.now(),
      ttsProvider,
      hasTabId: !!data.tabId,
      tabId: data.tabId
    });
    
    log('[ClipAIble Background] === Audio generation: TTS provider selected ===', { 
      ttsProvider, 
      hasTabId: !!data.tabId,
      tabId: data.tabId,
      audioProvider: data.audioProvider 
    });
    
    // Get TTS API key using TTSApiKeyManager
    let ttsApiKey;
    try {
      ttsApiKey = await TTSApiKeyManager.getDecryptedKey(ttsProvider, data);
    } catch (error) {
      // TTSApiKeyManager already provides localized error messages
      throw error;
    }
    
    if (ttsProvider === 'offline') {
      log('[ClipAIble Background] === OFFLINE TTS DETECTED ===', {
        timestamp: Date.now(),
        tabId: data.tabId,
        hasTabId: !!data.tabId,
        audioVoice: data.audioVoice,
        audioVoiceType: typeof data.audioVoice,
        audioProvider: data.audioProvider
      });
      
      // CRITICAL: Log voice received from popup for offline TTS
      log(`[ClipAIble Background] ===== OFFLINE TTS VOICE FROM POPUP ===== VOICE="${String(data.audioVoice || '')}" =====`, {
        timestamp: Date.now(),
        audioVoice: data.audioVoice,
        VOICE_STRING: `VOICE="${String(data.audioVoice || '')}"`,
        audioVoiceType: typeof data.audioVoice,
        audioVoiceStr: String(data.audioVoice || ''),
        isNumeric: /^\d+$/.test(String(data.audioVoice || '')),
        isValidFormat: data.audioVoice && (String(data.audioVoice).includes('_') || String(data.audioVoice).includes('-')),
        willCauseReset: /^\d+$/.test(String(data.audioVoice || '')) || (data.audioVoice && !String(data.audioVoice).includes('_') && !String(data.audioVoice).includes('-'))
      });
    }
    
    // DETAILED LOGGING: Voice received in factory
    log('[ClipAIble Background] ===== VOICE IN FACTORY =====', {
      timestamp: Date.now(),
      ttsProvider,
      audioVoice: data.audioVoice,
      audioVoiceType: typeof data.audioVoice,
      audioVoiceString: String(data.audioVoice || ''),
      isNumeric: /^\d+$/.test(String(data.audioVoice || '')),
      hasUnderscore: data.audioVoice && String(data.audioVoice).includes('_'),
      hasDash: data.audioVoice && String(data.audioVoice).includes('-'),
      isValidFormat: data.audioVoice && (String(data.audioVoice).includes('_') || String(data.audioVoice).includes('-')),
      googleTtsVoice: data.googleTtsVoice,
      defaultVoice: CONFIG.DEFAULT_AUDIO_VOICE,
      VOICE_STRING: `VOICE="${String(data.audioVoice || '')}"`,
      source: 'factory',
      willBePassedToGenerateAudio: true
    });
    
    /** @type {AudioGenerationData} */
    const audioParams = {
      content: result.content,
      title: result.title,
      apiKey: data.apiKey, // For text preparation
      ttsApiKey: ttsApiKey, // For TTS conversion
      model: data.model,
      provider: ttsProvider,
      // Validate and normalize voice using VoiceValidator
      voice: VoiceValidator.validate(
        ttsProvider,
        data.audioVoice,
        data.googleTtsVoice,
        CONFIG.DEFAULT_AUDIO_VOICE
      ),
      speed: data.audioSpeed || CONFIG.DEFAULT_AUDIO_SPEED,
      format: data.audioFormat || CONFIG.DEFAULT_AUDIO_FORMAT,
      language: data.effectiveLanguage || 'auto',
      tabId: data.tabId || null, // For offline TTS
      elevenlabsModel: data.elevenlabsModel || CONFIG.DEFAULT_ELEVENLABS_MODEL,
      elevenlabsFormat: data.elevenlabsFormat || 'mp3_44100_192',
      elevenlabsStability: data.elevenlabsStability !== undefined ? data.elevenlabsStability : 0.5,
      elevenlabsSimilarity: data.elevenlabsSimilarity !== undefined ? data.elevenlabsSimilarity : 0.75,
      elevenlabsStyle: data.elevenlabsStyle !== undefined ? data.elevenlabsStyle : 0.0,
      elevenlabsSpeakerBoost: data.elevenlabsSpeakerBoost !== undefined ? data.elevenlabsSpeakerBoost : true,
      openaiInstructions: data.openaiInstructions || null,
      googleTtsModel: data.googleTtsModel || 'gemini-2.5-pro-preview-tts',
      googleTtsVoice: data.googleTtsVoice || 'Callirrhoe',
      googleTtsPrompt: data.googleTtsPrompt || null,
      respeecherTemperature: data.respeecherTemperature !== undefined ? data.respeecherTemperature : 1.0,
      respeecherRepetitionPenalty: data.respeecherRepetitionPenalty !== undefined ? data.respeecherRepetitionPenalty : 1.0,
      respeecherTopP: data.respeecherTopP !== undefined ? data.respeecherTopP : 1.0
    };
    
    log('[ClipAIble Background] === PREPARING TO CALL generateAudio ===', {
      timestamp: Date.now(),
      provider: audioParams.provider,
      tabId: audioParams.tabId,
      hasContent: !!audioParams.content,
      contentItems: audioParams.content?.length || 0,
      voice: audioParams.voice,
      speed: audioParams.speed,
      language: audioParams.language,
      hasTtsApiKey: !!audioParams.ttsApiKey
    });
    
    log('[ClipAIble Background] === Audio generation: Calling generateAudio ===', { 
      provider: audioParams.provider,
      tabId: audioParams.tabId,
      hasContent: !!audioParams.content,
      contentItems: audioParams.content?.length || 0,
      voice: audioParams.voice,
      speed: audioParams.speed,
      language: audioParams.language,
      timestamp: Date.now()
    });
    
    const generateAudioStart = Date.now();
    try {
      const result = await generateAudio(audioParams, updateState);
      log('[ClipAIble Background] === generateAudio COMPLETE ===', {
        timestamp: Date.now(),
        duration: Date.now() - generateAudioStart,
        totalDuration: Date.now() - audioStartTime
      });
      return result;
    } catch (error) {
      logError('[ClipAIble Background] === generateAudio FAILED ===', {
        timestamp: Date.now(),
        duration: Date.now() - generateAudioStart,
        totalDuration: Date.now() - audioStartTime,
        error: error.message,
        stack: error.stack
      });
      logError('[ClipAIble Background] generateAudio failed', {
        error: error.message,
        duration: Date.now() - generateAudioStart,
        stack: error.stack
      });
      throw error;
    }
  }
}


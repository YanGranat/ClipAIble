// @ts-check
// Audio settings management module
// Handles TTS provider settings, voice selection, audio UI visibility

import { logWarn } from '../../scripts/utils/logging.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { ELEVENLABS_TTS_MODELS, ELEVENLABS_TTS_VOICES, GOOGLE_TTS_MODELS, QWEN_TTS_MODELS, QWEN_AUDIO_VOICES, QWEN_LEGACY_VOICES, getDefaultTtsVoice, getElevenLabsCapabilities, isQwenAudioModel } from '../../scripts/api/tts-catalog.js';
import { normalizePiperVoiceId } from '../../scripts/api/piper-voices-mapping.js';
import { OPENAI_TTS_VOICES, OPENAI_TTS_MAX_SPEED } from '../../scripts/api/tts-catalog.js';
import { tSync } from '../../scripts/locales.js';

export function restoreTtsSelect(select, value) {
  if (!select || !value) return;
  if (![...select.options].some(option => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

/**
 * Initialize audio module
 * @param {Object} deps - Dependencies
 * @returns {Object} Audio functions
 */
export function initAudio(deps) {
  const {
    elements,
    STORAGE_KEYS,
    debouncedSaveSettings,
    audioVoiceMap,
    getElement,
    setElementGroupDisplay
  } = deps;

  /** @type {Array<[string, ReadonlyArray<{id: string, name: string, deprecated?: boolean}>]>} */
  const modelGroups = [['elevenlabsModel', ELEVENLABS_TTS_MODELS], ['googleTtsModel', GOOGLE_TTS_MODELS], ['qwenModel', QWEN_TTS_MODELS]];
  for (const [name, models] of modelGroups) {
    const select = elements[name];
    if (select) select.replaceChildren(...models.filter(model => !model.deprecated).map(model => new Option(model.name, model.id)));
  }
  let lastVoiceProvider = null;
  let preferredSpeed = null;
  const baseSpeedMin = elements.audioSpeed?.min;
  const baseSpeedMax = elements.audioSpeed?.max;
  elements.audioSpeed?.addEventListener('input', () => { preferredSpeed = elements.audioSpeed.value; });

  function populateVoices(provider, voices, currentValue) {
    for (const voice of voices) elements.audioVoice.add(new Option(voice.name, voice.id));
    const selected = currentValue || getDefaultTtsVoice(provider, elements.qwenModel?.value);
    restoreTtsSelect(elements.audioVoice, selected);
    if (!currentValue) saveAudioVoice(provider, selected);
  }

  // Save audio voice per provider with backward-compatible flat key
  function saveAudioVoice(provider, voice) {
    if (!provider) return;
    // Ensure audioVoiceMap has 'current' property
    if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
      // This should not happen if audioVoiceMap is passed correctly, but handle it gracefully
      logWarn('audioVoiceMap is not properly initialized');
      return;
    }
    if (!('current' in audioVoiceMap)) {
      audioVoiceMap.current = {};
    }
    // Ensure current is an object
    if (!audioVoiceMap.current || typeof audioVoiceMap.current !== 'object' || Array.isArray(audioVoiceMap.current)) {
      audioVoiceMap.current = {};
    }
    audioVoiceMap.current[provider] = voice;
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE, voice);
    // CRITICAL: Save in correct format { current: { provider: voice } }
    debouncedSaveSettings(STORAGE_KEYS.STORAGE_AUDIO_VOICE_MAP, { current: { ...audioVoiceMap.current } });
  }

  /**
   * Hide all audio-related UI fields
   * This is a centralized function to ensure all audio fields are hidden consistently
   * Used when output format is not 'audio' (PDF, EPUB, FB2, Markdown)
   */
  function hideAllAudioFields() {
    // Audio provider selector
    setElementGroupDisplay('audioProviderGroup', 'none');
    
    // Provider-specific API keys
    setElementGroupDisplay('elevenlabsApiKeyGroup', 'none');
    setElementGroupDisplay('qwenApiKeyGroup', 'none');
    for (const group of ['qwenModelGroup', 'qwenWorkspaceGroup', 'qwenRegionGroup']) setElementGroupDisplay(group, 'none');
    setElementGroupDisplay('respeecherApiKeyGroup', 'none');
    setElementGroupDisplay('googleTtsApiKeyGroup', 'none');
    
    // Provider-specific settings
    setElementGroupDisplay('elevenlabsModelGroup', 'none');
    setElementGroupDisplay('elevenlabsFormatGroup', 'none');
    setElementGroupDisplay('elevenlabsAdvancedGroup', 'none');
    setElementGroupDisplay('googleTtsModelGroup', 'none');
    setElementGroupDisplay('googleTtsVoiceGroup', 'none');
    setElementGroupDisplay('googleTtsPromptGroup', 'none');
    setElementGroupDisplay('respeecherAdvancedGroup', 'none');
    
    // Generic audio settings (voice, speed, instructions)
    setElementGroupDisplay('audioVoiceGroup', 'none');
    setElementGroupDisplay('audioSpeedGroup', 'none');
    setElementGroupDisplay('openaiInstructionsGroup', 'none');
  }

  // Update voice list based on TTS provider
  function updateVoiceList(provider) {
    if (!elements.audioVoice) return;
    
    // IMPORTANT: restore per-provider saved voice if available
    const voiceMap = (audioVoiceMap && typeof audioVoiceMap === 'object' && 'current' in audioVoiceMap) 
      ? audioVoiceMap.current 
      : (audioVoiceMap || {});
    const savedProviderVoice = voiceMap[provider] || '';
    let currentValue = savedProviderVoice || (lastVoiceProvider === provider ? elements.audioVoice.value : '') || '';
    lastVoiceProvider = provider;
    
    // CRITICAL: For offline provider, reject numeric values (indices) - they are invalid
    // Only voice IDs (strings with _ or -) are valid for offline
    if (provider === 'offline' && currentValue && /^\d+$/.test(String(currentValue))) {
      logWarn('[ClipAIble Audio] Invalid voice value (index) for offline provider, using saved voice or empty', {
        provider,
        invalidValue: currentValue,
        savedVoice: savedProviderVoice
      });
      currentValue = savedProviderVoice || ''; // Use saved voice from map, or empty
    }
    
    elements.audioVoice.innerHTML = '';
    
    if (provider === 'elevenlabs') {
      populateVoices(provider, ELEVENLABS_TTS_VOICES, currentValue);
    } else if (provider === 'qwen') {
      const voices = isQwenAudioModel(elements.qwenModel?.value) ? QWEN_AUDIO_VOICES : QWEN_LEGACY_VOICES;
      populateVoices(provider, voices, currentValue);
    } else if (provider === 'respeecher') {
      // Respeecher voices
      // Note: volodymyr is available on en-rt endpoint only, not on ua-rt
      // Ukrainian voices are available on ua-rt endpoint only
      const respeecherVoices = [
        // English voices (en-rt endpoint)
        { id: 'samantha', name: '🇺🇸 Samantha (female, American)' },
        { id: 'neve', name: '🇺🇸 Neve (female, emotional)' },
        { id: 'gregory', name: '🇺🇸 Gregory (male, emotional)' },
        { id: 'vincent', name: '🇺🇸 Vincent (male, deep)' },
        { id: 'volodymyr', name: '🇺🇦 Volodymyr (male, Ukrainian) - EN endpoint only' },
        // Ukrainian voices (ua-rt endpoint)
        { id: 'olesia-rozmova', name: '🇺🇦 Олеся: розмова (female, conversation)' },
        { id: 'olesia-media', name: '🇺🇦 Олеся: медіа (female, media)' },
        { id: 'olesia-ogoloshennia', name: '🇺🇦 Олеся: оголошення (female, announcement)' },
        { id: 'mariia-audioknyha', name: '🇺🇦 Марія: аудіокнига (female, audiobook)' },
        { id: 'oleksandr-radio', name: '🇺🇦 Олександр: радіо (male, radio)' },
        { id: 'oleksandr-reklama', name: '🇺🇦 Олександр: реклама (male, advertisement)' },
        { id: 'yevhen-reklama', name: '🇺🇦 Євген: реклама (male, advertisement)' },
        { id: 'yevhen-audioknyha', name: '🇺🇦 Євген: аудіокнига (male, audiobook)' },
        { id: 'dmitro-rozmova', name: '🇺🇦 Дмитро: розмова (male, conversation)' },
        { id: 'ihoreo-rozmova', name: '🇺🇦 Ігорео: розмова (male, conversation)' }
      ];
      
      respeecherVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      // IMPORTANT: Only change value if currentValue is invalid for this provider
      // This preserves user's selection across page reloads
      if (currentValue && respeecherVoices.find(v => v.id === currentValue)) {
        // Valid saved value - restore it
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        // Invalid value (e.g., 'nova' from OpenAI or 'volodymyr' for Ukrainian text)
        // Use default for this provider
        elements.audioVoice.value = CONFIG.DEFAULT_RESPEECHER_VOICE; // Default English voice
        // Save the new default value
        saveAudioVoice(provider, CONFIG.DEFAULT_RESPEECHER_VOICE);
      } else {
        // No saved value - use default
        elements.audioVoice.value = CONFIG.DEFAULT_RESPEECHER_VOICE;
      }
      saveAudioVoice(provider, elements.audioVoice.value);
    } else if (provider === 'offline') {
      // Piper TTS: use hardcoded voices list (same as other providers)
      // All supported voices from PIPER_VOICES_MAPPING for supported languages
      const offlineVoices = [
        // English GB
        { id: 'en_GB-alan-medium', name: 'en_GB-alan-medium' },
        { id: 'en_GB-alba-medium', name: 'en_GB-alba-medium' },
        { id: 'en_GB-aru-medium', name: 'en_GB-aru-medium' },
        { id: 'en_GB-cori-medium', name: 'en_GB-cori-medium' },
        { id: 'en_GB-cori-high', name: 'en_GB-cori-high' },
        { id: 'en_GB-jenny_dioco-medium', name: 'en_GB-jenny_dioco-medium' },
        { id: 'en_GB-northern_english_male-medium', name: 'en_GB-northern_english_male-medium' },
        { id: 'en_GB-semaine-medium', name: 'en_GB-semaine-medium' },
        { id: 'en_GB-vctk-medium', name: 'en_GB-vctk-medium' },
        // English US
        { id: 'en_US-amy-medium', name: 'en_US-amy-medium' },
        { id: 'en_US-arctic-medium', name: 'en_US-arctic-medium' },
        { id: 'en_US-bryce-medium', name: 'en_US-bryce-medium' },
        { id: 'en_US-hfc_female-medium', name: 'en_US-hfc_female-medium' },
        { id: 'en_US-hfc_male-medium', name: 'en_US-hfc_male-medium' },
        { id: 'en_US-joe-medium', name: 'en_US-joe-medium' },
        { id: 'en_US-john-medium', name: 'en_US-john-medium' },
        { id: 'en_US-kristin-medium', name: 'en_US-kristin-medium' },
        { id: 'en_US-kusal-medium', name: 'en_US-kusal-medium' },
        { id: 'en_US-l2arctic-medium', name: 'en_US-l2arctic-medium' },
        { id: 'en_US-lessac-medium', name: 'en_US-lessac-medium' },
        { id: 'en_US-lessac-high', name: 'en_US-lessac-high' },
        { id: 'en_US-libritts-high', name: 'en_US-libritts-high' },
        { id: 'en_US-libritts_r-medium', name: 'en_US-libritts_r-medium' },
        { id: 'en_US-ljspeech-medium', name: 'en_US-ljspeech-medium' },
        { id: 'en_US-ljspeech-high', name: 'en_US-ljspeech-high' },
        { id: 'en_US-norman-medium', name: 'en_US-norman-medium' },
        { id: 'en_US-ryan-medium', name: 'en_US-ryan-medium' },
        { id: 'en_US-ryan-high', name: 'en_US-ryan-high' },
        // Russian
        { id: 'ru_RU-denis-medium', name: 'ru_RU-denis-medium' },
        { id: 'ru_RU-dmitri-medium', name: 'ru_RU-dmitri-medium' },
        { id: 'ru_RU-irina-medium', name: 'ru_RU-irina-medium' },
        { id: 'ru_RU-ruslan-medium', name: 'ru_RU-ruslan-medium' },
        // Ukrainian - REMOVED: Quality too poor, use Respeecher instead
        // { id: 'uk_UA-ukrainian_tts-medium', name: 'uk_UA-ukrainian_tts-medium' },
        // German
        { id: 'de_DE-mls-medium', name: 'de_DE-mls-medium' },
        { id: 'de_DE-thorsten-medium', name: 'de_DE-thorsten-medium' },
        { id: 'de_DE-thorsten-high', name: 'de_DE-thorsten-high' },
        { id: 'de_DE-thorsten_emotional-medium', name: 'de_DE-thorsten_emotional-medium' },
        // French
        { id: 'fr_FR-mls-medium', name: 'fr_FR-mls-medium' },
        { id: 'fr_FR-siwis-medium', name: 'fr_FR-siwis-medium' },
        { id: 'fr_FR-tom-medium', name: 'fr_FR-tom-medium' },
        { id: 'fr_FR-upmc-medium', name: 'fr_FR-upmc-medium' },
        // Spanish ES
        { id: 'es_ES-davefx-medium', name: 'es_ES-davefx-medium' },
        { id: 'es_ES-sharvard-medium', name: 'es_ES-sharvard-medium' },
        // Spanish MX
        { id: 'es_MX-ald-medium', name: 'es_MX-ald-medium' },
        { id: 'es_MX-claude-high', name: 'es_MX-claude-high' },
        // Italian
        { id: 'it_IT-paola-medium', name: 'it_IT-paola-medium' },
        // Portuguese BR
        { id: 'pt_BR-faber-medium', name: 'pt_BR-faber-medium' },
        // Portuguese PT
        { id: 'pt_PT-tugão-medium', name: 'pt_PT-tugão-medium' },
        // Chinese
        { id: 'zh_CN-huayan-medium', name: 'zh_CN-huayan-medium' }
      ];
      
      offlineVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.id; // Display voice ID directly
        elements.audioVoice.appendChild(option);
      });
      
      const normalizedVoice = normalizePiperVoiceId(currentValue);
      restoreTtsSelect(elements.audioVoice, normalizedVoice || getDefaultTtsVoice(provider));
      if (!currentValue || normalizedVoice !== currentValue) saveAudioVoice(provider, elements.audioVoice.value);
    } else {
      populateVoices(provider, OPENAI_TTS_VOICES.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })), currentValue);
      if (currentValue && !OPENAI_TTS_VOICES.includes(currentValue)) {
        const option = elements.audioVoice.selectedOptions[0];
        option.dataset.i18n = 'voiceUnavailable';
        option.dataset.i18nParams = JSON.stringify({ voice: currentValue });
        option.textContent = tSync('voiceUnavailable', document.documentElement.lang).replace('{voice}', currentValue);
      }
    }
  }

  /**
   * Update UI visibility based on audio provider selection
   * 
   * This function shows/hides provider-specific fields based on selected TTS provider:
   * - OpenAI: Shows voice selector, speed control, instructions
   * - ElevenLabs: Shows API key, model, format, advanced settings, voice selector, speed control
   * - Google TTS: Shows API key, model, voice selector, prompt (NO speed control)
   * - Qwen: Shows API key, voice selector (NO speed control)
   * - Respeecher: Shows API key, advanced settings, voice selector (NO speed control)
   * 
   * IMPORTANT: This function assumes audio format is already selected.
   * If format is not 'audio', it calls hideAllAudioFields() and returns early.
   * 
   * Speed control is only shown for providers that support it (OpenAI, ElevenLabs).
   */
  function updateAudioProviderUI() {
    const audioProvider = getElement('audioProvider');
    if (!audioProvider) return;
    
    // Safety check: If format is not audio, hide all audio fields and return
    // CRITICAL: Read format from mainFormatSelect first (user-facing control),
    // then fallback to outputFormat. This ensures we use the actual selected value.
    const mainFormatSelect = getElement('mainFormatSelect');
    const outputFormat = getElement('outputFormat');
    let format = outputFormat?.value;
    if (mainFormatSelect && mainFormatSelect.value) {
      format = mainFormatSelect.value;
    }
    if (format !== 'audio') {
      hideAllAudioFields();
      return;
    }
    
    const provider = audioProvider.value;
    const isElevenLabs = provider === 'elevenlabs';
    const isGoogle = provider === 'google';
    const isQwen = provider === 'qwen';
    const isRespeecher = provider === 'respeecher';
    // Speed is not supported by Qwen, Respeecher, and Google TTS (Google uses prompt for speed control)
    const capabilities = getElevenLabsCapabilities(elements.elevenlabsModel?.value);
    const supportsSpeed = isElevenLabs ? capabilities.speed : (isQwen ? isQwenAudioModel(elements.qwenModel?.value) : !(isRespeecher || isGoogle));
    
    // Show/hide ElevenLabs-specific fields
    setElementGroupDisplay('elevenlabsApiKeyGroup', isElevenLabs ? 'flex' : 'none');
    setElementGroupDisplay('elevenlabsModelGroup', isElevenLabs ? 'flex' : 'none');
    setElementGroupDisplay('elevenlabsFormatGroup', isElevenLabs ? 'flex' : 'none');
    setElementGroupDisplay('elevenlabsAdvancedGroup', isElevenLabs ? 'block' : 'none');
    
    // Show/hide Google TTS-specific fields
    // Note: format is already 'audio' at this point (checked at function start)
    setElementGroupDisplay('googleTtsApiKeyGroup', isGoogle ? 'flex' : 'none');
    setElementGroupDisplay('googleTtsModelGroup', isGoogle ? 'flex' : 'none');
    setElementGroupDisplay('googleTtsVoiceGroup', isGoogle ? 'flex' : 'none');
    setElementGroupDisplay('googleTtsPromptGroup', isGoogle ? 'block' : 'none');
    
    // Show/hide Qwen-specific fields
    setElementGroupDisplay('qwenApiKeyGroup', isQwen ? 'flex' : 'none');
    setElementGroupDisplay('qwenModelGroup', isQwen ? 'flex' : 'none');
    const workspaceRequired = isQwen && isQwenAudioModel(elements.qwenModel?.value);
    for (const group of ['qwenWorkspaceGroup', 'qwenRegionGroup']) setElementGroupDisplay(group, workspaceRequired ? 'flex' : 'none');
    /** @type {Array<[string, boolean]>} */
    const capabilityGroups = [['elevenlabsSimilarity', capabilities.similarity], ['elevenlabsStyle', capabilities.style], ['elevenlabsSpeakerBoost', capabilities.speakerBoost]];
    for (const [name, supported] of capabilityGroups) {
      const row = elements[name]?.closest('.setting-item');
      if (row) row.style.display = supported ? '' : 'none';
    }
    
    // Show/hide Respeecher-specific fields
    setElementGroupDisplay('respeecherApiKeyGroup', isRespeecher ? 'flex' : 'none');
    setElementGroupDisplay('respeecherAdvancedGroup', isRespeecher ? 'block' : 'none');
    
    // Show/hide OpenAI instructions (only for OpenAI provider)
    const isOpenAI = provider === 'openai';
    setElementGroupDisplay('openaiInstructionsGroup', isOpenAI ? 'block' : 'none');
    
    // Show/hide generic voice selector (for OpenAI, ElevenLabs, Qwen, Respeecher)
    // Hide for Google TTS (it has its own voice selector)
    setElementGroupDisplay('audioVoiceGroup', !isGoogle ? 'flex' : 'none');
    
    // Speed control only for providers that support it
    // Hide completely for Qwen/Respeecher/Google (they don't support speed)
    setElementGroupDisplay('audioSpeedGroup', supportsSpeed ? 'flex' : 'none');
    
    const audioSpeed = getElement('audioSpeed');
    if (audioSpeed) {
      if (preferredSpeed === null) preferredSpeed = audioSpeed.value;
      audioSpeed.disabled = !supportsSpeed;
      audioSpeed.min = isElevenLabs && capabilities.speed ? '0.7' : (isQwen && supportsSpeed ? '0.5' : baseSpeedMin);
      audioSpeed.max = isOpenAI ? String(OPENAI_TTS_MAX_SPEED) : (isElevenLabs && capabilities.speed ? '1.2' : (isQwen && supportsSpeed ? '2.0' : baseSpeedMax));
      audioSpeed.value = preferredSpeed;
      const audioSpeedValue = getElement('audioSpeedValue');
      if (audioSpeedValue) audioSpeedValue.textContent = `${Number(audioSpeed.value).toFixed(1)}x`;
    }
    
    const audioSpeedNote = getElement('audioSpeedNote');
    if (audioSpeedNote) {
      audioSpeedNote.style.display = 'none'; // Not needed since we hide the group completely
    }
    
    // Update voice list when provider changes
    // This ensures that the correct voices are shown and invalid voices are replaced
    updateVoiceList(provider);
  }

  /**
   * Get voice ID by index from audio voice select element
   * This function retrieves the actual voice ID from the option element at the given index
   * It checks dataset.voiceId first (most reliable), then option.value if it's not an index
   * @param {string} provider - TTS provider
   * @param {number} index - Selected index in audioVoice select
   * @returns {string|null} Voice ID or null if not found
   */
  function getVoiceIdByIndex(provider, index) {
    if (!elements.audioVoice || !elements.audioVoice.options || index < 0 || index >= elements.audioVoice.options.length) {
      return null;
    }
    
    const option = elements.audioVoice.options[index];
    if (!option) {
      return null;
    }
    
    // Priority 1: dataset.voiceId (most reliable - always contains actual voice ID)
    if (option.dataset && option.dataset.voiceId) {
      return option.dataset.voiceId;
    }
    
    // Priority 2: option.value (if not an index)
    if (option.value && !/^\d+$/.test(String(option.value))) {
      return option.value;
    }
    
    // If value is an index, we can't determine the voice ID from this function alone
    // This should not happen if updateVoiceList was called correctly
    return null;
  }

  return {
    saveAudioVoice,
    hideAllAudioFields,
    updateVoiceList,
    updateAudioProviderUI,
    getVoiceIdByIndex
  };
}


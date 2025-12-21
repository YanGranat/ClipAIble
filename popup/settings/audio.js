// Audio settings management module
// Handles TTS provider settings, voice selection, audio UI visibility

import { logWarn } from '../../scripts/utils/logging.js';
import { CONFIG } from '../../scripts/utils/config.js';

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
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE_MAP, { current: { ...audioVoiceMap.current } });
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
    const currentValue = savedProviderVoice || elements.audioVoice.value || '';
    elements.audioVoice.innerHTML = '';
    
    if (provider === 'elevenlabs') {
      // ElevenLabs voices (popular voices)
      const elevenlabsVoices = [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (female, clear)' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (female, strong)' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (female, warm)' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (male, deep)' },
        { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (female, young)' },
        { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (male, calm)' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (male, authoritative)' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (male, expressive)' },
        { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (male, friendly)' }
      ];
      
      elevenlabsVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      if (currentValue && elevenlabsVoices.find(v => v.id === currentValue)) {
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        elements.audioVoice.value = '21m00Tcm4TlvDq8ikWAM'; // Rachel
        saveAudioVoice(provider, '21m00Tcm4TlvDq8ikWAM');
      } else {
        elements.audioVoice.value = '21m00Tcm4TlvDq8ikWAM';
      }
      saveAudioVoice(provider, elements.audioVoice.value);
    } else if (provider === 'qwen') {
      // Qwen3-TTS-Flash-2025-11-27 voices (49 voices)
      const qwenVoices = [
        // Best for articles/education
        { id: 'Elias', name: '📚 Elias (academic, storytelling)' },
        { id: 'Neil', name: '📰 Neil (news anchor, professional)' },
        { id: 'Katerina', name: '🎭 Katerina (mature, rhythmic)' },
        { id: 'Ryan', name: '🎬 Ryan (dramatic, realistic)' },
        
        // Language-specific
        { id: 'Alek', name: '🇷🇺 Alek (Russian voice)' },
        { id: 'Jennifer', name: '🇺🇸 Jennifer (American English)' },
        { id: 'Emilien', name: '🇫🇷 Emilien (French)' },
        { id: 'Lenn', name: '🇩🇪 Lenn (German)' },
        { id: 'Dolce', name: '🇮🇹 Dolce (Italian)' },
        { id: 'Bodega', name: '🇪🇸 Bodega (Spanish)' },
        { id: 'Sonrisa', name: '🌎 Sonrisa (Latin American Spanish)' },
        { id: 'Andre', name: '🇵🇹 Andre (Portuguese European)' },
        { id: 'Radio Gol', name: '🇧🇷 Radio Gol (Portuguese Brazilian)' },
        { id: 'Sohee', name: '🇰🇷 Sohee (Korean)' },
        { id: 'Ono Anna', name: '🇯🇵 Ono Anna (Japanese)' },
        
        // General purpose
        { id: 'Cherry', name: 'Cherry (sunny, friendly)' },
        { id: 'Ethan', name: 'Ethan (warm, energetic)' },
        { id: 'Serena', name: 'Serena (gentle)' },
        { id: 'Chelsie', name: 'Chelsie (anime style)' },
        { id: 'Aiden', name: 'Aiden (American young man)' },
        { id: 'Maia', name: 'Maia (intelligent, gentle)' },
        { id: 'Kai', name: 'Kai (relaxing)' },
        { id: 'Nofish', name: 'Nofish (designer)' },
        
        // Character voices
        { id: 'Eldric Sage', name: '🧙 Eldric Sage (old wise man)' },
        { id: 'Arthur', name: '📖 Arthur (old storyteller)' },
        { id: 'Bellona', name: '⚔️ Bellona (powerful, epic)' },
        { id: 'Vincent', name: '🦸 Vincent (raspy, heroic)' },
        { id: 'Mia', name: 'Mia (gentle as snow)' },
        { id: 'Seren', name: '😴 Seren (soothing, ASMR)' }
      ];
      
      qwenVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      if (currentValue && qwenVoices.find(v => v.id === currentValue)) {
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        elements.audioVoice.value = 'Elias'; // Default - best for articles
        saveAudioVoice(provider, 'Elias');
      } else {
        elements.audioVoice.value = 'Elias';
      }
      saveAudioVoice(provider, elements.audioVoice.value);
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
        { id: 'fr_FR-mls_fr-medium', name: 'fr_FR-mls_fr-medium' },
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
      
      // Set value: use saved value if valid, otherwise use default
      // CRITICAL: Only save if value actually changed - don't overwrite saved voice unnecessarily
      if (currentValue && offlineVoices.find(v => v.id === currentValue)) {
        // Valid saved voice found - use it, don't save again
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        // Saved voice exists but not in list - use fallback for UI only, don't overwrite saved voice
        // This preserves user's saved voice even if it's temporarily unavailable
        elements.audioVoice.value = 'en_US-lessac-medium'; // Default for UI
        // Don't save - preserve user's saved voice
      } else {
        // No saved voice - use default and save it
        elements.audioVoice.value = 'en_US-lessac-medium';
        saveAudioVoice(provider, 'en_US-lessac-medium');
      }
      // CRITICAL: Don't save here - only save if value actually changed or was missing
    } else {
      // OpenAI voices
      const openaiVoices = [
        { value: 'nova', name: 'Nova (female, warm)' },
        { value: 'alloy', name: 'Alloy (neutral)' },
        { value: 'echo', name: 'Echo (male)' },
        { value: 'fable', name: 'Fable (expressive)' },
        { value: 'onyx', name: 'Onyx (male, deep)' },
        { value: 'shimmer', name: 'Shimmer (female, clear)' },
        { value: 'coral', name: 'Coral (female, friendly)' },
        { value: 'sage', name: 'Sage (neutral, calm)' },
        { value: 'ash', name: 'Ash (male, authoritative)' },
        { value: 'ballad', name: 'Ballad (expressive, dramatic)' },
        { value: 'verse', name: 'Verse (rhythmic)' }
      ];
      
      openaiVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.value;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      if (currentValue && openaiVoices.find(v => v.value === currentValue)) {
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        elements.audioVoice.value = CONFIG.DEFAULT_AUDIO_VOICE;
        saveAudioVoice(provider, CONFIG.DEFAULT_AUDIO_VOICE);
      } else {
        elements.audioVoice.value = CONFIG.DEFAULT_AUDIO_VOICE;
      }
      saveAudioVoice(provider, elements.audioVoice.value);
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
    const outputFormat = getElement('outputFormat');
    const format = outputFormat?.value;
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
    const supportsSpeed = !(isQwen || isRespeecher || isGoogle);
    
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
      audioSpeed.disabled = !supportsSpeed;
      if (!supportsSpeed) {
        audioSpeed.value = '1.0';
        const audioSpeedValue = getElement('audioSpeedValue');
        if (audioSpeedValue) {
          audioSpeedValue.textContent = '1.0x';
        }
      }
    }
    
    const audioSpeedNote = getElement('audioSpeedNote');
    if (audioSpeedNote) {
      audioSpeedNote.style.display = 'none'; // Not needed since we hide the group completely
    }
    
    // Update voice list when provider changes
    // This ensures that the correct voices are shown and invalid voices are replaced
    updateVoiceList(provider);
  }

  return {
    saveAudioVoice,
    hideAllAudioFields,
    updateVoiceList,
    updateAudioProviderUI
  };
}


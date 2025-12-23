// @ts-check
// Audio handlers (provider, voice, speed, provider-specific settings)

/**
 * Setup audio-related handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Object} [deps.settingsModule] - Settings module
 */
export function setupAudioHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    debouncedSaveSettings,
    log,
    logError,
    logWarn,
    settingsModule
  } = deps;

  // Audio provider handler
  if (elements.audioProvider) {
    elements.audioProvider.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.AUDIO_PROVIDER, elements.audioProvider.value, () => {
        if (settingsModule) {
          settingsModule.updateVoiceList(elements.audioProvider.value);
          settingsModule.updateAudioProviderUI();
        }
      });
    });
  }

  // Audio voice handler (complex logic for voice ID extraction)
  if (elements.audioVoice) {
    elements.audioVoice.addEventListener('change', () => {
      const provider = elements.audioProvider?.value || 'openai';
      const selectedIndex = elements.audioVoice.selectedIndex;
      const selectedOption = elements.audioVoice.options[selectedIndex];
      const selectedValue = elements.audioVoice.value;
      
      log('[ClipAIble Handlers] ===== AUDIO VOICE CHANGE EVENT =====', {
        timestamp: Date.now(),
        provider,
        selectedIndex,
        selectedValue,
        selectedValueType: typeof selectedValue,
        isNumeric: /^\d+$/.test(String(selectedValue)),
        optionText: selectedOption?.textContent,
        optionValue: selectedOption?.value,
        datasetVoiceId: selectedOption?.dataset?.voiceId,
        allOptionsCount: elements.audioVoice.options.length
      });
    
      log('[ClipAIble Handlers] ===== USER SELECTED VOICE IN UI =====', {
        timestamp: Date.now(),
        provider,
        selectedValue,
        selectedValueType: typeof selectedValue,
        selectedIndex,
        selectedOptionValue: selectedOption?.value,
        selectedOptionText: selectedOption?.textContent,
        isNumericIndex: /^\d+$/.test(String(selectedValue)),
        allOptions: Array.from(elements.audioVoice.options).map((opt, idx) => ({
          index: idx,
          value: opt.value,
          text: opt.textContent,
          isSelected: idx === selectedIndex
        }))
      });
      
      let voiceToSave = null;
      if (selectedOption) {
        log('[ClipAIble Handlers] ===== CHECKING VOICE ID SOURCES =====', {
          timestamp: Date.now(),
          provider,
          selectedIndex,
          hasDataset: !!selectedOption.dataset,
          datasetVoiceId: selectedOption.dataset?.voiceId,
          optionValue: selectedOption.value,
          selectValue: selectedValue,
          optionText: selectedOption.textContent,
          allDatasetKeys: selectedOption.dataset ? Object.keys(selectedOption.dataset) : []
        });
        
        if (selectedOption.dataset && selectedOption.dataset.voiceId) {
          voiceToSave = selectedOption.dataset.voiceId;
          log('[ClipAIble Handlers] ===== USING DATASET.VOICEID (SOURCE OF TRUTH) =====', {
            timestamp: Date.now(),
            provider,
            selectedIndex,
            datasetVoiceId: voiceToSave,
            datasetVoiceIdType: typeof voiceToSave,
            isNumeric: /^\d+$/.test(String(voiceToSave)),
            hasUnderscore: voiceToSave && String(voiceToSave).includes('_'),
            hasDash: voiceToSave && String(voiceToSave).includes('-'),
            optionValue: selectedOption.value,
            selectValue: selectedValue
          });
          
          if (/^\d+$/.test(String(voiceToSave))) {
            logWarn('[ClipAIble Handlers] CRITICAL: dataset.voiceId is index, trying to fix with cache', {
              index: voiceToSave,
              selectedIndex: selectedIndex,
              provider: provider,
              hasSettingsModule: !!settingsModule,
              hasGetVoiceIdByIndex: !!(settingsModule && settingsModule.getVoiceIdByIndex)
            });
            
            if (settingsModule && settingsModule.getVoiceIdByIndex) {
              const voiceIdFromCache = settingsModule.getVoiceIdByIndex(provider, selectedIndex);
              logWarn('[ClipAIble Handlers] CRITICAL: getVoiceIdByIndex returned', {
                provider,
                selectedIndex,
                voiceIdFromCache,
                voiceIdFromCacheType: typeof voiceIdFromCache,
                hasUnderscore: voiceIdFromCache && String(voiceIdFromCache).includes('_'),
                hasDash: voiceIdFromCache && String(voiceIdFromCache).includes('-'),
                willUse: !!(voiceIdFromCache && (voiceIdFromCache.includes('_') || voiceIdFromCache.includes('-') || provider !== 'offline'))
              });
              
              if (voiceIdFromCache && (voiceIdFromCache.includes('_') || voiceIdFromCache.includes('-') || provider !== 'offline')) {
                logWarn('[ClipAIble Handlers] CRITICAL: dataset.voiceId is index, CORRECTED using cache', {
                  originalIndex: voiceToSave,
                  selectedIndex: selectedIndex,
                  correctedVoiceId: voiceIdFromCache,
                  isValidFormat: true
                });
                voiceToSave = voiceIdFromCache;
              } else {
                logError('[ClipAIble Handlers] CRITICAL: getVoiceIdByIndex returned invalid/null', {
                  provider,
                  selectedIndex,
                  voiceIdFromCache: voiceIdFromCache,
                  isValidFormat: voiceIdFromCache && (voiceIdFromCache.includes('_') || voiceIdFromCache.includes('-'))
                });
              }
            } else {
              logError('[ClipAIble Handlers] CRITICAL: Cannot access getVoiceIdByIndex', {
                hasSettingsModule: !!settingsModule,
                hasGetVoiceIdByIndex: !!(settingsModule && settingsModule.getVoiceIdByIndex)
              });
            }
          }
        } else if (selectedOption.value && !/^\d+$/.test(String(selectedOption.value))) {
          voiceToSave = selectedOption.value;
          log('[ClipAIble Handlers] ===== USING OPTION.VALUE =====', {
            timestamp: Date.now(),
            provider,
            selectedIndex,
            optionValue: voiceToSave,
            selectValue: selectedValue
          });
        } else {
          logWarn('[ClipAIble Handlers] CRITICAL: option.value is index or missing, trying to find voice ID', {
            optionValue: selectedOption.value,
            selectedIndex,
            optionText: selectedOption.textContent,
            hasDataset: !!selectedOption.dataset,
            datasetVoiceId: selectedOption.dataset?.voiceId
          });
        }
      }
      
      if (!voiceToSave) {
        voiceToSave = selectedValue;
        logWarn('[ClipAIble Handlers] CRITICAL: No option.value, using select.value as fallback', {
          selectedValue,
          selectedIndex,
          willValidate: true
        });
        
        if (/^\d+$/.test(String(voiceToSave))) {
          const indexNum = parseInt(voiceToSave, 10);
          if (indexNum >= 0 && indexNum < elements.audioVoice.options.length) {
            const optionByIndex = elements.audioVoice.options[indexNum];
            if (optionByIndex && optionByIndex.value) {
              logWarn('[ClipAIble Handlers] CRITICAL: select.value is index, using option.value', {
                index: voiceToSave,
                correctedValue: optionByIndex.value,
                optionText: optionByIndex.textContent
              });
              voiceToSave = optionByIndex.value;
            } else {
              logError('[ClipAIble Handlers] CRITICAL: Cannot get voice ID from index', {
                index: voiceToSave,
                optionsLength: elements.audioVoice.options.length
              });
              return;
            }
          } else {
            logError('[ClipAIble Handlers] CRITICAL: Index out of range', {
              index: voiceToSave,
              optionsLength: elements.audioVoice.options.length
            });
            return;
          }
        }
      }
      
      log('[ClipAIble Handlers] ===== SAVING VOICE TO STORAGE =====', {
        timestamp: Date.now(),
        provider,
        voiceToSave,
        voiceToSaveType: typeof voiceToSave,
        isNumeric: /^\d+$/.test(String(voiceToSave)),
        hasUnderscore: voiceToSave && String(voiceToSave).includes('_'),
        hasDash: voiceToSave && String(voiceToSave).includes('-'),
        isValidFormat: voiceToSave && (voiceToSave.includes('_') || voiceToSave.includes('-') || provider !== 'offline'),
        willCallSaveAudioVoice: true
      });
      
      if (settingsModule && settingsModule.saveAudioVoice) {
        settingsModule.saveAudioVoice(provider, voiceToSave);
      } else {
        logError('[ClipAIble Handlers] CRITICAL: Cannot save voice - settingsModule.saveAudioVoice not available', {
          hasSettingsModule: !!settingsModule,
          hasSaveAudioVoice: !!(settingsModule && settingsModule.saveAudioVoice)
        });
      }
    });
  }
  
  // Audio speed handler
  if (elements.audioSpeed) {
    elements.audioSpeed.addEventListener('input', () => {
      const speed = parseFloat(elements.audioSpeed.value).toFixed(1);
      if (elements.audioSpeedValue) {
        elements.audioSpeedValue.textContent = speed + 'x';
      }
    });
    
    elements.audioSpeed.addEventListener('change', () => {
      const speed = parseFloat(elements.audioSpeed.value).toFixed(1);
      debouncedSaveSettings(STORAGE_KEYS.AUDIO_SPEED, speed);
    });
  }
  
  // ElevenLabs settings
  if (elements.elevenlabsModel) {
    elements.elevenlabsModel.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_MODEL, elements.elevenlabsModel.value);
    });
  }
  
  if (elements.elevenlabsFormat) {
    elements.elevenlabsFormat.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_FORMAT, elements.elevenlabsFormat.value);
    });
  }
  
  if (elements.elevenlabsStability) {
    elements.elevenlabsStability.addEventListener('input', () => {
      const value = parseFloat(elements.elevenlabsStability.value);
      if (elements.elevenlabsStabilityValue) {
        elements.elevenlabsStabilityValue.textContent = value.toFixed(1);
      }
    });
    
    elements.elevenlabsStability.addEventListener('change', () => {
      const value = parseFloat(elements.elevenlabsStability.value);
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STABILITY, value);
    });
  }
  
  if (elements.elevenlabsSimilarity) {
    elements.elevenlabsSimilarity.addEventListener('input', () => {
      const value = parseFloat(elements.elevenlabsSimilarity.value);
      if (elements.elevenlabsSimilarityValue) {
        elements.elevenlabsSimilarityValue.textContent = value.toFixed(1);
      }
    });
    
    elements.elevenlabsSimilarity.addEventListener('change', () => {
      const value = parseFloat(elements.elevenlabsSimilarity.value);
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SIMILARITY, value);
    });
  }
  
  if (elements.elevenlabsStyle) {
    elements.elevenlabsStyle.addEventListener('input', () => {
      const value = parseFloat(elements.elevenlabsStyle.value);
      if (elements.elevenlabsStyleValue) {
        elements.elevenlabsStyleValue.textContent = value.toFixed(1);
      }
    });
    
    elements.elevenlabsStyle.addEventListener('change', () => {
      const value = parseFloat(elements.elevenlabsStyle.value);
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STYLE, value);
    });
  }
  
  if (elements.elevenlabsSpeakerBoost) {
    elements.elevenlabsSpeakerBoost.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST, elements.elevenlabsSpeakerBoost.checked);
    });
  }
  
  // OpenAI instructions
  if (elements.openaiInstructions) {
    elements.openaiInstructions.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.OPENAI_INSTRUCTIONS, elements.openaiInstructions.value.trim());
    });
  }
  
  // Google TTS settings
  if (elements.googleTtsModel) {
    elements.googleTtsModel.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_MODEL, elements.googleTtsModel.value);
    });
  }
  
  if (elements.googleTtsVoice) {
    elements.googleTtsVoice.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_VOICE, elements.googleTtsVoice.value);
    });
  }
  
  if (elements.googleTtsPrompt) {
    elements.googleTtsPrompt.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_PROMPT, elements.googleTtsPrompt.value.trim());
    });
  }
  
  // Respeecher settings
  if (elements.respeecherTemperature) {
    elements.respeecherTemperature.addEventListener('input', () => {
      const value = parseFloat(elements.respeecherTemperature.value).toFixed(1);
      if (elements.respeecherTemperatureValue) {
        elements.respeecherTemperatureValue.textContent = value;
      }
    });
    
    elements.respeecherTemperature.addEventListener('change', () => {
      const value = parseFloat(elements.respeecherTemperature.value);
      debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_TEMPERATURE, value);
    });
  }
  
  if (elements.respeecherRepetitionPenalty) {
    elements.respeecherRepetitionPenalty.addEventListener('input', () => {
      const value = parseFloat(elements.respeecherRepetitionPenalty.value).toFixed(1);
      if (elements.respeecherRepetitionPenaltyValue) {
        elements.respeecherRepetitionPenaltyValue.textContent = value;
      }
    });
    
    elements.respeecherRepetitionPenalty.addEventListener('change', () => {
      const value = parseFloat(elements.respeecherRepetitionPenalty.value);
      debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY, value);
    });
  }
  
  if (elements.respeecherTopP) {
    elements.respeecherTopP.addEventListener('input', () => {
      const value = parseFloat(elements.respeecherTopP.value).toFixed(2);
      if (elements.respeecherTopPValue) {
        elements.respeecherTopPValue.textContent = value;
      }
    });
    
    elements.respeecherTopP.addEventListener('change', () => {
      const value = parseFloat(elements.respeecherTopP.value);
      debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_TOP_P, value);
    });
  }
}


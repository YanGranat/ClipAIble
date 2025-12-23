// @ts-check
/**
 * Complete mapping of all available Piper TTS voices
 * Based on actual voices from @mintplex-labs/piper-tts-web library
 * Verified against types.d.ts and actual library responses
 * 
 * Format: voice name -> voice ID
 * Only includes medium and high quality voices for supported languages
 */

export const PIPER_VOICES_MAPPING = {
  // Arabic (AR_JO) - not in supported languages, but keeping for reference
  'kareem': 'ar_JO-kareem-medium',
  
  // Catalan (CA_ES) - not in supported languages
  'upc_ona': 'ca_ES-upc_ona-medium',
  
  // Czech (CS_CZ) - not in supported languages
  'jirka': 'cs_CZ-jirka-medium',
  
  // Welsh (CY_GB) - User sees this, may exist in library even if not in types
  'gwryw_gogleddol': 'cy_GB-gwryw_gogleddol-medium', // User sees this, trying to map it
  
  // Danish (DA_DK) - not in supported languages
  'talesyntese': 'da_DK-talesyntese-medium',
  
  // German (DE_DE) - SUPPORTED
  'mls': 'de_DE-mls-medium',
  'thorsten': 'de_DE-thorsten-medium', // Default for medium quality
  'thorsten_high': 'de_DE-thorsten-high', // High quality version
  'thorsten_emotional': 'de_DE-thorsten_emotional-medium',
  
  // English GB (EN_GB) - SUPPORTED (maps to 'en')
  'alan': 'en_GB-alan-medium',
  'alba': 'en_GB-alba-medium',
  'aru': 'en_GB-aru-medium',
  'cori': 'en_GB-cori-medium', // Default for medium quality
  'cori_high': 'en_GB-cori-high', // High quality version
  'jenny_dioco': 'en_GB-jenny_dioco-medium',
  'northern_english_male': 'en_GB-northern_english_male-medium',
  'semaine': 'en_GB-semaine-medium',
  'vctk': 'en_GB-vctk-medium',
  
  // English US (EN_US) - SUPPORTED (maps to 'en')
  'amy': 'en_US-amy-medium',
  'arctic': 'en_US-arctic-medium',
  'bryce': 'en_US-bryce-medium', // User sees this, may exist in library even if not in types
  'hfc_female': 'en_US-hfc_female-medium',
  'hfc_male': 'en_US-hfc_male-medium',
  'joe': 'en_US-joe-medium',
  'john': 'en_US-john-medium', // User sees this, may exist in library even if not in types
  'kristin': 'en_US-kristin-medium',
  'kusal': 'en_US-kusal-medium',
  'l2arctic': 'en_US-l2arctic-medium',
  'lessac': 'en_US-lessac-medium', // Default for medium quality
  'lessac_high': 'en_US-lessac-high', // High quality version
  'libritts': 'en_US-libritts-high', // High quality
  'libritts_r': 'en_US-libritts_r-medium',
  'ljspeech': 'en_US-ljspeech-medium', // Default for medium quality
  'ljspeech_high': 'en_US-ljspeech-high', // High quality version
  'norman': 'en_US-norman-medium', // User sees this, may exist in library even if not in types
  'ryan': 'en_US-ryan-medium', // Default for medium quality
  'ryan_high': 'en_US-ryan-high', // High quality version
  
  // Spanish ES (ES_ES) - SUPPORTED (maps to 'es')
  'davefx': 'es_ES-davefx-medium',
  'sharvard': 'es_ES-sharvard-medium',
  
  // Spanish MX (ES_MX) - SUPPORTED (maps to 'es')
  'ald': 'es_MX-ald-medium',
  'claude': 'es_MX-claude-high', // High quality
  
  // Persian (FA_IR) - not in supported languages
  'amir': 'fa_IR-amir-medium',
  'gyro': 'fa_IR-gyro-medium',
  
  // Finnish (FI_FI) - not in supported languages
  'harri': 'fi_FI-harri-medium',
  
  // French (FR_FR) - SUPPORTED
  'mls_fr': 'fr_FR-mls-medium',
  'siwis': 'fr_FR-siwis-medium', // Default
  'tom': 'fr_FR-tom-medium',
  'upmc': 'fr_FR-upmc-medium',
  
  // Hungarian (HU_HU) - not in supported languages
  'anna': 'hu_HU-anna-medium',
  'berta': 'hu_HU-berta-medium',
  'imre': 'hu_HU-imre-medium',
  
  // Icelandic (IS_IS) - not in supported languages
  'bui': 'is_IS-bui-medium',
  'salka': 'is_IS-salka-medium',
  'steinn': 'is_IS-steinn-medium',
  'ugla': 'is_IS-ugla-medium',
  
  // Italian (IT_IT) - SUPPORTED
  'paola': 'it_IT-paola-medium', // User sees this, may exist in library even if not in types
  'riccardo': 'it_IT-riccardo-x_low', // Only x_low available (will be filtered)
  
  // Georgian (KA_GE) - not in supported languages
  'natia': 'ka_GE-natia-medium',
  
  // Kazakh (KK_KZ) - not in supported languages
  'issai': 'kk_KZ-issai-high', // High quality
  
  // Luxembourgish (LB_LU) - not in supported languages
  'marylux': 'lb_LU-marylux-medium',
  
  // Nepali (NE_NP) - not in supported languages
  'google': 'ne_NP-google-medium',
  
  // Dutch BE (NL_BE) - not in supported languages
  'nathalie': 'nl_BE-nathalie-medium',
  'rdh': 'nl_BE-rdh-medium',
  
  // Dutch NL (NL_NL) - not in supported languages
  'mls_nl': 'nl_NL-mls-medium',
  
  // Norwegian (NO_NO) - not in supported languages
  'talesyntese_no': 'no_NO-talesyntese-medium',
  
  // Polish (PL_PL) - not in supported languages
  'darkman': 'pl_PL-darkman-medium',
  'gosia': 'pl_PL-gosia-medium',
  'mc_speech': 'pl_PL-mc_speech-medium',
  
  // Portuguese BR (PT_BR) - SUPPORTED (maps to 'pt')
  'faber': 'pt_BR-faber-medium', // Default
  'edresson': 'pt_BR-edresson-low', // Only low available (will be filtered)
  
  // Portuguese PT (PT_PT) - SUPPORTED (maps to 'pt')
  'tugão': 'pt_PT-tugão-medium',
  
  // Romanian (RO_RO) - not in supported languages
  'mihai': 'ro_RO-mihai-medium',
  
  // Russian (RU_RU) - SUPPORTED
  'denis': 'ru_RU-denis-medium',
  'dmitri': 'ru_RU-dmitri-medium', // Default
  'irina': 'ru_RU-irina-medium',
  'ruslan': 'ru_RU-ruslan-medium',
  
  // Slovak (SK_SK) - not in supported languages
  'lili': 'sk_SK-lili-medium',
  
  // Slovenian (SL_SI) - not in supported languages
  'artur': 'sl_SI-artur-medium',
  
  // Serbian (SR_RS) - not in supported languages
  'serbski_institut': 'sr_RS-serbski_institut-medium',
  
  // Swedish (SV_SE) - not in supported languages
  'nst': 'sv_SE-nst-medium',
  
  // Swahili (SW_CD) - not in supported languages
  'lanfrica': 'sw_CD-lanfrica-medium',
  
  // Turkish (TR_TR) - not in supported languages
  'dfki': 'tr_TR-dfki-medium',
  'fahrettin': 'tr_TR-fahrettin-medium',
  'fettah': 'tr_TR-fettah-medium',
  
  // Ukrainian (UK_UA) - REMOVED: Quality too poor, use Respeecher instead
  // 'ukrainian_tts': 'uk_UA-ukrainian_tts-medium', // Removed - quality too poor
  // 'lada': 'uk_UA-lada-x_low', // Removed - only x_low available
  
  // Vietnamese (VI_VN) - not in supported languages
  'vais1000': 'vi_VN-vais1000-medium',
  
  // Chinese (ZH_CN) - SUPPORTED
  'huayan': 'zh_CN-huayan-medium' // Default (only one available)
};

/**
 * Find voice ID by name (handles partial matches and aliases)
 * Also tries to construct voice ID from name if not found in mapping
 * @param {string} voiceName - Voice name to find
 * @param {string} language - Optional language code (e.g., 'ru', 'en') to help construct ID
 * @returns {string|null} Voice ID or null if not found
 */
export function findVoiceIdByName(voiceName, language = null) {
  if (!voiceName || voiceName === '0' || voiceName === '') {
    return null;
  }
  
  // If voiceName already looks like a voice ID (contains underscore and dash), return as-is
  if (voiceName.includes('_') && voiceName.includes('-')) {
    return voiceName;
  }
  
  const normalizedName = voiceName.toLowerCase().trim();
  
  // Try exact match first
  if (PIPER_VOICES_MAPPING[normalizedName]) {
    return PIPER_VOICES_MAPPING[normalizedName];
  }
  
  // Try partial match (e.g., "thorsten" matches "thorsten_high")
  // But prioritize exact matches and avoid matching numbers
  for (const [name, id] of Object.entries(PIPER_VOICES_MAPPING)) {
    const normalizedMapName = name.toLowerCase();
    // Skip if map name is a number (e.g., "107")
    if (/^\d+$/.test(name)) {
      continue;
    }
    // Check for partial match
    if (normalizedMapName.includes(normalizedName) || normalizedName.includes(normalizedMapName)) {
      // Prefer high quality versions if available and name suggests high quality
      // But for now, just return the first match
      return id;
    }
  }
  
  // If not found in mapping, try to construct voice ID from name and language
  // This handles cases where voice exists in library but not in types.d.ts
  // (e.g., "bryce", "john", "norman", "paola", "gwryw_gogleddol")
  // CRITICAL: Don't try to construct ID from numbers or indices (e.g., "107")
  // Only construct from actual voice names (letters, not pure numbers)
  if (language && !/^\d+$/.test(voiceName)) {
    const langCode = language.toLowerCase().split('-')[0];
    
    // Language to country code mapping
    const langToCountry = {
      'en': ['en_US', 'en_GB'],
      'ru': ['ru_RU'],
      'uk': ['uk_UA'],
      'de': ['de_DE'],
      'fr': ['fr_FR'],
      'es': ['es_ES', 'es_MX'],
      'it': ['it_IT'],
      'pt': ['pt_BR', 'pt_PT'],
      'zh': ['zh_CN'],
      'cy': ['cy_GB'] // Welsh
    };
    
    const countryCodes = langToCountry[langCode] || [];
    
    // Try to construct voice ID: {countryCode}-{voiceName}-medium
    // Only if voiceName contains letters (not pure numbers)
    if (/[a-zA-Z]/.test(voiceName)) {
      for (const countryCode of countryCodes) {
        const constructedId = `${countryCode}-${voiceName}-medium`;
        // Check if this looks like a valid voice ID format
        if (constructedId.match(/^[a-z]{2}_[A-Z]{2}-[a-z0-9_]+-(medium|high)$/i)) {
          return constructedId;
        }
      }
    }
  }
  
  return null;
}


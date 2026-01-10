// @ts-check
// Author validation utility
// Centralized function to check if author is anonymous/invalid

/**
 * List of all possible anonymous/invalid author values in all supported languages
 * This includes original values and their translations
 */
const ANONYMOUS_AUTHOR_VARIANTS = [
  // English
  'anonymous',
  '(anonymous)',
  // Russian
  'анонимный',
  '(анонимный)',
  // Ukrainian
  'анонімний',
  '(анонімний)',
  'анонім',  // Short form
  'Анонім',  // Capitalized form
  // German
  'anonym',
  '(anonym)',
  // French
  'anonyme',
  '(anonyme)',
  // Spanish
  'anónimo',
  '(anónimo)',
  // Italian
  'anonimo',
  '(anonimo)',
  // Portuguese
  'anônimo',
  '(anônimo)',
  'anonimo',
  '(anonimo)',
  // Chinese
  '匿名',
  '(匿名)',
  // Japanese
  '匿名',
  '(匿名)',
  // Korean
  '익명',
  '(익명)'
];

/**
 * Check if author is anonymous or invalid
 * @param {string} author - Author string to check
 * @returns {boolean} True if author is anonymous/invalid, false otherwise
 */
export function isAnonymousAuthor(author) {
  if (!author || typeof author !== 'string') {
    return true; // Empty or invalid author is considered anonymous
  }
  
  const authorTrimmed = author.trim();
  if (!authorTrimmed) {
    return true; // Empty string is anonymous
  }
  
  // Check against all known anonymous variants (case-insensitive)
  const authorLower = authorTrimmed.toLowerCase();
  for (const variant of ANONYMOUS_AUTHOR_VARIANTS) {
    if (authorLower === variant.toLowerCase()) {
      return true;
    }
  }
  
  // Also check if it's just "anonymous" (case-insensitive)
  if (authorLower === 'anonymous') {
    return true;
  }
  
  return false;
}

/**
 * Clean author string - remove anonymous values and return empty string if invalid
 * @param {string} author - Author string to clean
 * @returns {string} Cleaned author string, or empty string if anonymous/invalid
 */
export function cleanAuthor(author) {
  if (isAnonymousAuthor(author)) {
    return '';
  }
  return author.trim();
}


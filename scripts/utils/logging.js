// @ts-check
// Backward compatibility: re-export from logging/ directory
// This file maintains backward compatibility for existing imports
//
// NOTE: This is an intentional backward compatibility layer, NOT a temporary solution.
// All 133+ files in the codebase use '../utils/logging.js' or './logging.js' imports.
// This file provides a clean, consistent import path across the entire codebase.
//
// Structure:
//   utils/logging.js (this file) → utils/logging/index.js → utils/logging/logging.js + logging-port.js
//
// Benefits of current approach:
//   - Single consistent import path: '../utils/logging.js' works from any location
//   - No need to know internal structure (logging.js vs logging-port.js)
//   - Easy to refactor internal structure without breaking imports
//   - Matches pattern used by other utils modules (html/, security/, storage/, etc.)
//
// No action needed - this is the correct architecture.

export * from './logging/index.js';



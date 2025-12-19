// Settings-related message handlers
// Handlers: exportSettings, importSettings

import { exportSettings, importSettings } from '../settings/import-export.js';
import { withErrorHandling } from './utils.js';

/**
 * Handle exportSettings request
 */
export function handleExportSettings(request, sender, sendResponse) {
  return withErrorHandling(
    exportSettings(request.includeStats, request.includeCache)
      .then(jsonData => ({ success: true, data: jsonData })),
    'settingsExportFailed',
    sendResponse
  );
}

/**
 * Handle importSettings request
 */
export function handleImportSettings(request, sender, sendResponse) {
  return withErrorHandling(
    importSettings(request.jsonData, request.options)
      .then(result => ({ success: true, result })),
    'settingsImportFailed',
    sendResponse
  );
}



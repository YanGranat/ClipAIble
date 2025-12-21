// Wrapper module for onnxruntime-web
// This module exports window.ort or global ort as a default export
// Used when onnxruntime-web is loaded via script tag

// Check for ort in various global contexts
let ortModule = null;

if (typeof window !== 'undefined' && window.ort) {
  ortModule = window.ort;
} else if (typeof globalThis !== 'undefined' && globalThis.ort) {
  ortModule = globalThis.ort;
} else if (typeof self !== 'undefined' && self.ort) {
  ortModule = self.ort;
} else if (typeof global !== 'undefined' && global.ort) {
  ortModule = global.ort;
} else {
  // Try to find ort in the global scope
  try {
    // ort.min.js may create a variable 'ort' in the global scope
    // In strict mode, we need to access it via eval or window
    if (typeof window !== 'undefined') {
      ortModule = window['ort'] || window.ort;
    }
  } catch (e) {
    console.error('[ClipAIble Wrapper] Failed to access ort from global scope', e);
  }
}

if (!ortModule) {
  const errorMsg = 'onnxruntime-web not loaded. Make sure ort.min.js is loaded before this module. ' +
    `Checked: window.ort=${!!window?.ort}, globalThis.ort=${!!globalThis?.ort}, self.ort=${!!self?.ort}`;
  console.error('[ClipAIble Wrapper]', errorMsg);
  throw new Error(errorMsg);
}

// Export ortModule as default export
export default ortModule;

// Also export named exports if available
export const InferenceSession = ortModule?.InferenceSession;
export const Tensor = ortModule?.Tensor;
export const env = ortModule?.env;


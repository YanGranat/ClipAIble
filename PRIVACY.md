# Privacy Policy for ClipAIble

Last updated: November 2026

ClipAIble processes selected web pages, video subtitles, and PDFs in the browser and through the external services used by enabled features.

## Local data

The extension uses Chrome extension storage, IndexedDB, and local model caches for:

- API keys, settings, custom AI prompts, selected models, and voice preferences.
- Processing state and temporary document-preparation data, including extracted content and PDF, image, print, and audio records.
- Generated summaries and key claims.
- Usage statistics and saved-item history, including page titles and URLs. Collection is enabled by default. To stop recording new entries, turn off **Enable statistics collection** in **Statistics**.
- Cached content selectors and downloaded local speech models.

API keys are stored using AES-256-GCM encryption with a non-extractable, installation-specific key kept in the extension's IndexedDB. Older encrypted settings are migrated locally. The extension decrypts API keys locally to authenticate requests to the corresponding service.

## External requests

Custom AI prompts are sent to the provider when the corresponding feature runs.

AI extraction, translation, summaries, and key claims send the required page content and metadata to the selected AI service. Depending on the extraction mode, this can include page HTML, extracted text, or rendered PDF pages. For YouTube exports, the selected AI service can receive the title and description to help select a subtitle track. For YouTube and Vimeo, it receives the subtitles to structure an article.

The OCR extraction mode recognizes PDF text on your device. If you also select cloud translation or narration, the recognized text is sent to the selected service for that step.

With Gemini image translation, the article AI service receives images for text detection. Google Gemini receives images that the detector flags as needing translation. With OpenAI image translation, both detection and editing use OpenAI. With OpenRouter image translation, OpenRouter receives images for text detection and routes flagged images to the selected editor.

Cloud audio generation sends narration text to the selected TTS service. A custom narration preparation prompt also sends text to the selected article AI service. When OpenRouter is selected for synthesis, it routes the request to the selected model provider. Piper and Supertonic narration run locally. The article AI, image translation, and TTS providers can be configured separately.

Retrieving source images, online PDFs, and video subtitles makes requests to their source websites. Piper retrieves voice lists and model files from Hugging Face. Supertonic contacts Hugging Face to download the model when the user chooses to install it. These downloads do not include article text.

The external services used by these features include OpenAI, Google, Anthropic, DeepSeek, xAI, OpenRouter, ElevenLabs, DashScope, Respeecher, and Hugging Face. Each service handles requests under its own terms and privacy policy.

## Retention and controls

Settings, summaries, key claims, processing state, statistics, selector cache, and voice models can remain locally until replaced, cleared, or removed with the extension's stored data. Temporary document-preparation records are used during processing and cleaned up by the owning workflow or startup recovery.

ClipAIble keeps up to 50 recent history entries. In **Statistics**, you can delete individual history entries without resetting totals, clear statistics and history, or clear the selector cache. Turning off statistics collection does not delete prior entries. Closing a summary or key-claims panel clears its saved text.

Settings exports exclude API keys and include saved custom AI prompts. If you include statistics or selector cache, the exported file contains that data, including saved-item history where present.

Chrome removes its local extension storage when the extension is uninstalled. Documents and audio already saved to your computer remain in your downloads.

## Contact

For privacy questions, open an issue in the [project repository](https://github.com/YanGranat/ClipAIble/issues).

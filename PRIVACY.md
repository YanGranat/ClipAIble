# Privacy Policy for ClipAIble

Last updated: November 2026

ClipAIble processes selected web pages, video subtitles, and PDFs in the browser and through the external services used by enabled features.

## Local data

The extension uses Chrome extension storage, IndexedDB, and local model caches for:

- API keys, settings, selected models, and voice preferences.
- Processing state and temporary document-preparation data, including extracted content and PDF, image, print, and audio records.
- Generated summaries and key claims.
- Usage statistics and saved-item history, including page titles and URLs. Collection is enabled by default and can be disabled in Settings.
- Cached content selectors and downloaded Piper voice models.

API keys are stored using AES-256-GCM encryption with a non-extractable, installation-specific key kept in the extension's IndexedDB. Older encrypted settings are migrated locally. The extension decrypts API keys locally to authenticate requests to the corresponding service.

## External requests

AI extraction, translation, summaries, and key claims send the required page content and metadata to the selected AI service. Depending on the extraction mode, this can include page HTML, extracted text, or rendered PDF pages. Video subtitles are sent to the selected AI service to structure an article.

With Gemini image translation, selected images are sent to the article AI service for text detection and to Google Gemini for editing. With OpenAI image translation, both detection and editing use OpenAI.

Cloud audio generation can send article text to the selected article AI service to prepare the narration, then sends the prepared text to the selected TTS service. Piper narration preparation and synthesis run locally. The article AI, image translation, and TTS providers can be configured separately.

Retrieving source images, online PDFs, and video subtitles makes requests to their source websites. Piper downloads voice lists and model files from Hugging Face; speech synthesis then runs locally using the downloaded model.

The external services used by these features include OpenAI, Google, Anthropic, DeepSeek, xAI, OpenRouter, ElevenLabs, DashScope, Respeecher, and Hugging Face. Each service handles requests under its own terms and privacy policy.

## Retention and controls

Settings, summaries, key claims, processing state, statistics, selector cache, and voice models can remain locally until replaced, cleared, or removed with the extension's stored data. Temporary document-preparation records are used during processing and cleaned up by the owning workflow or startup recovery.

The Stats panel provides controls to clear statistics and selector cache. Closing a summary or key-claims panel clears its saved text. These controls clear the named data; they do not clear all extension storage.

Settings exports exclude API keys. If you include statistics or selector cache, the exported file contains that data, including saved-item history where present.

Chrome removes its local extension storage when the extension is uninstalled. Documents and audio already saved to your computer remain in your downloads.

## Contact

For privacy questions, open an issue in the [project repository](https://github.com/YanGranat/ClipAIble/issues).

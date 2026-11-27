# ClipAIble Technical Overview

## Runtime

ClipAIble is a Manifest V3 Chrome extension with native ES modules and a background service worker. Its manifest sets Chrome 116 as the minimum version.

- `scripts/background.js` coordinates requests, processing state, and downloads.
- `popup/` contains the toolbar interface and settings.
- `scripts/content.js` receives subtitle requests on YouTube pages. Article extraction is injected into the selected page through `chrome.scripting`.
- `offscreen.html` loads `dist/offscreen-bundle.js` for PDF.js, image decoding and conversion, local speech synthesis, and Blob download preparation.
- `src/tts-worker-entry.js` builds into `dist/tts-worker-bundle.js`. Piper phonemization and ONNX Runtime inference run in this worker with the WebAssembly execution provider.
- `scripts/offscreen/supertonic/worker.js` runs Supertonic synthesis using the same packaged ONNX Runtime. The worker reads model files from the extension cache.
- `print/print.html` receives an owned print job and renders the document for PDF export through Chrome's debugging and print interfaces.

The manifest declares extension-origin scripts and WebAssembly in its Content Security Policy. Bundled libraries, fonts, PDF resources, and WebAssembly files are loaded from the extension. Local speech models are downloaded separately. See [Permissions](../PERMISSIONS.md) for the declared permissions and their uses.

## Processing

The processing pipeline validates the request, acquires the source content, extracts its structure, applies the requested translation and formatting, and generates the selected output.

For web articles:

- **Automatic** uses local heuristics and available cached selectors.
- **AI Selector** uses cached CSS selectors when available and enabled. Otherwise, it asks the selected AI provider for selectors. ClipAIble extracts the matching content locally.
- **AI Extract** asks the provider to produce structured content from page HTML, using chunks for large inputs.

For PDFs, Automatic parses the text layer and layout with PDF.js. AI modes render pages with PDF.js and send them to an image-capable AI model. To open a local PDF, ClipAIble tries direct file access if Chrome allows it, then tries to read the PDF from the active tab before requesting the matching file in the popup. See the [PDF module](../scripts/offscreen/pdf/README.md).

YouTube and Vimeo exports use the selected article AI provider to turn available subtitles into an article, regardless of the extraction mode. The output generators create PDF, EPUB, FB2, Markdown, or audio.

The PDF generator measures the rendered document in the print tab. If **Single long page** would exceed the 200-inch PDF page height limit, it exports the document on A4 pages.

`scripts/state/processing.js` owns document progress, cancellation, and terminal state. Each document operation has a `processingRunId`; asynchronous updates must still belong to that operation. After a service worker restart, startup restores progress, reconciles interrupted work, and cleans owned temporary resources. Summary and key-claim generation have separate job owners.

## Content representation

`scripts/types.js` defines `ContentItem`. The generators consume headings, paragraphs, standfirsts (`subtitle`), images, code, lists, quotes, tables, and infobox boundaries.

- `format: 'text'` marks plain text that must be escaped at serialization.
- `html` carries rich content that is sanitized before rendering. List-item objects can contain nested lists in this field.
- Legacy AI text without an explicit format uses the Markdown renderer.
- Tables declare `cellFormat` as `text`, `html`, or `markdown`; `headers`, `hasHeaders`, and `rows` describe the table structure.
- Images carry a source URL, optional caption and alt text. Image loading validates the response and decodes it before embedding; SVG, WebP, and AVIF are converted through the offscreen image service when needed.

PDF.js text items also retain line and font information used by native PDF extraction. The document generators preserve the distinction between plain text, rich HTML, and Markdown.

## Services

The text AI adapters support OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter, and DeepSeek. `scripts/utils/model-catalog.js` holds model IDs, labels, capabilities, defaults, and saved-model migrations. Request adapters apply provider-specific parameters and validate responses.

Image translation is available for PDF, EPUB, and FB2 when a target language is selected. With Google Gemini, the selected article model detects text in images and the chosen **Image model** edits them with a Google AI API key. With OpenAI, dedicated OpenAI models handle both steps with the OpenAI API key. With OpenRouter, an image-capable detection model checks for text and the selected editor receives eligible images through the OpenRouter Images API. Model bindings and supported output formats are defined in `scripts/api/image-translation-catalog.js`.

Audio supports OpenAI, ElevenLabs, Google Gemini, OpenRouter, Qwen, Respeecher, and local Piper and Supertonic. OpenRouter sends narration to its Speech API using the selected model and voice. OpenRouter credentials are stored separately for text, image translation, and speech. Model and voice capabilities determine the available controls. Custom cloud narration preparation uses the selected text AI service when enabled. Piper and Supertonic synthesize locally after their model files are downloaded.

Transport retries are bounded and respect cancellation, terminal errors, and request admission. Processing errors and progress messages carry translation keys and interpolation parameters for the popup. See [Privacy](../PRIVACY.md) for the content sent to external services.

## Storage and resource ownership

- `chrome.storage.local` stores settings, encrypted API keys, progress, summaries, key claims, selector cache, and usage history. The manifest requests `unlimitedStorage`.
- Extension-origin IndexedDB stores the non-extractable AES-GCM installation key and owned binary or document-preparation records, including PDF bytes, rendered pages, print jobs, image operations, and audio downloads.
- Piper voice models are cached in the Origin Private File System (OPFS).
- Supertonic uses a versioned Cache Storage namespace. The extension verifies the byte length and SHA-256 of each model file before marking the download complete. Both publisher download locations are pinned to specific revisions.

API keys are encrypted with AES-256-GCM using the installation key. Legacy encrypted values are migrated locally. Settings exports exclude API keys. Job identifiers and run ownership bind temporary records to their consumers; completion, cancellation, and startup recovery perform the corresponding cleanup.

## Build and tests

In a source checkout, use a Node.js version accepted by `package.json`:

```sh
npm ci
npm run build
npm test
```

`npm run build` generates and applies the Automatic extractor, builds the offscreen bundle, and builds the TTS worker. The authored extractor lives under `scripts/extraction/extractor/`; `scripts/extraction/automatic.js` is its generated runtime artifact.

For local development, `npm run build:offscreen:watch` and `npm run build:worker:watch` rebuild their respective bundles. `npm run dev` starts the offscreen watcher. Reload the unpacked extension after a build.

```sh
npm run package:production
```

The packager builds the extension and writes the runtime ZIP and matching `-sources.zip` under `workspace/releases/`. Pass a custom output ZIP path after `--`. The source archive includes the build inputs and [third-party source kits](https://github.com/YanGranat/ClipAIble/blob/main/third_party/sources/README.md). See the [test commands](https://github.com/YanGranat/ClipAIble/blob/main/tests/README.md).

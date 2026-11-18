# ClipAIble Technical Overview

## Runtime

ClipAIble is a Manifest V3 Chrome extension for Chrome 116 or newer. It uses native ES modules and a background service worker.

- `scripts/background.js` coordinates requests, processing state, and downloads.
- `popup/` contains the toolbar interface and settings.
- `scripts/content.js` receives subtitle requests on YouTube pages. Article extraction is injected into the selected page through `chrome.scripting`.
- `offscreen.html` loads `dist/offscreen-bundle.js` for PDF.js, image decoding and conversion, local speech synthesis, and Blob download preparation.
- `src/tts-worker-entry.js` builds into `dist/tts-worker-bundle.js`. Piper phonemization and ONNX Runtime inference run in this worker with the WebAssembly execution provider.
- `print/print.html` receives an owned print job and renders the document for PDF export through Chrome's debugging and print interfaces.

The manifest declares extension-origin scripts and WebAssembly in its Content Security Policy. Bundled libraries, fonts, PDF resources, and WebAssembly files are loaded from the extension. Piper voice models are downloaded separately. See [Permissions](../PERMISSIONS.md) for the declared permissions and their uses.

## Processing

The processing pipeline validates the request, acquires the source content, extracts its structure, applies the requested translation and formatting, and generates the selected output.

For web articles:

- **Automatic** uses local heuristics and available cached selectors.
- **AI Selector** asks the selected AI provider for CSS selectors, then extracts the matching content locally.
- **AI Extract** asks the provider to produce structured content from page HTML, using chunks for large inputs.

For PDFs, Automatic parses the text layer and layout with PDF.js. AI modes render pages with PDF.js and send them to an image-capable AI model. Local PDFs are read directly when Chrome file access is allowed; otherwise the popup requests the matching file. See the [PDF module](../scripts/offscreen/pdf/README.md).

Supported video pages supply subtitles, which the AI pipeline turns into an article. The output generators create PDF, EPUB, FB2, Markdown, or audio.

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

Image translation has its own Gemini or OpenAI provider setting. The model bindings and supported output formats are defined in `scripts/api/image-translation-catalog.js`. Image editing credentials are selected independently of the article provider.

Audio supports OpenAI, ElevenLabs, Google Gemini, Qwen, Respeecher, and local Piper. Model and voice capabilities determine the available controls. Cloud narration preparation can use the selected text AI service before synthesis; Piper preparation and synthesis run locally after a voice model has been downloaded.

Transport retries are bounded and respect cancellation, terminal errors, and request admission. Processing errors and progress messages carry translation keys and interpolation parameters for the popup. See [Privacy](../PRIVACY.md) for the content sent to external services.

## Storage and resource ownership

- `chrome.storage.local` stores settings, encrypted API keys, progress, summaries, key claims, selector cache, and usage history. The manifest requests `unlimitedStorage`.
- Extension-origin IndexedDB stores the non-extractable AES-GCM installation key and owned binary or document-preparation records, including PDF bytes, rendered pages, print jobs, image operations, and audio downloads.
- Piper voice models are cached in the Origin Private File System (OPFS).

API keys are encrypted with AES-256-GCM using the installation key. Legacy encrypted values are migrated locally. Settings exports exclude API keys. Job identifiers and run ownership bind temporary records to their consumers; completion, cancellation, and startup recovery perform the corresponding cleanup.

## Build and tests

Use a Node.js version accepted by `package.json`:

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

The packager builds the extension and writes the runtime ZIP and matching `-sources.zip` under `workspace/releases/`. A custom output ZIP path can be passed after `--`. The source archive includes the build inputs and third-party source kits; see [Third-party source](../third_party/sources/README.md). Test commands are documented in [tests/README.md](../tests/README.md).

# ClipAIble

Save web articles as PDF, EPUB, FB2, Markdown, or audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Usage

1. Open an article, supported video, or PDF.
2. Click the ClipAIble toolbar icon.
3. Select an output format and extraction mode.
4. Click **Save**.

The page context menu also provides save actions. For local PDFs, AI modes request the file through a file picker.

**Automatic** uses local extraction heuristics. **AI Selector** asks an AI provider for content selectors, then extracts the selected page content. **AI Extractor** asks an AI provider to structure the content.

Settings include translation, image translation, document styles, a table of contents, summaries, and key theses. Audio can use a configured TTS service or local Piper synthesis after downloading a voice model.

Add the API keys required by the AI and TTS features you select. Settings export excludes API keys and can optionally include statistics and selector cache.

## Development

Requires Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`.

Install dependencies and build the extension:

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project folder.

```sh
npm test
```

See [Permissions](PERMISSIONS.md), [Privacy](PRIVACY.md), and the [technical overview](docs/technical-overview.md).

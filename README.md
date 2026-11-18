# ClipAIble

Save web articles as PDF, EPUB, FB2, Markdown, or audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Usage

1. Open an article, supported video, or PDF.
2. Click the ClipAIble toolbar icon.
3. Select an output format and extraction mode.
4. Click **Save**.

The page context menu also provides save actions. For local PDFs, allow file access in Chrome's extension settings or select the matching file when prompted. Keep the popup open if a file selection is needed.

For web articles, **Automatic** uses local extraction heuristics and available cached selectors. **AI Selector** asks an AI provider for content selectors, then extracts the selected page content. **AI Extract** asks an AI provider to structure the content. For PDFs, Automatic extracts the text layer; AI modes process rendered pages.

Settings include translation, image translation, document styles, and a table of contents. The popup can also generate a summary or key claims. Audio can use a configured TTS service or local Piper synthesis after downloading a voice model.

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
npm run check
npm test
```

See [Permissions](PERMISSIONS.md), [Privacy](PRIVACY.md), and the [technical overview](docs/technical-overview.md).

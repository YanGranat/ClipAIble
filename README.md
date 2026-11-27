# ClipAIble

Save web articles as PDF, EPUB, FB2, Markdown, or audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Usage

1. Open a web article, a PDF, or a YouTube or Vimeo video with subtitles.
2. Click the ClipAIble toolbar icon.
3. Select an output format. Open **Settings** to change the extraction mode.
4. Click **Save**.

The page context menu also provides save actions using your saved settings. For direct access to local PDFs, turn on **Allow access to file URLs** in Chrome's extension settings. If ClipAIble asks you to select the file, keep the popup open and choose the same PDF.

For web articles, **Automatic** uses local extraction heuristics and available cached selectors. **AI Selector** finds content with CSS selectors, asking the AI provider for selectors when needed. **AI Extract** asks the AI provider to structure the content. For PDFs, **Automatic** reads the text layer. Either AI mode sends rendered pages to a model that accepts images.

Video exports use the selected article AI provider to turn subtitles into an article. They require its API key even in **Automatic**.

In PDF settings, **Page Layout** offers **Single long page** or **Multiple pages (A4)**. If the document is too tall for a single PDF page, ClipAIble switches to A4 pages automatically.

### Translate images

Select PDF, EPUB, or FB2. In **Settings**, choose a **Target Language** other than **Auto (original)**, turn on **Translate images**, and choose an **Image translation provider**.

For **Google Gemini**, choose an **Image model** and save your **Google AI API Key** from [Google AI Studio](https://aistudio.google.com/docs/api-key). To detect text, choose an article model that accepts images and add its provider's API key. The Gemini image model edits images after detection.

With **OpenAI**, OpenAI detects and edits the text. Enter your **OpenAI API Key** in the image translation settings and click **Save**. If you already saved an OpenAI key, ClipAIble uses it here too. Your article AI provider stays unchanged.

With **OpenRouter**, choose a Gemini or GPT Image editor in **Image model** and save an **OpenRouter API Key** next to it. The editor is independent of the article AI provider.

### Other options

Settings include text translation, document styles, and a table of contents. The popup can generate a summary or key claims. For local narration, select **Audio**, open **Settings**, and choose **Piper TTS** or **Supertonic 3** under **TTS Provider**. Supertonic downloads one 401 MB model for all its voices. Its model can be removed from the same settings. For OpenRouter speech, choose **OpenRouter**, then select a model and voice. Text, image translation, and speech have separate OpenRouter API key fields.

Open **Settings → Advanced settings** to review and edit AI prompts. Changes apply to new jobs.

Add the API keys required by the AI and TTS features you select.

### Back up settings

In **Settings**, choose **Export Settings** to download a JSON backup of your preferences and custom prompts. The optional sections contain statistics with saved-item history and the selector cache. API keys are excluded from backups.

Choose **Import Settings** to restore the backup. Enable **Overwrite existing settings** to replace preferences you already set. For the selected statistics and cache sections, **Add to current data** adds missing history entries and rules for new sites. Existing site rules take precedence, and statistics totals are not summed. **Replace selected data** restores each selected section in full.

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

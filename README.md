# ClipAIble

ClipAIble is a Chrome extension for saving web articles, PDFs, and subtitled videos as PDF, EPUB, FB2, Markdown, or audio. Save a readable PDF for reference, move an article to an e-reader, keep editable Markdown notes, or listen to an article away from your screen.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

| What you want to do | Where to start |
| --- | --- |
| Save an article without an AI account | [First export](#first-export) |
| Choose among three extraction modes | [How extraction works](#how-extraction-works) |
| Save a PDF or turn video captions into an article | [PDF and video sources](#pdf-and-video-sources) |
| Choose a format and customize a PDF | [Output formats](#output-formats) |
| Set up API keys or add an AI model | [AI providers and models](#ai-providers-and-models) |
| Translate an article and its illustrations | [Translation](#translation) |
| Create a narration with local or cloud speech | [Audio](#audio) |
| Generate summaries or edit AI prompts | [Summaries and prompts](#summaries-and-prompts) |
| Manage history, cache, and backups | [Local data and backups](#local-data-and-backups) |
| Follow a workflow from source to output | [Common workflows](#common-workflows) |
| Diagnose a failed export | [Troubleshooting](#troubleshooting) |
| Build and run the extension from source | [Development](#development) |

## Install

Install ClipAIble from the Chrome Web Store and pin it from Chrome’s Extensions menu if you want the icon to stay visible. ClipAIble requires **Chrome 116 or newer**. Chrome updates installations from the store. The popup footer shows the version you are running. This guide describes the current source version. For an unpacked installation, see [Build from source](#build-from-source).

## First export

1. Open an article in Chrome. Wait until its text has loaded.
2. Click the **ClipAIble** toolbar icon. The top of the popup contains the article AI settings. The status and **Save** button are below them, with the format menu beside **Save**. **Settings** opens the controls for the current export.
3. Open **Settings** and choose **Automatic (no AI)** under **Extraction Mode**. Leave **Target Language** at **Auto (original)** to retain the source language.
4. Choose **PDF** beside **Save**, then click **Save**. Keep the source tab open while ClipAIble reads the page. The file appears in Chrome’s downloads.
5. Run the export again with **EPUB**, **FB2**, **MD**, or **Audio** selected when you need another format. Audio requires a speech provider or a local voice model.

<img src="screenshots/quick-start.png" width="368" alt="ClipAIble toolbar popup showing Ready, Save, and PDF output">

An article in **Automatic (no AI)** with its original language can be saved without an API key. The **AI Provider** and **Model** fields configure options that use the article AI model. Retrieving original images can still make requests to the source websites.

You can also right-click the article page, open the **Save as** submenu, and choose a format. ClipAIble uses your saved settings. Use the toolbar popup if you want to review the settings before downloading. The popup shows the active job’s progress and lets you cancel it. If a local PDF asks for a file, keep the popup open while you select it. See [Local PDFs](#local-pdfs).

## How extraction works

**Extraction Mode** determines how ClipAIble finds and reads the article. The format menu determines what it makes from that content. You can change the extraction mode without changing the output format.

| Mode | How it reads a web page | When to use it |
| --- | --- | --- |
| **Automatic (no AI)** | Reads the page with local heuristics and available cached selectors. | Start here when the main article is clearly separated from the rest of the page or when you want local extraction. |
| **AI Selector (faster, exact text)** | Uses a matching cached result when enabled. Otherwise, an AI model reads page structure and identifies the parts that make up the article. ClipAIble copies the content from those parts of the original page. | Try this when Automatic misses sections, chooses a sidebar, or includes unrelated material. |
| **AI Extract (full content)** | Asks the selected model to return structured content from the page HTML. Long inputs can be processed in chunks. | Try this when the reading order is unclear or the article has an unusual layout. Review the result against the source when exact wording matters. |

A **CSS selector** is a pattern that finds elements in a web page. For example, selectors can identify an article’s title, body, and lead image. They can also mark a related-content panel to skip. In AI Selector mode, the model supplies these rules and the extension applies them in Chrome. The paragraphs come from the original page.

AI Extract asks the model to interpret the HTML and return the article’s content. The model can influence the text and its structure. This can help on layouts that are difficult to describe with selectors. Keep the source on hand if you intend to quote the exported text or use it as a reference.

### Reuse selectors for a site

**Use cached selectors** in **Settings** allows the extension to reuse successful selector rules. It is useful when you save several articles from a publication that shares a page template. With a cache hit, AI Selector can find the article without requesting new selectors from the model.

A site may change its layout or use a separate template for a long feature. If a cached result includes the wrong sections, turn off **Use cached selectors** before retrying. This lets AI Selector obtain a fresh set of rules. Open **Statistics** to inspect or clear the saved selector cache.

### Combine extraction with other steps

Extraction is one part of an export. For example, you can select Automatic to read an article locally, then set a **Target Language** so the article AI provider translates the text. You can also retain the original language and use a speech provider to narrate it. Choose the extraction mode for the source, then configure the options that affect the output.

## PDF and video sources

### PDFs opened in Chrome

Open the original PDF in a Chrome tab and start from the ClipAIble toolbar popup. Choose an output format, then save. You can turn a report into Markdown, make an EPUB from a paper, or listen to its text as narration.

- **Automatic (no AI)** reads the PDF’s text layer. The bundled PDF parser uses the positions of words and lines to reconstruct content. Start here when the original has selectable paragraphs in a sensible reading order.
- **AI Selector** and **AI Extract** both render the PDF pages and send the rendered images to the article AI provider. Select a model that accepts **image input** and save its key. Use this route for scans and pages whose text layer differs from what you see.

To check a PDF, select and copy a paragraph in Chrome. If it pastes in the correct order, try Automatic first. If you can select only a page number while the rest of the page behaves like a picture, use an AI mode. For an AI PDF job, the model receives visible page content, including text that is part of an image.

### OCR for scanned PDFs

Open a PDF, then choose **Settings → Extraction Mode → OCR (Tesseract)**. ClipAIble recognizes text on every rendered page using its bundled English, Russian, and Ukrainian models. Recognition runs locally and works offline. The resulting text can be saved in any supported format. Translation and cloud narration use their selected providers when enabled.

### Local PDFs

For direct access to local file tabs, open `chrome://extensions`, locate ClipAIble, open **Details**, and enable **Allow access to file URLs**. Then open the PDF in Chrome and start the export from its tab.

If ClipAIble asks you to select a PDF manually, leave its popup open and choose the same PDF that is open in the tab. This allows the extension to read the local document through the file picker. Online PDFs are normally read from their source URL.

### YouTube and Vimeo

Open the video’s own YouTube or Vimeo page. Check that it has a subtitle track available, select an output format in ClipAIble, and click **Save**. ClipAIble retrieves the available subtitles and asks the article AI model to turn them into a structured article. Set up an article AI key even when **Automatic (no AI)** is selected.

YouTube video metadata can help the model select a subtitle track when several are available. This workflow uses the video’s captions. If you select **Audio**, the TTS provider narrates the article made from the captions. To save the written article around an embedded player, start on the article page. To use the player’s captions, start on the video page.

## Output formats

| Format | What you get | Use it for |
| --- | --- | --- |
| **PDF** | A styled document with a fixed layout, source link, and supported article structure and imagery. | Reading offline, printing, or sharing a document whose layout should stay consistent. |
| **EPUB** | A reflowable e-book whose fonts and reading layout can be adjusted by the reader. | E-readers and reading apps that support EPUB. |
| **FB2** | A FictionBook document with structured text and embedded illustrations when available. | Reading devices or apps that organize books in FB2 format. |
| **MD** | An editable Markdown document with headings, links, and supported article structure. | Notes, plain-text archives, and edits before republishing. |
| **Audio** | A narration file generated from the extracted article. The audio format depends on the speech provider and its settings. | Listening after the file is saved. |

ClipAIble can preserve headings, paragraphs, lists, quotations, code, tables, images, and captions when it can identify them in the source. The title, byline, publication date, and link to the source can carry into the output. Use **Generate Table of Contents** in **Settings** for formats that support navigation derived from headings. A source with clearly marked sections gives the table of contents more useful entries.

### PDF layout and appearance

Select **PDF** next to **Save**, then open **Settings**. **Page Layout** controls how ClipAIble divides the document. **Single long page** creates a continuous page for on-screen reading. **Multiple pages (A4)** creates conventional pages for printing or browsing by page number.

**Style Preset** sets the document colors. Choose **Dark (default)**, **Light**, **Sepia**, or **High Contrast**, or use the font, font size, background, text, heading, and link controls for a custom look. The reset button restores the default PDF styles. The theme selector at the top of the popup affects the extension interface. The PDF’s colors come from **Style Preset** and the individual style controls in **Settings**.

<img src="screenshots/pdf-export.png" width="740" alt="An exported ClipAIble PDF with formatted article text and an illustration">

### Sample downloads

Compare the repository’s sample article in [PDF](examples/PDF/Style%20Preset%20-%20Light/Measuring_Light_in_a_Greenhouse.pdf), [EPUB](examples/EPUB/Measuring_Light_in_a_Greenhouse.epub), [FB2](examples/FB2/Measuring_Light_in_a_Greenhouse.fb2), or [Markdown](examples/Markdown/Measuring_Light_in_a_Greenhouse.md). Its [Piper audio export](examples/Audio/Piper%20TTS%20%28offline%29/Measuring_Light_in_a_Greenhouse.wav) shows the same article as narration.

Try different formats on the same representative article if you are deciding how to keep a collection. PDF preserves a reading layout. EPUB is useful when a reader needs to resize the text. Markdown makes the extracted structure easy to edit. For an article with wide tables, check how the table lays out at your chosen PDF size before saving a set of similar documents.

## AI providers and models

**AI Provider** and **Model** at the top of the popup control the model used for AI Selector, AI Extract, text translation, summaries, key claims, and the article created from video subtitles. Image editing and speech synthesis have their own provider settings.

### Connect a provider

1. Create an API key in the provider’s developer console. Check that the API account has access to the model you want.
2. Open ClipAIble. Select the provider under **AI Provider** and choose a model under **Model**.
3. Paste the key into the provider’s API-key field and click **Save Keys**.
4. Export a short article in **AI Selector** to try the connection. Review the file, then check the provider’s usage dashboard when you need to confirm charges.

You can store keys for several providers and switch among them in the popup. Each provider expects its own key. The account behind the key determines its quota, billing, and model access.

| Article AI provider | Get an API key | Official documentation |
| --- | --- | --- |
| **OpenAI** | [OpenAI Platform keys](https://platform.openai.com/api-keys) | [API quickstart](https://developers.openai.com/api/docs/quickstart) · [Models](https://developers.openai.com/api/docs/models) |
| **Claude** | [Claude API key setup](https://platform.claude.com/docs/en/get-api-key) | [Claude models](https://platform.claude.com/docs/en/models/overview) |
| **Gemini** | [Google AI Studio keys](https://aistudio.google.com/apikey) | [Gemini API keys](https://aistudio.google.com/docs/api-key) · [Models](https://aistudio.google.com/docs/models) |
| **Grok** | [Grok API console](https://console.x.ai/) | [Grok API overview](https://docs.x.ai/overview) |
| **OpenRouter** | [OpenRouter API keys](https://openrouter.ai/settings/keys) | [API quickstart](https://openrouter.ai/docs/quickstart) · [Model catalog](https://openrouter.ai/models) |
| **DeepSeek** | [DeepSeek platform](https://platform.deepseek.com/api_keys) | [First API call](https://api-docs.deepseek.com/) · [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/) |

Provider catalogs and pricing change independently of the extension. The provider links show current availability, supported input types, and prices. For AI PDF reading and for image detection with the article model, check that the selected model accepts image input. A text model can still be useful for finding article structure and translating extracted text.

### Add a custom model and choose reasoning effort

Select the provider first. Click **Add model** next to **Model** and paste the model’s exact API ID. Leave the model in the provider that serves it. For OpenRouter, include the full ID from its model page, including the organization prefix and any variant suffix.

For providers that support the option, the extension accepts `model-id (reasoning: effort)`. For example, `gpt-6.2-sol (reasoning: xhigh)` specifies an OpenAI model and a separate reasoning setting. Use an effort that the model supports. Higher effort can increase time and token use. Use the default for a short test, then adjust if a more complex source needs it. The custom entry stays in the model list for reuse.

## Translation

### Translate the article text

Open **Settings**, find **Target Language**, and select the language you want to read. ClipAIble extracts the article before sending the text needed for translation to the article AI provider. **Auto (original)** retains the language of the source. The same extraction mode and document format can be used for multiple languages. Change the target and export again to create another file.

Headings and supported parts of the article are translated alongside paragraphs. ClipAIble preserves document structure such as lists and links as it passes text through the translation step. For a technical article, compare important terminology, numbers, footnotes, and table headings with the source. If you want a brief overview in another language, choose a target and use **Generate Summary** instead of saving the full translation.

### Translate lettering inside images

Image translation edits text inside the pixels of an illustration, diagram, or screenshot. It is available with **PDF**, **EPUB**, and **FB2** when you choose a target language. ClipAIble checks whether an image has text that needs translation. It sends eligible images to the editor and embeds the returned images in the document. An individual edit failure can leave the original image in place.

1. Choose **PDF**, **EPUB**, or **FB2** beside **Save**.
2. Open **Settings** and pick a **Target Language**. Enable **Translate images**.
3. Choose an **Image translation provider**. If that provider shows **Image model**, pick an editor from the list.
4. Save the API key for the editing step. When detection uses the article AI model, make sure that model accepts images and its provider has a key.
5. Export the document. Inspect the lettering in figures, especially units, values, legends, and axis labels.

<img src="screenshots/image-translation.png" width="342" alt="Image translation settings with the OpenRouter image provider, model selector, and API-key field">

| Image provider | What it uses | Official documentation |
| --- | --- | --- |
| **Google Gemini** | The selected article AI model detects text. A Gemini image model edits the image with the **Google AI API Key** saved in the image settings. | [Gemini image generation](https://aistudio.google.com/docs/image-generation) |
| **OpenAI** | Dedicated OpenAI models handle detection and editing. The **OpenAI API Key** can be saved in the image settings and is shared with other OpenAI features. | [OpenAI image generation and editing](https://developers.openai.com/api/docs/guides/image-generation) |
| **OpenRouter** | OpenRouter handles detection and routes the edits to the selected image model. ClipAIble offers compatible Gemini and GPT Image editors. Enter the key in the image section. | [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) |

For example, you can use Claude to read and translate the article and use OpenRouter to translate its diagrams. Set **AI Provider** to **Claude** at the top of the popup. Choose **OpenRouter** under **Image translation provider** in **Settings**. Save each key in the field beside the feature that uses it. Start with the source text and charts from a short document to familiarize yourself with each step.

## Audio

Audio export uses text-to-speech, or **TTS**, to read the extracted article. If you choose a target language, the text is translated first. Longer sources can be synthesized in sections and assembled into one downloaded file.

Choose **Audio** beside **Save** and open **Settings**. Choose **TTS Provider** before choosing a model or voice. The available controls depend on that choice. To narrate a document in its original language, choose **Auto (original)** for **Target Language** and a voice intended for the source language. To change the language the narration reads, translate the article by selecting a target language and choose a compatible voice.

### Local speech

Piper and Supertonic run on your device after their files are downloaded. You can use either without a speech API key. To keep article extraction and narration local, choose **Automatic (no AI)**, **Auto (original)**, and one of the local speech providers.

- **Piper TTS (offline)** downloads a voice model when it is first needed. Choose the voice before exporting. The next export can reuse that model. When you choose a different voice, ClipAIble may need to download files for it. [Piper voice catalog](https://huggingface.co/rhasspy/piper-voices)
- **Supertonic 3 (offline)** uses one shared model of about **401 MB** for its voices. Select the provider, then use the download control under **Offline model**. Wait for the model to be ready, choose a voice, and click **Save** to export the audio. You can remove the downloaded model from the same settings when you need the disk space. [Supertonic documentation](https://github.com/supertone-oss-archive/supertonic)

<img src="screenshots/local-audio.png" width="342" alt="Supertonic 3 settings showing an offline model download and the voice selector">

Downloading the model and generating the narration are separate steps. Get the model while you have a connection, then open a source that is already available and export it. Downloading a local model does not send article text to a speech service. Cloud translation can still be used with a local voice if you choose to translate before narration.

### Cloud speech

| TTS provider | How to set it up in ClipAIble | Official documentation |
| --- | --- | --- |
| **OpenAI TTS** | Save an OpenAI key. Choose a voice and adjust speed or **Voice Instructions (Optional)** as needed. | [API keys](https://platform.openai.com/api-keys) · [Realtime API](https://developers.openai.com/api/docs/guides/realtime) |
| **ElevenLabs** | Save the ElevenLabs key in the audio section. Choose a model, voice, and audio format. Compatible models expose extra voice settings. | [API quickstart](https://elevenlabs.io/docs/eleven-api/quickstart) · [Text-to-speech models](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) |
| **Google Gemini TTS** | Save a **Google Gemini TTS API Key** in the audio section. Choose the speech model and voice. A style prompt can guide delivery. | [API keys](https://aistudio.google.com/docs/api-key) · [Speech generation](https://aistudio.google.com/docs/speech-generation) |
| **OpenRouter** | Save the **OpenRouter speech API key**. Choose a speech model and a voice in that model’s list. Style and speed options depend on the model. | [OpenRouter keys](https://openrouter.ai/settings/keys) · [Speech API guide](https://openrouter.ai/blog/tutorials/text-to-speech/) |
| **Qwen TTS** | Save an Alibaba Cloud Model Studio key. Select the correct region and enter the workspace ID when the model asks for one. | [Model Studio keys](https://www.alibabacloud.com/help/en/model-studio/get-api-key) · [Qwen speech API](https://www.alibabacloud.com/help/en/model-studio/qwen-audio-tts-http-api) |
| **Respeecher** | Save a Respeecher Space API key. Choose a supported English or Ukrainian voice. Sampling controls are in the provider’s advanced settings. | [Space API quickstart](https://space.respeecher.com/docs/space/quickstart) |

The OpenRouter audio list includes compatible Google Gemini, ElevenLabs, Microsoft, Grok, and Mistral speech models. The voice names and options belong to the selected model. After switching models, check the new voice selection before exporting. For Qwen, match the workspace and region to the key issued in Model Studio.

OpenRouter keys for **article AI**, **image translation**, and **speech** are saved in separate fields. You can paste the same key in each field or use separate keys to account for each type of usage. Saving a key in the audio section leaves the article and image keys as they were.

A custom cloud narration preparation prompt uses the article AI provider before the text reaches the speech service. A voice style instruction, where supported, guides the delivery by the speech model. If you select a local speech provider, the local model synthesizes the extracted text itself.

### Choose a voice and check the resulting file

Try a short source with a few section headings and the kinds of numbers or technical terms you expect in longer exports. Listen to the beginning, a passage with domain-specific terms, and the transition into the next section. When testing a new voice or changing its style settings, use the same text so you can hear the effect of the change.

The file is an audio reading of the article. For example, a narrated YouTube export uses the article generated from the subtitles and a new speech track. To keep an editable version of what you are reading, save the source as Markdown in a separate export. Use a document format when readers need the illustrations or table layout as well as the prose.

## Summaries and prompts

### Summary, key claims, and document TL;DR

- **Generate Summary** in the main popup creates a separate summary panel. Use the panel’s copy and download controls to keep the summary by itself.
- **Key claims** creates a separate list of the article’s central claims. Use it to identify points to check against the source.
- **Generate TL;DR** in **Settings** adds a short summary to the exported document in an AI extraction mode. It appears for document outputs. The popup’s separate summary buttons are independent of this switch.

All three actions use the selected article AI provider. The separate **Generate Summary** and **Key claims** results use the target language you chose, or the popup language when **Target Language** is set to **Auto (original)**. To compare a summary with the original, keep the source tab open and look up quotes, figures, and conclusions in the relevant passage. An AI-generated summary is a guide to the material. The exported article gives more context when you need to understand the author’s argument in full.

### Edit the built-in prompts

Open **Settings** in the popup, scroll down, and click **Advanced settings**. This opens a new tab containing the prompts used for operations such as extraction, translation, summaries, image processing, and narration. Select a prompt from the menu to read its current text and see whether it is default or customized.

Each prompt can include variables that ClipAIble fills in for a job. For example, `{{targetLanguage}}` receives the selected language during translation. The editor shows the required variables. Keep those variables and any structured response instructions the workflow needs. Change the wording around them to suit your reading or narration workflow.

**Save** applies the change to new jobs. **Discard changes** removes edits you have not saved. **Restore default** restores the individual prompt. You can view the default to compare it with a custom version. Try a short representative source after editing a prompt. The settings backup includes saved custom prompts.

<img src="screenshots/prompt-editor.png" width="960" alt="Advanced settings with the text translation prompt selected and its required targetLanguage variable shown">

## Local data and backups

### Statistics and saved-item history

Open **Statistics** in the popup to see export totals, the format breakdown, and recent saved sources. History holds up to 50 entries. Switch off **Enable statistics collection** to stop new entries. Delete an individual history entry from the panel or use **Clear Statistics** to clear totals and history together. The files already downloaded remain on disk.

The panel also shows information about the selector cache and lets you clear it. The cache holds rules for finding content on familiar sites. Clearing it is useful after a site changes how it displays articles. It does not remove history entries. If one export needs fresh selectors, you can turn off **Use cached selectors** in **Settings** before the export, then turn it back on for later pages.

<img src="screenshots/export-statistics.png" width="368" alt="Statistics showing one saved PDF and export totals by format">

### Export and restore settings

1. In **Settings**, click **Export Settings**. The downloaded JSON backup contains preferences and custom prompts. Select the optional statistics and selector-cache sections if you want to keep that data too.
2. To restore a backup, open **Settings** and click **Import Settings**. Choose the saved JSON file.
3. Select **Overwrite existing settings** if the backup should replace preferences already saved in this installation. Leave it off to add missing preferences.
4. For the optional statistics and cache sections, choose **Add to current data** to add missing entries and rules, or **Replace selected data** to restore those sections in full.
5. Enter the provider keys again on a new installation. Keys are excluded from the JSON file.

When adding statistics, missing history entries can be imported without adding the two sets of lifetime totals together. When adding selector rules, the current rules for a site take precedence. With replacement, the selected sections are restored from the backup. You can overwrite preferences and add to history in the same import.

For example, to copy PDF styling and prompts to another Chrome profile while retaining that profile’s history, export your settings, include statistics only if you want to bring in missing records, and choose **Add to current data** during import. A backup that includes history can contain page titles and URLs. Store it accordingly.

### What stays local and what is sent

ClipAIble stores settings, custom prompts, encrypted API keys, history, and cache in the Chrome profile. Downloaded voice models are also kept in the extension’s local storage. Keys are encrypted with an installation-specific key and used locally to authenticate provider requests.

| Action | Where data is processed |
| --- | --- |
| Automatic article extraction in the original language | In Chrome. Loading the source and retrieving original images can make requests to their websites. |
| AI extraction, translation, summaries, or video processing | The article AI service receives the data needed for the task. This can include page HTML, extracted text, video subtitles, or rendered PDF pages. |
| Image translation | Detection and editing services receive the images needed for the selected workflow. |
| Local narration | The local voice model runs in Chrome. Any enabled translation takes place separately. |
| Cloud narration | The selected speech service receives narration text. A custom preparation prompt can involve the article AI service before synthesis. |

Chrome grants permissions for reading the current source, downloading documents, and related browser operations. PDF generation uses Chrome’s printing interface through the debugger permission. [Permissions](PERMISSIONS.md) explains each permission. The [Privacy Policy](PRIVACY.md) lists external services and describes local retention and how to clear data.

## Common workflows

### Save several articles from the same publication

1. Open a complete article from the site, select **AI Selector (faster, exact text)**, and leave **Use cached selectors** enabled.
2. Export the first article and review the headings, first and last paragraphs, and illustrations. The extension can reuse rules from a successful selection on other pages of the same site.
3. Open the next article in its own tab and export with the same settings. You can use the page’s **Save as** menu when you already know which format you want.
4. If an article uses a different template and the resulting file misses content, turn off **Use cached selectors** and repeat that export. You can clear cached rules from **Statistics** when you want to discard them for future exports.

Reusing selectors saves the step that asks a provider to identify the same article structure again. The extension still reads each page’s current content. When you enable translation or cloud narration, those operations still run for the new article.

### Make a translated reading copy of a report

1. Open the report in Chrome. Decide whether you have a web article or a PDF. For a PDF, check whether ordinary text selection works.
2. Choose the extraction mode for the source. Use Automatic on a clean text layer, or select a model with image input and use an AI mode for a scan.
3. Set **Target Language**. Use **PDF** with A4 pages if the report needs a fixed layout, or **EPUB** if the reader wants to adjust the size of the text.
4. If the report has important labels inside images, enable **Translate images** and choose an editor. Confirm that the configured provider can run the detection and edit steps for that editor.
5. Export and check the table headings, units, citations, and image captions. Save another copy with **Auto (original)** if readers need the original wording beside the translation.

### Listen to an article without a speech API

1. Open an article with text that your local voice can read. In **Settings**, choose **Automatic (no AI)** and **Auto (original)**.
2. Change the format to **Audio**. Under **TTS Provider**, choose Piper or Supertonic and pick a voice for the article’s language.
3. Download the model while connected. Piper downloads voice files when first needed. For Supertonic, use the explicit **Offline model** download.
4. Click **Save**. The finished file can be played in an audio player. Keep an EPUB or Markdown copy if you also want to read links, charts, or footnotes.

### Use separate providers for text, images, and speech

To translate an article with one provider and use another for the images, configure the article provider at the top of the popup, then choose the image provider in **Settings**. Each job uses the choices relevant to its output. For example, a PDF with translated diagrams uses the text and image services. An audio version uses the text and speech services. You can keep your text provider selection while switching between these formats.

When you use OpenRouter for more than one step, save a key for each feature you enable. To check costs by feature, use the provider dashboard for the corresponding key or API project. Use a short article to verify the wiring before running a long PDF, a large set of illustrations, or an extended narration.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| **Save** asks for a key | Check the extraction mode, target language, and source type. Video subtitles, AI modes, and text translation need an article AI key. Image editing and cloud speech check their own settings. |
| The provider rejects a key | Confirm that the key belongs to the service shown in the relevant field. Check API access, billing or credits, and whether the key can use the selected model. |
| The provider reports that a model is unavailable | Open the model catalog for the chosen provider. Check the full ID, any variant suffix, and whether the model is active for your account. If you added reasoning effort manually, check that the model accepts it. |
| The job cannot reach the provider or hits a rate limit | Check the provider’s service status and usage dashboard. For rate limits, wait for the provider’s quota to reset or use a suitable model available to your key. **Cancel** stops the current job in ClipAIble. |
| The export includes page controls or misses the end of the article | Confirm that the full article is visible in Chrome. Try **AI Selector** with **Use cached selectors** turned off. If the article is still incomplete, compare an **AI Extract** run against the source. |
| A PDF has few selectable characters | Copy a paragraph from the original PDF to check its text layer. Use an AI mode with an image-capable model when the visible page is mostly a scan. |
| ClipAIble asks for a file while reading a local PDF | Select the same PDF while the popup is open. For direct access in the future, enable **Allow access to file URLs** in the extension’s Chrome details. |
| A video job cannot find usable subtitles | Open the video on its own page and check for a caption track. Verify the article AI key even when Automatic is selected. |
| **Translate images** is missing | Choose PDF, EPUB, or FB2 and set a specific target language. The switch and editor settings appear for those outputs. |
| A cloud audio job asks for a different key | Pick **Audio**, reopen **Settings**, and verify the key for the selected **TTS Provider**. The OpenRouter speech key is in the audio section. The Gemini TTS key is separate from the image key. |
| A local voice needs a download | Use a network connection for the first download and ensure there is space for the selected model. **Offline model** shows the Supertonic download status. |
| Qwen rejects the workspace | Use the region and workspace ID from the Alibaba Cloud Model Studio account that issued the API key. Confirm that your model and voice are available in that workspace. |
| You cannot find a completed file | Open `chrome://downloads`, find the export, and use the browser’s option to open its containing folder. |

To report a reproducible problem, include the source type, format, extraction mode, provider and model if applicable, and the exact error text. Include the source URL when it is public and appropriate to share. Keep API keys, settings backups, and private source material out of issue reports. [Report an issue](https://github.com/YanGranat/ClipAIble/issues)

## Development

### Build from source

ClipAIble is a Manifest V3 Chrome extension. It requires Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0` and npm. From a checkout of this repository, install the locked dependencies and build the extension.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`. Use the extension’s reload button after rebuilding, then reopen the popup. Use a separate Chrome profile when testing settings or data imports with fresh extension storage.

| Command | Purpose |
| --- | --- |
| `npm run build` | Rebuild the article extractor, offscreen bundle, and local speech worker. |
| `npm run build:extraction` | Rebuild the browser-side extractor after editing its source modules. |
| `npm run check` | Run TypeScript checks for the extension and Node.js tooling. |
| `npm test` | Run the automated test suite with Vitest. |
| `npm run test:coverage` | Run the test suite with coverage. |
| `npm run package:production` | Build the extension and write the runtime and matching source ZIPs to the local releases directory. |

### Project layout

- `popup/` contains the toolbar interface, export settings, and advanced prompt editor.
- `scripts/background.js` coordinates processing jobs, state updates, and downloads.
- `scripts/extraction/extractor/` contains the editable article extractor. `scripts/extraction/automatic.js` is the generated bundle used by the browser.
- `scripts/api/` contains provider adapters and image and speech model catalogs. The article model catalog is in `scripts/utils/model-catalog.js`.
- `scripts/generation/` turns the article into a document or audio file. `print/` contains the print page used for PDF generation.
- The extension’s offscreen document handles work such as PDF reading, image decoding, and local speech synthesis independently of the popup.

See the [technical overview](docs/technical-overview.md) for runtime components, how content moves through them, and what they store. See [test commands](tests/README.md) for targeted checks and [third-party source packages](third_party/sources/README.md) for the corresponding build inputs.

## License

[MIT](LICENSE)

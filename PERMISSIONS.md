# Permissions

ClipAIble declares the following Chrome extension permissions.

| Permission | Use |
| --- | --- |
| `activeTab` | Access the page selected for extraction. |
| `storage` | Store settings, encrypted API keys, processing state, summaries, key claims, statistics, and selector cache. |
| `unlimitedStorage` | Store large processing data and local resources. |
| `scripting` | Run content extraction in the selected page. |
| `downloads` | Save generated documents and audio files. |
| `debugger` | Generate PDF documents through Chrome's debugging and print interfaces. |
| `alarms` | Schedule background processing checks. |
| `notifications` | Report processing completion and errors. |
| `contextMenus` | Add save actions to the page context menu. |
| `offscreen` | Run PDF processing, Piper speech synthesis, image conversion, and download preparation in a hidden extension document. |
| `webNavigation` | Observe navigation events used by page processing. |
| `<all_urls>` host access | Extract page content, retrieve source images and PDFs, download voice models, and contact configured AI and TTS services. |

API keys are encrypted before local storage using an installation-specific key in the extension's IndexedDB and are excluded from settings exports. The selected features determine which content is sent to external services. See the [Privacy Policy](PRIVACY.md) for data handling and retention.


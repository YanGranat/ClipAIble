# Privacy Policy for ClipAIble

**Last updated:** December 2025

## Overview

ClipAIble is a browser extension that extracts articles from web pages and saves them in various formats. This privacy policy explains what data we collect and how we handle it.

## Data Collection

**ClipAIble does NOT collect any personal data.** All data is stored locally in your browser using Chrome's storage API.

## What We Store Locally

The following data is stored **only on your device**:

| Data | Purpose |
|------|---------|
| API keys | Encrypted with AES-256-GCM, used to call AI providers |
| Settings | Your preferences (theme, fonts, colors, language) |
| Statistics | Save counts and history (for your reference) |
| Selector cache | Cached CSS selectors for faster repeat extractions |

## What We DO NOT Do

- ❌ We do NOT send any data to our servers (we don't have any)
- ❌ We do NOT track your browsing history
- ❌ We do NOT collect analytics or telemetry
- ❌ We do NOT share any data with third parties
- ❌ We do NOT store your article content

## Third-Party Services

When you use ClipAIble, article content is sent **only** to the AI provider YOU configure:

| Provider | When Used | Their Privacy Policy |
|----------|-----------|---------------------|
| OpenAI | If you use GPT models or OpenAI TTS | [openai.com/privacy](https://openai.com/privacy) |
| Google | If you use Gemini models | [policies.google.com](https://policies.google.com/privacy) |
| Anthropic | If you use Claude models | [anthropic.com/privacy](https://www.anthropic.com/privacy) |
| ElevenLabs | If you use ElevenLabs TTS | [elevenlabs.io/privacy](https://elevenlabs.io/privacy) |

**You control which provider receives your data** by choosing which API key to use.

## API Key Security

Your API keys are protected:

- ✅ Encrypted using AES-256-GCM before storage
- ✅ Encryption key derived using PBKDF2 (100,000 iterations)
- ✅ Never included in settings exports
- ✅ Never transmitted except to the AI provider you configured
- ✅ Can only be decrypted within your browser instance

## Data Retention

- All data remains on your device until you clear it
- Uninstalling the extension removes all stored data
- You can clear statistics and cache anytime from the Stats panel

## Children's Privacy

ClipAIble is not directed at children under 13. We do not knowingly collect any information from children.

## Changes to This Policy

We may update this privacy policy occasionally. Changes will be reflected in the "Last updated" date.

## Open Source

ClipAIble is open source. You can review the code to verify our privacy practices in this repository.

## Contact

For questions about this privacy policy, please open an issue on GitHub.

---

**Summary:** ClipAIble stores everything locally, encrypts your API keys, and only sends article content to the AI provider you choose. We have no servers and collect no data.


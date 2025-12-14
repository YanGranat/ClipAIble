# ✂️ ClipAIble

> **KI-gestützter Artikel-Extraktor** — Speichern Sie beliebige Artikel aus dem Internet als PDF, EPUB, FB2, Markdown, DOCX, HTML, TXT oder Audio. Übersetzung in 11 Sprachen. Funktioniert auf jeder Website.

![Version](https://img.shields.io/badge/version-2.9.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Erweiterung-green)
![Lizenz](https://img.shields.io/badge/lizenz-MIT-brightgreen)

**[⬇️ Aus Chrome Web Store installieren](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ Was ist ClipAIble?

ClipAIble nutzt künstliche Intelligenz, um Artikelinhalte intelligent von jeder Webseite zu extrahieren — entfernt Werbung, Navigation, Popups und überflüssige Elemente. Dann exportiert es in Ihr bevorzugtes Format:

- 📄 **PDF** — Schönes, anpassbares Styling
- 📚 **EPUB** — Geeignet für Kindle, Kobo, Apple Books
- 📖 **FB2** — Geeignet für PocketBook, FBReader
- 📝 **Markdown** — Klartext für Notizen
- 📘 **DOCX** — Microsoft Word-Format mit Bildern und Formatierung
- 🌐 **HTML** — Saubere HTML-Datei mit erhaltenen Styles
- 📄 **TXT** — Klartext ohne Formatierung
- 🎧 **Audio (MP3/WAV)** — Anhören mit KI-Vorlesung

Alle Formate unterstützen **Übersetzung in 11 Sprachen** — sogar Übersetzung von Text auf Bildern!

---

## 🚀 Funktionen

### 🤖 KI-gestützte Extraktion
- **Zwei Modi**: AI Selector (schnell, wiederverwendbar) und AI Extract (gründlich)
- **Mehrere Anbieter**: OpenAI GPT (GPT-5.2, GPT-5.2-pro, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Video-Unterstützung**: Untertitel von YouTube/Vimeo-Videos extrahieren und in Artikel umwandeln (v2.9.0)
- **Intelligente Erkennung**: Findet den Hauptinhalt des Artikels, entfernt automatisch Unnötiges
- **Erhält Struktur**: Überschriften, Bilder, Code-Blöcke, Tabellen, Fußnoten

### 🎧 Audio-Export
- **5 TTS-Anbieter**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ Stimmen**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (Englisch & Ukrainisch)
- **Geschwindigkeitsregelung**: 0.5x bis 2.0x (nur OpenAI/ElevenLabs)
- **Ukrainische Sprachunterstützung**: Dedizierte ukrainische Stimmen via Respeecher
- **Mehrsprachige Aussprache**: Korrekte Aussprache für jede Sprache
- **Intelligente Textbereinigung**: KI entfernt URLs, Code und nicht-sprachlichen Inhalt

### 🌍 Übersetzung
- **11 Sprachen**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Intelligente Erkennung**: Überspringt Übersetzung, wenn Artikel bereits in Zielsprache
- **Bildübersetzung**: Übersetzt Text auf Bildern (via Gemini)
- **Lokalisierte Metadaten**: Daten und Beschriftungen passen sich der Sprache an

### 🎨 PDF-Anpassung
- **4 Voreinstellungen**: Dunkel, Hell, Sepia, Hoher Kontrast
- **Anpassbare Farben**: Hintergrund, Text, Überschriften, Links
- **11 Schriftarten** zur Auswahl
- **Seitenmodi**: Einzelne durchgehende Seite oder mehrseitiges A4-Format

### 📄 Dokumentformate
- **DOCX**: Microsoft Word-Format mit eingebetteten Bildern und erhaltener Formatierung
- **HTML**: Saubere, eigenständige HTML-Datei mit eingebetteten Styles und Bildern
- **TXT**: Klartext ohne Formatierung, perfekt für einfache Textextraktion

### ⚡ Intelligente Funktionen
- **Video-Unterstützung**: Untertitel von YouTube/Vimeo-Videos extrahieren und in Artikel umwandeln (v2.9.0)
- **Audio-Transkription**: Automatische Transkription, wenn keine Untertitel verfügbar sind (gpt-4o-transcribe)
- **Offline-Modus**: Caching von Selektoren — keine KI für wiederholte Websites erforderlich
- **Statistiken**: Anzahl der Speicherungen verfolgen, Verlauf ansehen
- **Inhaltsverzeichnis**: Automatisch aus Überschriften generiert
- **Zusammenfassung**: KI-geschriebene Zusammenfassung von 2-3 Absätzen
- **Kontextmenü**: Rechtsklick → "Artikel als PDF speichern"
- **Jederzeit abbrechen**: Verarbeitung mit einem Klick stoppen

### 🔒 Sicherheit
- **API-Schlüssel verschlüsselt** mit AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Schlüssel nie exportiert** — aus Sicherheitsgründen von Einstellungs-Backup ausgeschlossen
- **Alle Daten lokal** — nichts wird an Dritte gesendet

---

## ⚠️ Bekannte Einschränkungen

### Dateiformate
- **WAV-Format** (Qwen/Respeecher): Dateien können sehr groß sein (10-50MB+ für lange Artikel). Erwägen Sie die Verwendung des MP3-Formats für kleinere Dateigrößen.
- **Zeichenlimits**: 
  - Qwen TTS: 600 Zeichen pro Segment
  - Respeecher TTS: 450 Zeichen pro Segment
  - Text wird automatisch intelligent an Satz-/Wortgrenzen aufgeteilt

### Technische Einschränkungen
- **Keep-alive-Anforderung**: Chrome MV3 erfordert ein Keep-alive-Intervall von mindestens 1 Minute. Lange Verarbeitungsaufgaben können mehrere Minuten dauern.
- **CORS für Bilder**: Einige Bilder können nicht geladen werden, wenn die Website Cross-Origin-Anfragen blockiert. Die Erweiterung überspringt diese Bilder.
- **Abbruch nicht sofortig**: Der Abbruch kann einige Sekunden dauern, um alle Hintergrundprozesse vollständig zu stoppen.
- **Großes HTML**: Seiten mit sehr großem HTML (>500KB) können länger verarbeitet werden.

### Browser-Kompatibilität
- **Chrome/Edge/Brave/Arc**: Vollständig unterstützt
- **Firefox**: Nicht unterstützt (verwendet andere Extension-API)
- **Safari**: Nicht unterstützt (verwendet andere Extension-API)

---

## 📦 Installation

### Option 1: Installation aus Chrome Web Store (Empfohlen)

**[⬇️ ClipAIble aus Chrome Web Store installieren](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### Option 2: Manuelle Installation (Entwicklermodus)

1. **Klonen** Sie dieses Repository
2. Öffnen Sie Chrome → `chrome://extensions/`
3. Aktivieren Sie den **Entwicklermodus**
4. Klicken Sie auf **Entpackte Erweiterung laden** → wählen Sie den Ordner

### Anforderungen

- Chrome, Edge, Brave oder Arc Browser
- API-Schlüssel von mindestens einem Anbieter (siehe unten)

---

## 🔑 API-Schlüssel erhalten

### OpenAI (GPT-Modelle + Audio)

1. Gehen Sie zu [platform.openai.com](https://platform.openai.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys** (linkes Menü) oder direkt zu [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Klicken Sie auf **"Create new secret key"**
5. Kopieren Sie den Schlüssel (beginnt mit `sk-...`)
6. Fügen Sie Zahlungsinformationen unter **Settings → Billing** hinzu (erforderlich für API-Nutzung)

> **Hinweis:** OpenAI-Schlüssel ist für Audio-Export (TTS) erforderlich. Andere Formate funktionieren mit jedem Anbieter.

### Google Gemini

1. Gehen Sie zu [Google AI Studio](https://aistudio.google.com/)
2. Melden Sie sich mit Google-Konto an
3. Klicken Sie auf **"Get API key"** oder gehen Sie direkt zu [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Klicken Sie auf **"Create API key"**
5. Kopieren Sie den Schlüssel (beginnt mit `AIza...`)

> **Tipp:** Gemini ermöglicht auch die Bildtextübersetzungsfunktion.

### Anthropic Claude

1. Gehen Sie zu [console.anthropic.com](https://console.anthropic.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys**
4. Klicken Sie auf **"Create Key"**
5. Kopieren Sie den Schlüssel (beginnt mit `sk-ant-...`)
6. Fügen Sie Credits unter **Plans & Billing** hinzu

### Qwen3-TTS-Flash (Audio)

1. Gehen Sie zu [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys** oder **Model Studio**
4. Erstellen Sie einen API-Schlüssel
5. Kopieren Sie den Schlüssel (beginnt mit `sk-...`)

> **Hinweis:** Qwen3-TTS-Flash bietet 49 Stimmen, einschließlich einer speziellen russischen Stimme (Alek). Festes WAV-Format bei 24kHz.

### Respeecher (Audio - Englisch & Ukrainisch)

1. Gehen Sie zu [Respeecher Space](https://space.respeecher.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys**
4. Erstellen Sie einen API-Schlüssel
5. Kopieren Sie den Schlüssel

> **Hinweis:** Respeecher unterstützt Englisch und Ukrainisch mit dedizierten ukrainischen Stimmen. Festes WAV-Format bei 22.05kHz.

### Welchen wählen?

| Anbieter | Am besten für | Audio | Bildübersetzung |
|----------|---------------|-------|-----------------|
| **OpenAI** | Allgemeine Nutzung, Audio-Export, Video-Transkription | ✅ | ❌ |
| **Gemini** | Schnelle Extraktion, Bildübersetzung, Audio-Export (30 Stimmen) | ✅ | ✅ |
| **Claude** | Lange Artikel, komplexe Seiten | ❌ | ❌ |
| **Grok** | Schnelle Reasoning-Aufgaben | ❌ | ❌ |
| **OpenRouter** | Zugriff auf mehrere Modelle | ❌ | ❌ |
| **Qwen** | Audio-Export (49 Stimmen, Russisch-Unterstützung) | ✅ | ❌ |
| **Respeecher** | Audio-Export (Ukrainische Sprache) | ✅ | ❌ |

**Empfehlung:** Beginnen Sie mit OpenAI für volle Funktionen (Extraktion + Audio). Verwenden Sie Respeecher für ukrainischen Text.

---

## 🎯 Schnellstart

1. Klicken Sie auf das **ClipAIble**-Symbol in der Symbolleiste
2. Geben Sie Ihren API-Schlüssel ein → **Schlüssel speichern**
3. Navigieren Sie zu einem beliebigen Artikel
4. Klicken Sie auf **Als PDF speichern** (oder wählen Sie ein anderes Format)
5. Fertig! Datei wird automatisch heruntergeladen

**Pro-Tipp:** Rechtsklick überall → **"Artikel als PDF speichern"**

---

## ⚙️ Einstellungen

### Extraktionsmodi

| Modus | Geschwindigkeit | Am besten für |
|-------|-----------------|---------------|
| **AI Selector** | ⚡ Schnell | Die meisten Websites, Blogs, Nachrichten |
| **AI Extract** | 🐢 Gründlich | Komplexe Seiten, Notion, SPAs |

### KI-Modelle

| Anbieter | Modell | Hinweise |
|----------|--------|----------|
| OpenAI | GPT-5.2 | Neueste, mittleres Reasoning |
| OpenAI | GPT-5.2-pro | Verbessert, mittleres Reasoning |
| OpenAI | GPT-5.1 | Ausgewogen |
| OpenAI | GPT-5.1 (high) | Beste Qualität |
| Anthropic | Claude Sonnet 4.5 | Großartig für lange Artikel |
| Google | Gemini 3 Pro | Schnell |
| Grok | Grok 4.1 Fast Reasoning | Schnelles Reasoning |

### Audio-Stimmen

**OpenAI (11 Stimmen):** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs (9 Stimmen):** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS (30 Stimmen):** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash (49 Stimmen):** Einschließlich Elias (Standard), Alek (Russisch) und Stimmen für 10 Sprachen

**Respeecher (14 Stimmen):** 4 Englische (Samantha, Neve, Gregory, Vincent) + 10 Ukrainische Stimmen

### Stil-Voreinstellungen (PDF)

| Voreinstellung | Hintergrund | Text |
|----------------|-------------|------|
| Dunkel | `#303030` | `#b9b9b9` |
| Hell | `#f8f9fa` | `#343a40` |
| Sepia | `#faf4e8` | `#5d4e37` |
| Hoher Kontrast | `#000000` | `#ffffff` |

---

## 📊 Statistiken & Cache

Klicken Sie auf **📊 Statistiken** zum Anzeigen:
- Gesamte Speicherungen, Anzahl diesen Monat
- Aufschlüsselung nach Format
- Neuer Verlauf mit Links
- Gecachte Domains für Offline-Modus

### Offline-Modus

ClipAIble cached KI-generierte Selektoren nach Domain:
- **Zweiter Besuch = sofort** — kein API-Aufruf
- **Automatische Invalidierung** — löscht bei fehlgeschlagener Extraktion
- **Manuelle Steuerung** — einzelne Domains löschen

---

## 💾 Einstellungen importieren/exportieren

**⚙️ Einstellungen** → **Import/Export**

- Alle Einstellungen exportieren (API-Schlüssel aus Sicherheitsgründen ausgeschlossen)
- Optional: Statistiken und Cache einschließen
- Import mit Merge- oder Überschreib-Optionen

---

## 🔧 Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Leerer Inhalt | Versuchen Sie **AI Extract**-Modus |
| Ungültiger API-Schlüssel | Überprüfen Sie Schlüsselformat (sk-..., AIza..., sk-ant-...) |
| Fehlende Bilder | Einige Websites blockieren Cross-Origin; kleine Bilder werden gefiltert |
| Langsames Audio | Lange Artikel werden in Chunks aufgeteilt; Fortschrittsbalken beobachten |

---

## 🏗️ Architektur

```
clipaible/
├── manifest.json       # Erweiterungskonfiguration
├── popup/              # UI (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service Worker
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # Inhaltsextraktion
│   ├── translation/    # Übersetzung & Spracherkennung
│   ├── generation/     # PDF, EPUB, FB2, MD, DOCX, HTML, TXT, Audio
│   ├── cache/          # Selektor-Caching
│   ├── stats/          # Nutzungsstatistiken
│   └── utils/          # Konfiguration, Verschlüsselung, Helfer
├── print/              # PDF-Rendering
├── config/             # Stile
└── lib/                # JSZip
```

---

## 🔐 Sicherheit & Datenschutz

- **Verschlüsselung**: AES-256-GCM über Web Crypto API
- **Schlüsselableitung**: PBKDF2, 100.000 Iterationen
- **Kein Tracking**: Null Analytics, null Remote-Logging
- **Nur lokal**: Alle Daten bleiben in Ihrem Browser

---

## 📋 Berechtigungen

| Berechtigung | Warum |
|--------------|-------|
| `activeTab` | Artikel von aktueller Registerkarte lesen |
| `storage` | Einstellungen lokal speichern |
| `scripting` | Extraktionsskript einfügen |
| `downloads` | Generierte Dateien speichern (PDF, EPUB, FB2, Markdown, DOCX, HTML, TXT, Audio) |
| `debugger` | PDFs über Chrome Print API generieren |
| `alarms` | Worker während langer Aufgaben aktiv halten |
| `contextMenus` | "Mit ClipAIble speichern"-Optionen (PDF/EPUB/FB2/MD/DOCX/HTML/TXT/Audio) zum Rechtsklick-Menü auf Webseiten hinzufügen |

Siehe [PERMISSIONS.md](PERMISSIONS.md) für Details.

---

## 🤝 Beitragen

1. Forken Sie das Repository
2. Erstellen Sie Feature-Branch: `git checkout -b feature/cool-thing`
3. Commit: `git commit -m 'Add cool thing'`
4. Push: `git push origin feature/cool-thing`
5. Pull Request öffnen

---

## 📜 Lizenz

MIT License — siehe [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — Speichern. Lesen. Anhören. Überall.
</p>


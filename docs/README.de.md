# ✂️ ClipAIble

> **KI-gestützter Artikel-Extraktor** — Speichern Sie beliebige Artikel aus dem Internet als PDF, EPUB, FB2, Markdown oder Audio. Übersetzung in 11 Sprachen. Funktioniert auf jeder Website.

![Version](https://img.shields.io/badge/version-2.7.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Erweiterung-green)
![Lizenz](https://img.shields.io/badge/lizenz-MIT-brightgreen)

---

## ✨ Was ist ClipAIble?

ClipAIble nutzt künstliche Intelligenz, um Artikelinhalte intelligent von jeder Webseite zu extrahieren — entfernt Werbung, Navigation, Popups und überflüssige Elemente. Dann exportiert es in Ihr bevorzugtes Format:

- 📄 **PDF** — Schönes, anpassbares Styling
- 📚 **EPUB** — Geeignet für Kindle, Kobo, Apple Books
- 📖 **FB2** — Geeignet für PocketBook, FBReader
- 📝 **Markdown** — Klartext für Notizen
- 🎧 **Audio (MP3)** — Anhören mit KI-Vorlesung

Alle Formate unterstützen **Übersetzung in 11 Sprachen** — sogar Übersetzung von Text auf Bildern!

---

## 🚀 Funktionen

### 🤖 KI-gestützte Extraktion
- **Zwei Modi**: AI Selector (schnell, wiederverwendbar) und AI Extract (gründlich)
- **Mehrere Anbieter**: OpenAI GPT, Google Gemini, Anthropic Claude
- **Intelligente Erkennung**: Findet den Hauptinhalt des Artikels, entfernt automatisch Unnötiges
- **Erhält Struktur**: Überschriften, Bilder, Code-Blöcke, Tabellen, Fußnoten

### 🎧 Audio-Export
- **2 TTS-Anbieter**: OpenAI TTS und ElevenLabs
- **20+ Stimmen**: 11 OpenAI-Stimmen + 9 ElevenLabs-Stimmen
- **Geschwindigkeitsregelung**: 0.5x bis 2.0x
- **Mehrsprachige Aussprache**: Korrekte Aussprache für jede Sprache
- **Intelligente Textbereinigung**: KI entfernt URLs, Code und nicht-sprachlichen Inhalt

### 🌍 Übersetzung
- **11 Sprachen**: EN, RU, UK, DE, FR, ES, IT, PT, ZH, JA, KO
- **Intelligente Erkennung**: Überspringt Übersetzung, wenn Artikel bereits in Zielsprache
- **Bildübersetzung**: Übersetzt Text auf Bildern (via Gemini)
- **Lokalisierte Metadaten**: Daten und Beschriftungen passen sich der Sprache an

### 🎨 PDF-Anpassung
- **4 Voreinstellungen**: Dunkel, Hell, Sepia, Hoher Kontrast
- **Anpassbare Farben**: Hintergrund, Text, Überschriften, Links
- **11 Schriftarten** zur Auswahl
- **Seitenmodi**: Einzelne durchgehende Seite oder mehrseitiges A4-Format

### ⚡ Intelligente Funktionen
- **Offline-Modus**: Caching von Selektoren — keine KI für wiederholte Websites erforderlich
- **Statistiken**: Anzahl der Speicherungen verfolgen, Verlauf ansehen
- **Inhaltsverzeichnis**: Automatisch aus Überschriften generiert
- **Zusammenfassung**: KI-geschriebene Zusammenfassung von 2-3 Absätzen
- **Kontextmenü**: Rechtsklick → "Artikel als PDF speichern"
- **Jederzeit abbrechen**: Verarbeitung mit einem Klick stoppen

### 🔒 Sicherheit
- **API-Schlüssel verschlüsselt** mit AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs)
- **Schlüssel nie exportiert** — aus Sicherheitsgründen von Einstellungs-Backup ausgeschlossen
- **Alle Daten lokal** — nichts wird an Dritte gesendet

---

## 📦 Installation

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

### Welchen wählen?

| Anbieter | Am besten für | Audio | Bildübersetzung |
|----------|---------------|-------|-----------------|
| **OpenAI** | Allgemeine Nutzung, Audio-Export | ✅ | ❌ |
| **Gemini** | Schnelle Extraktion, Bildübersetzung | ❌ | ✅ |
| **Claude** | Lange Artikel, komplexe Seiten | ❌ | ❌ |

**Empfehlung:** Beginnen Sie mit OpenAI für volle Funktionen (Extraktion + Audio).

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
| OpenAI | GPT-5.1 | Ausgewogen |
| OpenAI | GPT-5.1 (high) | Beste Qualität |
| Anthropic | Claude Sonnet 4.5 | Großartig für lange Artikel |
| Google | Gemini 3 Pro | Schnell |

### Audio-Stimmen

| Stimme | Stil |
|--------|------|
| nova | Weiblich, warm |
| alloy | Neutral |
| echo | Männlich |
| fable | Ausdrucksvoll |
| onyx | Männlich, tief |
| shimmer | Weiblich, klar |
| coral | Weiblich, freundlich |
| sage | Neutral, ruhig |
| ash | Männlich, autoritär |
| ballad | Dramatisch |
| verse | Rhythmisch |

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
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
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
| `downloads` | Generierte Dateien speichern |
| `debugger` | PDFs über Chrome Print API generieren |
| `alarms` | Worker während langer Aufgaben aktiv halten |
| `contextMenus` | Rechtsklick-Menü |

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


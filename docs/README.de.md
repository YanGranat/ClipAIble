# ✂️ ClipAIble

> **KI-gestützter Artikel-Extraktor** — Speichern Sie beliebige Artikel aus dem Internet als PDF, EPUB, FB2, Markdown oder Audio. Übersetzung in 11 Sprachen. Funktioniert auf jeder Website.

![Version](https://img.shields.io/badge/version-3.0.3-blue)
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
- 🎧 **Audio** — Anhören mit KI-Vorlesung

Alle Formate unterstützen **Übersetzung in 11 Sprachen** — sogar Übersetzung von Text auf Bildern!

---

## 🚀 Funktionen

### 🤖 KI-gestützte Extraktion
- **Zwei Modi**: AI Selector (schnell, wiederverwendbar) und AI Extract (gründlich)
- **Mehrere Anbieter**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Video-Unterstützung**: Untertitel von YouTube/Vimeo-Videos extrahieren und in Artikel umwandeln (v3.0.0)
  - Mehrere Extraktionsmethoden mit Fallbacks
  - Priorität: manuelle Untertitel > automatisch generierte > übersetzte
  - KI-Verarbeitung: entfernt Zeitstempel, fügt Absätze zusammen, korrigiert Fehler
  - Audio-Transkriptions-Fallback, wenn keine Untertitel verfügbar sind
- **Intelligente Erkennung**: Findet den Hauptinhalt des Artikels, entfernt automatisch Unnötiges
- **Erweiterte Fallback-Strategien**: 6 verschiedene Strategien für zuverlässige Inhalts-Extraktion
- **Erhält Struktur**: Überschriften, Bilder, Code-Blöcke, Tabellen, Fußnoten
- **Selector-Caching**: Unabhängige Einstellungen für Verwendung und Aktivierung des Caches

### 🎧 Audio-Export
- **5 TTS-Anbieter**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ Stimmen**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (Englisch & Ukrainisch)
- **Geschwindigkeitsregelung**: 0.5x bis 2.0x (nur OpenAI/ElevenLabs; Google/Qwen/Respeecher verwenden feste Geschwindigkeit)
- **Format-Unterstützung**: MP3 (OpenAI/ElevenLabs) oder WAV (Google/Qwen/Respeecher)
- **Mehrsprachige Aussprache**: Korrekte Aussprache für jede Sprache
- **Ukrainische Sprachunterstützung**: Dedizierte ukrainische Stimmen via Respeecher (10 Stimmen)
- **Intelligente Textbereinigung**: KI entfernt URLs, Code und nicht-sprachlichen Inhalt
- **Anbieter-spezifische Funktionen**:
  - **ElevenLabs**: Modellauswahl (v2, v3, Turbo v2.5), Formatauswahl, erweiterte Stimmeinstellungen
  - **Google Gemini 2.5 TTS**: Modellauswahl (pro/flash), 30 Stimmen, 24k Zeichenlimit
  - **Qwen**: 49 Stimmen einschließlich russischer Stimme (Alek), 600 Zeichenlimit
  - **Respeecher**: Erweiterte Sampling-Parameter (temperature, repetition_penalty, top_p)

### 🌍 Übersetzung
- **11 Sprachen**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Intelligente Erkennung**: Überspringt Übersetzung, wenn Artikel bereits in Zielsprache
- **Bildübersetzung**: Übersetzt Text auf Bildern (via Gemini)
- **Lokalisierte Metadaten**: Daten und Beschriftungen passen sich der Sprache an

### 🎨 PDF-Anpassung
- **4 Voreinstellungen**: Dunkel, Hell, Sepia, Hoher Kontrast
- **Anpassbare Farben**: Hintergrund, Text, Überschriften, Links
- **11 Schriftarten**: Standard (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **Schriftgröße**: Einstellbar (Standard: 31px)
- **Seitenmodi**: Einzelne durchgehende Seite oder mehrseitiges A4-Format


### ⚡ Intelligente Funktionen
- **Video-Unterstützung**: Untertitel von YouTube/Vimeo-Videos extrahieren und in Artikel umwandeln (v3.0.0)
  - Direkte Untertitel-Extraktion (keine API-Schlüssel von YouTube/Vimeo erforderlich)
  - KI-Verarbeitung: entfernt Zeitstempel, fügt Absätze zusammen, korrigiert Fehler
  - Audio-Transkriptions-Fallback: automatische Transkription, wenn keine Untertitel verfügbar sind (gpt-4o-transcribe)
  - Vollständige Pipeline-Integration: Übersetzung, Inhaltsverzeichnis, Zusammenfassung, alle Exportformate
- **Zusammenfassungs-Generierung**: Erstellen Sie detaillierte KI-Zusammenfassungen von Artikeln oder Videos
  - Klicken Sie auf die Schaltfläche **"Zusammenfassung erstellen"**, um eine umfassende Zusammenfassung zu erstellen
  - Funktioniert mit normalen Artikeln und YouTube/Vimeo-Videos
  - Setzt die Generierung fort, auch wenn das Popup geschlossen ist (läuft im Hintergrund)
  - In Zwischenablage kopieren oder als Markdown-Datei herunterladen
  - Aufklappbare/zuklappbare Anzeige mit formatiertem Text
  - Detaillierte Zusammenfassungen mit Schlüsselideen, Konzepten, Beispielen und Schlussfolgerungen
- **Zusammenfassung (TL;DR)**: KI-geschriebene kurze Zusammenfassung von 2-4 Sätzen, in Dokumenten enthalten
  - Optionale Funktion: in Einstellungen aktivieren, um kurze Zusammenfassung zu PDF/EPUB/FB2/Markdown hinzuzufügen
  - Erscheint am Anfang exportierter Dokumente
  - Unterscheidet sich von detaillierter Zusammenfassung (dies ist eine kurze Übersicht)
- **Offline-Modus**: Caching von Selektoren — keine KI für wiederholte Websites erforderlich
  - Unabhängige Einstellungen: Verwendung gecachter Selektoren und Aktivierung des Cachings separat
  - Automatische Invalidierung bei Extraktionsfehler
  - Manuelle Cache-Verwaltung pro Domain
- **Statistiken**: Anzahl der Speicherungen verfolgen, Verlauf ansehen
- **Inhaltsverzeichnis**: Automatisch aus Überschriften generiert
- **Kontextmenü**: Rechtsklick → "Artikel als PDF/EPUB/FB2/Markdown/Audio speichern"
- **Jederzeit abbrechen**: Verarbeitung mit einem Klick stoppen
- **Einstellungen importieren/exportieren**: Backup und Wiederherstellung aller Einstellungen (API-Schlüssel aus Sicherheitsgründen ausgeschlossen)

### 🔒 Sicherheit
- **API-Schlüssel verschlüsselt** mit AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Schlüssel nie exportiert** — aus Sicherheitsgründen von Einstellungs-Backup ausgeschlossen
- **Alle Daten lokal** — nichts wird an Dritte gesendet

---

## ⚠️ Bekannte Einschränkungen

### Dateiformate
- **WAV-Format** (Google/Qwen/Respeecher): Dateien können sehr groß sein (10-50MB+ für lange Artikel). MP3-Format (OpenAI/ElevenLabs) bietet kleinere Dateigrößen.
- **Zeichenlimits pro Anfrage**: 
  - OpenAI TTS: 4096 Zeichen
  - ElevenLabs: 5000 Zeichen
  - Google Gemini 2.5 TTS: 24000 Zeichen
  - Qwen TTS: 600 Zeichen
  - Respeecher TTS: 450 Zeichen
  - Text wird automatisch intelligent an Satz-/Wortgrenzen aufgeteilt

### Technische Einschränkungen
- **Keep-alive-Anforderung**: Chrome MV3 erfordert ein Keep-alive-Intervall von mindestens 1 Minute. Lange Verarbeitungsaufgaben können mehrere Minuten dauern. Die Erweiterung verwendet einen einheitlichen Keep-alive-Mechanismus (Alarm alle 1 Minute + Status-Speicherung alle 2 Sekunden), um zu verhindern, dass der Service Worker stirbt.
- **CORS für Bilder**: Einige Bilder können nicht geladen werden, wenn die Website Cross-Origin-Anfragen blockiert. Die Erweiterung überspringt diese Bilder.
- **Abbruch nicht sofortig**: Der Abbruch kann einige Sekunden dauern, um alle Hintergrundprozesse vollständig zu stoppen.
- **Service Worker-Wiederherstellung**: Operationen werden automatisch nach Service Worker-Neustart fortgesetzt (innerhalb von 2 Stunden).

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

> **Tipp:** Gemini ermöglicht auch die Bildtextübersetzungsfunktion und Google Gemini 2.5 TTS (30 Stimmen). Für TTS können Sie denselben Gemini API-Schlüssel verwenden oder einen separaten Google TTS API-Schlüssel einrichten. Erfordert die Aktivierung der Generative Language API in der Google Cloud Console.

### Anthropic Claude

1. Gehen Sie zu [console.anthropic.com](https://console.anthropic.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys**
4. Klicken Sie auf **"Create Key"**
5. Kopieren Sie den Schlüssel (beginnt mit `sk-ant-...`)
6. Fügen Sie Credits unter **Plans & Billing** hinzu

### ElevenLabs (Audio)

1. Gehen Sie zu [ElevenLabs](https://elevenlabs.io/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **Profile** → **API Keys**
4. Erstellen Sie einen API-Schlüssel
5. Kopieren Sie den Schlüssel

> **Hinweis:** ElevenLabs bietet 9 Premium-Stimmen mit hochwertigem TTS. Unterstützt Geschwindigkeitsregelung (0.25-4.0x) und Formatauswahl (MP3 hohe Qualität Standard: mp3_44100_192). Modelle: Multilingual v2, v3 (Standard), Turbo v2.5. Erweiterte Stimmeinstellungen verfügbar (stability, similarity, style, speaker boost).

### Google Gemini 2.5 TTS (Audio)

1. Gehen Sie zu [Google AI Studio](https://aistudio.google.com/)
2. Melden Sie sich mit Google-Konto an
3. Klicken Sie auf **"Get API key"** oder gehen Sie direkt zu [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Klicken Sie auf **"Create API key"**
5. Kopieren Sie den Schlüssel (beginnt mit `AIza...`)
6. Aktivieren Sie **Generative Language API** in der [Google Cloud Console](https://console.cloud.google.com/)
7. (Optional) Aktivieren Sie die Abrechnung, falls für Ihr Modell erforderlich

> **Hinweis:** Google Gemini 2.5 TTS bietet 30 Stimmen. Sie können denselben Gemini API-Schlüssel verwenden oder einen separaten Google TTS API-Schlüssel einrichten. Festes WAV-Format bei 24kHz. Modelle: `gemini-2.5-pro-preview-tts` (primär) oder `gemini-2.5-flash-preview-tts` (schneller).

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
| **OpenAI** | Allgemeine Nutzung, Audio-Export, Video-Transkription | ✅ (11 Stimmen) | ❌ |
| **Gemini** | Schnelle Extraktion, Bildübersetzung, Audio-Export (30 Stimmen) | ✅ (30 Stimmen) | ✅ |
| **Claude** | Lange Artikel, komplexe Seiten | ❌ | ❌ |
| **Grok** | Schnelle Reasoning-Aufgaben | ❌ | ❌ |
| **OpenRouter** | Zugriff auf mehrere Modelle | ❌ | ❌ |
| **ElevenLabs** | Audio-Export (9 Stimmen, hohe Qualität) | ✅ (9 Stimmen) | ❌ |
| **Qwen** | Audio-Export (49 Stimmen, Russisch-Unterstützung) | ✅ (49 Stimmen) | ❌ |
| **Respeecher** | Audio-Export (Ukrainische Sprache) | ✅ (14 Stimmen) | ❌ |

**Empfehlung:** 
- **Für Extraktion**: Beginnen Sie mit OpenAI oder Gemini (schnell und zuverlässig)
- **Für Audio**: OpenAI für allgemeine Nutzung, ElevenLabs für hohe Qualität, Google Gemini 2.5 TTS für 30 Stimmen, Qwen für Russisch, Respeecher für Ukrainisch
- **Für Bildübersetzung**: Erfordert Gemini API-Schlüssel

---

## 🎯 Schnellstart

1. Klicken Sie auf das **ClipAIble**-Symbol in der Symbolleiste
2. Geben Sie Ihren API-Schlüssel ein → **Schlüssel speichern**
3. Navigieren Sie zu einem beliebigen Artikel
4. Klicken Sie auf **Als PDF speichern** (oder wählen Sie ein anderes Format)
5. Fertig! Datei wird automatisch heruntergeladen

**Tipps:**
- Rechtsklick überall → **"Artikel als PDF speichern"**
- Klicken Sie auf **"Zusammenfassung erstellen"**, um eine detaillierte KI-Zusammenfassung zu erstellen (funktioniert auch, wenn das Popup geschlossen ist)
- Aktivieren Sie **"TL;DR generieren"** in den Einstellungen, um eine kurze Zusammenfassung zu Dokumenten hinzuzufügen

---

## ⚙️ Einstellungen

### Benutzeroberfläche

- **Thema**: Wählen Sie Dunkel, Hell oder Auto (folgt dem System) in der Kopfzeile
- **Sprache**: Wählen Sie die Benutzeroberflächensprache (11 Sprachen) in der Kopfzeile
- **Benutzerdefinierte Modelle**: Fügen Sie Ihre eigenen KI-Modelle über die Schaltfläche "+" neben dem Modellauswahlfeld hinzu

### Extraktionsmodi

| Modus | Geschwindigkeit | Am besten für |
|-------|-----------------|---------------|
| **AI Selector** | ⚡ Schnell | Die meisten Websites, Blogs, Nachrichten |
| **AI Extract** | 🐢 Gründlich | Komplexe Seiten, Notion, SPAs |

### KI-Modelle

| Anbieter | Modell | Hinweise |
|----------|--------|----------|
| OpenAI | GPT-5.2 | Neueste, mittleres Reasoning (Standard) |
| OpenAI | GPT-5.2-high | Verbessert, hohes Reasoning |
| OpenAI | GPT-5.1 | Ausgewogen |
| OpenAI | GPT-5.1 (high) | Beste Qualität, hohes Reasoning |
| Anthropic | Claude Sonnet 4.5 | Großartig für lange Artikel |
| Google | Gemini 3 Pro | Schnelle Extraktion, Bildübersetzung |
| Grok | Grok 4.1 Fast Reasoning | Schnelles Reasoning |
| OpenRouter | Verschiedene Modelle | Zugriff auf mehrere Anbieter |

**Benutzerdefinierte Modelle:** Klicken Sie auf die Schaltfläche **"+"** neben dem Modellauswahlfeld, um benutzerdefinierte Modelle hinzuzufügen (z.B. `gpt-4o`, `claude-opus-4.5`). Benutzerdefinierte Modelle erscheinen im Dropdown-Menü und können bei Bedarf ausgeblendet/angezeigt werden.

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

**Benutzerdefinierte Farben:** Passen Sie Hintergrund, Text, Überschriften und Links mit Farbwählern an. Einzelne Zurücksetzen-Schaltflächen (↺) für jede Farbe oder **"Alle auf Standard zurücksetzen"**, um alle Stile wiederherzustellen.

---

## 📊 Statistiken & Cache

Klicken Sie auf **📊 Statistiken** zum Anzeigen:
- Gesamte Speicherungen, Anzahl diesen Monat
- Aufschlüsselung nach Format (PDF, EPUB, FB2, Markdown, Audio)
- Neuer Verlauf mit Links zu ursprünglichen Artikeln (letzte 50 Speicherungen)
  - Klicken Sie auf den Link, um den ursprünglichen Artikel zu öffnen
  - Klicken Sie auf die Schaltfläche ✕, um einen einzelnen Verlaufseintrag zu löschen
  - Zeigt Format, Domain, Verarbeitungszeit und Datum
- Gecachte Domains für Offline-Modus
- **Statistiken aktivieren/deaktivieren**: Umschalter für Statistikerfassung
- **Statistiken löschen**: Schaltfläche zum Zurücksetzen aller Statistiken
- **Cache löschen**: Schaltfläche zum Entfernen aller gecachten Selektoren
- Einzelne Domain-Löschung aus dem Cache

## 📝 Zusammenfassungs-Generierung

Erstellen Sie detaillierte KI-Zusammenfassungen von Artikeln oder Videos:

1. Navigieren Sie zu einem beliebigen Artikel oder YouTube/Vimeo-Video
2. Klicken Sie auf die Schaltfläche **"Zusammenfassung erstellen"** im Popup
3. Zusammenfassung wird im Hintergrund generiert (Sie können das Popup schließen)
4. Wenn fertig, erscheint die Zusammenfassung mit Optionen:
   - **Kopieren** in Zwischenablage
   - **Herunterladen** als Markdown-Datei
   - **Aufklappen/Zuklappen**, um den vollständigen Text anzuzeigen
   - **Schließen**, um die Zusammenfassung auszublenden

**Funktionen:**
- Funktioniert mit Artikeln und YouTube/Vimeo-Videos
- Setzt die Generierung fort, auch wenn das Popup geschlossen ist
- Detaillierte Zusammenfassungen mit Schlüsselideen, Konzepten, Beispielen und Schlussfolgerungen
- Formatierter Text mit Überschriften, Listen und Links
- Automatisch gespeichert — bleibt erhalten, bis Sie es schließen

**Hinweis:** Die Zusammenfassungs-Generierung ist getrennt vom Dokumentexport. Verwenden Sie sie, um Inhalte schnell zu verstehen, ohne ein vollständiges Dokument zu speichern.

### Offline-Modus

ClipAIble cached KI-generierte Selektoren nach Domain:
- **Zweiter Besuch = sofort** — kein API-Aufruf
- **Automatische Invalidierung** — löscht bei fehlgeschlagener Extraktion
- **Manuelle Steuerung** — einzelne Domains löschen
- **Unabhängige Einstellungen**:
  - **Gecachte Selektoren verwenden**: Seitenanalyse überspringen, wenn Cache existiert (schneller)
  - **Caching aktivieren**: Neue Selektoren nach Extraktion im Cache speichern
  - Beide Einstellungen arbeiten unabhängig für flexible Kontrolle

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
| Zusammenfassung wird nicht generiert | Überprüfen Sie den API-Schlüssel, stellen Sie sicher, dass Seiteninhalt geladen ist, versuchen Sie es erneut |
| Timeout bei Zusammenfassungs-Generierung | Sehr lange Artikel können bis zu 45 Minuten dauern; warten Sie oder versuchen Sie es mit kürzerem Inhalt |

---

## 🏗️ Architektur

```
clipaible/
├── manifest.json       # Erweiterungskonfiguration
├── popup/              # UI (HTML, CSS, JS)
│   ├── popup.js       # Hauptorchestrierung (2670 Zeilen)
│   ├── core.js        # Geschäftslogik (1459 Zeilen)
│   ├── handlers.js    # Event-Handler (1567 Zeilen)
│   ├── ui.js          # UI-Verwaltung
│   ├── stats.js       # Statistikanzeige
│   └── settings.js    # Einstellungsverwaltung
├── scripts/
│   ├── background.js   # Service Worker (2635 Zeilen)
│   ├── content.js      # Content Script für YouTube
│   ├── locales.js      # UI-Lokalisierung (11 Sprachen)
│   ├── message-handlers/ # Nachrichtenhandler-Module (v3.0.3)
│   │   ├── index.js    # Nachrichten-Router
│   │   ├── utils.js    # Handler-Utilities
│   │   ├── simple.js   # Einfache Handler
│   │   ├── stats.js    # Statistik-Handler
│   │   ├── cache.js    # Cache-Handler
│   │   ├── settings.js # Einstellungs-Handler
│   │   ├── processing.js # Verarbeitungs-Handler
│   │   ├── video.js    # Video/Untertitel-Handler
│   │   ├── summary.js  # Zusammenfassungs-Generierungshelfer
│   │   └── complex.js  # Komplexe Handler
│   ├── api/            # AI & TTS Anbieter
│   │   ├── openai.js   # OpenAI (GPT Modelle)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # TTS Router
│   │   └── index.js    # API Router
│   ├── extraction/     # Inhaltsextraktion
│   │   ├── prompts.js  # KI Prompts
│   │   ├── html-utils.js # HTML Utilities
│   │   ├── video-subtitles.js # YouTube/Vimeo Untertitel-Extraktion
│   │   └── video-processor.js # KI Untertitel-Verarbeitung
│   ├── translation/    # Übersetzung & Spracherkennung
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Selektor-Caching
│   ├── stats/          # Nutzungsstatistiken
│   ├── settings/       # Einstellungen Import/Export
│   ├── state/          # Verarbeitungsstatus-Verwaltung
│   └── utils/          # Konfiguration, Verschlüsselung, Helfer
│       ├── video.js    # Video-Plattform-Erkennung
│       ├── validation.js # Validierungs-Utilities
│       └── api-error-handler.js # Gemeinsame API-Fehlerbehandlung
├── print/              # PDF-Rendering
├── config/             # Stile
├── lib/                # JSZip
├── docs/               # Lokalisierte README-Dateien
└── memory-bank/        # Projektdokumentation
```

---

## 🔐 Sicherheit & Datenschutz

- **Verschlüsselung**: AES-256-GCM über Web Crypto API
- **Schlüsselableitung**: PBKDF2, 100.000 Iterationen
- **Kein Tracking**: Null Analytics, null Remote-Logging
- **Nur lokal**: Alle Daten bleiben in Ihrem Browser

---

## 📋 Berechtigungen

ClipAIble benötigt die folgenden Berechtigungen, um zu funktionieren. Alle Berechtigungen werden nur für die angegebenen Zwecke verwendet:

| Berechtigung | Warum |
|--------------|-------|
| `activeTab` | Lesen der aktuellen Seite, um Inhalte zu extrahieren, wenn Sie auf das Erweiterungssymbol klicken oder das Kontextmenü verwenden. Die Erweiterung greift nur auf die Registerkarte zu, die Sie gerade ansehen. |
| `storage` | Speichern Ihrer Einstellungen (API-Schlüssel, Stileinstellungen, Sprachauswahl) und Statistiken lokal in Ihrem Browser. Ihre Daten verlassen niemals Ihr Gerät. |
| `scripting` | Einfügen des Inhalts-Extraktionsskripts in Webseiten. Dieses Skript findet und extrahiert den Artikelinhalt (Text, Bilder, Überschriften) aus dem DOM der Seite. |
| `downloads` | Speichern der generierten Dateien (PDF, EPUB, FB2, Markdown, Audio) auf Ihren Computer. Ohne diese Berechtigung kann die Erweiterung keine Dateien herunterladen. |
| `debugger` | **Nur für PDF-Generierung** — Verwendet die integrierte Chrome-Funktion print-to-PDF, um hochwertige PDFs mit ordnungsgemäßem Seitenlayout und Styling zu generieren. Der Debugger wird nur während der PDF-Generierung angehängt und sofort nach Abschluss getrennt. Dies ist die einzige Möglichkeit, PDFs mit benutzerdefiniertem Styling in Chrome-Erweiterungen zu generieren. |
| `alarms` | Halten des Hintergrund-Service-Workers während langer Operationen (große Artikel, Übersetzung) aktiv. Chrome Manifest V3 setzt Service-Worker nach 30 Sekunden aus, aber die Artikelverarbeitung kann mehrere Minuten dauern. Verwendet einen einheitlichen Keep-alive-Mechanismus (Alarm alle 1 Minute + Status-Speicherung alle 2 Sekunden) gemäß MV3-Regeln. |
| `contextMenus` | Hinzufügen von "Mit ClipAIble speichern"-Optionen (PDF/EPUB/FB2/MD/Audio) zum Rechtsklick-Kontextmenü auf Webseiten. |
| `notifications` | Anzeigen von Desktop-Benachrichtigungen bei Verwendung der "Speichern"-Funktion aus dem Kontextmenü. Benachrichtigt Sie bei Fehlern (z. B. fehlender API-Schlüssel). |
| `unlimitedStorage` | Speichern des Selektoren-Caches und temporärer Druckdaten lokal. Dies ermöglicht schnellere Wiederholungsextraktionen ohne erneuten AI-Aufruf (Offline-Modus). |

### Host-Berechtigungen

| Berechtigung | Warum |
|--------------|-------|
| `<all_urls>` | Extrahieren von Inhalten von jeder Website, die Sie besuchen. Die Erweiterung muss: 1) Die Seiten-HTML lesen, um Artikelinhalte zu finden, 2) Bilder herunterladen, die in Artikel eingebettet sind, 3) API-Aufrufe an AI/TTS-Anbieter (OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher) tätigen. Die Erweiterung greift nur auf Seiten zu, die Sie explizit speichern — sie durchsucht das Web nicht selbstständig. |

**Sicherheitshinweis:** Alle API-Schlüssel werden mit AES-256-GCM verschlüsselt und nur lokal gespeichert. Schlüssel werden niemals exportiert oder an einen Server übertragen, außer an die AI-Anbieter, die Sie konfigurieren.

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


# ✂️ ClipAIble

> **KI-gestützter Artikel-Extraktor** — Speichern Sie beliebige Artikel aus dem Internet als PDF, EPUB, FB2, Markdown oder Audio. Übersetzung in 11 Sprachen. Funktioniert auf jeder Website.

![Version](https://img.shields.io/badge/version-3.3.0-blue)
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
- **Zwei Modi**: Automatisch (ohne KI, schnell), AI Selector (schnell, wiederverwendbar)
- **Automatischer Modus**: Dokumente ohne KI erstellen — keine API-Schlüssel erforderlich, sofortige Extraktion
- **Mehrere Anbieter**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, DeepSeek, OpenRouter
- **PDF-Inhaltsextraktion** (v3.3.0): Inhalt aus PDF-Dateien mit PDF.js-Bibliothek extrahieren
  - Experimentelle Funktion mit komplexem mehrstufigem Klassifizierungssystem
  - Extrahiert Text, Bilder, Struktur und Metadaten aus PDF-Dateien
  - Unterstützt sowohl Web- als auch lokale PDF-Dateien
  - Verarbeitet mehrspaltige Layouts, Tabellen, Überschriften, Listen, seitenübergreifende Zusammenführung
  - Hinweis: Funktion ist experimentell und kann Einschränkungen bei komplexen PDFs haben (gescannte PDFs, passwortgeschützte PDFs)
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
- **6 TTS-Anbieter**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher, Piper TTS (offline)
- **Geschwindigkeitsregelung**: 0.25x bis 4.0x (nur OpenAI/ElevenLabs; Google/Qwen/Respeecher/Piper TTS (offline) verwenden feste Geschwindigkeit)
- **Format-Unterstützung**: MP3 (OpenAI/ElevenLabs) oder WAV (Google/Qwen/Respeecher/Piper TTS (offline))
- **Mehrsprachige Aussprache**: Korrekte Aussprache für jede Sprache
- **Ukrainische Sprachunterstützung**: Dedizierte ukrainische Stimmen via Respeecher
- **Piper TTS (offline)**: Funktioniert vollständig offline, keine API-Schlüssel erforderlich, mehrere Stimmen in 8 Sprachen (Englisch, Russisch, Deutsch, Französisch, Spanisch, Italienisch, Portugiesisch, Chinesisch)
- **Intelligente Textbereinigung**: KI entfernt URLs, Code und nicht-sprachlichen Inhalt
- **Anbieter-spezifische Funktionen**: Modellauswahl, Formatoptionen und erweiterte Einstellungen für jeden Anbieter verfügbar

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
- **PDF-Inhaltsextraktion** (v3.3.0): Inhalt aus PDF-Dateien extrahieren und in Artikel umwandeln
  - Verwendet PDF.js-Bibliothek zum Parsen im Offscreen-Dokument
  - Mehrstufiges Klassifizierungssystem für genaue Extraktion
  - Unterstützt sowohl Web- als auch lokale PDF-Dateien
  - Vollständige Pipeline-Integration: Übersetzung, Inhaltsverzeichnis, Zusammenfassung, alle Exportformate
  - Hinweis: Experimentelle Funktion, kann Einschränkungen bei komplexen PDFs haben
- **Video-Unterstützung**: Untertitel von YouTube/Vimeo-Videos extrahieren und in Artikel umwandeln (v3.0.0)
  - Direkte Untertitel-Extraktion (keine API-Schlüssel von YouTube/Vimeo erforderlich)
  - KI-Verarbeitung: entfernt Zeitstempel, fügt Absätze zusammen, korrigiert Fehler
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
- **API-Schlüssel verschlüsselt** mit branchenüblicher Verschlüsselung (OpenAI, Claude, Gemini, Grok, DeepSeek, OpenRouter, ElevenLabs, Qwen, Respeecher)
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
- **Keep-alive-Anforderung**: Chrome MV3 erfordert ein Keep-alive-Intervall von mindestens 1 Minute. Lange Verarbeitungsaufgaben können mehrere Minuten dauern. Die Erweiterung verwendet einen einheitlichen Keep-alive-Mechanismus (Alarm alle 1 Minute) um zu verhindern, dass der Service Worker stirbt.
- **CORS für Bilder**: Einige Bilder können nicht geladen werden, wenn die Website Cross-Origin-Anfragen blockiert. Die Erweiterung überspringt diese Bilder.
- **Abbruch nicht sofortig**: Der Abbruch kann einige Sekunden dauern, um alle Hintergrundprozesse vollständig zu stoppen.
- **Service Worker-Wiederherstellung**: Operationen werden automatisch nach Service Worker-Neustart fortgesetzt, wenn der Status aktuell ist (< 1 Minute). Erweiterungs-Neuladen setzt den Status immer zurück.
- **PDF-Extraktions-Einschränkungen** (v3.3.0): 
  - Gescannte PDFs (keine Textebene) werden nicht unterstützt — OCR ist noch nicht verfügbar
  - Passwortgeschützte PDFs müssen vor der Extraktion entsperrt werden
  - Sehr große PDFs (>100MB) funktionieren möglicherweise nicht aufgrund von Speicherbeschränkungen
  - Komplexe Layouts (mehrspaltig, Tabellen) werden extrahiert, können aber manuelle Überprüfung erfordern

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

> **💡 Tipp**: Sie können ClipAIble ohne API-Schlüssel verwenden! Der automatische Modus funktioniert sofort mit lokalen Algorithmen. API-Schlüssel werden nur für KI-Funktionen benötigt (Übersetzung, Zusammenfassungsgenerierung, AI Selector-Modus).
> 
> **💡 Tipp**: Piper TTS (offline) - Generieren Sie Audio vollständig offline in 8 Sprachen, keine API-Schlüssel erforderlich!
> 
> **💡 Behoben in v3.2.1**: Popup-UI aktualisiert sich korrekt nach Audio-Generierung, Stimmenwechsel funktioniert ordnungsgemäß für Offline-TTS.
> 
> **💡 Neu in v3.3.0**: PDF-Inhaltsextraktion - Experimentelle Unterstützung für die Extraktion von Inhalten aus PDF-Dateien hinzugefügt. Vorherige: DeepSeek-Anbieter-Integration, Leistungsoptimierungen, Google Translate-Interferenz-Fix.

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

### DeepSeek

1. Gehen Sie zu [platform.deepseek.com](https://platform.deepseek.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys** oder gehen Sie zu [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. Klicken Sie auf **"Create API key"**
5. Kopieren Sie den Schlüssel (beginnt mit `sk-...`)

> **Hinweis:** DeepSeek bietet DeepSeek-V3.2-Modelle mit Thinking- und Non-Thinking-Modi.

### ElevenLabs (Audio)

1. Gehen Sie zu [ElevenLabs](https://elevenlabs.io/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **Profile** → **API Keys**
4. Erstellen Sie einen API-Schlüssel
5. Kopieren Sie den Schlüssel

> **Hinweis:** ElevenLabs bietet hochwertiges TTS mit Geschwindigkeitsregelung und Formatauswahl.

### Google Gemini 2.5 TTS (Audio)

1. Gehen Sie zu [Google AI Studio](https://aistudio.google.com/)
2. Melden Sie sich mit Google-Konto an
3. Klicken Sie auf **"Get API key"** oder gehen Sie direkt zu [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Klicken Sie auf **"Create API key"**
5. Kopieren Sie den Schlüssel (beginnt mit `AIza...`)
6. Aktivieren Sie **Generative Language API** in der [Google Cloud Console](https://console.cloud.google.com/)
7. (Optional) Aktivieren Sie die Abrechnung, falls für Ihr Modell erforderlich

> **Hinweis:** Google Gemini 2.5 TTS. Sie können denselben Gemini API-Schlüssel verwenden oder einen separaten Google TTS API-Schlüssel einrichten.

### Qwen3-TTS-Flash (Audio)

1. Gehen Sie zu [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys** oder **Model Studio**
4. Erstellen Sie einen API-Schlüssel
5. Kopieren Sie den Schlüssel (beginnt mit `sk-...`)

> **Hinweis:** Qwen3-TTS-Flash enthält eine spezielle russische Stimme (Alek).

### Respeecher (Audio - Englisch & Ukrainisch)

1. Gehen Sie zu [Respeecher Space](https://space.respeecher.com/)
2. Registrieren Sie sich oder melden Sie sich an
3. Navigieren Sie zu **API Keys**
4. Erstellen Sie einen API-Schlüssel
5. Kopieren Sie den Schlüssel

> **Hinweis:** Respeecher unterstützt Englisch und Ukrainisch mit dedizierten ukrainischen Stimmen.

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
| **Automatisch** | ⚡⚡ Sofort | Einfache Artikel, kein API-Schlüssel erforderlich |
| **AI Selector** | ⚡ Schnell | Die meisten Websites, Blogs, Nachrichten |

### Stil-Voreinstellungen (PDF)

4 Voreinstellungen verfügbar: Dunkel, Hell, Sepia, Hoher Kontrast. Passen Sie Farben für Hintergrund, Text, Überschriften und Links an.
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
| Leerer Inhalt | Versuchen Sie **AI Selector**-Modus |
| Ungültiger API-Schlüssel | Überprüfen Sie Schlüsselformat (sk-..., AIza..., sk-ant-...) |
| Fehlende Bilder | Einige Websites blockieren Cross-Origin; kleine Bilder werden gefiltert |
| Langsames Audio | Lange Artikel werden in Chunks aufgeteilt; Fortschrittsbalken beobachten |
| Zusammenfassung wird nicht generiert | Überprüfen Sie den API-Schlüssel, stellen Sie sicher, dass Seiteninhalt geladen ist, versuchen Sie es erneut |
| Timeout bei Zusammenfassungs-Generierung | Sehr lange Artikel können bis zu 45 Minuten dauern; warten Sie oder versuchen Sie es mit kürzerem Inhalt |
| PDF-Extraktion schlägt fehl | Überprüfen Sie, ob PDF passwortgeschützt ist (zuerst entsperren) oder gescannt ist (OCR wird noch nicht unterstützt). Versuchen Sie es zuerst mit einfacheren PDFs. |
| PDF-Inhalt unvollständig | Komplexe Layouts (mehrspaltig, Tabellen) können manuelle Überprüfung erfordern. Funktion ist experimentell. |

---

---

## 🔐 Sicherheit & Datenschutz

- **Verschlüsselung**: API-Schlüssel werden mit branchenüblicher Verschlüsselung verschlüsselt
- **Kein Tracking**: Null Analytics, null Remote-Logging
- **Nur lokal**: Alle Daten bleiben in Ihrem Browser

---

## 📋 Berechtigungen

ClipAIble benötigt Berechtigungen für:
- Lesen der aktuellen Seite, um Inhalte zu extrahieren
- Speichern Ihrer Einstellungen und generierten Dateien lokal
- API-Aufrufe an AI/TTS-Anbieter, die Sie konfigurieren
- Zugriff auf Websites nur, wenn Sie sie explizit speichern

**Sicherheitshinweis:** Alle API-Schlüssel werden verschlüsselt und nur lokal gespeichert. Schlüssel werden niemals exportiert oder an einen Server übertragen, außer an die AI-Anbieter, die Sie konfigurieren.

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


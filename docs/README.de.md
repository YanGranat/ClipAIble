# ClipAIble

KI-gestützter Artikel-Extraktor. Funktioniert auf jeder Website.

## Was es macht

ClipAIble extrahiert Artikelinhalt von Webseiten und konvertiert ihn in verschiedene Formate:
- PDF Dokumente
- EPUB Dateien
- FB2 Dateien
- Markdown Text
- Audio Dateien

**Besondere Funktionen:**
- **YouTube/Vimeo Support**: Extrahiert Videountertitel und erstellt Artikel daraus
- **PDF Verarbeitung**: Funktioniert mit Online-PDFs und lokalen PDF-Dateien
- **Inhaltsübersetzung**: Übersetzt Artikel in 11 Sprachen
- **Bildübersetzung**: Übersetzt Text auf Bildern mit KI
- **TLDR Generierung**: Erstellt kurze Zusammenfassungen innerhalb von Dokumenten
- **Summary Panel**: Zeigt Artikelsummaries im Popup nach der Verarbeitung an

## Installation

Installieren Sie aus dem [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflolc).

## Verwendung

1. Klicken Sie auf das ClipAIble-Symbol in der Browser-Symbolleiste
2. Öffnen Sie einen beliebigen Artikel, YouTube-Video oder PDF
3. Wählen Sie das gewünschte Format (PDF, EPUB, FB2, Markdown oder Audio)
4. Klicken Sie auf speichern

**Alternative Möglichkeiten zum Speichern:**
- Rechtsklick auf einer beliebigen Webseite und Verwendung der Kontextmenü-Optionen

**Für lokale PDF-Dateien**: In KI-Modi werden Sie aufgefordert, die PDF-Datei aufgrund von Browser-Einschränkungen auszuwählen.

## Einstellungen

### Extraktionsmodi

- **AI Selector**: Empfohlener Modus für die meisten Seiten. Verwendet KI, um Artikelinhalt zu finden.
- **Automatic**: Basis-Modus, der ohne API-Schlüssel funktioniert.
- **AI Extractor**: Alternativer KI-Modus (nicht für regelmäßige Verwendung empfohlen).

### Leistungsfunktionen

- **Selektor-Caching**: Beschleunigt die Verarbeitung zuvor besuchter Seiten durch Wiederverwendung von KI-erlernten Selektoren

### Ausgabeformate

- **PDF**: Erstellt formatierte Dokumente mit 4 vordefinierten Stilen (Dunkel, Hell, Sepia, Hoher Kontrast) und anpassbaren Schriftarten/Farben
- **EPUB**: Erstellt strukturierte E-Books für Reader wie Kindle
- **FB2**: Erstellt strukturierte E-Books für PocketBook und andere Reader
- **Markdown**: Behält die Artikelstruktur mit Überschriften und Listen bei
- **Audio**: Konvertiert Text in Sprache mit 6 verschiedenen TTS-Diensten

### Übersetzung

Inhalte können übersetzt werden in: Englisch, Russisch, Ukrainisch, Deutsch, Französisch, Spanisch, Italienisch, Portugiesisch, Chinesisch, Japanisch, Koreanisch.

### Audio

Audio kann mit verschiedenen TTS-Anbietern generiert werden:
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (nur Englisch und Ukrainisch)
- Piper (offline, keine API-Schlüssel erforderlich)

## API-Schlüssel (optional)

Für KI-Funktionen können Sie API-Schlüssel von diesen Anbietern hinzufügen:

### OpenAI
Schlüssel erhalten auf [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Google Gemini
Schlüssel erhalten auf [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Für TTS aktivieren Sie [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) in Google Cloud Console

### Anthropic Claude
Schlüssel erhalten auf [console.anthropic.com](https://console.anthropic.com/)

### DeepSeek
Schlüssel erhalten auf [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### ElevenLabs
Schlüssel erhalten auf [elevenlabs.io](https://elevenlabs.io/)

### Qwen
Schlüssel erhalten auf [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)

### Respeecher
Schlüssel erhalten auf [space.respeecher.com](https://space.respeecher.com/)

## Zusätzliche Funktionen

- **Statistiken**: Verfolgen Sie Ihre gespeicherten Artikel mit Verlauf und monatlichen Zählern
- **Einstellungen Import/Export**: Sichern und Wiederherstellen Ihrer Einstellungen
- **11-sprachige Oberfläche**: Wechseln zwischen Sprachen ohne Neustart
- **Sichere Speicherung**: API-Schlüssel werden vor dem Speichern verschlüsselt

## Berechtigungen

Die Erweiterung benötigt diese Berechtigungen, um zu funktionieren:
- Lesen von Webseiten, die Sie besuchen
- Speichern von Dateien auf Ihrem Computer
- API-Aufrufe an KI-Anbieter machen (nur wenn Sie diese Funktionen verwenden)

**Sicherheit**: Alle API-Schlüssel werden vor dem Speichern im Browser verschlüsselt.

---

ClipAIble extrahiert und konvertiert Web-Artikel.
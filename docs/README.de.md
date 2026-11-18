# ClipAIble

Webartikel als PDF, EPUB, FB2, Markdown oder Audio speichern.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Verwendung

1. Einen Artikel, ein unterstütztes Video oder eine PDF-Datei öffnen.
2. In der Chrome-Symbolleiste auf ClipAIble klicken.
3. Ausgabeformat und Extraktionsmodus auswählen.
4. Auf **Speichern** klicken.

Auch das Kontextmenü der Seite bietet Speicheraktionen. Für lokale PDFs den Dateizugriff in den Chrome-Erweiterungseinstellungen erlauben oder bei Aufforderung die passende Datei auswählen. Das Popup geöffnet lassen, wenn eine Dateiauswahl erforderlich ist.

Bei Webartikeln verwendet **Automatisch** lokale Heuristiken und vorhandene zwischengespeicherte Selektoren. **AI Selector** lässt einen KI-Dienst CSS-Selektoren bestimmen und extrahiert anschließend die entsprechenden Seiteninhalte. **AI Extract** lässt den Dienst die Inhalte strukturieren. Bei PDFs liest Automatisch die Textebene; die KI-Modi verarbeiten gerenderte Seiten.

Die Einstellungen umfassen Text- und Bildübersetzung, Dokumentstile und ein Inhaltsverzeichnis. Im Popup lassen sich außerdem eine Zusammenfassung oder Kernaussagen erzeugen. Audio nutzt einen eingerichteten TTS-Dienst oder die lokale Piper-Sprachausgabe nach dem Herunterladen eines Stimmenmodells.

Die gewählten KI- und TTS-Funktionen benötigen die jeweiligen API-Schlüssel. Der Einstellungsexport enthält keine API-Schlüssel; Statistiken und der Selektor-Cache können optional eingeschlossen werden.

## Entwicklung

Installation, Build und Tests sind in der [englischen Hauptanleitung](../README.md#development) beschrieben.

[Berechtigungen](../PERMISSIONS.md) · [Datenschutz](../PRIVACY.md) · [Technischer Überblick](technical-overview.md)

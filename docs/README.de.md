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

Für den Export von YouTube- und Vimeo-Videos sind Untertitel und ein API-Schlüssel des für Artikel ausgewählten KI-Anbieters erforderlich. Das gilt auch im Modus **Automatisch**.

In den Einstellungen finden Sie Text- und Bildübersetzung, Dokumentstile und ein Inhaltsverzeichnis. Im Popup lassen sich eine Zusammenfassung oder Kernaussagen erzeugen. Für die Audioausgabe stehen ein eingerichteter TTS-Dienst sowie die lokale Sprachausgabe mit Piper oder Supertonic nach dem Download des Modells zur Verfügung.

Fügen Sie die API-Schlüssel für die gewählten KI- und TTS-Funktionen hinzu. Einstellungen und eigene Prompts lassen sich als JSON sichern. Statistik, Verlauf und Selektor-Cache können Sie zusätzlich aufnehmen. API-Schlüssel sind von der Sicherung ausgeschlossen. Beim Import können Sie fehlende Verlaufseinträge und Regeln für neue Websites hinzufügen oder die ausgewählten Datenbereiche ersetzen. Siehe [Einstellungen sichern](../README.md#back-up-settings).

## Entwicklung

Installation, Build und Tests sind in der [englischen Hauptanleitung](../README.md#development) beschrieben.

[Berechtigungen](../PERMISSIONS.md) · [Datenschutz](../PRIVACY.md) · [Technischer Überblick](technical-overview.md)

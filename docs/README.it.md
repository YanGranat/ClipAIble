# ClipAIble

Salva gli articoli web in PDF, EPUB, FB2, Markdown o audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Utilizzo

1. Apri un articolo, un video supportato o un PDF.
2. Fai clic su ClipAIble nella barra degli strumenti di Chrome.
3. Seleziona il formato di uscita e la modalità di estrazione.
4. Fai clic su **Salva**.

Anche il menu contestuale della pagina offre azioni di salvataggio. Per i PDF locali, consenti l’accesso ai file nelle impostazioni dell’estensione in Chrome oppure seleziona il file corrispondente quando richiesto. Lascia aperto il pannello dell’estensione se è necessario selezionare un file.

Per gli articoli web, **Automatico** usa euristiche locali e i selettori disponibili nella cache. **AI Selector** chiede a un servizio IA i selettori CSS, poi estrae il contenuto corrispondente. **AI Extract** chiede al servizio di strutturare il contenuto. Per i PDF, Automatico estrae il livello di testo; le modalità IA elaborano le pagine renderizzate.

Le impostazioni includono la traduzione di testo e immagini, gli stili del documento e un indice. Il pannello consente anche di generare un riepilogo o affermazioni chiave. L’audio usa un servizio TTS configurato oppure la sintesi locale Piper dopo il download di un modello vocale.

Aggiungi le chiavi API richieste dalle funzioni IA e TTS selezionate. L’esportazione delle impostazioni esclude le chiavi API e può includere facoltativamente statistiche e cache dei selettori.

## Sviluppo

Le istruzioni per installazione, compilazione e test si trovano nella [guida principale in inglese](../README.md#development).

[Autorizzazioni](../PERMISSIONS.md) · [Privacy](../PRIVACY.md) · [Panoramica tecnica](technical-overview.md)

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

Per esportare video di YouTube e Vimeo servono i sottotitoli e una chiave API del servizio IA selezionato per gli articoli. Vale anche in modalità **Automatico**.

Le impostazioni includono la traduzione di testo e immagini, gli stili del documento e un indice. Il pannello consente anche di generare un riepilogo o affermazioni chiave. Per l’audio puoi usare un servizio di sintesi vocale configurato oppure scaricare il modello di Piper o Supertonic per la sintesi locale.

Aggiungi le chiavi API richieste dalle funzioni IA e di sintesi vocale selezionate. Il backup JSON salva impostazioni e prompt personalizzati. Può includere anche statistiche, cronologia e cache dei selettori. Le chiavi API sono escluse dal backup. Durante l’importazione puoi aggiungere le voci mancanti nella cronologia e le regole per i nuovi siti oppure sostituire le sezioni selezionate. Vedi [Backup delle impostazioni](../README.md#back-up-settings).

## Sviluppo

Le istruzioni per installazione, compilazione e test si trovano nella [guida principale in inglese](../README.md#development).

[Autorizzazioni](../PERMISSIONS.md) · [Privacy](../PRIVACY.md) · [Panoramica tecnica](technical-overview.md)

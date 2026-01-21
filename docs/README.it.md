# ClipAIble

Estrattore di articoli con IA. Funziona su qualsiasi sito web.

## Cosa fa

ClipAIble estrae il contenuto degli articoli dalle pagine web e lo converte in diversi formati:
- Documenti PDF
- File EPUB
- File FB2
- Testo Markdown
- File audio

**Funzionalità speciali:**
- **Supporto YouTube/Vimeo**: Estrae i sottotitoli video e crea articoli da essi
- **Elaborazione PDF**: Funziona con PDF online e file PDF locali
- **Traduzione contenuto**: Traduce articoli in 11 lingue
- **Traduzione immagini**: Traduce testo sulle immagini usando IA
- **Generazione TLDR**: Crea riassunti brevi all'interno dei documenti
- **Pannello summary**: Mostra riassunti articoli nel popup dopo l'elaborazione

## Installazione

Installa dal [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflolc).

## Come usare

1. Clicca sull'icona ClipAIble nella barra degli strumenti del browser
2. Apri qualsiasi articolo, video YouTube o PDF
3. Seleziona il formato desiderato (PDF, EPUB, FB2, Markdown o Audio)
4. Clicca su salva

**Metodi alternativi di salvataggio:**
- Clic destro su qualsiasi pagina web e utilizzo delle opzioni del menu contestuale

**Per file PDF locali**: Nelle modalità IA, ti verrà chiesto di selezionare il file PDF a causa delle restrizioni del browser.

## Impostazioni

### Modi di estrazione

- **AI Selector**: Modalità raccomandata per la maggior parte dei siti. Usa l'IA per trovare il contenuto dell'articolo.
- **Automatic**: Modalità base che funziona senza chiavi API.
- **AI Extractor**: Modalità alternativa con IA (non raccomandata per uso regolare).

### Funzionalità di performance

- **Caching dei selettori**: Velocizza l'elaborazione dei siti visitati in precedenza riutilizzando i selettori appresi dall'IA

### Formati di output

- **PDF**: Crea documenti formattati con 4 stili predefiniti (Scuro, Chiaro, Seppia, Alto contrasto) e caratteri/colori personalizzabili
- **EPUB**: Crea libri elettronici strutturati per reader come Kindle
- **FB2**: Crea libri elettronici strutturati per PocketBook e altri reader
- **Markdown**: Mantiene la struttura dell'articolo con titoli ed elenchi
- **Audio**: Converte testo in voce utilizzando 6 diversi servizi TTS

### Traduzione

Il contenuto può essere tradotto in: inglese, russo, ucraino, tedesco, francese, spagnolo, italiano, portoghese, cinese, giapponese, coreano.

### Audio

L'audio può essere generato con diversi provider TTS:
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (solo inglese e ucraino)
- Piper (offline, non sono necessarie chiavi API)

## Chiavi API (opzionale)

Per le funzioni IA, puoi aggiungere chiavi API da questi provider:

### OpenAI
Ottieni la chiave su [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Google Gemini
Ottieni la chiave su [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Per TTS, attiva [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) in Google Cloud Console

### Anthropic Claude
Ottieni la chiave su [console.anthropic.com](https://console.anthropic.com/)

### DeepSeek
Ottieni la chiave su [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### ElevenLabs
Ottieni la chiave su [elevenlabs.io](https://elevenlabs.io/)

### Qwen
Ottieni la chiave su [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)

### Respeecher
Ottieni la chiave su [space.respeecher.com](https://space.respeecher.com/)

## Funzionalità aggiuntive

- **Statistiche**: Traccia i tuoi articoli salvati con cronologia e contatori mensili
- **Importazione/esportazione impostazioni**: Backup e ripristino delle tue preferenze
- **Interfaccia in 11 lingue**: Passa tra le lingue senza riavvio
- **Archiviazione sicura**: Le chiavi API vengono crittografate prima del salvataggio

## Permessi

L'estensione ha bisogno di questi permessi per funzionare:
- Leggere pagine web che visiti
- Salvare file sul tuo computer
- Fare chiamate API ai provider IA (solo quando usi quelle funzioni)

**Sicurezza**: Tutte le chiavi API vengono crittografate prima di essere memorizzate nel browser.

---

ClipAIble estrae e converte articoli web.
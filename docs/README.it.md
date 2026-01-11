# ✂️ ClipAIble

> **Estrattore di articoli alimentato da IA** — Salva qualsiasi articolo dal web come PDF, EPUB, FB2, Markdown o Audio. Traduzione in 11 lingue. Funziona su qualsiasi sito web.

![Versione](https://img.shields.io/badge/versione-3.3.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Estensione-green)
![Licenza](https://img.shields.io/badge/licenza-MIT-brightgreen)

**[⬇️ Installa da Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ Cos'è ClipAIble?

ClipAIble utilizza l'intelligenza artificiale per estrarre intelligentemente il contenuto degli articoli da qualsiasi pagina web — rimuove pubblicità, navigazione, popup e elementi superflui. Poi esporta nel formato preferito:

- 📄 **PDF** — Stile bello e personalizzabile
- 📚 **EPUB** — Compatibile con Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatibile con PocketBook, FBReader
- 📝 **Markdown** — Testo semplice per appunti
- 🎧 **Audio** — Ascolta con narrazione IA

Tutti i formati supportano la **traduzione in 11 lingue** — persino la traduzione del testo sulle immagini!

---

## 🚀 Funzionalità

### 🤖 Estrazione alimentata da IA
- **Due modalità**: Automatico (senza IA, veloce), AI Selector (veloce, riutilizzabile)
- **Modalità automatica**: Crea documenti senza IA — nessuna chiave API richiesta, estrazione istantanea
- **Più fornitori**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, DeepSeek, OpenRouter
- **Estrazione contenuto PDF** (v3.3.0): Estrarre contenuto da file PDF utilizzando la libreria PDF.js
  - Funzionalità sperimentale con sistema di classificazione multi-livello complesso
  - Estrae testo, immagini, struttura e metadati da file PDF
  - Supporta file PDF web e locali
  - Gestisce layout multi-colonna, tabelle, intestazioni, elenchi, fusione tra pagine
  - Nota: La funzionalità è sperimentale e può avere limitazioni con PDF complessi (PDF scansionati, PDF protetti da password)
- **Supporto video**: Estrarre sottotitoli da video YouTube/Vimeo e convertirli in articoli (v3.0.0)
  - Metodi di estrazione multipli con fallback
  - Priorità: sottotitoli manuali > generati automaticamente > tradotti
  - Elaborazione IA: rimuove timestamp, unisce paragrafi, corregge errori
  - Fallback di trascrizione audio quando i sottotitoli non sono disponibili
- **Rilevamento intelligente**: Trova il contenuto principale dell'articolo, rimuove automaticamente elementi indesiderati
- **Strategie di fallback avanzate**: 6 strategie diverse per estrazione di contenuto affidabile
- **Preserva struttura**: Intestazioni, immagini, blocchi di codice, tabelle, note a piè di pagina
- **Caching dei selettori**: Impostazioni indipendenti per l'uso e l'abilitazione della cache

### 🎧 Esportazione audio
- **5 fornitori TTS**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **Regolazione velocità**: 0.25x a 4.0x (solo OpenAI/ElevenLabs; Google/Qwen/Respeecher usano velocità fissa)
- **Supporto formati**: MP3 (OpenAI/ElevenLabs) o WAV (Google/Qwen/Respeecher)
- **Pronuncia multilingue**: Pronuncia corretta per ogni lingua
- **Supporto lingua ucraina**: Voci ucraine dedicate via Respeecher
- **Pulizia intelligente del testo**: L'IA rimuove URL, codice e contenuto non vocale
- **Funzionalità specifiche del fornitore**: Selezione modello, opzioni formato e impostazioni avanzate disponibili per ogni fornitore

### 🌍 Traduzione
- **11 lingue**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Rilevamento intelligente**: Salta la traduzione se l'articolo è già nella lingua di destinazione
- **Traduzione immagini**: Traduce testo sulle immagini (via Gemini)
- **Metadati localizzati**: Date ed etichette si adattano alla lingua

### 🎨 Personalizzazione PDF
- **4 preimpostazioni**: Scuro, Chiaro, Seppia, Alto contrasto
- **Colori personalizzabili**: Sfondo, testo, intestazioni, collegamenti
- **11 font**: Predefinito (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **Dimensione font**: Regolabile (predefinito: 31px)
- **Modalità pagina**: Pagina singola continua o formato multi-pagina A4


### ⚡ Funzionalità intelligenti
- **Estrazione contenuto PDF** (v3.3.0): Estrarre contenuto da file PDF e convertirli in articoli
  - Utilizza la libreria PDF.js per l'analisi in un documento offscreen
  - Sistema di classificazione multi-livello per estrazione precisa
  - Supporta file PDF web e locali
  - Integrazione completa della pipeline: traduzione, indice, riassunto, tutti i formati di esportazione
  - Nota: Funzionalità sperimentale, può avere limitazioni con PDF complessi
- **Supporto video**: Estrarre sottotitoli da video YouTube/Vimeo e convertirli in articoli (v3.0.0)
  - Estrazione diretta dei sottotitoli (nessuna chiave API di YouTube/Vimeo richiesta)
  - Elaborazione IA: rimuove timestamp, unisce paragrafi, corregge errori
  - Integrazione completa della pipeline: traduzione, indice, riassunto, tutti i formati di esportazione
- **Generazione riassunto**: Crea riassunti IA dettagliati di qualsiasi articolo o video
  - Fai clic sul pulsante **"Genera riassunto"** per creare un riassunto completo
  - Funziona con articoli normali e video YouTube/Vimeo
  - Continua la generazione anche se il popup è chiuso (funziona in background)
  - Copia negli appunti o scarica come file Markdown
  - Visualizzazione espandibile/comprimibile con testo formattato
  - Riassunti dettagliati con idee chiave, concetti, esempi e conclusioni
- **Riassunto (TL;DR)**: Riassunto breve di 2-4 frasi scritto dall'IA, incluso nei documenti
  - Funzionalità opzionale: attiva nelle impostazioni per aggiungere riassunto breve a PDF/EPUB/FB2/Markdown
  - Appare all'inizio dei documenti esportati
  - Diverso dal riassunto dettagliato (questo è un riepilogo breve)
- **Modalità offline**: Caching dei selettori — nessuna IA necessaria per siti ripetuti
  - Impostazioni indipendenti: usa selettori in cache e abilita caching separatamente
  - Invalidazione automatica in caso di errore di estrazione
  - Gestione manuale della cache per dominio
- **Statistiche**: Traccia numero di salvataggi, visualizza cronologia
- **Indice**: Generato automaticamente dalle intestazioni
- **Menu contestuale**: Tasto destro → "Salva articolo come PDF/EPUB/FB2/Markdown/Audio"
- **Annulla in qualsiasi momento**: Interrompi l'elaborazione con un clic
- **Importa/Esporta impostazioni**: Backup e ripristino di tutte le impostazioni (chiavi API escluse per sicurezza)

### 🔒 Sicurezza
- **Chiavi API crittografate** con crittografia standard (OpenAI, Claude, Gemini, Grok, DeepSeek, OpenRouter, ElevenLabs, Qwen, Respeecher)
- **Chiavi mai esportate** — escluse dal backup delle impostazioni
- **Tutti i dati vengono memorizzati localmente** — nulla viene inviato a terze parti

---

## ⚠️ Limitazioni Note

### Formati di File
- **Formato WAV** (Google/Qwen/Respeecher): I file possono essere molto grandi (10-50MB+ per articoli lunghi). Il formato MP3 (OpenAI/ElevenLabs) offre dimensioni di file più piccole.
- **Limiti di caratteri per richiesta**: 
  - OpenAI TTS: 4096 caratteri
  - ElevenLabs: 5000 caratteri
  - Google Gemini 2.5 TTS: 24000 caratteri
  - Qwen TTS: 600 caratteri
  - Respeecher TTS: 450 caratteri
  - Il testo viene automaticamente diviso in modo intelligente ai confini di frasi/parole

### Vincoli Tecnici
- **Requisito keep-alive**: Chrome MV3 richiede un intervallo keep-alive di almeno 1 minuto. Le attività di elaborazione lunghe possono richiedere diversi minuti. L'estensione usa meccanismo unificato di keep-alive (allarme ogni 1 minuto) per prevenire l'arresto del service worker.
- **CORS per le immagini**: Alcune immagini potrebbero non caricarsi se il sito web blocca le richieste cross-origin. L'estensione salterà queste immagini.
- **Annullamento non istantaneo**: L'annullamento può richiedere alcuni secondi per fermare completamente tutti i processi in background.
- **Recupero Service Worker**: Le operazioni riprendono automaticamente dopo il riavvio del service worker, se lo stato è recente (< 1 minuto). Il ricaricamento dell'estensione reimposta sempre lo stato.
- **Limitazioni estrazione PDF** (v3.3.0): 
  - PDF scansionati (senza strato di testo) non sono supportati — OCR non è ancora disponibile
  - PDF protetti da password devono essere sbloccati prima dell'estrazione
  - PDF molto grandi (>100MB) potrebbero non funzionare a causa di limitazioni di memoria
  - Layout complessi (multi-colonna, tabelle) vengono estratti ma possono richiedere verifica manuale

### Compatibilità del Browser
- **Chrome/Edge/Brave/Arc**: Completamente supportato
- **Firefox**: Non supportato (utilizza un'API di estensione diversa)
- **Safari**: Non supportato (utilizza un'API di estensione diversa)

---

## 📦 Installazione

### Opzione 1: Installazione da Chrome Web Store (Consigliato)

**[⬇️ Installa ClipAIble da Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### Opzione 2: Installazione manuale (Modalità sviluppatore)

1. **Clona** questo repository
2. Apri Chrome → `chrome://extensions/`
3. Abilita la **Modalità sviluppatore**
4. Fai clic su **Carica estensione non compressa** → seleziona la cartella

### Requisiti

- Chrome, Edge, Brave o browser Arc
- Chiave API da almeno un fornitore (vedi sotto)

---

## 🔑 Ottenere chiavi API

### OpenAI (modelli GPT + Audio)

1. Vai su [platform.openai.com](https://platform.openai.com/)
2. Registrati o accedi
3. Vai a **API Keys** (menu sinistro) o direttamente su [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Fai clic su **"Create new secret key"**
5. Copia la chiave (inizia con `sk-...`)
6. Aggiungi fatturazione in **Settings → Billing** (richiesto per l'uso dell'API)

> **Nota:** La chiave OpenAI è richiesta per l'esportazione audio (TTS). Altri formati funzionano con qualsiasi fornitore.

### Google Gemini

1. Vai su [Google AI Studio](https://aistudio.google.com/)
2. Accedi con account Google
3. Fai clic su **"Get API key"** o vai direttamente su [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Fai clic su **"Create API key"**
5. Copia la chiave (inizia con `AIza...`)

> **Suggerimento:** Gemini abilita anche la funzione di traduzione del testo sulle immagini e Google Gemini 2.5 TTS (30 voci). Per TTS, puoi usare la stessa chiave API Gemini o impostare una chiave API Google TTS dedicata. Richiede l'abilitazione di Generative Language API in Google Cloud Console.

### Anthropic Claude

1. Vai su [console.anthropic.com](https://console.anthropic.com/)
2. Registrati o accedi
3. Vai a **API Keys**
4. Fai clic su **"Create Key"**
5. Copia la chiave (inizia con `sk-ant-...`)
6. Aggiungi crediti in **Plans & Billing**

### DeepSeek

1. Vai su [platform.deepseek.com](https://platform.deepseek.com/)
2. Registrati o accedi
3. Vai a **API Keys** o vai su [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. Fai clic su **"Create API key"**
5. Copia la chiave (inizia con `sk-...`)

> **Nota:** DeepSeek fornisce modelli DeepSeek-V3.2 con modalità thinking e non-thinking.

### ElevenLabs (Audio)

1. Vai su [ElevenLabs](https://elevenlabs.io/)
2. Registrati o accedi
3. Vai a **Profile** → **API Keys**
4. Crea una chiave API
5. Copia la chiave

> **Nota:** ElevenLabs fornisce TTS di alta qualità con regolazione velocità e selezione formato.

### Google Gemini 2.5 TTS (Audio)

1. Vai su [Google AI Studio](https://aistudio.google.com/)
2. Accedi con account Google
3. Fai clic su **"Get API key"** o vai direttamente su [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Fai clic su **"Create API key"**
5. Copia la chiave (inizia con `AIza...`)
6. Abilita **Generative Language API** in [Google Cloud Console](https://console.cloud.google.com/)
7. (Opzionale) Abilita fatturazione se richiesto per il tuo modello

> **Nota:** Google Gemini 2.5 TTS. Puoi usare la stessa chiave API Gemini o impostare una chiave API Google TTS dedicata.

### Qwen3-TTS-Flash (Audio)

1. Vai su [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Registrati o accedi
3. Vai a **API Keys** o **Model Studio**
4. Crea una chiave API
5. Copia la chiave (inizia con `sk-...`)

> **Nota:** Qwen3-TTS-Flash include una voce russa dedicata (Alek).

### Respeecher (Audio - Inglese e Ucraino)

1. Vai su [Respeecher Space](https://space.respeecher.com/)
2. Registrati o accedi
3. Vai a **API Keys**
4. Crea una chiave API
5. Copia la chiave

> **Nota:** Respeecher supporta inglese e ucraino con voci ucraine dedicate.

---

## 🎯 Guida rapida

1. Fai clic sull'icona **ClipAIble** nella barra degli strumenti
2. Inserisci la tua chiave API → **Salva chiavi**
3. Naviga verso qualsiasi articolo
4. Fai clic su **Salva come PDF** (o scegli un altro formato)
5. Fatto! Il file viene scaricato automaticamente

**Suggerimenti:**
- Tasto destro ovunque → **"Salva articolo come PDF"**
- Fai clic su **"Genera riassunto"** per creare un riassunto IA dettagliato (funziona anche se il popup è chiuso)
- Attiva **"Genera TL;DR"** nelle impostazioni per aggiungere un riassunto breve ai documenti

---

## ⚙️ Impostazioni

### Interfaccia

- **Tema**: Scegli Scuro, Chiaro o Auto (segue il sistema) nell'intestazione
- **Lingua**: Seleziona la lingua dell'interfaccia (11 lingue) nell'intestazione
- **Modelli personalizzati**: Aggiungi i tuoi modelli IA tramite il pulsante "+" accanto al selettore modelli

### Modalità di estrazione

| Modalità | Velocità | Migliore per |
|----------|----------|--------------|
| **Automatico** | ⚡⚡ Istantaneo | Articoli semplici, nessuna chiave API richiesta |
| **AI Selector** | ⚡ Veloce | La maggior parte dei siti, blog, notizie |

### Preimpostazioni stile (PDF)

4 preimpostazioni disponibili: Scuro, Chiaro, Sepia, Alto contrasto. Personalizza colori per sfondo, testo, intestazioni e collegamenti.
|-----------------|--------|-------|
| Scuro | `#303030` | `#b9b9b9` |
| Chiaro | `#f8f9fa` | `#343a40` |
| Seppia | `#faf4e8` | `#5d4e37` |
| Alto contrasto | `#000000` | `#ffffff` |

**Colori personalizzati:** Personalizza sfondo, testo, intestazioni e collegamenti con selettori colore. Pulsanti di ripristino individuali (↺) per ogni colore, o **"Ripristina tutto predefinito"** per ripristinare tutti gli stili.

---

## 📊 Statistiche e cache

Fai clic su **📊 Statistiche** per visualizzare:
- Totale salvataggi, conteggio questo mese
- Suddivisione per formato (PDF, EPUB, FB2, Markdown, Audio)
- Cronologia recente con collegamenti agli articoli originali (ultimi 50 salvataggi)
  - Fai clic sul collegamento per aprire l'articolo originale
  - Fai clic sul pulsante ✕ per eliminare una singola voce di cronologia
  - Mostra formato, dominio, tempo di elaborazione e data
- Domini in cache per modalità offline
- **Attiva/Disattiva statistiche**: Interruttore per raccolta statistiche
- **Cancella statistiche**: Pulsante per ripristinare tutte le statistiche
- **Cancella cache**: Pulsante per rimuovere tutti i selettori in cache
- Eliminazione di singoli domini dalla cache

## 📝 Generazione riassunto

Crea riassunti IA dettagliati di qualsiasi articolo o video:

1. Naviga verso qualsiasi articolo o video YouTube/Vimeo
2. Fai clic sul pulsante **"Genera riassunto"** nel popup
3. Il riassunto viene generato in background (puoi chiudere il popup)
4. Quando pronto, il riassunto appare con opzioni:
   - **Copia** negli appunti
   - **Scarica** come file Markdown
   - **Espandi/Comprimi** per vedere il testo completo
   - **Chiudi** per nascondere il riassunto

**Funzionalità:**
- Funziona con articoli e video YouTube/Vimeo
- Continua la generazione anche se il popup è chiuso
- Riassunti dettagliati con idee chiave, concetti, esempi e conclusioni
- Testo formattato con intestazioni, elenchi e collegamenti
- Salvato automaticamente — persiste fino a quando non lo chiudi

**Nota:** La generazione del riassunto è separata dall'esportazione del documento. Usala per capire rapidamente il contenuto senza salvare un documento completo.

### Modalità offline

ClipAIble memorizza in cache i selettori generati dall'IA per dominio:
- **Seconda visita = istantanea** — nessuna chiamata API
- **Invalidazione automatica** — si svuota se l'estrazione fallisce
- **Controllo manuale** — elimina singoli domini
- **Impostazioni indipendenti**:
  - **Usa selettori in cache**: Salta l'analisi della pagina se la cache esiste (più veloce)
  - **Abilita caching**: Salva nuovi selettori nella cache dopo l'estrazione
  - Entrambe le impostazioni funzionano indipendentemente per controllo flessibile

---

## 💾 Importa/Esporta impostazioni

**⚙️ Impostazioni** → **Import/Export**

- Esporta tutte le impostazioni (chiavi API escluse per sicurezza)
- Opzionale: includi statistiche e cache
- Importa con opzioni di unione o sovrascrittura

---

## 🔧 Risoluzione problemi

| Problema | Soluzione |
|----------|----------|
| Contenuto vuoto | Prova la modalità **AI Selector** |
| Chiave API non valida | Verifica il formato della chiave (sk-..., AIza..., sk-ant-...) |
| Immagini mancanti | Alcuni siti bloccano cross-origin; immagini piccole filtrate |
| Audio lento | Articoli lunghi divisi in blocchi; osserva la barra di avanzamento |
| Riassunto non generato | Verifica la chiave API, assicurati che il contenuto della pagina sia caricato, riprova |
| Timeout generazione riassunto | Articoli molto lunghi possono richiedere fino a 45 minuti; attendi o prova con contenuto più corto |

---

---

## 🔐 Sicurezza e privacy

- **Crittografia**: AES-256-GCM tramite Web Crypto API
- **Derivazione chiave**: PBKDF2, 100.000 iterazioni
- **Nessun tracciamento**: Nessuna analitica, nessuna registrazione remota
- **Solo locale**: Tutti i dati rimangono nel tuo browser

---

## 📋 Permessi

ClipAIble richiede permessi per:
- Leggere la pagina corrente per estrarre il contenuto
- Salvare le tue impostazioni e file generati localmente
- Effettuare chiamate API ai fornitori IA/TTS che configuri
- Accedere ai siti web solo quando li salvi esplicitamente

**Nota sulla sicurezza:** Tutte le chiavi API sono crittografate e memorizzate solo localmente. Le chiavi non vengono mai esportate o trasmesse a nessun server, eccetto i fornitori IA che configuri.

Vedi [PERMISSIONS.md](PERMISSIONS.md) per i dettagli.

---

## 🤝 Contribuire

1. Fai fork del repository
2. Crea ramo funzionalità: `git checkout -b feature/cool-thing`
3. Commit: `git commit -m 'Add cool thing'`
4. Push: `git push origin feature/cool-thing`
5. Apri Pull Request

---

## 📜 Licenza

MIT License — vedi [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — Salva. Leggi. Ascolta. Ovunque.
</p>


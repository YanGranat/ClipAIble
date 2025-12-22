# ✂️ ClipAIble

> **Estrattore di articoli alimentato da IA** — Salva qualsiasi articolo dal web come PDF, EPUB, FB2, Markdown o Audio. Traduzione in 11 lingue. Funziona su qualsiasi sito web.

![Versione](https://img.shields.io/badge/versione-3.2.1-blue)
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
- **Tre modalità**: Automatico (senza IA, veloce), AI Selector (veloce, riutilizzabile) e AI Extract (approfondita)
- **Modalità automatica**: Crea documenti senza IA — nessuna chiave API richiesta, estrazione istantanea
- **Più fornitori**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
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
- **100+ voci**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (inglese e ucraino)
- **Regolazione velocità**: 0.5x a 2.0x (solo OpenAI/ElevenLabs; Google/Qwen/Respeecher usano velocità fissa)
- **Supporto formati**: MP3 (OpenAI/ElevenLabs) o WAV (Google/Qwen/Respeecher)
- **Pronuncia multilingue**: Pronuncia corretta per ogni lingua
- **Supporto lingua ucraina**: Voci ucraine dedicate via Respeecher (10 voci)
- **Pulizia intelligente del testo**: L'IA rimuove URL, codice e contenuto non vocale
- **Funzionalità specifiche del fornitore**:
  - **ElevenLabs**: Selezione modello (v2, v3, Turbo v2.5), selezione formato, impostazioni vocali avanzate
  - **Google Gemini 2.5 TTS**: Selezione modello (pro/flash), 30 voci, limite 24k caratteri
  - **Qwen**: 49 voci incluso voce russa (Alek), limite 600 caratteri
  - **Respeecher**: Parametri di campionamento avanzati (temperature, repetition_penalty, top_p)

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
- **Supporto video**: Estrarre sottotitoli da video YouTube/Vimeo e convertirli in articoli (v3.0.0)
  - Estrazione diretta dei sottotitoli (nessuna chiave API di YouTube/Vimeo richiesta)
  - Elaborazione IA: rimuove timestamp, unisce paragrafi, corregge errori
  - Fallback di trascrizione audio: trascrizione automatica quando i sottotitoli non sono disponibili (richiede chiave API OpenAI con modello gpt-4o-transcribe)
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
- **Chiavi API crittografate** con AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
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
- **Requisito keep-alive**: Chrome MV3 richiede un intervallo keep-alive di almeno 1 minuto. Le attività di elaborazione lunghe possono richiedere diversi minuti. L'estensione usa meccanismo unificato di keep-alive (allarme ogni 1 minuto + salvataggio stato ogni 2 secondi) per prevenire l'arresto del service worker.
- **CORS per le immagini**: Alcune immagini potrebbero non caricarsi se il sito web blocca le richieste cross-origin. L'estensione salterà queste immagini.
- **Annullamento non istantaneo**: L'annullamento può richiedere alcuni secondi per fermare completamente tutti i processi in background.
- **Recupero Service Worker**: Le operazioni riprendono automaticamente dopo il riavvio del service worker (entro 2 ore).

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

### ElevenLabs (Audio)

1. Vai su [ElevenLabs](https://elevenlabs.io/)
2. Registrati o accedi
3. Vai a **Profile** → **API Keys**
4. Crea una chiave API
5. Copia la chiave

> **Nota:** ElevenLabs fornisce 9 voci premium con TTS di alta qualità. Supporta regolazione velocità (0.25-4.0x) e selezione formato (MP3 alta qualità predefinito: mp3_44100_192). Modelli: Multilingual v2, v3 (predefinito), Turbo v2.5. Impostazioni vocali avanzate disponibili (stability, similarity, style, speaker boost).

### Google Gemini 2.5 TTS (Audio)

1. Vai su [Google AI Studio](https://aistudio.google.com/)
2. Accedi con account Google
3. Fai clic su **"Get API key"** o vai direttamente su [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Fai clic su **"Create API key"**
5. Copia la chiave (inizia con `AIza...`)
6. Abilita **Generative Language API** in [Google Cloud Console](https://console.cloud.google.com/)
7. (Opzionale) Abilita fatturazione se richiesto per il tuo modello

> **Nota:** Google Gemini 2.5 TTS fornisce 30 voci. Puoi usare la stessa chiave API Gemini o impostare una chiave API Google TTS dedicata. Formato WAV fisso a 24kHz. Modelli: `gemini-2.5-pro-preview-tts` (principale) o `gemini-2.5-flash-preview-tts` (più veloce).

### Qwen3-TTS-Flash (Audio)

1. Vai su [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Registrati o accedi
3. Vai a **API Keys** o **Model Studio**
4. Crea una chiave API
5. Copia la chiave (inizia con `sk-...`)

> **Nota:** Qwen3-TTS-Flash fornisce 49 voci, inclusa una voce russa dedicata (Alek). Formato WAV fisso a 24kHz.

### Respeecher (Audio - Inglese e Ucraino)

1. Vai su [Respeecher Space](https://space.respeecher.com/)
2. Registrati o accedi
3. Vai a **API Keys**
4. Crea una chiave API
5. Copia la chiave

> **Nota:** Respeecher supporta inglese e ucraino con voci ucraine dedicate. Formato WAV fisso a 22.05kHz.

### Quale scegliere?

| Fornitore | Migliore per | Audio | Traduzione immagini |
|-----------|--------------|-------|---------------------|
| **OpenAI** | Uso generale, esportazione audio, trascrizione video | ✅ (11 voci) | ❌ |
| **Gemini** | Estrazione rapida, traduzione immagini, esportazione audio (30 voci) | ✅ (30 voci) | ✅ |
| **Claude** | Articoli lunghi, pagine complesse | ❌ | ❌ |
| **Grok** | Attività di ragionamento rapido | ❌ | ❌ |
| **OpenRouter** | Accesso a più modelli | ❌ | ❌ |
| **ElevenLabs** | Esportazione audio (9 voci, alta qualità) | ✅ (9 voci) | ❌ |
| **Qwen** | Esportazione audio (49 voci, supporto russo) | ✅ (49 voci) | ❌ |
| **Respeecher** | Esportazione audio (lingua ucraina) | ✅ (14 voci) | ❌ |

**Raccomandazione:** 
- **Per estrazione**: Inizia con OpenAI o Gemini (veloce e affidabile)
- **Per audio**: OpenAI per uso generale, ElevenLabs per alta qualità, Google Gemini 2.5 TTS per 30 voci, Qwen per russo, Respeecher per ucraino
- **Per traduzione immagini**: Richiede chiave API Gemini

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
| **AI Extract** | 🐢 Approfondita | Pagine complesse, Notion, SPAs |

### Modelli IA

| Fornitore | Modello | Note |
|-----------|---------|------|
| OpenAI | GPT-5.2 | Ultimo, ragionamento medio (predefinito) |
| OpenAI | GPT-5.2-high | Migliorato, ragionamento alto |
| OpenAI | GPT-5.1 | Equilibrato |
| OpenAI | GPT-5.1 (high) | Migliore qualità, ragionamento alto |
| Anthropic | Claude Sonnet 4.5 | Ottimo per articoli lunghi |
| Google | Gemini 3 Pro | Estrazione rapida, traduzione immagini |
| Grok | Grok 4.1 Fast Reasoning | Ragionamento veloce |
| OpenRouter | Vari modelli | Accesso a più fornitori |

**Modelli personalizzati:** Fai clic sul pulsante **"+"** accanto al selettore modelli per aggiungere modelli personalizzati (ad esempio, `gpt-4o`, `claude-opus-4.5`). I modelli personalizzati appaiono nel menu a tendina e possono essere nascosti/mostrati secondo necessità.

### Voci audio

**OpenAI (11 voci) :** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs (9 voci) :** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS (30 voci) :** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash (49 voci) :** Compreso Elias (predefinito), Alek (russo) e voci per 10 lingue

**Respeecher (14 voci) :** 4 inglesi (Samantha, Neve, Gregory, Vincent) + 10 voci ucraine

### Preimpostazioni stile (PDF)

| Preimpostazione | Sfondo | Testo |
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
| Contenuto vuoto | Prova la modalità **AI Extract** |
| Chiave API non valida | Verifica il formato della chiave (sk-..., AIza..., sk-ant-...) |
| Immagini mancanti | Alcuni siti bloccano cross-origin; immagini piccole filtrate |
| Audio lento | Articoli lunghi divisi in blocchi; osserva la barra di avanzamento |
| Riassunto non generato | Verifica la chiave API, assicurati che il contenuto della pagina sia caricato, riprova |
| Timeout generazione riassunto | Articoli molto lunghi possono richiedere fino a 45 minuti; attendi o prova con contenuto più corto |

---

## 🏗️ Architettura

```
clipaible/
├── manifest.json       # Configurazione estensione
├── popup/              # Interfaccia (HTML, CSS, JS)
│   ├── popup.js       # Orchestrazione principale (2670 righe)
│   ├── core.js        # Logica di business (1459 righe)
│   ├── handlers.js    # Gestori di eventi (1567 righe)
│   ├── ui.js          # Gestione interfaccia
│   ├── stats.js       # Visualizzazione statistiche
│   └── settings.js    # Gestione impostazioni
├── scripts/
│   ├── background.js   # Service worker (2635 righe)
│   ├── content.js      # Content script per YouTube
│   ├── locales.js      # Localizzazione UI (11 lingue)
│   ├── message-handlers/ # Moduli gestori messaggi (v3.2.1+)
│   │   ├── index.js    # Router messaggi
│   │   ├── utils.js    # Utilità gestori
│   │   ├── simple.js   # Gestori semplici
│   │   ├── stats.js    # Gestori statistiche
│   │   ├── cache.js    # Gestori cache
│   │   ├── settings.js # Gestori impostazioni
│   │   ├── processing.js # Gestori elaborazione
│   │   ├── video.js    # Gestori video/sottotitoli
│   │   ├── summary.js  # Helper generazione riassunti
│   │   └── complex.js  # Gestori complessi
│   ├── api/            # Fornitori AI & TTS
│   │   ├── openai.js   # OpenAI (modelli GPT)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # Router TTS
│   │   └── index.js    # Router API
│   ├── extraction/     # Estrazione contenuto
│   │   ├── prompts.js  # Prompt IA
│   │   ├── html-utils.js # Utilità HTML
│   │   ├── video-subtitles.js # Estrazione sottotitoli YouTube/Vimeo
│   │   └── video-processor.js # Elaborazione sottotitoli IA
│   ├── translation/    # Traduzione e rilevamento lingua
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Cache selettori
│   ├── stats/          # Statistiche utilizzo
│   ├── settings/       # Importa/Esporta impostazioni
│   ├── state/          # Gestione stato elaborazione
│   └── utils/          # Configurazione, crittografia, utilità
│       ├── video.js    # Rilevamento piattaforma video
│       ├── validation.js # Utilità validazione
│       └── api-error-handler.js # Gestione errori API comune
├── print/              # Rendering PDF
├── config/             # Stili
├── lib/                # JSZip
├── docs/               # File README localizzati
└── memory-bank/        # Documentazione progetto
```

---

## 🔐 Sicurezza e privacy

- **Crittografia**: AES-256-GCM tramite Web Crypto API
- **Derivazione chiave**: PBKDF2, 100.000 iterazioni
- **Nessun tracciamento**: Nessuna analitica, nessuna registrazione remota
- **Solo locale**: Tutti i dati rimangono nel tuo browser

---

## 📋 Permessi

ClipAIble richiede i seguenti permessi per funzionare. Tutti i permessi sono utilizzati solo per gli scopi indicati:

| Permesso | Perché |
|----------|--------|
| `activeTab` | Leggere la pagina corrente per estrarre il contenuto quando si fa clic sull'icona dell'estensione o si usa il menu contestuale. L'estensione accede solo alla scheda che stai visualizzando attualmente. |
| `storage` | Salvare le tue impostazioni (chiavi API, preferenze di stile, selezione della lingua) e statistiche localmente nel tuo browser. I tuoi dati non lasciano mai il tuo dispositivo. |
| `scripting` | Iniettare lo script di estrazione del contenuto nelle pagine web. Questo script trova ed estrae il contenuto dell'articolo (testo, immagini, intestazioni) dal DOM della pagina. |
| `downloads` | Salvare i file generati (PDF, EPUB, FB2, Markdown, Audio) sul tuo computer. Senza questo permesso, l'estensione non può scaricare file. |
| `debugger` | **Solo generazione PDF** — Utilizza la funzionalità integrata print-to-PDF di Chrome per generare PDF di alta qualità con layout di pagina e stile appropriati. Il debugger viene collegato solo durante la generazione PDF e immediatamente scollegato dopo il completamento. Questo è l'unico modo per generare PDF con stile personalizzato nelle estensioni Chrome. |
| `alarms` | Mantenere il service worker in background attivo durante operazioni lunghe (articoli grandi, traduzione). Chrome Manifest V3 sospende i service worker dopo 30 secondi, ma l'elaborazione degli articoli può richiedere diversi minuti. Usa meccanismo unificato di keep-alive (allarme ogni 1 minuto + salvataggio stato ogni 2 secondi) secondo le regole MV3. |
| `contextMenus` | Aggiungere opzioni "Salva con ClipAIble" (PDF/EPUB/FB2/MD/Audio) al menu contestuale del tasto destro sulle pagine web. |
| `notifications` | Mostrare notifiche desktop quando si usa la funzione "Salva" dal menu contestuale. Ti notifica se c'è un errore (ad esempio, chiave API mancante). |
| `unlimitedStorage` | Archiviare la cache dei selettori e i dati di stampa temporanei localmente. Ciò consente estrazioni ripetute più veloci senza richiamare l'IA (modalità offline). |

### Permessi host

| Permesso | Perché |
|----------|--------|
| `<all_urls>` | Estrarre contenuto da qualsiasi sito web che visiti. L'estensione deve: 1) Leggere l'HTML della pagina per trovare il contenuto dell'articolo, 2) Scaricare immagini incorporate negli articoli, 3) Effettuare chiamate API ai fornitori IA/TTS (OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher). L'estensione accede solo alle pagine che salvi esplicitamente — non naviga sul web da sola. |

**Nota sulla sicurezza:** Tutte le chiavi API sono crittografate utilizzando AES-256-GCM e memorizzate solo localmente. Le chiavi non vengono mai esportate o trasmesse a nessun server, eccetto i fornitori IA che configuri.

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


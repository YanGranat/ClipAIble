# ✂️ ClipAIble

> **Estrattore di articoli alimentato da IA** — Salva qualsiasi articolo dal web come PDF, EPUB, FB2, Markdown o Audio. Traduzione in 11 lingue. Funziona su qualsiasi sito web.

![Versione](https://img.shields.io/badge/versione-2.9.0-blue)
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
- 🎧 **Audio (MP3/WAV)** — Ascolta con narrazione IA

Tutti i formati supportano la **traduzione in 11 lingue** — persino la traduzione del testo sulle immagini!

---

## 🚀 Funzionalità

### 🤖 Estrazione alimentata da IA
- **Due modalità**: AI Selector (veloce, riutilizzabile) e AI Extract (approfondita)
- **Più fornitori**: OpenAI GPT (GPT-5.2, GPT-5.2-pro, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Supporto video**: Estrarre sottotitoli da video YouTube/Vimeo e convertirli in articoli (v2.9.0)
- **Rilevamento intelligente**: Trova il contenuto principale dell'articolo, rimuove automaticamente elementi indesiderati
- **Preserva struttura**: Intestazioni, immagini, blocchi di codice, tabelle, note a piè di pagina

### 🎧 Esportazione audio
- **5 fornitori TTS**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ voci**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (inglese e ucraino)
- **Regolazione velocità**: 0.5x a 2.0x (solo OpenAI/ElevenLabs)
- **Supporto lingua ucraina**: Voci ucraine dedicate via Respeecher
- **Pronuncia multilingue**: Pronuncia corretta per ogni lingua
- **Pulizia intelligente del testo**: L'IA rimuove URL, codice e contenuto non vocale

### 🌍 Traduzione
- **11 lingue**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Rilevamento intelligente**: Salta la traduzione se l'articolo è già nella lingua di destinazione
- **Traduzione immagini**: Traduce testo sulle immagini (via Gemini)
- **Metadati localizzati**: Date ed etichette si adattano alla lingua

### 🎨 Personalizzazione PDF
- **4 preimpostazioni**: Scuro, Chiaro, Seppia, Alto contrasto
- **Colori personalizzabili**: Sfondo, testo, intestazioni, collegamenti
- **11 font** tra cui scegliere
- **Modalità pagina**: Pagina singola continua o formato multi-pagina A4


### ⚡ Funzionalità intelligenti
- **Supporto video**: Estrarre sottotitoli da video YouTube/Vimeo e convertirli in articoli (v2.9.0)
- **Trascrizione audio**: Trascrizione automatica quando i sottotitoli non sono disponibili (gpt-4o-transcribe)
- **Modalità offline**: Caching dei selettori — nessuna IA necessaria per siti ripetuti
- **Statistiche**: Traccia numero di salvataggi, visualizza cronologia
- **Indice**: Generato automaticamente dalle intestazioni
- **Riassunto**: Riassunto di 2-3 paragrafi scritto dall'IA
- **Menu contestuale**: Tasto destro → "Salva articolo come PDF"
- **Annulla in qualsiasi momento**: Interrompi l'elaborazione con un clic

### 🔒 Sicurezza
- **Chiavi API crittografate** con AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Chiavi mai esportate** — escluse dal backup delle impostazioni
- **Tutti i dati vengono memorizzati localmente** — nulla viene inviato a terze parti

---

## ⚠️ Limitazioni Note

### Formati di File
- **Formato WAV** (Qwen/Respeecher): I file possono essere molto grandi (10-50MB+ per articoli lunghi). Considera l'uso del formato MP3 per dimensioni di file più piccole.
- **Limiti di caratteri**: 
  - Qwen TTS: 600 caratteri per segmento
  - Respeecher TTS: 450 caratteri per segmento
  - Il testo viene automaticamente diviso in modo intelligente ai confini di frasi/parole

### Vincoli Tecnici
- **Requisito keep-alive**: Chrome MV3 richiede un intervallo keep-alive di almeno 1 minuto. Le attività di elaborazione lunghe possono richiedere diversi minuti.
- **CORS per le immagini**: Alcune immagini potrebbero non caricarsi se il sito web blocca le richieste cross-origin. L'estensione salterà queste immagini.
- **Annullamento non istantaneo**: L'annullamento può richiedere alcuni secondi per fermare completamente tutti i processi in background.

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

> **Suggerimento:** Gemini abilita anche la funzione di traduzione del testo sulle immagini.

### Anthropic Claude

1. Vai su [console.anthropic.com](https://console.anthropic.com/)
2. Registrati o accedi
3. Vai a **API Keys**
4. Fai clic su **"Create Key"**
5. Copia la chiave (inizia con `sk-ant-...`)
6. Aggiungi crediti in **Plans & Billing**

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
| **OpenAI** | Uso generale, esportazione audio, trascrizione video | ✅ | ❌ |
| **Gemini** | Estrazione rapida, traduzione immagini, esportazione audio (30 voci) | ✅ | ✅ |
| **Claude** | Articoli lunghi, pagine complesse | ❌ | ❌ |
| **Grok** | Attività di ragionamento rapido | ❌ | ❌ |
| **OpenRouter** | Accesso a più modelli | ❌ | ❌ |
| **Qwen** | Esportazione audio (49 voci, supporto russo) | ✅ | ❌ |
| **Respeecher** | Esportazione audio (lingua ucraina) | ✅ | ❌ |

**Raccomandazione:** Inizia con OpenAI per ottenere tutte le funzionalità (estrazione + audio). Usa Respeecher per testo ucraino.

---

## 🎯 Guida rapida

1. Fai clic sull'icona **ClipAIble** nella barra degli strumenti
2. Inserisci la tua chiave API → **Salva chiavi**
3. Naviga verso qualsiasi articolo
4. Fai clic su **Salva come PDF** (o scegli un altro formato)
5. Fatto! Il file viene scaricato automaticamente

**Suggerimento:** Tasto destro ovunque → **"Salva articolo come PDF"**

---

## ⚙️ Impostazioni

### Modalità di estrazione

| Modalità | Velocità | Migliore per |
|----------|----------|--------------|
| **AI Selector** | ⚡ Veloce | La maggior parte dei siti, blog, notizie |
| **AI Extract** | 🐢 Approfondita | Pagine complesse, Notion, SPAs |

### Modelli IA

| Fornitore | Modello | Note |
|-----------|---------|------|
| OpenAI | GPT-5.2 | Ultimo, ragionamento medio |
| OpenAI | GPT-5.2-pro | Migliorato, ragionamento medio |
| OpenAI | GPT-5.1 | Equilibrato |
| OpenAI | GPT-5.1 (high) | Migliore qualità |
| Anthropic | Claude Sonnet 4.5 | Ottimo per articoli lunghi |
| Google | Gemini 3 Pro | Veloce |
| Grok | Grok 4.1 Fast Reasoning | Ragionamento veloce |

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

---

## 📊 Statistiche e cache

Fai clic su **📊 Statistiche** per visualizzare:
- Totale salvataggi, conteggio questo mese
- Suddivisione per formato
- Cronologia recente con collegamenti
- Domini in cache per modalità offline

### Modalità offline

ClipAIble memorizza in cache i selettori generati dall'IA per dominio:
- **Seconda visita = istantanea** — nessuna chiamata API
- **Invalidazione automatica** — si svuota se l'estrazione fallisce
- **Controllo manuale** — elimina singoli domini

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

---

## 🏗️ Architettura

```
clipaible/
├── manifest.json       # Configurazione estensione
├── popup/              # Interfaccia (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # Estrazione contenuto
│   ├── translation/    # Traduzione e rilevamento lingua
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Cache selettori
│   ├── stats/          # Statistiche utilizzo
│   └── utils/          # Configurazione, crittografia, utilità
├── print/              # Rendering PDF
├── config/             # Stili
└── lib/                # JSZip
```

---

## 🔐 Sicurezza e privacy

- **Crittografia**: AES-256-GCM tramite Web Crypto API
- **Derivazione chiave**: PBKDF2, 100.000 iterazioni
- **Nessun tracciamento**: Nessuna analitica, nessuna registrazione remota
- **Solo locale**: Tutti i dati rimangono nel tuo browser

---

## 📋 Permessi

| Permesso | Perché |
|----------|--------|
| `activeTab` | Leggi articolo dalla scheda corrente |
| `storage` | Salva impostazioni localmente |
| `scripting` | Inietta script di estrazione |
| `downloads` | Salva file generati (PDF, EPUB, FB2, Markdown, Audio) |
| `debugger` | Genera PDF tramite API di stampa Chrome |
| `alarms` | Mantieni worker in stato attivo durante attività lunghe |
| `contextMenus` | Aggiungi opzioni "Salva con ClipAIble" (PDF/EPUB/FB2/MD/Audio) al menu contestuale sulle pagine web |

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


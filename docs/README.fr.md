# ✂️ ClipAIble

> **Extracteur d'articles alimenté par l'IA** — Enregistrez n'importe quel article du web au format PDF, EPUB, FB2, Markdown ou Audio. Traduction en 11 langues. Fonctionne sur n'importe quel site.

![Version](https://img.shields.io/badge/version-2.9.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![Licence](https://img.shields.io/badge/licence-MIT-brightgreen)

---

## ✨ Qu'est-ce que ClipAIble ?

ClipAIble utilise l'intelligence artificielle pour extraire intelligemment le contenu des articles de n'importe quelle page web — supprime les publicités, la navigation, les popups et les éléments superflus. Puis exporte dans votre format préféré :

- 📄 **PDF** — Mise en page élégante et personnalisable
- 📚 **EPUB** — Compatible avec Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatible avec PocketBook, FBReader
- 📝 **Markdown** — Texte brut pour les notes
- 🎧 **Audio (MP3/WAV)** — Écoutez avec la narration IA

Tous les formats prennent en charge la **traduction en 11 langues** — même la traduction du texte sur les images !

---

## 🚀 Fonctionnalités

### 🤖 Extraction alimentée par l'IA
- **Deux modes** : AI Selector (rapide, réutilisable) et AI Extract (approfondi)
- **Plusieurs fournisseurs** : OpenAI GPT (GPT-5.2, GPT-5.2-pro, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Support vidéo** : Extraire les sous-titres des vidéos YouTube/Vimeo et les convertir en articles (v2.9.0)
- **Détection intelligente** : Trouve le contenu principal de l'article, supprime automatiquement les éléments indésirables
- **Préserve la structure** : Titres, images, blocs de code, tableaux, notes de bas de page

### 🎧 Export audio
- **5 fournisseurs TTS** : OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ voix** : 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (anglais et ukrainien)
- **Réglage de la vitesse** : 0.5x à 2.0x (OpenAI/ElevenLabs uniquement)
- **Support de la langue ukrainienne** : Voix ukrainiennes dédiées via Respeecher
- **Prononciation multilingue** : Prononciation correcte pour chaque langue
- **Nettoyage intelligent du texte** : L'IA supprime les URL, le code et le contenu non vocal

### 🌍 Traduction
- **11 langues** : EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Détection intelligente** : Ignore si l'article est déjà dans la langue cible
- **Traduction d'images** : Traduit le texte sur les images (via Gemini)
- **Métadonnées localisées** : Les dates et les étiquettes s'adaptent à la langue

### 🎨 Personnalisation PDF
- **4 préréglages** : Sombre, Clair, Sépia, Contraste élevé
- **Couleurs personnalisables** : Arrière-plan, texte, titres, liens
- **11 polices** au choix
- **Modes de page** : Page unique continue ou format multi-pages A4

### ⚡ Fonctionnalités intelligentes
- **Support vidéo** : Extraire les sous-titres des vidéos YouTube/Vimeo et les convertir en articles (v2.9.0)
- **Transcription audio** : Transcription automatique lorsque les sous-titres ne sont pas disponibles (gpt-4o-transcribe)
- **Mode hors ligne** : Mise en cache des sélecteurs — pas besoin d'IA pour les sites répétés
- **Statistiques** : Suivez le nombre d'enregistrements, consultez l'historique
- **Table des matières** : Générée automatiquement à partir des titres
- **Résumé** : Résumé de 2-3 paragraphes écrit par l'IA
- **Menu contextuel** : Clic droit → "Enregistrer l'article en PDF"
- **Annulation à tout moment** : Arrêtez le traitement en un clic

### 🔒 Sécurité
- **Clés API chiffrées** avec AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Clés jamais exportées** — exclues de la sauvegarde des paramètres
- **Toutes les données sont stockées localement** — rien n'est envoyé à des tiers

---

## ⚠️ Limitations Connues

### Formats de Fichier
- **Format WAV** (Qwen/Respeecher): Les fichiers peuvent être très volumineux (10-50MB+ pour les articles longs). Envisagez d'utiliser le format MP3 pour des tailles de fichier plus petites.
- **Limites de caractères**: 
  - Qwen TTS: 600 caractères par segment
  - Respeecher TTS: 450 caractères par segment
  - Le texte est automatiquement divisé intelligemment aux limites des phrases/mots

### Contraintes Techniques
- **Exigence keep-alive**: Chrome MV3 nécessite un intervalle keep-alive d'au moins 1 minute. Les tâches de traitement longues peuvent prendre plusieurs minutes.
- **CORS pour les images**: Certaines images peuvent ne pas se charger si le site Web bloque les requêtes cross-origin. L'extension ignorera ces images.
- **Annulation non instantanée**: L'annulation peut prendre quelques secondes pour arrêter complètement tous les processus en arrière-plan.
- **HTML volumineux**: Les pages avec un HTML très volumineux (>500KB) peuvent prendre plus de temps à traiter.

### Compatibilité des Navigateurs
- **Chrome/Edge/Brave/Arc**: Entièrement pris en charge
- **Firefox**: Non pris en charge (utilise une API d'extension différente)
- **Safari**: Non pris en charge (utilise une API d'extension différente)

---

## 📦 Installation

1. **Clonez** ce dépôt
2. Ouvrez Chrome → `chrome://extensions/`
3. Activez le **Mode développeur**
4. Cliquez sur **Charger l'extension non empaquetée** → sélectionnez le dossier

### Prérequis

- Chrome, Edge, Brave ou navigateur Arc
- Clé API d'au moins un fournisseur (voir ci-dessous)

---

## 🔑 Obtenir des clés API

### OpenAI (modèles GPT + Audio)

1. Allez sur [platform.openai.com](https://platform.openai.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys** (menu de gauche) ou directement sur [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Cliquez sur **"Create new secret key"**
5. Copiez la clé (commence par `sk-...`)
6. Ajoutez un moyen de paiement dans **Settings → Billing** (requis pour l'utilisation de l'API)

> **Note :** La clé OpenAI est requise pour l'export audio (TTS). Les autres formats fonctionnent avec n'importe quel fournisseur.

### Google Gemini

1. Allez sur [Google AI Studio](https://aistudio.google.com/)
2. Connectez-vous avec un compte Google
3. Cliquez sur **"Get API key"** ou allez directement sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Cliquez sur **"Create API key"**
5. Copiez la clé (commence par `AIza...`)

> **Astuce :** Gemini active également la fonctionnalité de traduction de texte sur les images.

### Anthropic Claude

1. Allez sur [console.anthropic.com](https://console.anthropic.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys**
4. Cliquez sur **"Create Key"**
5. Copiez la clé (commence par `sk-ant-...`)
6. Ajoutez des crédits dans **Plans & Billing**

### Qwen3-TTS-Flash (Audio)

1. Allez sur [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys** ou **Model Studio**
4. Créez une clé API
5. Copiez la clé (commence par `sk-...`)

> **Note :** Qwen3-TTS-Flash fournit 49 voix, y compris une voix russe dédiée (Alek). Format WAV fixe à 24kHz.

### Respeecher (Audio - Anglais & Ukrainien)

1. Allez sur [Respeecher Space](https://space.respeecher.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys**
4. Créez une clé API
5. Copiez la clé

> **Note :** Respeecher prend en charge l'anglais et l'ukrainien avec des voix ukrainiennes dédiées. Format WAV fixe à 22.05kHz.

### Lequel choisir ?

| Fournisseur | Idéal pour | Audio | Traduction d'images |
|-------------|------------|-------|---------------------|
| **OpenAI** | Usage général, export audio, transcription vidéo | ✅ | ❌ |
| **Gemini** | Extraction rapide, traduction d'images, export audio (30 voix) | ✅ | ✅ |
| **Claude** | Articles longs, pages complexes | ❌ | ❌ |
| **Grok** | Tâches de raisonnement rapides | ❌ | ❌ |
| **OpenRouter** | Accès à plusieurs modèles | ❌ | ❌ |
| **Qwen** | Export audio (49 voix, support russe) | ✅ | ❌ |
| **Respeecher** | Export audio (langue ukrainienne) | ✅ | ❌ |

**Recommandation :** Commencez par OpenAI pour obtenir toutes les fonctionnalités (extraction + audio). Utilisez Respeecher pour le texte ukrainien.

---

## 🎯 Démarrage rapide

1. Cliquez sur l'icône **ClipAIble** dans la barre d'outils
2. Entrez votre clé API → **Enregistrer les clés**
3. Naviguez vers n'importe quel article
4. Cliquez sur **Enregistrer en PDF** (ou choisissez un autre format)
5. Terminé ! Le fichier se télécharge automatiquement

**Astuce pro :** Clic droit n'importe où → **"Enregistrer l'article en PDF"**

---

## ⚙️ Paramètres

### Modes d'extraction

| Mode | Vitesse | Idéal pour |
|------|---------|------------|
| **AI Selector** | ⚡ Rapide | La plupart des sites, blogs, actualités |
| **AI Extract** | 🐢 Approfondi | Pages complexes, Notion, SPAs |

### Modèles IA

| Fournisseur | Modèle | Notes |
|-------------|--------|-------|
| OpenAI | GPT-5.2 | Dernière, raisonnement moyen |
| OpenAI | GPT-5.2-pro | Améliorée, raisonnement moyen |
| OpenAI | GPT-5.1 | Équilibré |
| OpenAI | GPT-5.1 (high) | Meilleure qualité |
| Anthropic | Claude Sonnet 4.5 | Excellent pour les articles longs |
| Google | Gemini 3 Pro | Rapide |
| Grok | Grok 4.1 Fast Reasoning | Raisonnement rapide |

### Voix audio

**OpenAI (11 voix) :** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs (9 voix) :** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS (30 voix) :** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash (49 voix) :** Y compris Elias (par défaut), Alek (russe) et voix pour 10 langues

**Respeecher (14 voix) :** 4 anglaises (Samantha, Neve, Gregory, Vincent) + 10 voix ukrainiennes

### Préréglages de style (PDF)

| Préréglage | Arrière-plan | Texte |
|------------|--------------|-------|
| Sombre | `#303030` | `#b9b9b9` |
| Clair | `#f8f9fa` | `#343a40` |
| Sépia | `#faf4e8` | `#5d4e37` |
| Contraste élevé | `#000000` | `#ffffff` |

---

## 📊 Statistiques et cache

Cliquez sur **📊 Statistiques** pour voir :
- Total des enregistrements, nombre ce mois-ci
- Répartition par format
- Historique récent avec liens
- Domaines mis en cache pour le mode hors ligne

### Mode hors ligne

ClipAIble met en cache les sélecteurs générés par l'IA par domaine :
- **Deuxième visite = instantané** — pas d'appel API
- **Invalidation automatique** — se vide si l'extraction échoue
- **Contrôle manuel** — supprimer des domaines individuels

---

## 💾 Importer/Exporter les paramètres

**⚙️ Paramètres** → **Import/Export**

- Exporter tous les paramètres (clés API exclues pour la sécurité)
- Optionnel : inclure les statistiques et le cache
- Importer avec options de fusion ou d'écrasement

---

## 🔧 Dépannage

| Problème | Solution |
|----------|----------|
| Contenu vide | Essayez le mode **AI Extract** |
| Clé API invalide | Vérifiez le format de la clé (sk-..., AIza..., sk-ant-...) |
| Images manquantes | Certains sites bloquent cross-origin ; petites images filtrées |
| Audio lent | Articles longs divisés en morceaux ; surveillez la barre de progression |

---

## 🏗️ Architecture

```
clipaible/
├── manifest.json       # Configuration de l'extension
├── popup/              # Interface (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # Extraction de contenu
│   ├── translation/    # Traduction et détection de langue
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Mise en cache des sélecteurs
│   ├── stats/          # Statistiques d'utilisation
│   └── utils/          # Configuration, chiffrement, utilitaires
├── print/              # Rendu PDF
├── config/             # Styles
└── lib/                # JSZip
```

---

## 🔐 Sécurité et confidentialité

- **Chiffrement** : AES-256-GCM via Web Crypto API
- **Dérivation de clé** : PBKDF2, 100 000 itérations
- **Aucun suivi** : Pas d'analytique, pas de journalisation à distance
- **Local uniquement** : Toutes les données restent dans votre navigateur

---

## 📋 Permissions

| Permission | Pourquoi |
|------------|----------|
| `activeTab` | Lire l'article de l'onglet actuel |
| `storage` | Enregistrer les paramètres localement |
| `scripting` | Injecter le script d'extraction |
| `downloads` | Enregistrer les fichiers générés |
| `debugger` | Générer des PDF via l'API d'impression Chrome |
| `alarms` | Maintenir le worker en état actif pendant les tâches longues |
| `contextMenus` | Menu contextuel |

Voir [PERMISSIONS.md](PERMISSIONS.md) pour les détails.

---

## 🤝 Contribution

1. Forkez le dépôt
2. Créez une branche de fonctionnalité : `git checkout -b feature/cool-thing`
3. Commit : `git commit -m 'Add cool thing'`
4. Push : `git push origin feature/cool-thing`
5. Ouvrez une Pull Request

---

## 📜 Licence

MIT License — voir [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — Enregistrez. Lisez. Écoutez. Partout.
</p>


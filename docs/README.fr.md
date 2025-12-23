# ✂️ ClipAIble

> **Extracteur d'articles alimenté par l'IA** — Enregistrez n'importe quel article du web au format PDF, EPUB, FB2, Markdown ou Audio. Traduction en 11 langues. Fonctionne sur n'importe quel site.

![Version](https://img.shields.io/badge/version-3.2.4-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![Licence](https://img.shields.io/badge/licence-MIT-brightgreen)

**[⬇️ Installer depuis Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ Qu'est-ce que ClipAIble ?

ClipAIble utilise l'intelligence artificielle pour extraire intelligemment le contenu des articles de n'importe quelle page web — supprime les publicités, la navigation, les popups et les éléments superflus. Puis exporte dans votre format préféré :

- 📄 **PDF** — Mise en page élégante et personnalisable
- 📚 **EPUB** — Compatible avec Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatible avec PocketBook, FBReader
- 📝 **Markdown** — Texte brut pour les notes
- 🎧 **Audio** — Écoutez avec la narration IA

Tous les formats prennent en charge la **traduction en 11 langues** — même la traduction du texte sur les images !

---

## 🚀 Fonctionnalités

### 🤖 Extraction alimentée par l'IA
- **Trois modes** : Automatique (sans IA, rapide), AI Selector (rapide, réutilisable) et AI Extract (approfondi)
- **Mode automatique** : Créer des documents sans IA — aucune clé API requise, extraction instantanée
- **Plusieurs fournisseurs** : OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Support vidéo** : Extraire les sous-titres des vidéos YouTube/Vimeo et les convertir en articles (v3.0.0)
  - Plusieurs méthodes d'extraction avec replis
  - Priorité : sous-titres manuels > générés automatiquement > traduits
  - Traitement IA : supprime les horodatages, fusionne les paragraphes, corrige les erreurs
- **Détection intelligente** : Trouve le contenu principal de l'article, supprime automatiquement les éléments indésirables
- **Stratégies de repli avancées** : 6 stratégies différentes pour une extraction de contenu fiable
- **Préserve la structure** : Titres, images, blocs de code, tableaux, notes de bas de page
- **Mise en cache des sélecteurs** : Paramètres indépendants pour l'utilisation et l'activation du cache

### 🎧 Export audio
- **5 fournisseurs TTS** : OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ voix** : 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (anglais et ukrainien)
- **Réglage de la vitesse** : 0.5x à 2.0x (OpenAI/ElevenLabs uniquement ; Google/Qwen/Respeecher utilisent une vitesse fixe)
- **Support des formats** : MP3 (OpenAI/ElevenLabs) ou WAV (Google/Qwen/Respeecher)
- **Prononciation multilingue** : Prononciation correcte pour chaque langue
- **Support de la langue ukrainienne** : Voix ukrainiennes dédiées via Respeecher (10 voix)
- **Nettoyage intelligent du texte** : L'IA supprime les URL, le code et le contenu non vocal
- **Fonctionnalités spécifiques aux fournisseurs** :
  - **ElevenLabs** : Sélection du modèle (v2, v3, Turbo v2.5), sélection du format, paramètres vocaux avancés
  - **Google Gemini 2.5 TTS** : Sélection du modèle (pro/flash), 30 voix, limite de 24k caractères
  - **Qwen** : 49 voix dont voix russe (Alek), limite de 600 caractères
  - **Respeecher** : Paramètres d'échantillonnage avancés (temperature, repetition_penalty, top_p)

### 🌍 Traduction
- **11 langues** : EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Détection intelligente** : Ignore si l'article est déjà dans la langue cible
- **Traduction d'images** : Traduit le texte sur les images (via Gemini)
- **Métadonnées localisées** : Les dates et les étiquettes s'adaptent à la langue

### 🎨 Personnalisation PDF
- **4 préréglages** : Sombre, Clair, Sépia, Contraste élevé
- **Couleurs personnalisables** : Arrière-plan, texte, titres, liens
- **11 polices** : Par défaut (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **Taille de police** : Ajustable (par défaut : 31px)
- **Modes de page** : Page unique continue ou format multi-pages A4


### ⚡ Fonctionnalités intelligentes
- **Support vidéo** : Extraire les sous-titres des vidéos YouTube/Vimeo et les convertir en articles (v3.0.0)
  - Extraction directe des sous-titres (aucune clé API de YouTube/Vimeo requise)
  - Traitement IA : supprime les horodatages, fusionne les paragraphes, corrige les erreurs
  - Intégration complète du pipeline : traduction, table des matières, résumé, tous les formats d'export
- **Génération de résumé** : Créez des résumés IA détaillés de n'importe quel article ou vidéo
  - Cliquez sur le bouton **"Générer un résumé"** pour créer un résumé complet
  - Fonctionne avec les articles normaux et les vidéos YouTube/Vimeo
  - Continue la génération même si la popup est fermée (fonctionne en arrière-plan)
  - Copier dans le presse-papiers ou télécharger en tant que fichier Markdown
  - Affichage extensible/réductible avec texte formaté
  - Résumés détaillés avec idées clés, concepts, exemples et conclusions
- **Résumé (TL;DR)** : Résumé court de 2-4 phrases écrit par l'IA, inclus dans les documents
  - Fonctionnalité optionnelle : activez dans les paramètres pour ajouter un résumé court aux PDF/EPUB/FB2/Markdown
  - Apparaît au début des documents exportés
  - Différent du résumé détaillé (c'est un aperçu court)
- **Mode hors ligne** : Mise en cache des sélecteurs — pas besoin d'IA pour les sites répétés
  - Paramètres indépendants : utiliser les sélecteurs mis en cache et activer la mise en cache séparément
  - Invalidation automatique en cas d'échec d'extraction
  - Gestion manuelle du cache par domaine
- **Statistiques** : Suivez le nombre d'enregistrements, consultez l'historique
- **Table des matières** : Générée automatiquement à partir des titres
- **Menu contextuel** : Clic droit → "Enregistrer l'article en PDF/EPUB/FB2/Markdown/Audio"
- **Annulation à tout moment** : Arrêtez le traitement en un clic
- **Import/Export des paramètres** : Sauvegarde et restauration de tous les paramètres (clés API exclues pour des raisons de sécurité)

### 🔒 Sécurité
- **Clés API chiffrées** avec AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Clés jamais exportées** — exclues de la sauvegarde des paramètres
- **Toutes les données sont stockées localement** — rien n'est envoyé à des tiers

---

## ⚠️ Limitations Connues

### Formats de Fichier
- **Format WAV** (Google/Qwen/Respeecher): Les fichiers peuvent être très volumineux (10-50MB+ pour les articles longs). Le format MP3 (OpenAI/ElevenLabs) offre des tailles de fichier plus petites.
- **Limites de caractères par requête**: 
  - OpenAI TTS: 4096 caractères
  - ElevenLabs: 5000 caractères
  - Google Gemini 2.5 TTS: 24000 caractères
  - Qwen TTS: 600 caractères
  - Respeecher TTS: 450 caractères
  - Le texte est automatiquement divisé intelligemment aux limites des phrases/mots

### Contraintes Techniques
- **Exigence keep-alive**: Chrome MV3 nécessite un intervalle keep-alive d'au moins 1 minute. Les tâches de traitement longues peuvent prendre plusieurs minutes. L'extension utilise un mécanisme unifié de keep-alive (alarme toutes les 1 minute + sauvegarde d'état toutes les 2 secondes) pour empêcher le service worker de s'arrêter.
- **CORS pour les images**: Certaines images peuvent ne pas se charger si le site Web bloque les requêtes cross-origin. L'extension ignorera ces images.
- **Annulation non instantanée**: L'annulation peut prendre quelques secondes pour arrêter complètement tous les processus en arrière-plan.
- **Récupération du Service Worker**: Les opérations reprennent automatiquement après le redémarrage du service worker (dans les 2 heures).

### Compatibilité des Navigateurs
- **Chrome/Edge/Brave/Arc**: Entièrement pris en charge
- **Firefox**: Non pris en charge (utilise une API d'extension différente)
- **Safari**: Non pris en charge (utilise une API d'extension différente)

---

## 📦 Installation

### Option 1 : Installation depuis Chrome Web Store (Recommandé)

**[⬇️ Installer ClipAIble depuis Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### Option 2 : Installation manuelle (Mode développeur)

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

> **Astuce :** Gemini active également la fonctionnalité de traduction de texte sur les images et Google Gemini 2.5 TTS (30 voix). Pour TTS, vous pouvez utiliser la même clé API Gemini ou définir une clé API Google TTS dédiée. Nécessite l'activation de l'API Generative Language dans Google Cloud Console.

### Anthropic Claude

1. Allez sur [console.anthropic.com](https://console.anthropic.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys**
4. Cliquez sur **"Create Key"**
5. Copiez la clé (commence par `sk-ant-...`)
6. Ajoutez des crédits dans **Plans & Billing**

### ElevenLabs (Audio)

1. Allez sur [ElevenLabs](https://elevenlabs.io/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **Profile** → **API Keys**
4. Créez une clé API
5. Copiez la clé

> **Note :** ElevenLabs fournit 9 voix premium avec TTS de haute qualité. Prend en charge le réglage de la vitesse (0.25-4.0x) et la sélection du format (MP3 haute qualité par défaut : mp3_44100_192). Modèles : Multilingual v2, v3 (par défaut), Turbo v2.5. Paramètres vocaux avancés disponibles (stability, similarity, style, speaker boost).

### Google Gemini 2.5 TTS (Audio)

1. Allez sur [Google AI Studio](https://aistudio.google.com/)
2. Connectez-vous avec un compte Google
3. Cliquez sur **"Get API key"** ou allez directement sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Cliquez sur **"Create API key"**
5. Copiez la clé (commence par `AIza...`)
6. Activez **Generative Language API** dans [Google Cloud Console](https://console.cloud.google.com/)
7. (Optionnel) Activez la facturation si nécessaire pour votre modèle

> **Note :** Google Gemini 2.5 TTS fournit 30 voix. Vous pouvez utiliser la même clé API Gemini ou définir une clé API Google TTS dédiée. Format WAV fixe à 24kHz. Modèles : `gemini-2.5-pro-preview-tts` (principal) ou `gemini-2.5-flash-preview-tts` (plus rapide).

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
| **OpenAI** | Usage général, export audio | ✅ (11 voix) | ❌ |
| **Gemini** | Extraction rapide, traduction d'images, export audio (30 voix) | ✅ (30 voix) | ✅ |
| **Claude** | Articles longs, pages complexes | ❌ | ❌ |
| **Grok** | Tâches de raisonnement rapides | ❌ | ❌ |
| **OpenRouter** | Accès à plusieurs modèles | ❌ | ❌ |
| **ElevenLabs** | Export audio (9 voix, haute qualité) | ✅ (9 voix) | ❌ |
| **Qwen** | Export audio (49 voix, support russe) | ✅ (49 voix) | ❌ |
| **Respeecher** | Export audio (langue ukrainienne) | ✅ (14 voix) | ❌ |

**Recommandation :** 
- **Pour l'extraction** : Commencez avec OpenAI ou Gemini (rapide et fiable)
- **Pour l'audio** : OpenAI pour usage général, ElevenLabs pour haute qualité, Google Gemini 2.5 TTS pour 30 voix, Qwen pour le russe, Respeecher pour l'ukrainien
- **Pour la traduction d'images** : Nécessite une clé API Gemini

---

## 🎯 Démarrage rapide

1. Cliquez sur l'icône **ClipAIble** dans la barre d'outils
2. Entrez votre clé API → **Enregistrer les clés**
3. Naviguez vers n'importe quel article
4. Cliquez sur **Enregistrer en PDF** (ou choisissez un autre format)
5. Terminé ! Le fichier se télécharge automatiquement

**Astuces :**
- Clic droit n'importe où → **"Enregistrer l'article en PDF"**
- Cliquez sur **"Générer un résumé"** pour créer un résumé IA détaillé (fonctionne même si la popup est fermée)
- Activez **"Générer TL;DR"** dans les paramètres pour ajouter un résumé court aux documents

---

## ⚙️ Paramètres

### Interface

- **Thème** : Choisissez Sombre, Clair ou Auto (suit le système) dans l'en-tête
- **Langue** : Sélectionnez la langue de l'interface (11 langues) dans l'en-tête
- **Modèles personnalisés** : Ajoutez vos propres modèles IA via le bouton "+" à côté du sélecteur de modèles

### Modes d'extraction

| Mode | Vitesse | Idéal pour |
|------|---------|------------|
| **Automatique** | ⚡⚡ Instantané | Articles simples, aucune clé API requise |
| **AI Selector** | ⚡ Rapide | La plupart des sites, blogs, actualités |
| **AI Extract** | 🐢 Approfondi | Pages complexes, Notion, SPAs |

### Modèles IA

| Fournisseur | Modèle | Notes |
|-------------|--------|-------|
| OpenAI | GPT-5.2 | Dernière, raisonnement moyen (par défaut) |
| OpenAI | GPT-5.2-high | Améliorée, raisonnement élevé |
| OpenAI | GPT-5.1 | Équilibré |
| OpenAI | GPT-5.1 (high) | Meilleure qualité, raisonnement élevé |
| Anthropic | Claude Sonnet 4.5 | Excellent pour les articles longs |
| Google | Gemini 3 Pro | Extraction rapide, traduction d'images |
| Grok | Grok 4.1 Fast Reasoning | Raisonnement rapide |
| OpenRouter | Divers modèles | Accès à plusieurs fournisseurs |

**Modèles personnalisés :** Cliquez sur le bouton **"+"** à côté du sélecteur de modèles pour ajouter des modèles personnalisés (par exemple, `gpt-4o`, `claude-opus-4.5`). Les modèles personnalisés apparaissent dans le menu déroulant et peuvent être masqués/affichés selon les besoins.

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

**Couleurs personnalisées :** Personnalisez l'arrière-plan, le texte, les titres et les liens avec des sélecteurs de couleur. Boutons de réinitialisation individuels (↺) pour chaque couleur, ou **"Tout réinitialiser par défaut"** pour restaurer tous les styles.

---

## 📊 Statistiques et cache

Cliquez sur **📊 Statistiques** pour voir :
- Total des enregistrements, nombre ce mois-ci
- Répartition par format (PDF, EPUB, FB2, Markdown, Audio)
- Historique récent avec liens vers les articles originaux (50 derniers enregistrements)
  - Cliquez sur le lien pour ouvrir l'article original
  - Cliquez sur le bouton ✕ pour supprimer une entrée d'historique individuelle
  - Affiche le format, le domaine, le temps de traitement et la date
- Domaines mis en cache pour le mode hors ligne
- **Activer/Désactiver les statistiques** : Bascule pour la collecte de statistiques
- **Effacer les statistiques** : Bouton pour réinitialiser toutes les statistiques
- **Effacer le cache** : Bouton pour supprimer tous les sélecteurs mis en cache
- Suppression de domaines individuels du cache

## 📝 Génération de résumé

Créez des résumés IA détaillés de n'importe quel article ou vidéo :

1. Naviguez vers n'importe quel article ou vidéo YouTube/Vimeo
2. Cliquez sur le bouton **"Générer un résumé"** dans la popup
3. Le résumé se génère en arrière-plan (vous pouvez fermer la popup)
4. Lorsqu'il est prêt, le résumé apparaît avec les options :
   - **Copier** dans le presse-papiers
   - **Télécharger** en tant que fichier Markdown
   - **Développer/Réduire** pour voir le texte complet
   - **Fermer** pour masquer le résumé

**Fonctionnalités :**
- Fonctionne avec les articles et les vidéos YouTube/Vimeo
- Continue la génération même si la popup est fermée
- Résumés détaillés avec idées clés, concepts, exemples et conclusions
- Texte formaté avec titres, listes et liens
- Automatiquement sauvegardé — persiste jusqu'à ce que vous le fermiez

**Note :** La génération de résumé est séparée de l'export de document. Utilisez-la pour comprendre rapidement le contenu sans sauvegarder un document complet.

### Mode hors ligne

ClipAIble met en cache les sélecteurs générés par l'IA par domaine :
- **Deuxième visite = instantané** — pas d'appel API
- **Invalidation automatique** — se vide si l'extraction échoue
- **Contrôle manuel** — supprimer des domaines individuels
- **Paramètres indépendants** :
  - **Utiliser les sélecteurs mis en cache** : Ignorer l'analyse de page si le cache existe (plus rapide)
  - **Activer la mise en cache** : Enregistrer les nouveaux sélecteurs dans le cache après extraction
  - Les deux paramètres fonctionnent indépendamment pour un contrôle flexible

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
| Résumé non généré | Vérifiez la clé API, assurez-vous que le contenu de la page est chargé, réessayez |
| Timeout de génération de résumé | Les articles très longs peuvent prendre jusqu'à 45 minutes ; attendez ou essayez avec un contenu plus court |

---

## 🏗️ Architecture

```
clipaible/
├── manifest.json       # Configuration de l'extension
├── popup/              # Interface (HTML, CSS, JS)
│   ├── popup.js       # Orchestration principale (2841 lignes)
│   ├── core.js        # Logique métier (203 lignes)
│   ├── handlers.js    # Gestionnaires d'événements (1991 lignes)
│   ├── ui.js          # Gestion de l'interface
│   ├── stats.js       # Affichage des statistiques
│   └── settings.js    # Gestion des paramètres
├── scripts/
│   ├── background.js   # Service worker (2525 lignes, réduit de 3705)
│   ├── content.js      # Content script pour YouTube
│   ├── locales.js      # Localisation UI (11 langues)
│   ├── message-handlers/ # Modules de gestionnaires de messages (v3.2.1+)
│   │   ├── index.js    # Routeur de messages
│   │   ├── utils.js    # Utilitaires de gestionnaires
│   │   ├── simple.js   # Gestionnaires simples
│   │   ├── stats.js    # Gestionnaires de statistiques
│   │   ├── cache.js    # Gestionnaires de cache
│   │   ├── settings.js # Gestionnaires de paramètres
│   │   ├── processing.js # Gestionnaires de traitement
│   │   ├── video.js    # Gestionnaires vidéo/sous-titres
│   │   ├── summary.js  # Aide à la génération de résumés
│   │   └── complex.js  # Gestionnaires complexes
│   ├── api/            # Fournisseurs AI & TTS
│   │   ├── openai.js   # OpenAI (modèles GPT)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # Routeur TTS
│   │   └── index.js    # Routeur API
│   ├── extraction/     # Extraction de contenu
│   │   ├── prompts.js  # Prompts IA
│   │   ├── html-utils.js # Utilitaires HTML
│   │   ├── video-subtitles.js # Extraction de sous-titres YouTube/Vimeo
│   │   └── video-processor.js # Traitement de sous-titres IA
│   ├── translation/    # Traduction et détection de langue
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Mise en cache des sélecteurs
│   ├── stats/          # Statistiques d'utilisation
│   ├── settings/       # Import/Export des paramètres
│   ├── state/          # Gestion de l'état de traitement
│   └── utils/          # Configuration, chiffrement, utilitaires
│       ├── video.js    # Détection de plateforme vidéo
│       ├── validation.js # Utilitaires de validation
│       └── api-error-handler.js # Gestion d'erreurs API commune
├── print/              # Rendu PDF
├── config/             # Styles
├── lib/                # JSZip
├── docs/               # Fichiers README localisés
└── memory-bank/        # Documentation du projet
```

---

## 🔐 Sécurité et confidentialité

- **Chiffrement** : AES-256-GCM via Web Crypto API
- **Dérivation de clé** : PBKDF2, 100 000 itérations
- **Aucun suivi** : Pas d'analytique, pas de journalisation à distance
- **Local uniquement** : Toutes les données restent dans votre navigateur

---

## 📋 Permissions

ClipAIble nécessite les permissions suivantes pour fonctionner. Toutes les permissions sont utilisées uniquement aux fins indiquées :

| Permission | Pourquoi |
|------------|----------|
| `activeTab` | Lire la page actuelle pour extraire le contenu lorsque vous cliquez sur l'icône de l'extension ou utilisez le menu contextuel. L'extension n'accède qu'à l'onglet que vous consultez actuellement. |
| `storage` | Enregistrer vos paramètres (clés API, préférences de style, sélection de langue) et statistiques localement dans votre navigateur. Vos données ne quittent jamais votre appareil. |
| `scripting` | Injecter le script d'extraction de contenu dans les pages web. Ce script trouve et extrait le contenu de l'article (texte, images, titres) du DOM de la page. |
| `downloads` | Enregistrer les fichiers générés (PDF, EPUB, FB2, Markdown, Audio) sur votre ordinateur. Sans cette permission, l'extension ne peut pas télécharger de fichiers. |
| `debugger` | **Génération PDF uniquement** — Utilise la fonctionnalité intégrée print-to-PDF de Chrome pour générer des PDF de haute qualité avec une mise en page et un style appropriés. Le débogueur est attaché uniquement pendant la génération PDF et immédiatement détaché après la fin. C'est le seul moyen de générer des PDF avec un style personnalisé dans les extensions Chrome. |
| `alarms` | Maintenir le service worker en arrière-plan actif pendant les opérations longues (grands articles, traduction). Chrome Manifest V3 suspend les service workers après 30 secondes, mais le traitement des articles peut prendre plusieurs minutes. Utilise un mécanisme unifié de keep-alive (alarme toutes les 1 minute + sauvegarde d'état toutes les 2 secondes) selon les règles MV3. |
| `contextMenus` | Ajouter les options "Enregistrer avec ClipAIble" (PDF/EPUB/FB2/MD/Audio) au menu contextuel du clic droit sur les pages web. |
| `notifications` | Afficher les notifications de bureau lors de l'utilisation de la fonctionnalité "Enregistrer" du menu contextuel. Vous notifie en cas d'erreur (par exemple, clé API manquante). |
| `unlimitedStorage` | Stocker le cache des sélecteurs et les données d'impression temporaires localement. Cela permet des extractions répétées plus rapides sans rappeler l'IA (mode hors ligne). |

### Permissions d'hôte

| Permission | Pourquoi |
|------------|----------|
| `<all_urls>` | Extraire le contenu de n'importe quel site web que vous visitez. L'extension doit : 1) Lire le HTML de la page pour trouver le contenu de l'article, 2) Télécharger les images intégrées dans les articles, 3) Faire des appels API aux fournisseurs IA/TTS (OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher). L'extension n'accède qu'aux pages que vous enregistrez explicitement — elle ne navigue pas sur le Web par elle-même. |

**Note de sécurité :** Toutes les clés API sont chiffrées à l'aide d'AES-256-GCM et stockées uniquement localement. Les clés ne sont jamais exportées ou transmises à un serveur, sauf aux fournisseurs IA que vous configurez.

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


# ✂️ ClipAIble

> **Extracteur d'articles alimenté par l'IA** — Enregistrez n'importe quel article du web au format PDF, EPUB, FB2, Markdown ou Audio. Traduction en 11 langues. Fonctionne sur n'importe quel site.

![Version](https://img.shields.io/badge/version-3.3.0-blue)
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
- **Deux modes** : Automatique (sans IA, rapide), AI Selector (rapide, réutilisable)
- **Mode automatique** : Créer des documents sans IA — aucune clé API requise, extraction instantanée
- **Plusieurs fournisseurs** : OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, DeepSeek, OpenRouter
- **Extraction de contenu PDF** (v3.3.0) : Extraire le contenu des fichiers PDF à l'aide de la bibliothèque PDF.js
  - Fonction expérimentale avec système de classification multi-niveaux complexe
  - Extrait le texte, les images, la structure et les métadonnées des fichiers PDF
  - Prend en charge les fichiers PDF Web et locaux
  - Gère les mises en page multi-colonnes, tableaux, titres, listes, fusion inter-pages
  - Note : La fonction est expérimentale et peut avoir des limitations avec les PDF complexes (PDF scannés, PDF protégés par mot de passe)
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
- **Réglage de la vitesse** : 0.25x à 4.0x (OpenAI/ElevenLabs uniquement ; Google/Qwen/Respeecher utilisent une vitesse fixe)
- **Support des formats** : MP3 (OpenAI/ElevenLabs) ou WAV (Google/Qwen/Respeecher)
- **Prononciation multilingue** : Prononciation correcte pour chaque langue
- **Support de la langue ukrainienne** : Voix ukrainiennes dédiées via Respeecher
- **Nettoyage intelligent du texte** : L'IA supprime les URL, le code et le contenu non vocal
- **Fonctionnalités spécifiques aux fournisseurs** : Sélection du modèle, options de format et paramètres avancés disponibles pour chaque fournisseur

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
- **Extraction de contenu PDF** (v3.3.0) : Extraire le contenu des fichiers PDF et les convertir en articles
  - Utilise la bibliothèque PDF.js pour l'analyse dans un document offscreen
  - Système de classification multi-niveaux pour une extraction précise
  - Prend en charge les fichiers PDF Web et locaux
  - Intégration complète du pipeline : traduction, table des matières, résumé, tous les formats d'export
  - Note : Fonction expérimentale, peut avoir des limitations avec les PDF complexes
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
- **Clés API chiffrées** avec un chiffrement standard (OpenAI, Claude, Gemini, Grok, DeepSeek, OpenRouter, ElevenLabs, Qwen, Respeecher)
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
- **Exigence keep-alive**: Chrome MV3 nécessite un intervalle keep-alive d'au moins 1 minute. Les tâches de traitement longues peuvent prendre plusieurs minutes. L'extension utilise un mécanisme unifié de keep-alive (alarme toutes les 1 minute) pour empêcher le service worker de s'arrêter.
- **CORS pour les images**: Certaines images peuvent ne pas se charger si le site Web bloque les requêtes cross-origin. L'extension ignorera ces images.
- **Annulation non instantanée**: L'annulation peut prendre quelques secondes pour arrêter complètement tous les processus en arrière-plan.
- **Récupération du Service Worker**: Les opérations reprennent automatiquement après le redémarrage du service worker, si l'état est récent (< 1 minute). Le rechargement de l'extension réinitialise toujours l'état.
- **Limitations d'extraction PDF** (v3.3.0): 
  - Les PDF scannés (sans couche de texte) ne sont pas pris en charge — OCR n'est pas encore disponible
  - Les PDF protégés par mot de passe doivent être déverrouillés avant l'extraction
  - Les très gros PDF (>100MB) peuvent ne pas fonctionner en raison de limitations de mémoire
  - Les mises en page complexes (multi-colonnes, tableaux) sont extraites mais peuvent nécessiter une vérification manuelle

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

### DeepSeek

1. Allez sur [platform.deepseek.com](https://platform.deepseek.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys** ou allez sur [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. Cliquez sur **"Create API key"**
5. Copiez la clé (commence par `sk-...`)

> **Note:** DeepSeek fournit les modèles DeepSeek-V3.2 avec modes thinking et non-thinking.

### ElevenLabs (Audio)

1. Allez sur [ElevenLabs](https://elevenlabs.io/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **Profile** → **API Keys**
4. Créez une clé API
5. Copiez la clé

> **Note :** ElevenLabs fournit un TTS de haute qualité avec réglage de la vitesse et sélection du format.

### Google Gemini 2.5 TTS (Audio)

1. Allez sur [Google AI Studio](https://aistudio.google.com/)
2. Connectez-vous avec un compte Google
3. Cliquez sur **"Get API key"** ou allez directement sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Cliquez sur **"Create API key"**
5. Copiez la clé (commence par `AIza...`)
6. Activez **Generative Language API** dans [Google Cloud Console](https://console.cloud.google.com/)
7. (Optionnel) Activez la facturation si nécessaire pour votre modèle

> **Note :** Google Gemini 2.5 TTS. Vous pouvez utiliser la même clé API Gemini ou définir une clé API Google TTS dédiée.

### Qwen3-TTS-Flash (Audio)

1. Allez sur [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys** ou **Model Studio**
4. Créez une clé API
5. Copiez la clé (commence par `sk-...`)

> **Note :** Qwen3-TTS-Flash inclut une voix russe dédiée (Alek).

### Respeecher (Audio - Anglais & Ukrainien)

1. Allez sur [Respeecher Space](https://space.respeecher.com/)
2. Inscrivez-vous ou connectez-vous
3. Accédez à **API Keys**
4. Créez une clé API
5. Copiez la clé

> **Note :** Respeecher prend en charge l'anglais et l'ukrainien avec des voix ukrainiennes dédiées.

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

### Préréglages de style (PDF)

4 préréglages disponibles : Sombre, Clair, Sépia, Contraste élevé. Personnalisez les couleurs pour l'arrière-plan, le texte, les titres et les liens.
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
| Contenu vide | Essayez le mode **AI Selector** |
| Clé API invalide | Vérifiez le format de la clé (sk-..., AIza..., sk-ant-...) |
| Images manquantes | Certains sites bloquent cross-origin ; petites images filtrées |
| Audio lent | Articles longs divisés en morceaux ; surveillez la barre de progression |
| Résumé non généré | Vérifiez la clé API, assurez-vous que le contenu de la page est chargé, réessayez |
| Timeout de génération de résumé | Les articles très longs peuvent prendre jusqu'à 45 minutes ; attendez ou essayez avec un contenu plus court |
| L'extraction PDF ne fonctionne pas | Vérifiez si le PDF est protégé par mot de passe (déverrouillez d'abord) ou s'il est scanné (OCR n'est pas encore pris en charge). Essayez d'abord avec des PDF plus simples. |
| Contenu PDF incomplet | Les mises en page complexes (multi-colonnes, tableaux) peuvent nécessiter une vérification manuelle. La fonction est expérimentale. |

---

---

## 🔐 Sécurité et confidentialité

- **Chiffrement** : AES-256-GCM via Web Crypto API
- **Dérivation de clé** : PBKDF2, 100 000 itérations
- **Aucun suivi** : Pas d'analytique, pas de journalisation à distance
- **Local uniquement** : Toutes les données restent dans votre navigateur

---

## 📋 Permissions

ClipAIble nécessite des permissions pour :
- Lire la page actuelle pour extraire le contenu
- Enregistrer vos paramètres et fichiers générés localement
- Faire des appels API aux fournisseurs IA/TTS que vous configurez
- Accéder aux sites web uniquement lorsque vous les enregistrez explicitement

**Note de sécurité :** Toutes les clés API sont chiffrées et stockées uniquement localement. Les clés ne sont jamais exportées ou transmises à un serveur, sauf aux fournisseurs IA que vous configurez.

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


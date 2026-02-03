# ClipAIble

Extracteur d'articles alimenté par IA. Fonctionne sur n'importe quel site web.

**Disponible sur le [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

## Ce qu'il fait

ClipAIble extrait le contenu des articles des pages web et le convertit en différents formats :
- Documents PDF
- Fichiers EPUB
- Fichiers FB2
- Texte Markdown
- Fichiers audio

**Fonctionnalités spéciales :**
- **Support YouTube/Vimeo** : Extrait les sous-titres vidéo et crée des articles à partir d'eux
- **Traitement PDF** : Fonctionne avec les PDF en ligne et les fichiers PDF locaux
- **Traduction de contenu** : Traduit les articles en 11 langues
- **Traduction d'images** : Traduit le texte sur les images à l'aide de l'IA
- **Génération TLDR** : Crée des résumés courts dans les documents
- **Panneau summary** : Affiche les résumés d'articles dans le popup après traitement

## Comment l'utiliser

1. Cliquez sur l'icône ClipAIble dans la barre d'outils de votre navigateur
2. Ouvrez n'importe quel article, vidéo YouTube ou PDF
3. Sélectionnez le format souhaité (PDF, EPUB, FB2, Markdown ou Audio)
4. Cliquez sur enregistrer

**Méthodes alternatives de sauvegarde :**
- Clic droit sur n'importe quelle page web et utilisation des options du menu contextuel

**Pour les fichiers PDF locaux** : Dans les modes IA, vous serez invité à sélectionner le fichier PDF en raison des restrictions du navigateur.

## Paramètres

### Modes d'extraction

- **AI Selector** : Mode recommandé pour la plupart des sites. Utilise l'IA pour trouver le contenu de l'article.
- **Automatic** : Mode de base qui fonctionne sans clés API.
- **AI Extractor** : Mode alternatif avec IA (non recommandé pour une utilisation régulière).

### Fonctionnalités de performance

- **Mise en cache des sélecteurs** : Accélère le traitement des sites précédemment visités en réutilisant les sélecteurs appris par l'IA

### Formats de sortie

- **PDF** : Crée des documents formatés avec 4 styles prédéfinis (Sombre, Clair, Sépia, Contraste élevé) et polices/couleurs personnalisables
- **EPUB** : Crée des livres électroniques structurés pour les liseuses comme Kindle
- **FB2** : Crée des livres électroniques structurés pour PocketBook et autres liseuses
- **Markdown** : Préserve la structure de l'article avec les titres et les listes
- **Audio** : Convertit le texte en parole en utilisant 6 services TTS différents

### Traduction

Le contenu peut être traduit en : anglais, russe, ukrainien, allemand, français, espagnol, italien, portugais, chinois, japonais, coréen.

### Audio

L'audio peut être généré avec différents fournisseurs TTS :
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (anglais et ukrainien uniquement)
- Piper (hors ligne, aucune clé API requise)

## Clés API (optionnel)

Pour les fonctionnalités IA, vous pouvez ajouter des clés API de ces fournisseurs :

### OpenAI
Obtenez la clé sur [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Google Gemini
Obtenez la clé sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Pour TTS, activez [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) dans Google Cloud Console

### Anthropic Claude
Obtenez la clé sur [console.anthropic.com](https://console.anthropic.com/)

### DeepSeek
Obtenez la clé sur [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### ElevenLabs
Obtenez la clé sur [elevenlabs.io](https://elevenlabs.io/)

### Qwen
Obtenez la clé sur [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)

### Respeecher
Obtenez la clé sur [space.respeecher.com](https://space.respeecher.com/)

## Fonctionnalités supplémentaires

- **Statistiques** : Suivez vos articles sauvegardés avec l'historique et les compteurs mensuels
- **Import/export des paramètres** : Sauvegardez et restaurez vos préférences
- **Interface en 11 langues** : Basculez entre les langues sans redémarrage
- **Stockage sécurisé** : Les clés API sont chiffrées avant la sauvegarde

## Permissions

L'extension a besoin de ces permissions pour fonctionner :
- Lire les pages web que vous visitez
- Enregistrer des fichiers sur votre ordinateur
- Faire des appels API aux fournisseurs IA (uniquement lorsque vous utilisez ces fonctionnalités)

**Sécurité** : Toutes les clés API sont chiffrées avant d'être stockées dans le navigateur.

---

ClipAIble extrait et convertit les articles web.
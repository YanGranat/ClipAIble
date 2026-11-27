# ClipAIble

Enregistrez des articles web au format PDF, EPUB, FB2, Markdown ou audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Utilisation

1. Ouvrez un article, une vidéo prise en charge ou un PDF.
2. Cliquez sur ClipAIble dans la barre d’outils de Chrome.
3. Choisissez le format de sortie et le mode d’extraction.
4. Cliquez sur **Enregistrer**.

Le menu contextuel de la page propose aussi des actions d’enregistrement. Pour les PDF locaux, autorisez l’accès aux fichiers dans les paramètres de l’extension Chrome ou sélectionnez le fichier correspondant lorsque cela vous est demandé. Gardez le panneau de l’extension ouvert si une sélection de fichier est nécessaire.

Pour les articles web, **Automatique** utilise des heuristiques locales et les sélecteurs disponibles en cache. **AI Selector** demande à un service d’IA des sélecteurs CSS, puis extrait le contenu correspondant. **AI Extract** demande au service de structurer le contenu. Pour les PDF, Automatique extrait la couche de texte ; les modes IA traitent les pages rendues.

L’exportation de vidéos YouTube et Vimeo nécessite des sous-titres et une clé API du fournisseur d’IA choisi pour les articles. Cela s’applique aussi au mode **Automatique**.

Les paramètres comprennent la traduction du texte et des images, les styles du document et une table des matières. Le panneau permet aussi de générer un résumé ou des affirmations clés. Pour créer un fichier audio, utilisez un service de synthèse vocale configuré ou téléchargez le modèle de Piper ou de Supertonic pour l’utiliser en local.

Ajoutez les clés API nécessaires aux fonctions d’IA et de synthèse vocale choisies. La sauvegarde JSON comprend les paramètres et les instructions personnalisées. Elle peut aussi inclure les statistiques, l’historique et le cache des sélecteurs. Les clés API sont exclues de la sauvegarde. À l’importation, vous pouvez ajouter les entrées manquantes de l’historique et les règles des nouveaux sites ou remplacer les sections sélectionnées. Voir [Sauvegarder les paramètres](../README.md#back-up-settings).

## Développement

Les instructions d’installation, de compilation et de test figurent dans le [guide principal en anglais](../README.md#development).

[Autorisations](../PERMISSIONS.md) · [Confidentialité](../PRIVACY.md) · [Présentation technique](technical-overview.md)

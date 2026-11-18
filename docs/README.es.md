# ClipAIble

Guarda artículos web como PDF, EPUB, FB2, Markdown o audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Uso

1. Abre un artículo, un vídeo compatible o un PDF.
2. Haz clic en ClipAIble en la barra de herramientas de Chrome.
3. Selecciona el formato de salida y el modo de extracción.
4. Haz clic en **Guardar**.

El menú contextual de la página también ofrece acciones para guardar. Para los PDF locales, permite el acceso a archivos en la configuración de la extensión en Chrome o selecciona el archivo correspondiente cuando se solicite. Mantén abierto el panel de la extensión si es necesario seleccionar un archivo.

Para artículos web, **Automático** utiliza heurísticas locales y selectores disponibles en caché. **AI Selector** pide a un servicio de IA que identifique selectores CSS y después extrae el contenido correspondiente. **AI Extract** pide al servicio que estructure el contenido. Para los PDF, Automático extrae la capa de texto; los modos de IA procesan las páginas renderizadas.

Los ajustes incluyen traducción de texto e imágenes, estilos de documento y un índice. El panel también permite generar un resumen o afirmaciones clave. El audio utiliza un servicio TTS configurado o la síntesis local de Piper después de descargar un modelo de voz.

Añade las claves API necesarias para las funciones de IA y TTS que elijas. La exportación de ajustes excluye las claves API y permite incluir opcionalmente estadísticas y la caché de selectores.

## Desarrollo

Las instrucciones de instalación, compilación y pruebas están en la [guía principal en inglés](../README.md#development).

[Permisos](../PERMISSIONS.md) · [Privacidad](../PRIVACY.md) · [Descripción técnica](technical-overview.md)

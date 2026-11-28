# ClipAIble

Guarda artículos web como PDF, EPUB, FB2, Markdown o audio.

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## Uso

1. Abre un artículo, un vídeo compatible o un PDF.
2. Haz clic en ClipAIble en la barra de herramientas de Chrome.
3. Selecciona el formato de salida y el modo de extracción.
4. Haz clic en **Guardar**.

El menú contextual de la página también ofrece acciones para guardar. Para los PDF locales, permite el acceso a archivos en la configuración de la extensión en Chrome o selecciona el archivo correspondiente cuando se solicite. Mantén abierto el panel de la extensión si es necesario seleccionar un archivo.

Para artículos web, **Automático** utiliza heurísticas locales y selectores disponibles en caché. **AI Selector** pide a un servicio de IA que identifique selectores CSS y después extrae el contenido correspondiente. **AI Extract** pide al servicio que estructure el contenido. Para los PDF, Automático extrae la capa de texto; los modos de IA procesan las páginas renderizadas. **OCR (Tesseract)** reconoce localmente el texto de todas las páginas del PDF.

Para exportar vídeos de YouTube y Vimeo se necesitan subtítulos y una clave API del proveedor de IA seleccionado para artículos. Esto también se aplica al modo **Automático**.

Los ajustes incluyen traducción de texto e imágenes, estilos de documento y un índice. En el panel también puedes generar un resumen o afirmaciones clave. Para crear audio, usa un servicio de síntesis de voz configurado o descarga el modelo de Piper o Supertonic para generar audio en el equipo.

Añade las claves API necesarias para las funciones de IA y de síntesis de voz que elijas. La copia JSON guarda los ajustes y los prompts personalizados. También puede incluir estadísticas, historial y la caché de selectores. Las claves API quedan fuera de la copia. Al importarla, puedes añadir entradas de historial que falten y reglas para sitios nuevos o reemplazar las secciones seleccionadas. Consulta [Copias de los ajustes](../README.md#export-and-restore-settings).

## Desarrollo

Las instrucciones de instalación, compilación y pruebas están en la [guía principal en inglés](../README.md#development).

[Permisos](../PERMISSIONS.md) · [Privacidad](../PRIVACY.md) · [Descripción técnica](technical-overview.md)

# ClipAIble

Extractor de artículos con IA. Funciona en cualquier sitio web.

## Qué hace

ClipAIble extrae el contenido de artículos de páginas web y lo convierte a diferentes formatos:
- Documentos PDF
- Archivos EPUB
- Archivos FB2
- Texto Markdown
- Archivos de audio

**Funciones especiales:**
- **Soporte YouTube/Vimeo**: Extrae subtítulos de video y crea artículos a partir de ellos
- **Procesamiento PDF**: Funciona con PDFs en línea y archivos PDF locales
- **Traducción de contenido**: Traduce artículos a 11 idiomas
- **Traducción de imágenes**: Traduce texto en imágenes usando IA
- **Generación TLDR**: Crea resúmenes breves dentro de los documentos
- **Panel summary**: Muestra resúmenes de artículos en el popup después del procesamiento

## Instalación

Instale desde [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflolc).

## Cómo usar

1. Haga clic en el ícono de ClipAIble en la barra de herramientas del navegador
2. Abra cualquier artículo, video de YouTube o PDF
3. Seleccione el formato deseado (PDF, EPUB, FB2, Markdown o Audio)
4. Haga clic en guardar

**Métodos alternativos de guardado:**
- Clic derecho en cualquier página web y uso de las opciones del menú contextual

**Para archivos PDF locales**: En los modos IA, se le pedirá que seleccione el archivo PDF debido a las restricciones del navegador.

## Configuración

### Modos de extracción

- **AI Selector**: Modo recomendado para la mayoría de sitios. Usa IA para encontrar el contenido del artículo.
- **Automatic**: Modo básico que funciona sin claves API.
- **AI Extractor**: Modo alternativo con IA (no recomendado para uso regular).

### Funciones de rendimiento

- **Almacenamiento en caché de selectores**: Acelera el procesamiento de sitios visitados anteriormente reutilizando selectores aprendidos por IA

### Formatos de salida

- **PDF**: Crea documentos formateados con 4 estilos predefinidos (Oscuro, Claro, Sepia, Alto contraste) y fuentes/colores personalizables
- **EPUB**: Crea libros electrónicos estructurados para lectores como Kindle
- **FB2**: Crea libros electrónicos estructurados para PocketBook y otros lectores
- **Markdown**: Preserva la estructura del artículo con títulos y listas
- **Audio**: Convierte texto a voz usando 6 servicios TTS diferentes

### Traducción

El contenido se puede traducir a: inglés, ruso, ucraniano, alemán, francés, español, italiano, portugués, chino, japonés, coreano.

### Audio

El audio se puede generar con diferentes proveedores TTS:
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher (solo inglés y ucraniano)
- Piper (sin conexión, no se necesitan claves API)

## Claves API (opcional)

Para funciones de IA, puede agregar claves API de estos proveedores:

### OpenAI
Obtenga la clave en [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Google Gemini
Obtenga la clave en [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Para TTS, active [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) en Google Cloud Console

### Anthropic Claude
Obtenga la clave en [console.anthropic.com](https://console.anthropic.com/)

### DeepSeek
Obtenga la clave en [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### ElevenLabs
Obtenga la clave en [elevenlabs.io](https://elevenlabs.io/)

### Qwen
Obtenga la clave en [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/)

### Respeecher
Obtenga la clave en [space.respeecher.com](https://space.respeecher.com/)

## Funciones adicionales

- **Estadísticas**: Rastree sus artículos guardados con historial y contadores mensuales
- **Importación/exportación de configuración**: Copia de seguridad y restauración de sus preferencias
- **Interfaz en 11 idiomas**: Cambie entre idiomas sin reiniciar
- **Almacenamiento seguro**: Las claves API se cifran antes de guardar

## Permisos

La extensión necesita estos permisos para funcionar:
- Leer páginas web que visita
- Guardar archivos en su computadora
- Hacer llamadas API a proveedores de IA (solo cuando usa esas funciones)

**Seguridad**: Todas las claves API se cifran antes de almacenarse en el navegador.

---

ClipAIble extrae y convierte artículos web.
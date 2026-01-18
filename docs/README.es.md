# ✂️ ClipAIble

> **Extractor de artículos con IA** — Guarda cualquier artículo de la web como PDF, EPUB, FB2, Markdown o Audio. Traducción a 11 idiomas. Funciona en cualquier sitio web.

![Versión](https://img.shields.io/badge/versión-3.3.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extensión-green)
![Licencia](https://img.shields.io/badge/licencia-MIT-brightgreen)

**[⬇️ Instalar desde Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ ¿Qué es ClipAIble?

ClipAIble utiliza inteligencia artificial para extraer inteligentemente el contenido de artículos de cualquier página web — elimina anuncios, navegación, popups y elementos innecesarios. Luego exporta a tu formato preferido:

- 📄 **PDF** — Diseño hermoso y personalizable
- 📚 **EPUB** — Compatible con Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatible con PocketBook, FBReader
- 📝 **Markdown** — Texto plano para notas
- 🎧 **Audio** — Escucha con narración de IA

¡Todos los formatos admiten **traducción a 11 idiomas** — incluso traducción de texto en imágenes!

---

## 🚀 Características

### 🤖 Extracción con IA
- **Dos modos**: Automático (sin IA, rápido), AI Selector (rápido, reutilizable)
- **Modo automático**: Crear documentos sin IA — no se requieren claves API, extracción instantánea
- **Varios proveedores**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, DeepSeek, OpenRouter
- **Extracción de contenido PDF** (v3.3.0): Extraer contenido de archivos PDF usando la biblioteca PDF.js
  - Función experimental con sistema de clasificación multi-nivel complejo
  - Extrae texto, imágenes, estructura y metadatos de archivos PDF
  - Soporta archivos PDF web y locales
  - Maneja diseños multi-columna, tablas, encabezados, listas, fusión entre páginas
  - Nota: La función es experimental y puede tener limitaciones con PDFs complejos (PDFs escaneados, PDFs protegidos con contraseña)
- **Soporte de video**: Extraer subtítulos de videos YouTube/Vimeo y convertirlos en artículos (v3.0.0)
  - Múltiples métodos de extracción con respaldos
  - Prioridad: subtítulos manuales > generados automáticamente > traducidos
  - Procesamiento IA: elimina marcas de tiempo, fusiona párrafos, corrige errores
  - Respaldo de transcripción de audio cuando los subtítulos no están disponibles
- **Detección inteligente**: Encuentra el contenido principal del artículo, elimina elementos innecesarios automáticamente
- **Estrategias de respaldo mejoradas**: 6 estrategias diferentes para extracción de contenido confiable
- **Preserva estructura**: Encabezados, imágenes, bloques de código, tablas, notas al pie
- **Caché de selectores**: Configuraciones independientes para usar y habilitar caché

### 🎧 Exportación de audio
- **5 proveedores TTS**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **Regulación de velocidad**: 0.25x a 4.0x (solo OpenAI/ElevenLabs; Google/Qwen/Respeecher usan velocidad fija)
- **Soporte de formatos**: MP3 (OpenAI/ElevenLabs) o WAV (Google/Qwen/Respeecher)
- **Pronunciación multilingüe**: Pronunciación correcta para cada idioma
- **Soporte de idioma ucraniano**: Voces ucranianas dedicadas vía Respeecher
- **Limpieza inteligente de texto**: La IA elimina URL, código y contenido no vocal
- **Características específicas del proveedor**: Selección de modelo, opciones de formato y configuraciones avanzadas disponibles para cada proveedor

### 🌍 Traducción
- **11 idiomas**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Detección inteligente**: Omite la traducción si el artículo ya está en el idioma objetivo
- **Traducción de imágenes**: Traduce texto en imágenes (vía Gemini)
- **Metadatos localizados**: Fechas y etiquetas se adaptan al idioma

### 🎨 Personalización PDF
- **4 preajustes**: Oscuro, Claro, Sepia, Alto contraste
- **Colores personalizables**: Fondo, texto, encabezados, enlaces
- **11 fuentes**: Por defecto (Segoe UI), Arial, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Palatino Linotype, Garamond, Courier New, Comic Sans MS
- **Tamaño de fuente**: Ajustable (por defecto: 31px)
- **Modos de página**: Página única continua o formato multi-página A4


### ⚡ Características inteligentes
- **Extracción de contenido PDF** (v3.3.0): Extraer contenido de archivos PDF y convertirlos en artículos
  - Usa la biblioteca PDF.js para analizar en un documento offscreen
  - Sistema de clasificación multi-nivel para extracción precisa
  - Soporta archivos PDF web y locales
  - Integración completa del pipeline: traducción, tabla de contenidos, resumen, todos los formatos de exportación
  - Nota: Función experimental, puede tener limitaciones con PDFs complejos
- **Soporte de video**: Extraer subtítulos de videos YouTube/Vimeo y convertirlos en artículos (v3.0.0)
  - Extracción directa de subtítulos (no se requieren claves API de YouTube/Vimeo)
  - Procesamiento IA: elimina marcas de tiempo, fusiona párrafos, corrige errores
  - Integración completa del pipeline: traducción, tabla de contenidos, resumen, todos los formatos de exportación
- **Generación de resumen**: Crea resúmenes IA detallados de cualquier artículo o video
  - Haz clic en el botón **"Generar resumen"** para crear un resumen completo
  - Funciona con artículos normales y videos YouTube/Vimeo
  - Continúa generando incluso si el popup está cerrado (funciona en segundo plano)
  - Copiar al portapapeles o descargar como archivo Markdown
  - Visualización expandible/colapsable con texto formateado
  - Resúmenes detallados con ideas clave, conceptos, ejemplos y conclusiones
- **Resumen (TL;DR)**: Resumen corto de 2-4 oraciones escrito por IA, incluido en documentos
  - Función opcional: activa en configuración para agregar resumen corto a PDF/EPUB/FB2/Markdown
  - Aparece al inicio de documentos exportados
  - Diferente del resumen detallado (este es un resumen breve)
- **Modo offline**: Caché de selectores — no se necesita IA para sitios repetidos
  - Configuraciones independientes: usar selectores en caché y habilitar caché por separado
  - Invalidación automática en caso de fallo de extracción
  - Gestión manual de caché por dominio
- **Estadísticas**: Rastrea cantidad de guardados, visualiza historial
- **Tabla de contenidos**: Generada automáticamente desde encabezados
- **Menú contextual**: Clic derecho → "Guardar artículo como PDF/EPUB/FB2/Markdown/Audio"
- **Cancelar en cualquier momento**: Detén el procesamiento con un clic
- **Importar/Exportar configuración**: Respaldo y restauración de toda la configuración (claves API excluidas por seguridad)

### 🔒 Seguridad
- **Claves API encriptadas** con encriptación estándar (OpenAI, Claude, Gemini, Grok, DeepSeek, OpenRouter, ElevenLabs, Qwen, Respeecher)
- **Claves nunca exportadas** — excluidas de la copia de seguridad de configuración
- **Todos los datos se almacenan localmente** — nada se envía a terceros

---

## ⚠️ Limitaciones Conocidas

### Formatos de Archivo
- **Formato WAV** (Google/Qwen/Respeecher): Los archivos pueden ser muy grandes (10-50MB+ para artículos largos). El formato MP3 (OpenAI/ElevenLabs) ofrece tamaños de archivo más pequeños.
- **Límites de caracteres por solicitud**: 
  - OpenAI TTS: 4096 caracteres
  - ElevenLabs: 5000 caracteres
  - Google Gemini 2.5 TTS: 24000 caracteres
  - Qwen TTS: 600 caracteres
  - Respeecher TTS: 450 caracteres
  - El texto se divide automáticamente de forma inteligente en los límites de oraciones/palabras

### Restricciones Técnicas
- **Requisito de keep-alive**: Chrome MV3 requiere un intervalo de keep-alive de al menos 1 minuto. Las tareas de procesamiento largas pueden tardar varios minutos. La extensión usa mecanismo unificado de keep-alive (alarma cada 1 minuto) para evitar que el service worker se detenga.
- **CORS para imágenes**: Algunas imágenes pueden no cargarse si el sitio web bloquea las solicitudes cross-origin. La extensión omitirá estas imágenes.
- **Cancelación no instantánea**: La cancelación puede tardar unos segundos en detener completamente todos los procesos en segundo plano.
- **Recuperación del Service Worker**: Las operaciones se reanudan automáticamente después del reinicio del service worker, si el estado es reciente (< 1 minuto). La recarga de la extensión siempre restablece el estado.
- **Limitaciones de extracción PDF** (v3.3.0): 
  - Los PDFs escaneados (sin capa de texto) no son compatibles — OCR aún no está disponible
  - Los PDFs protegidos con contraseña deben desbloquearse antes de la extracción
  - Los PDFs muy grandes (>100MB) pueden no funcionar debido a limitaciones de memoria
  - Los diseños complejos (multi-columna, tablas) se extraen pero pueden requerir verificación manual

### Compatibilidad del Navegador
- **Chrome/Edge/Brave/Arc**: Totalmente compatible
- **Firefox**: No compatible (usa una API de extensión diferente)
- **Safari**: No compatible (usa una API de extensión diferente)

---

## 📦 Instalación

### Opción 1: Instalación desde Chrome Web Store (Recomendado)

**[⬇️ Instalar ClipAIble desde Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### Opción 2: Instalación manual (Modo desarrollador)

1. **Clona** este repositorio
2. **Instala dependencias y compila:**
   ```bash
   npm install
   npm run build
   ```
3. Abre Chrome → `chrome://extensions/`
4. Habilita el **Modo de desarrollador**
5. Haz clic en **Cargar extensión sin empaquetar** → selecciona la carpeta

### Requisitos

- Chrome, Edge, Brave o navegador Arc
- Clave API de al menos un proveedor (ver abajo)

---

## 🔑 Obtener claves API

### OpenAI (modelos GPT + Audio)

1. Ve a [platform.openai.com](https://platform.openai.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys** (menú izquierdo) o directamente a [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Haz clic en **"Create new secret key"**
5. Copia la clave (comienza con `sk-...`)
6. Agrega facturación en **Settings → Billing** (requerido para uso de API)

> **Nota:** La clave OpenAI es requerida para exportación de audio (TTS). Otros formatos funcionan con cualquier proveedor.

### Google Gemini

1. Ve a [Google AI Studio](https://aistudio.google.com/)
2. Inicia sesión con cuenta de Google
3. Haz clic en **"Get API key"** o ve directamente a [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Haz clic en **"Create API key"**
5. Copia la clave (comienza con `AIza...`)

> **Consejo:** Gemini también habilita la función de traducción de texto en imágenes y Google Gemini 2.5 TTS (30 voces). Para TTS, puedes usar la misma clave API de Gemini o configurar una clave API de Google TTS dedicada. Requiere habilitar Generative Language API en Google Cloud Console.

### Anthropic Claude

1. Ve a [console.anthropic.com](https://console.anthropic.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys**
4. Haz clic en **"Create Key"**
5. Copia la clave (comienza con `sk-ant-...`)
6. Agrega créditos en **Plans & Billing**

### DeepSeek

1. Ve a [platform.deepseek.com](https://platform.deepseek.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys** o ve a [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. Haz clic en **"Create API key"**
5. Copia la clave (comienza con `sk-...`)

> **Nota:** DeepSeek proporciona modelos DeepSeek-V3.2 con modos thinking y non-thinking.

### ElevenLabs (Audio)

1. Ve a [ElevenLabs](https://elevenlabs.io/)
2. Regístrate o inicia sesión
3. Navega a **Profile** → **API Keys**
4. Crea una clave API
5. Copia la clave

> **Nota:** ElevenLabs proporciona TTS de alta calidad con regulación de velocidad y selección de formato.

### Google Gemini 2.5 TTS (Audio)

1. Ve a [Google AI Studio](https://aistudio.google.com/)
2. Inicia sesión con cuenta de Google
3. Haz clic en **"Get API key"** o ve directamente a [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Haz clic en **"Create API key"**
5. Copia la clave (comienza con `AIza...`)
6. Habilita **Generative Language API** en [Google Cloud Console](https://console.cloud.google.com/)
7. (Opcional) Habilita facturación si es requerido para tu modelo

> **Nota:** Google Gemini 2.5 TTS. Puedes usar la misma clave API de Gemini o configurar una clave API de Google TTS dedicada.

### Qwen3-TTS-Flash (Audio)

1. Ve a [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys** o **Model Studio**
4. Crea una clave API
5. Copia la clave (comienza con `sk-...`)

> **Nota:** Qwen3-TTS-Flash incluye una voz rusa dedicada (Alek).

### Respeecher (Audio - Inglés y Ucraniano)

1. Ve a [Respeecher Space](https://space.respeecher.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys**
4. Crea una clave API
5. Copia la clave

> **Nota:** Respeecher admite inglés y ucraniano con voces ucranianas dedicadas.

---

## 🎯 Inicio rápido

1. Haz clic en el icono **ClipAIble** en la barra de herramientas
2. Ingresa tu clave API → **Guardar claves**
3. Navega a cualquier artículo
4. Haz clic en **Guardar como PDF** (o elige otro formato)
5. ¡Listo! El archivo se descarga automáticamente

**Consejos:**
- Clic derecho en cualquier lugar → **"Guardar artículo como PDF"**
- Haz clic en **"Generar resumen"** para crear un resumen IA detallado (funciona incluso si el popup está cerrado)
- Activa **"Generar TL;DR"** en configuración para agregar un resumen corto a los documentos

---

## ⚙️ Configuración

### Interfaz

- **Tema**: Elige Oscuro, Claro o Auto (sigue el sistema) en el encabezado
- **Idioma**: Selecciona el idioma de la interfaz (11 idiomas) en el encabezado
- **Modelos personalizados**: Agrega tus propios modelos IA a través del botón "+" junto al selector de modelos

### Modos de extracción

| Modo | Velocidad | Mejor para |
|------|-----------|------------|
| **Automático** | ⚡⚡ Instantáneo | Artículos simples, no se requiere clave API |
| **AI Selector** | ⚡ Rápido | La mayoría de sitios, blogs, noticias |

### Preajustes de estilo (PDF)

4 preajustes disponibles: Oscuro, Claro, Sepia, Alto contraste. Personaliza colores para fondo, texto, encabezados y enlaces.

---

## 📊 Estadísticas y caché

Haz clic en **📊 Estadísticas** para ver:
- Total de guardados, cantidad este mes
- Desglose por formato (PDF, EPUB, FB2, Markdown, Audio)
- Historial reciente con enlaces a artículos originales (últimos 50 guardados)
  - Haz clic en el enlace para abrir el artículo original
  - Haz clic en el botón ✕ para eliminar una entrada de historial individual
  - Muestra formato, dominio, tiempo de procesamiento y fecha
- Dominios en caché para modo offline
- **Activar/Desactivar estadísticas**: Interruptor para recopilación de estadísticas
- **Limpiar estadísticas**: Botón para restablecer todas las estadísticas
- **Limpiar caché**: Botón para eliminar todos los selectores en caché
- Eliminación de dominios individuales del caché

## 📝 Generación de resumen

Crea resúmenes IA detallados de cualquier artículo o video:

1. Navega a cualquier artículo o video YouTube/Vimeo
2. Haz clic en el botón **"Generar resumen"** en el popup
3. El resumen se genera en segundo plano (puedes cerrar el popup)
4. Cuando esté listo, el resumen aparece con opciones:
   - **Copiar** al portapapeles
   - **Descargar** como archivo Markdown
   - **Expandir/Colapsar** para ver el texto completo
   - **Cerrar** para ocultar el resumen

**Características:**
- Funciona con artículos y videos YouTube/Vimeo
- Continúa generando incluso si el popup está cerrado
- Resúmenes detallados con ideas clave, conceptos, ejemplos y conclusiones
- Texto formateado con encabezados, listas y enlaces
- Automáticamente guardado — persiste hasta que lo cierres

**Nota:** La generación de resumen está separada de la exportación de documentos. Úsala para entender rápidamente el contenido sin guardar un documento completo.

### Modo offline

ClipAIble almacena en caché los selectores generados por IA por dominio:
- **Segunda visita = instantáneo** — sin llamada API
- **Invalidación automática** — se limpia si la extracción falla
- **Control manual** — eliminar dominios individuales
- **Configuraciones independientes**:
  - **Usar selectores en caché**: Omitir análisis de página si el caché existe (más rápido)
  - **Habilitar caché**: Guardar nuevos selectores en caché después de extracción
  - Ambas configuraciones funcionan independientemente para control flexible

---

## 💾 Importar/Exportar configuración

**⚙️ Configuración** → **Import/Export**

- Exportar toda la configuración (claves API excluidas por seguridad)
- Opcional: incluir estadísticas y caché
- Importar con opciones de fusionar o sobrescribir

---

## 🔧 Solución de problemas

| Problema | Solución |
|----------|----------|
| Contenido vacío | Prueba el modo **AI Selector** |
| Clave API inválida | Verifica el formato de la clave (sk-..., AIza..., sk-ant-...) |
| Imágenes faltantes | Algunos sitios bloquean cross-origin; imágenes pequeñas filtradas |
| Audio lento | Artículos largos divididos en fragmentos; observa la barra de progreso |
| Resumen no generado | Verifica la clave API, asegúrate de que el contenido de la página esté cargado, intenta de nuevo |
| Timeout de generación de resumen | Artículos muy largos pueden tardar hasta 45 minutos; espera o intenta con contenido más corto |
| La extracción PDF no funciona | Verifica si el PDF está protegido con contraseña (desbloquéalo primero) o si está escaneado (OCR aún no es compatible). Prueba primero con PDFs más simples. |
| Contenido PDF incompleto | Los diseños complejos (multi-columna, tablas) pueden requerir verificación manual. La función es experimental. |

---

---

## 🔐 Seguridad y privacidad

- **Encriptación**: AES-256-GCM vía Web Crypto API
- **Derivación de clave**: PBKDF2, 100,000 iteraciones
- **Sin seguimiento**: Sin analíticas, sin registro remoto
- **Solo local**: Todos los datos permanecen en tu navegador

---

## 📋 Permisos

ClipAIble requiere permisos para:
- Leer la página actual para extraer contenido
- Guardar tu configuración y archivos generados localmente
- Hacer llamadas API a proveedores IA/TTS que configuras
- Acceder a sitios web solo cuando los guardas explícitamente

**Nota de seguridad:** Todas las claves API están encriptadas y se almacenan solo localmente. Las claves nunca se exportan ni se transmiten a ningún servidor, excepto a los proveedores IA que configuras.

Ver [PERMISSIONS.md](PERMISSIONS.md) para detalles.

---

## 🤝 Contribuir

1. Haz fork del repositorio
2. Crea rama de característica: `git checkout -b feature/cool-thing`
3. Commit: `git commit -m 'Add cool thing'`
4. Push: `git push origin feature/cool-thing`
5. Abre Pull Request

---

## 📜 Licencia

MIT License — ver [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — Guarda. Lee. Escucha. En cualquier lugar.
</p>


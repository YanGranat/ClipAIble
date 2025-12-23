# ✂️ ClipAIble

> **Extractor de artículos con IA** — Guarda cualquier artículo de la web como PDF, EPUB, FB2, Markdown o Audio. Traducción a 11 idiomas. Funciona en cualquier sitio web.

![Versión](https://img.shields.io/badge/versión-3.2.4-blue)
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
- **Tres modos**: Automático (sin IA, rápido), AI Selector (rápido, reutilizable) y AI Extract (exhaustivo)
- **Modo automático**: Crear documentos sin IA — no se requieren claves API, extracción instantánea
- **Varios proveedores**: OpenAI GPT (GPT-5.2, GPT-5.2-high, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
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
- **100+ voces**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (inglés y ucraniano)
- **Regulación de velocidad**: 0.5x a 2.0x (solo OpenAI/ElevenLabs; Google/Qwen/Respeecher usan velocidad fija)
- **Soporte de formatos**: MP3 (OpenAI/ElevenLabs) o WAV (Google/Qwen/Respeecher)
- **Pronunciación multilingüe**: Pronunciación correcta para cada idioma
- **Soporte de idioma ucraniano**: Voces ucranianas dedicadas vía Respeecher (10 voces)
- **Limpieza inteligente de texto**: La IA elimina URL, código y contenido no vocal
- **Características específicas del proveedor**:
  - **ElevenLabs**: Selección de modelo (v2, v3, Turbo v2.5), selección de formato, configuraciones avanzadas de voz
  - **Google Gemini 2.5 TTS**: Selección de modelo (pro/flash), 30 voces, límite de 24k caracteres
  - **Qwen**: 49 voces incluyendo voz rusa (Alek), límite de 600 caracteres
  - **Respeecher**: Parámetros de muestreo avanzados (temperature, repetition_penalty, top_p)

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
- **Claves API encriptadas** con AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
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
- **Requisito de keep-alive**: Chrome MV3 requiere un intervalo de keep-alive de al menos 1 minuto. Las tareas de procesamiento largas pueden tardar varios minutos. La extensión usa mecanismo unificado de keep-alive (alarma cada 1 minuto + guardado de estado cada 2 segundos) para evitar que el service worker se detenga.
- **CORS para imágenes**: Algunas imágenes pueden no cargarse si el sitio web bloquea las solicitudes cross-origin. La extensión omitirá estas imágenes.
- **Cancelación no instantánea**: La cancelación puede tardar unos segundos en detener completamente todos los procesos en segundo plano.
- **Recuperación del Service Worker**: Las operaciones se reanudan automáticamente después del reinicio del service worker (dentro de 2 horas).

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
2. Abre Chrome → `chrome://extensions/`
3. Habilita el **Modo de desarrollador**
4. Haz clic en **Cargar extensión sin empaquetar** → selecciona la carpeta

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

### ElevenLabs (Audio)

1. Ve a [ElevenLabs](https://elevenlabs.io/)
2. Regístrate o inicia sesión
3. Navega a **Profile** → **API Keys**
4. Crea una clave API
5. Copia la clave

> **Nota:** ElevenLabs proporciona 9 voces premium con TTS de alta calidad. Soporta regulación de velocidad (0.25-4.0x) y selección de formato (MP3 alta calidad por defecto: mp3_44100_192). Modelos: Multilingual v2, v3 (por defecto), Turbo v2.5. Configuraciones avanzadas de voz disponibles (stability, similarity, style, speaker boost).

### Google Gemini 2.5 TTS (Audio)

1. Ve a [Google AI Studio](https://aistudio.google.com/)
2. Inicia sesión con cuenta de Google
3. Haz clic en **"Get API key"** o ve directamente a [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Haz clic en **"Create API key"**
5. Copia la clave (comienza con `AIza...`)
6. Habilita **Generative Language API** en [Google Cloud Console](https://console.cloud.google.com/)
7. (Opcional) Habilita facturación si es requerido para tu modelo

> **Nota:** Google Gemini 2.5 TTS proporciona 30 voces. Puedes usar la misma clave API de Gemini o configurar una clave API de Google TTS dedicada. Formato WAV fijo a 24kHz. Modelos: `gemini-2.5-pro-preview-tts` (principal) o `gemini-2.5-flash-preview-tts` (más rápido).

### Qwen3-TTS-Flash (Audio)

1. Ve a [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys** o **Model Studio**
4. Crea una clave API
5. Copia la clave (comienza con `sk-...`)

> **Nota:** Qwen3-TTS-Flash proporciona 49 voces, incluyendo una voz rusa dedicada (Alek). Formato WAV fijo a 24kHz.

### Respeecher (Audio - Inglés y Ucraniano)

1. Ve a [Respeecher Space](https://space.respeecher.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys**
4. Crea una clave API
5. Copia la clave

> **Nota:** Respeecher admite inglés y ucraniano con voces ucranianas dedicadas. Formato WAV fijo a 22.05kHz.

### ¿Cuál elegir?

| Proveedor | Mejor para | Audio | Traducción de imágenes |
|-----------|------------|-------|------------------------|
| **OpenAI** | Uso general, exportación de audio, transcripción de video | ✅ (11 voces) | ❌ |
| **Gemini** | Extracción rápida, traducción de imágenes, exportación de audio (30 voces) | ✅ (30 voces) | ✅ |
| **Claude** | Artículos largos, páginas complejas | ❌ | ❌ |
| **Grok** | Tareas de razonamiento rápido | ❌ | ❌ |
| **OpenRouter** | Acceso a múltiples modelos | ❌ | ❌ |
| **ElevenLabs** | Exportación de audio (9 voces, alta calidad) | ✅ (9 voces) | ❌ |
| **Qwen** | Exportación de audio (49 voces, soporte ruso) | ✅ (49 voces) | ❌ |
| **Respeecher** | Exportación de audio (idioma ucraniano) | ✅ (14 voces) | ❌ |

**Recomendación:** 
- **Para extracción**: Comienza con OpenAI o Gemini (rápido y confiable)
- **Para audio**: OpenAI para uso general, ElevenLabs para alta calidad, Google Gemini 2.5 TTS para 30 voces, Qwen para ruso, Respeecher para ucraniano
- **Para traducción de imágenes**: Requiere clave API de Gemini

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
| **AI Extract** | 🐢 Exhaustivo | Páginas complejas, Notion, SPAs |

### Modelos de IA

| Proveedor | Modelo | Notas |
|-----------|--------|-------|
| OpenAI | GPT-5.2 | Última, razonamiento medio (por defecto) |
| OpenAI | GPT-5.2-high | Mejorada, razonamiento alto |
| OpenAI | GPT-5.1 | Equilibrado |
| OpenAI | GPT-5.1 (high) | Mejor calidad, razonamiento alto |
| Anthropic | Claude Sonnet 4.5 | Excelente para artículos largos |
| Google | Gemini 3 Pro | Extracción rápida, traducción de imágenes |
| Grok | Grok 4.1 Fast Reasoning | Razonamiento rápido |
| OpenRouter | Varios modelos | Acceso a múltiples proveedores |

**Modelos personalizados:** Haz clic en el botón **"+"** junto al selector de modelos para agregar modelos personalizados (por ejemplo, `gpt-4o`, `claude-opus-4.5`). Los modelos personalizados aparecen en el menú desplegable y pueden ocultarse/mostrarse según sea necesario.

### Voces de audio

**OpenAI (11 voces) :** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs (9 voces) :** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS (30 voces) :** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash (49 voces) :** Incluyendo Elias (predeterminado), Alek (ruso) y voces para 10 idiomas

**Respeecher (14 voces) :** 4 inglesas (Samantha, Neve, Gregory, Vincent) + 10 voces ucranianas

### Preajustes de estilo (PDF)

| Preajuste | Fondo | Texto |
|-----------|-------|-------|
| Oscuro | `#303030` | `#b9b9b9` |
| Claro | `#f8f9fa` | `#343a40` |
| Sepia | `#faf4e8` | `#5d4e37` |
| Alto contraste | `#000000` | `#ffffff` |

**Colores personalizados:** Personaliza fondo, texto, encabezados y enlaces con selectores de color. Botones de reinicio individuales (↺) para cada color, o **"Restablecer todo por defecto"** para restaurar todos los estilos.

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
| Contenido vacío | Prueba el modo **AI Extract** |
| Clave API inválida | Verifica el formato de la clave (sk-..., AIza..., sk-ant-...) |
| Imágenes faltantes | Algunos sitios bloquean cross-origin; imágenes pequeñas filtradas |
| Audio lento | Artículos largos divididos en fragmentos; observa la barra de progreso |
| Resumen no generado | Verifica la clave API, asegúrate de que el contenido de la página esté cargado, intenta de nuevo |
| Timeout de generación de resumen | Artículos muy largos pueden tardar hasta 45 minutos; espera o intenta con contenido más corto |

---

## 🏗️ Arquitectura

```
clipaible/
├── manifest.json       # Configuración de extensión
├── popup/              # Interfaz (HTML, CSS, JS)
│   ├── popup.js       # Orquestación principal (2841 líneas)
│   ├── core.js        # Lógica de negocio (203 líneas)
│   ├── handlers.js    # Manejadores de eventos (1991 líneas)
│   ├── ui.js          # Gestión de interfaz
│   ├── stats.js       # Visualización de estadísticas
│   └── settings.js    # Gestión de configuración
├── scripts/
│   ├── background.js   # Service worker (2525 líneas, reducido de 3705)
│   ├── content.js      # Content script para YouTube
│   ├── locales.js      # Localización UI (11 idiomas)
│   ├── message-handlers/ # Módulos de manejadores de mensajes (v3.2.1+)
│   │   ├── index.js    # Enrutador de mensajes
│   │   ├── utils.js    # Utilidades de manejadores
│   │   ├── simple.js   # Manejadores simples
│   │   ├── stats.js    # Manejadores de estadísticas
│   │   ├── cache.js    # Manejadores de caché
│   │   ├── settings.js # Manejadores de configuración
│   │   ├── processing.js # Manejadores de procesamiento
│   │   ├── video.js    # Manejadores de video/subtítulos
│   │   ├── summary.js  # Ayudante de generación de resúmenes
│   │   └── complex.js  # Manejadores complejos
│   ├── api/            # Proveedores AI & TTS
│   │   ├── openai.js   # OpenAI (modelos GPT)
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # Enrutador TTS
│   │   └── index.js    # Enrutador API
│   ├── extraction/     # Extracción de contenido
│   │   ├── prompts.js  # Prompts IA
│   │   ├── html-utils.js # Utilidades HTML
│   │   ├── video-subtitles.js # Extracción de subtítulos YouTube/Vimeo
│   │   └── video-processor.js # Procesamiento de subtítulos IA
│   ├── translation/    # Traducción y detección de idioma
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Caché de selectores
│   ├── stats/          # Estadísticas de uso
│   ├── settings/       # Importar/Exportar configuración
│   ├── state/          # Gestión del estado de procesamiento
│   └── utils/          # Configuración, encriptación, utilidades
│       ├── video.js    # Detección de plataforma de video
│       ├── validation.js # Utilidades de validación
│       └── api-error-handler.js # Manejo común de errores API
├── print/              # Renderizado PDF
├── config/             # Estilos
├── lib/                # JSZip
├── docs/               # Archivos README localizados
└── memory-bank/        # Documentación del proyecto
```

---

## 🔐 Seguridad y privacidad

- **Encriptación**: AES-256-GCM vía Web Crypto API
- **Derivación de clave**: PBKDF2, 100,000 iteraciones
- **Sin seguimiento**: Sin analíticas, sin registro remoto
- **Solo local**: Todos los datos permanecen en tu navegador

---

## 📋 Permisos

ClipAIble requiere los siguientes permisos para funcionar. Todos los permisos se usan solo para los propósitos indicados:

| Permiso | Por qué |
|---------|--------|
| `activeTab` | Leer la página actual para extraer contenido cuando haces clic en el icono de la extensión o usas el menú contextual. La extensión solo accede a la pestaña que estás viendo actualmente. |
| `storage` | Guardar tu configuración (claves API, preferencias de estilo, selección de idioma) y estadísticas localmente en tu navegador. Tus datos nunca salen de tu dispositivo. |
| `scripting` | Inyectar el script de extracción de contenido en páginas web. Este script encuentra y extrae el contenido del artículo (texto, imágenes, encabezados) del DOM de la página. |
| `downloads` | Guardar los archivos generados (PDF, EPUB, FB2, Markdown, Audio) en tu computadora. Sin este permiso, la extensión no puede descargar archivos. |
| `debugger` | **Solo generación PDF** — Usa la funcionalidad integrada print-to-PDF de Chrome para generar PDFs de alta calidad con diseño de página y estilo adecuados. El depurador se adjunta solo durante la generación PDF y se desvincula inmediatamente después de completarse. Esta es la única forma de generar PDFs con estilo personalizado en extensiones de Chrome. |
| `alarms` | Mantener el service worker en segundo plano activo durante operaciones largas (artículos grandes, traducción). Chrome Manifest V3 suspende los service workers después de 30 segundos, pero el procesamiento de artículos puede tomar varios minutos. Usa mecanismo unificado de keep-alive (alarma cada 1 minuto + guardado de estado cada 2 segundos) según las reglas MV3. |
| `contextMenus` | Agregar opciones "Guardar con ClipAIble" (PDF/EPUB/FB2/MD/Audio) al menú contextual de clic derecho en páginas web. |
| `notifications` | Mostrar notificaciones de escritorio al usar la función "Guardar" del menú contextual. Te notifica si hay un error (por ejemplo, clave API faltante). |
| `unlimitedStorage` | Almacenar el caché de selectores y datos de impresión temporales localmente. Esto permite extracciones repetidas más rápidas sin volver a llamar a la IA (modo offline). |

### Permisos de host

| Permiso | Por qué |
|---------|--------|
| `<all_urls>` | Extraer contenido de cualquier sitio web que visites. La extensión necesita: 1) Leer el HTML de la página para encontrar el contenido del artículo, 2) Descargar imágenes incrustadas en artículos, 3) Hacer llamadas API a proveedores IA/TTS (OpenAI, Google, Anthropic, ElevenLabs, Qwen, Respeecher). La extensión solo accede a páginas que guardas explícitamente — no navega por la web por sí sola. |

**Nota de seguridad:** Todas las claves API están encriptadas usando AES-256-GCM y se almacenan solo localmente. Las claves nunca se exportan ni se transmiten a ningún servidor, excepto a los proveedores IA que configuras.

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


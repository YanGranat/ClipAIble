# ✂️ ClipAIble

> **Extractor de artículos con IA** — Guarda cualquier artículo de la web como PDF, EPUB, FB2, Markdown o Audio. Traducción a 11 idiomas. Funciona en cualquier sitio web.

![Versión](https://img.shields.io/badge/versión-2.9.0-blue)
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
- 🎧 **Audio (MP3/WAV)** — Escucha con narración de IA

¡Todos los formatos admiten **traducción a 11 idiomas** — incluso traducción de texto en imágenes!

---

## 🚀 Características

### 🤖 Extracción con IA
- **Dos modos**: AI Selector (rápido, reutilizable) y AI Extract (exhaustivo)
- **Varios proveedores**: OpenAI GPT (GPT-5.2, GPT-5.2-pro, GPT-5.1), Google Gemini, Anthropic Claude, Grok, OpenRouter
- **Soporte de video**: Extraer subtítulos de videos YouTube/Vimeo y convertirlos en artículos (v2.9.0)
- **Detección inteligente**: Encuentra el contenido principal del artículo, elimina elementos innecesarios automáticamente
- **Preserva estructura**: Encabezados, imágenes, bloques de código, tablas, notas al pie

### 🎧 Exportación de audio
- **5 proveedores TTS**: OpenAI TTS, ElevenLabs, Google Gemini 2.5 TTS, Qwen3-TTS-Flash, Respeecher
- **100+ voces**: 11 OpenAI + 9 ElevenLabs + 30 Google Gemini + 49 Qwen + 14 Respeecher (inglés y ucraniano)
- **Regulación de velocidad**: 0.5x a 2.0x (solo OpenAI/ElevenLabs)
- **Soporte de idioma ucraniano**: Voces ucranianas dedicadas vía Respeecher
- **Pronunciación multilingüe**: Pronunciación correcta para cada idioma
- **Limpieza inteligente de texto**: La IA elimina URL, código y contenido no vocal

### 🌍 Traducción
- **11 idiomas**: EN, RU, UA, DE, FR, ES, IT, PT, ZH, JA, KO
- **Detección inteligente**: Omite la traducción si el artículo ya está en el idioma objetivo
- **Traducción de imágenes**: Traduce texto en imágenes (vía Gemini)
- **Metadatos localizados**: Fechas y etiquetas se adaptan al idioma

### 🎨 Personalización PDF
- **4 preajustes**: Oscuro, Claro, Sepia, Alto contraste
- **Colores personalizables**: Fondo, texto, encabezados, enlaces
- **11 fuentes** para elegir
- **Modos de página**: Página única continua o formato multi-página A4


### ⚡ Características inteligentes
- **Soporte de video**: Extraer subtítulos de videos YouTube/Vimeo y convertirlos en artículos (v2.9.0)
- **Transcripción de audio**: Transcripción automática cuando los subtítulos no están disponibles (gpt-4o-transcribe)
- **Modo offline**: Caché de selectores — no se necesita IA para sitios repetidos
- **Estadísticas**: Rastrea cantidad de guardados, visualiza historial
- **Tabla de contenidos**: Generada automáticamente desde encabezados
- **Resumen**: Resumen de 2-3 párrafos escrito por IA
- **Menú contextual**: Clic derecho → "Guardar artículo como PDF"
- **Cancelar en cualquier momento**: Detén el procesamiento con un clic

### 🔒 Seguridad
- **Claves API encriptadas** con AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs, Qwen, Respeecher)
- **Claves nunca exportadas** — excluidas de la copia de seguridad de configuración
- **Todos los datos se almacenan localmente** — nada se envía a terceros

---

## ⚠️ Limitaciones Conocidas

### Formatos de Archivo
- **Formato WAV** (Qwen/Respeecher): Los archivos pueden ser muy grandes (10-50MB+ para artículos largos). Considere usar el formato MP3 para tamaños de archivo más pequeños.
- **Límites de caracteres**: 
  - Qwen TTS: 600 caracteres por segmento
  - Respeecher TTS: 450 caracteres por segmento
  - El texto se divide automáticamente de forma inteligente en los límites de oraciones/palabras

### Restricciones Técnicas
- **Requisito de keep-alive**: Chrome MV3 requiere un intervalo de keep-alive de al menos 1 minuto. Las tareas de procesamiento largas pueden tardar varios minutos.
- **CORS para imágenes**: Algunas imágenes pueden no cargarse si el sitio web bloquea las solicitudes cross-origin. La extensión omitirá estas imágenes.
- **Cancelación no instantánea**: La cancelación puede tardar unos segundos en detener completamente todos los procesos en segundo plano.

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

> **Consejo:** Gemini también habilita la función de traducción de texto en imágenes.

### Anthropic Claude

1. Ve a [console.anthropic.com](https://console.anthropic.com/)
2. Regístrate o inicia sesión
3. Navega a **API Keys**
4. Haz clic en **"Create Key"**
5. Copia la clave (comienza con `sk-ant-...`)
6. Agrega créditos en **Plans & Billing**

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
| **OpenAI** | Uso general, exportación de audio, transcripción de video | ✅ | ❌ |
| **Gemini** | Extracción rápida, traducción de imágenes, exportación de audio (30 voces) | ✅ | ✅ |
| **Claude** | Artículos largos, páginas complejas | ❌ | ❌ |
| **Grok** | Tareas de razonamiento rápido | ❌ | ❌ |
| **OpenRouter** | Acceso a múltiples modelos | ❌ | ❌ |
| **Qwen** | Exportación de audio (49 voces, soporte ruso) | ✅ | ❌ |
| **Respeecher** | Exportación de audio (idioma ucraniano) | ✅ | ❌ |

**Recomendación:** Comienza con OpenAI para todas las funciones (extracción + audio). Usa Respeecher para texto ucraniano.

---

## 🎯 Inicio rápido

1. Haz clic en el icono **ClipAIble** en la barra de herramientas
2. Ingresa tu clave API → **Guardar claves**
3. Navega a cualquier artículo
4. Haz clic en **Guardar como PDF** (o elige otro formato)
5. ¡Listo! El archivo se descarga automáticamente

**Consejo:** Clic derecho en cualquier lugar → **"Guardar artículo como PDF"**

---

## ⚙️ Configuración

### Modos de extracción

| Modo | Velocidad | Mejor para |
|------|-----------|------------|
| **AI Selector** | ⚡ Rápido | La mayoría de sitios, blogs, noticias |
| **AI Extract** | 🐢 Exhaustivo | Páginas complejas, Notion, SPAs |

### Modelos de IA

| Proveedor | Modelo | Notas |
|-----------|--------|-------|
| OpenAI | GPT-5.2 | Última, razonamiento medio |
| OpenAI | GPT-5.2-pro | Mejorada, razonamiento medio |
| OpenAI | GPT-5.1 | Equilibrado |
| OpenAI | GPT-5.1 (high) | Mejor calidad |
| Anthropic | Claude Sonnet 4.5 | Excelente para artículos largos |
| Google | Gemini 3 Pro | Rápido |
| Grok | Grok 4.1 Fast Reasoning | Razonamiento rápido |

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

---

## 📊 Estadísticas y caché

Haz clic en **📊 Estadísticas** para ver:
- Total de guardados, cantidad este mes
- Desglose por formato
- Historial reciente con enlaces
- Dominios en caché para modo offline

### Modo offline

ClipAIble almacena en caché los selectores generados por IA por dominio:
- **Segunda visita = instantáneo** — sin llamada API
- **Invalidación automática** — se limpia si la extracción falla
- **Control manual** — eliminar dominios individuales

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

---

## 🏗️ Arquitectura

```
clipaible/
├── manifest.json       # Configuración de extensión
├── popup/              # Interfaz (HTML, CSS, JS)
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI, Claude, Gemini, TTS
│   ├── extraction/     # Extracción de contenido
│   ├── translation/    # Traducción y detección de idioma
│   ├── generation/     # PDF, EPUB, FB2, MD, Audio
│   ├── cache/          # Caché de selectores
│   ├── stats/          # Estadísticas de uso
│   └── utils/          # Configuración, encriptación, utilidades
├── print/              # Renderizado PDF
├── config/             # Estilos
└── lib/                # JSZip
```

---

## 🔐 Seguridad y privacidad

- **Encriptación**: AES-256-GCM vía Web Crypto API
- **Derivación de clave**: PBKDF2, 100,000 iteraciones
- **Sin seguimiento**: Sin analíticas, sin registro remoto
- **Solo local**: Todos los datos permanecen en tu navegador

---

## 📋 Permisos

| Permiso | Por qué |
|---------|--------|
| `activeTab` | Leer artículo de la pestaña actual |
| `storage` | Guardar configuración localmente |
| `scripting` | Inyectar script de extracción |
| `downloads` | Guardar archivos generados (PDF, EPUB, FB2, Markdown, Audio) |
| `debugger` | Generar PDFs vía API de impresión de Chrome |
| `alarms` | Mantener worker en estado activo durante tareas largas |
| `contextMenus` | Agregar opciones "Guardar con ClipAIble" (PDF/EPUB/FB2/MD/Audio) al menú contextual en páginas web |

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


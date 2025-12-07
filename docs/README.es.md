# ✂️ ClipAIble

> **Extractor de artículos con IA** — Guarda cualquier artículo de la web como PDF, EPUB, FB2, Markdown o Audio. Traducción a 11 idiomas. Funciona en cualquier sitio web.

![Versión](https://img.shields.io/badge/versión-2.7.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extensión-green)
![Licencia](https://img.shields.io/badge/licencia-MIT-brightgreen)

---

## ✨ ¿Qué es ClipAIble?

ClipAIble utiliza inteligencia artificial para extraer inteligentemente el contenido de artículos de cualquier página web — elimina anuncios, navegación, popups y elementos innecesarios. Luego exporta a tu formato preferido:

- 📄 **PDF** — Diseño hermoso y personalizable
- 📚 **EPUB** — Compatible con Kindle, Kobo, Apple Books
- 📖 **FB2** — Compatible con PocketBook, FBReader
- 📝 **Markdown** — Texto plano para notas
- 🎧 **Audio (MP3)** — Escucha con narración de IA

¡Todos los formatos admiten **traducción a 11 idiomas** — incluso traducción de texto en imágenes!

---

## 🚀 Características

### 🤖 Extracción con IA
- **Dos modos**: AI Selector (rápido, reutilizable) y AI Extract (exhaustivo)
- **Varios proveedores**: OpenAI GPT, Google Gemini, Anthropic Claude
- **Detección inteligente**: Encuentra el contenido principal del artículo, elimina elementos innecesarios automáticamente
- **Preserva estructura**: Encabezados, imágenes, bloques de código, tablas, notas al pie

### 🎧 Exportación de audio
- **2 proveedores TTS**: OpenAI TTS y ElevenLabs
- **20+ voces**: 11 voces OpenAI + 9 voces ElevenLabs
- **Regulación de velocidad**: 0.5x a 2.0x
- **Pronunciación multilingüe**: Pronunciación correcta para cada idioma
- **Limpieza inteligente de texto**: La IA elimina URL, código y contenido no vocal

### 🌍 Traducción
- **11 idiomas**: EN, RU, UK, DE, FR, ES, IT, PT, ZH, JA, KO
- **Detección inteligente**: Omite la traducción si el artículo ya está en el idioma objetivo
- **Traducción de imágenes**: Traduce texto en imágenes (vía Gemini)
- **Metadatos localizados**: Fechas y etiquetas se adaptan al idioma

### 🎨 Personalización PDF
- **4 preajustes**: Oscuro, Claro, Sepia, Alto contraste
- **Colores personalizables**: Fondo, texto, encabezados, enlaces
- **11 fuentes** para elegir
- **Modos de página**: Página única continua o formato multi-página A4

### ⚡ Características inteligentes
- **Modo offline**: Caché de selectores — no se necesita IA para sitios repetidos
- **Estadísticas**: Rastrea cantidad de guardados, visualiza historial
- **Tabla de contenidos**: Generada automáticamente desde encabezados
- **Resumen**: Resumen de 2-3 párrafos escrito por IA
- **Menú contextual**: Clic derecho → "Guardar artículo como PDF"
- **Cancelar en cualquier momento**: Detén el procesamiento con un clic

### 🔒 Seguridad
- **Claves API encriptadas** con AES-256-GCM (OpenAI, Claude, Gemini, ElevenLabs)
- **Claves nunca exportadas** — excluidas de la copia de seguridad de configuración
- **Todos los datos se almacenan localmente** — nada se envía a terceros

---

## 📦 Instalación

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

### ¿Cuál elegir?

| Proveedor | Mejor para | Audio | Traducción de imágenes |
|-----------|------------|-------|------------------------|
| **OpenAI** | Uso general, exportación de audio | ✅ | ❌ |
| **Gemini** | Extracción rápida, traducción de imágenes | ❌ | ✅ |
| **Claude** | Artículos largos, páginas complejas | ❌ | ❌ |

**Recomendación:** Comienza con OpenAI para todas las funciones (extracción + audio).

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
| OpenAI | GPT-5.1 | Equilibrado |
| OpenAI | GPT-5.1 (high) | Mejor calidad |
| Anthropic | Claude Sonnet 4.5 | Excelente para artículos largos |
| Google | Gemini 3 Pro | Rápido |

### Voces de audio

| Voz | Estilo |
|-----|-------|
| nova | Femenina, cálida |
| alloy | Neutral |
| echo | Masculina |
| fable | Expresiva |
| onyx | Masculina, profunda |
| shimmer | Femenina, clara |
| coral | Femenina, amigable |
| sage | Neutral, calmada |
| ash | Masculina, autoritaria |
| ballad | Dramática |
| verse | Rítmica |

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
| `downloads` | Guardar archivos generados |
| `debugger` | Generar PDFs vía API de impresión de Chrome |
| `alarms` | Mantener worker en estado activo durante tareas largas |
| `contextMenus` | Menú contextual |

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


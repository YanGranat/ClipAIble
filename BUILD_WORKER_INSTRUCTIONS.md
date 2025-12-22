# Инструкция по сборке TTS Worker Bundle

## Проблема

Web Workers не поддерживают import maps, которые требуются для `piper-tts-web` (использует `import('onnxruntime-web')`).

## Решение

Использовать **esbuild** для создания self-contained bundle, который включает все зависимости и разрешает все импорты на этапе сборки.

## Шаги

### 1. Установить зависимости

```bash
npm install
```

Это установит `esbuild` и `nodemon` (если еще не установлены).

### 2. Собрать Worker Bundle

```bash
npm run build:worker
```

Это создаст `dist/tts-worker-bundle.js` - self-contained bundle, который включает:
- `onnxruntime-web` (все зависимости)
- `piper-tts-web` (все зависимости)
- Все импорты разрешены на этапе сборки

### 3. Проверить результат

После сборки проверьте:
- `dist/tts-worker-bundle.js` существует
- `tts-worker-bundle.js` скопирован в корень (для удобства)

### 4. Перезагрузить расширение

1. Откройте `chrome://extensions/`
2. Найдите ClipAIble
3. Нажмите кнопку перезагрузки

### 5. Протестировать

1. Откройте popup расширения
2. Выберите формат "Audio"
3. Выберите голос
4. Нажмите "Save"
5. Проверьте Chrome DevTools Performance:
   - INP должен быть < 200ms
   - WASM операции выполняются в Worker thread (не блокируют main thread)

## Структура файлов

```
src/
  └── tts-worker-entry.js    # Entry point для esbuild
dist/
  └── tts-worker-bundle.js   # Собранный bundle (создается esbuild)
build-tts-worker.js          # Build script
```

## Watch mode (для разработки)

```bash
npm run build:worker:watch
```

Это будет автоматически пересобирать bundle при изменении `src/tts-worker-entry.js`.

## Отладка

Если Worker не работает:

1. Проверьте консоль offscreen document:
   - `chrome://extensions/` → ClipAIble → "Inspect views: offscreen.html"
   - Ищите ошибки инициализации Worker

2. Проверьте, что bundle загружается:
   - В консоли offscreen должно быть: `[ClipAIble Offscreen] Loading worker from: chrome-extension://.../dist/tts-worker-bundle.js`

3. Проверьте, что Worker инициализируется:
   - Должно быть: `[ClipAIble Offscreen] ✅ TTS Worker Bundle initialized successfully`

4. Проверьте размер bundle:
   - `dist/tts-worker-bundle.js` должен быть достаточно большим (несколько MB)
   - Если файл маленький, возможно esbuild не включил все зависимости

## Ожидаемый результат

**До:** INP 2408ms → 3152ms (WASM блокирует main thread)
**После:** INP **< 200ms** ✅ (WASM выполняется в Worker thread)

## Примечания

- Bundle включает все зависимости, поэтому файл будет большим (несколько MB)
- Source maps включены для отладки (можно отключить в `build-tts-worker.js`)
- Minification отключена для отладки (можно включить в `build-tts-worker.js`)


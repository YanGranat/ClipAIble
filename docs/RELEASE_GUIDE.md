# Руководство по публикации версии в Chrome Web Store

## Подготовка к публикации версии 3.0.0

### ✅ Проверка перед публикацией

1. **Версия в manifest.json**: `3.0.0` ✓
2. **Версия в README**: `3.0.0` ✓
3. **Версия в коде**: Проверена ✓
4. **CHANGELOG.md**: Создан ✓

### 📦 Шаги для публикации

#### 1. Создание ZIP архива расширения

**Важно:** Не включайте в архив:
- `.git/` и другие служебные папки
- `node_modules/` (если есть)
- `docs/` (кроме privacy-policy.html если требуется)
- `memory-bank/`
- `doc/` (кроме необходимых файлов)
- `.cursorrules`
- `CHANGELOG.md` (опционально)
- `README.md` (опционально)
- Любые файлы с секретами/ключами

**Включите:**
- `manifest.json`
- `popup/`
- `scripts/`
- `print/`
- `config/`
- `lib/`
- `icons/`
- `docs/privacy-policy.html` (если требуется)

**Команда для создания ZIP (Windows):**

```powershell
# Перейти в корневую папку проекта
cd C:\ai_projects\ClipAIble

# Создать ZIP архив (PowerShell)
Compress-Archive -Path manifest.json,popup,scripts,print,config,lib,icons,docs\privacy-policy.html -DestinationPath ClipAIble-3.0.0.zip -Force
```

Или используйте 7-Zip/WinRAR для ручного создания архива.

#### 2. Загрузка в Chrome Web Store

1. Откройте [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Найдите ваше расширение ClipAIble
3. Нажмите **"Package"** или **"Upload new package"**
4. Загрузите созданный ZIP файл `ClipAIble-3.0.0.zip`

#### 3. Заполнение информации о версии

**Release Notes (Описание изменений):**

```
🎉 Version 3.0.0 - Major Update

✨ New Features:
• Video Support: Extract subtitles from YouTube/Vimeo videos and convert to articles
  - Direct subtitle extraction (no API keys required)
  - AI processing removes timestamps and merges paragraphs
  - Audio transcription fallback when subtitles unavailable
  - Full integration with translation, TOC, and all export formats

• Summary Generation: Generate detailed AI summaries of any article or video
  - Works with articles and YouTube/Vimeo videos
  - Continues generating in background even if popup is closed
  - Copy to clipboard or download as Markdown file
  - Expandable/collapsible display with formatted text

🔧 Improvements:
• Enhanced selector caching with independent settings
• Improved fallback strategies for reliable content extraction
• Better error handling and recovery mechanisms
• Performance optimizations for large articles and videos

🔒 Security & Quality:
• Comprehensive code review and improvements
• Enhanced encryption and key management
• Better modular architecture
• Updated documentation
```

**Что изменилось (What's new):**

```
Version 3.0.0 introduces major new features:

🎥 Video Support: Extract subtitles from YouTube/Vimeo videos and convert them to articles with full AI processing, translation, and export support.

📝 Summary Generation: Generate detailed AI summaries of any article or video. Works in background, supports copy/download, and formatted display.

⚡ Performance: Improved caching, better fallback strategies, and optimized processing for large content.

🔒 Quality: Comprehensive code review, enhanced security, and better architecture.
```

#### 4. Проверка перед отправкой

- [ ] ZIP архив создан и содержит только необходимые файлы
- [ ] Версия в manifest.json: `3.0.0`
- [ ] Release notes заполнены
- [ ] Privacy policy актуальна (если требуется обновление)
- [ ] Скриншоты актуальны (если изменился UI)
- [ ] Описание расширения актуально

#### 5. Отправка на проверку

1. Нажмите **"Submit for review"**
2. Выберите тип обновления: **"Minor update"** или **"Major update"** (для 3.0.0 это Major)
3. Подтвердите отправку

#### 6. Ожидание проверки

- Обычно проверка занимает **1-3 дня**
- Вы получите email уведомление о результате
- Проверьте статус в Developer Dashboard

### 📋 Дополнительные рекомендации

1. **Тестирование перед публикацией:**
   - Установите расширение из ZIP архива локально
   - Протестируйте основные функции
   - Проверьте работу на разных сайтах

2. **Версионирование:**
   - Следующая версия будет `3.0.1` (patch) или `3.1.0` (minor)
   - Major версия (`4.0.0`) для значительных изменений

3. **Откат (если нужно):**
   - В Developer Dashboard можно откатить к предыдущей версии
   - Или загрузить исправленную версию с патчем (`3.0.1`)

### 🔗 Полезные ссылки

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Extension Publishing Guide](https://developer.chrome.com/docs/webstore/publish/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

**Текущая версия в магазине:** 2.7.0 (commit: 08077e1e39f04c399453a86d3d32e8d1faaaa789)  
**Новая версия:** 3.0.0


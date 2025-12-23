# ✂️ ClipAIble

> **AI驱动的文章提取器** — 将网页上的任何文章保存为PDF、EPUB、FB2、Markdown或音频。支持11种语言翻译。适用于任何网站。

![版本](https://img.shields.io/badge/版本-3.2.4-blue)
![Chrome](https://img.shields.io/badge/Chrome-扩展-green)
![许可证](https://img.shields.io/badge/许可证-MIT-brightgreen)

**[⬇️ 从Chrome Web Store安装](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ 什么是 ClipAIble？

ClipAIble 使用人工智能智能地从任何网页提取文章内容 — 移除广告、导航、弹窗和多余元素。然后导出为您喜欢的格式：

- 📄 **PDF** — 美观的样式，支持自定义
- 📚 **EPUB** — 适用于 Kindle、Kobo、Apple Books
- 📖 **FB2** — 适用于 PocketBook、FBReader
- 📝 **Markdown** — 纯文本格式，适合笔记
- 🎧 **音频** — 使用AI语音朗读

所有格式都支持**翻译为11种语言** — 甚至翻译图像上的文字！

---

## 🚀 功能

### 🤖 AI驱动的提取
- **三种模式**：自动（无AI，快速）、AI Selector（快速、可重用）和 AI Extract（彻底）
- **自动模式**：无需AI创建文档 — 无需API密钥，即时提取
- **支持多个提供商**：OpenAI GPT（GPT-5.2、GPT-5.2-high、GPT-5.1）、Google Gemini、Anthropic Claude、Grok、OpenRouter
- **视频支持**：从YouTube/Vimeo视频提取字幕并转换为文章（v3.0.0）
  - 多种提取方法，带后备方案
  - 优先级：手动字幕 > 自动生成 > 翻译
  - AI处理：移除时间戳，合并段落，修正错误
  - 字幕不可用时的音频转录后备方案
- **智能检测**：找到文章主要内容，自动删除无关内容
- **增强的后备策略**：6种不同策略，确保可靠的内容提取
- **保留结构**：标题、图片、代码块、表格、脚注
- **选择器缓存**：使用和启用缓存的独立设置

### 🎧 音频导出
- **5个TTS提供商**：OpenAI TTS、ElevenLabs、Google Gemini 2.5 TTS、Qwen3-TTS-Flash、Respeecher
- **100+种语音**：11种OpenAI + 9种ElevenLabs + 30种Google Gemini + 49种Qwen + 14种Respeecher（英语和乌克兰语）
- **速度调节**：0.5x 至 2.0x（仅OpenAI/ElevenLabs；Google/Qwen/Respeecher使用固定速度）
- **格式支持**：MP3（OpenAI/ElevenLabs）或 WAV（Google/Qwen/Respeecher）
- **多语言发音**：每种语言正确的发音
- **乌克兰语支持**：通过Respeecher提供专用乌克兰语音（10种语音）
- **智能文本清理**：AI移除URL、代码和非语音内容
- **提供商特定功能**：
  - **ElevenLabs**：模型选择（v2、v3、Turbo v2.5）、格式选择、高级语音设置
  - **Google Gemini 2.5 TTS**：模型选择（pro/flash）、30种语音、24k字符限制
  - **Qwen**：49种语音，包括俄语语音（Alek），600字符限制
  - **Respeecher**：高级采样参数（temperature、repetition_penalty、top_p）

### 🌍 翻译
- **11种语言**：EN、RU、UA、DE、FR、ES、IT、PT、ZH、JA、KO
- **智能检测**：如果文章已经是目标语言则跳过翻译
- **图像翻译**：翻译图像上的文字（通过Gemini）
- **本地化元数据**：日期和标签适应所选语言

### 🎨 PDF自定义
- **4种预设**：深色、浅色、棕褐色、高对比度
- **可自定义颜色**：背景、文本、标题、链接
- **11种字体**：默认（Segoe UI）、Arial、Georgia、Times New Roman、Verdana、Tahoma、Trebuchet MS、Palatino Linotype、Garamond、Courier New、Comic Sans MS
- **字体大小**：可调整（默认：31px）
- **页面模式**：单页连续或多页A4格式


### ⚡ 智能功能
- **视频支持**：从YouTube/Vimeo视频提取字幕并转换为文章（v3.0.0）
  - 直接提取字幕（不需要YouTube/Vimeo的API密钥）
  - AI处理：移除时间戳，合并段落，修正错误
  - 完整的管道集成：翻译、目录、摘要、所有导出格式
- **摘要生成**：生成任何文章或视频的详细AI摘要
  - 点击**"生成摘要"**按钮创建完整摘要
  - 适用于普通文章和YouTube/Vimeo视频
  - 即使弹出窗口关闭也继续生成（在后台运行）
  - 复制到剪贴板或下载为Markdown文件
  - 可展开/折叠显示，带格式化文本
  - 详细摘要，包含关键思想、概念、示例和结论
- **摘要（TL;DR）**：AI编写的2-4句简短摘要，包含在文档中
  - 可选功能：在设置中启用，为PDF/EPUB/FB2/Markdown添加简短摘要
  - 出现在导出文档的开头
  - 与详细摘要不同（这是简要概述）
- **离线模式**：缓存选择器 — 重复访问网站时无需AI
  - 独立设置：使用缓存的选择器和启用缓存分别设置
  - 提取失败时自动失效
  - 按域名手动管理缓存
- **统计**：跟踪保存数量，查看历史记录
- **目录**：从标题自动生成
- **上下文菜单**：右键 → "将文章保存为PDF/EPUB/FB2/Markdown/音频"
- **随时取消**：一键停止处理
- **设置导入/导出**：备份和恢复所有设置（API密钥出于安全考虑被排除）

### 🔒 安全性
- **API密钥加密**使用AES-256-GCM（OpenAI、Claude、Gemini、ElevenLabs、Qwen、Respeecher）
- **密钥永不导出** — 从设置备份中排除
- **所有数据本地存储** — 不向第三方发送任何内容

---

## ⚠️ 已知限制

### 文件格式
- **WAV格式**（Google/Qwen/Respeecher）：文件可能非常大（长文章为10-50MB+）。MP3格式（OpenAI/ElevenLabs）提供更小的文件大小。
- **每个请求的字符限制**： 
  - OpenAI TTS：4096个字符
  - ElevenLabs：5000个字符
  - Google Gemini 2.5 TTS：24000个字符
  - Qwen TTS：600个字符
  - Respeecher TTS：450个字符
  - 文本会在句子/单词边界处智能自动分割

### 技术约束
- **Keep-alive要求**：Chrome MV3要求keep-alive间隔至少1分钟。长时间处理任务可能需要几分钟。扩展使用统一的keep-alive机制（每1分钟警报 + 每2秒保存状态）以防止service worker停止。
- **图像的CORS**：如果网站阻止跨域请求，某些图像可能无法加载。扩展将跳过这些图像。
- **取消不是即时的**：取消可能需要几秒钟才能完全停止所有后台进程。
- **Service Worker恢复**：操作在service worker重启后自动恢复（2小时内）。

### 浏览器兼容性
- **Chrome/Edge/Brave/Arc**：完全支持
- **Firefox**：不支持（使用不同的扩展API）
- **Safari**：不支持（使用不同的扩展API）

---

## 📦 安装

### 选项1：从Chrome Web Store安装（推荐）

**[⬇️ 从Chrome Web Store安装ClipAIble](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### 选项2：手动安装（开发者模式）

1. **克隆**此仓库
2. 打开 Chrome → `chrome://extensions/`
3. 启用**开发者模式**
4. 点击**加载已解压的扩展程序** → 选择文件夹

### 要求

- Chrome、Edge、Brave 或 Arc 浏览器
- 至少一个提供商的API密钥（见下文）

---

## 🔑 获取API密钥

### OpenAI（GPT模型 + 音频）

1. 访问 [platform.openai.com](https://platform.openai.com/)
2. 注册或登录
3. 导航至**API Keys**（左侧菜单）或直接访问 [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. 点击**"Create new secret key"**
5. 复制密钥（以 `sk-...` 开头）
6. 在**Settings → Billing**中添加付款方式（使用API需要）

> **注意：** OpenAI密钥是音频导出（TTS）所必需的。其他格式可与任何提供商一起使用。

### Google Gemini

1. 访问 [Google AI Studio](https://aistudio.google.com/)
2. 使用Google账户登录
3. 点击**"Get API key"**或直接访问 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. 点击**"Create API key"**
5. 复制密钥（以 `AIza...` 开头）

> **提示：** Gemini还启用图像文本翻译功能和Google Gemini 2.5 TTS（30种语音）。对于TTS，您可以使用相同的Gemini API密钥或设置专用的Google TTS API密钥。需要在Google Cloud Console中启用Generative Language API。

### Anthropic Claude

1. 访问 [console.anthropic.com](https://console.anthropic.com/)
2. 注册或登录
3. 导航至**API Keys**
4. 点击**"Create Key"**
5. 复制密钥（以 `sk-ant-...` 开头）
6. 在**Plans & Billing**中添加积分

### ElevenLabs（音频）

1. 访问 [ElevenLabs](https://elevenlabs.io/)
2. 注册或登录
3. 导航至**Profile** → **API Keys**
4. 创建API密钥
5. 复制密钥

> **注意：** ElevenLabs提供9种高级语音，具有高质量TTS。支持速度调节（0.25-4.0x）和格式选择（MP3高质量默认：mp3_44100_192）。模型：Multilingual v2、v3（默认）、Turbo v2.5。提供高级语音设置（stability、similarity、style、speaker boost）。

### Google Gemini 2.5 TTS（音频）

1. 访问 [Google AI Studio](https://aistudio.google.com/)
2. 使用Google账户登录
3. 点击**"Get API key"**或直接访问 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. 点击**"Create API key"**
5. 复制密钥（以 `AIza...` 开头）
6. 在 [Google Cloud Console](https://console.cloud.google.com/) 中启用**Generative Language API**
7. （可选）如果您的模型需要，请启用计费

> **注意：** Google Gemini 2.5 TTS提供30种语音。您可以使用相同的Gemini API密钥或设置专用的Google TTS API密钥。固定WAV格式，24kHz。模型：`gemini-2.5-pro-preview-tts`（主要）或 `gemini-2.5-flash-preview-tts`（更快）。

### Qwen3-TTS-Flash（音频）

1. 访问 [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)
2. 注册或登录
3. 导航至**API Keys**或**Model Studio**
4. 创建API密钥
5. 复制密钥（以 `sk-...` 开头）

> **注意：** Qwen3-TTS-Flash提供49种语音，包括专用俄语语音（Alek）。固定WAV格式，24kHz。

### Respeecher（音频 - 英语和乌克兰语）

1. 访问 [Respeecher Space](https://space.respeecher.com/)
2. 注册或登录
3. 导航至**API Keys**
4. 创建API密钥
5. 复制密钥

> **注意：** Respeecher支持英语和乌克兰语，提供专用乌克兰语音。固定WAV格式，22.05kHz。

### 选择哪个？

| 提供商 | 最适合 | 音频 | 图像翻译 |
|--------|--------|------|----------|
| **OpenAI** | 通用用途、音频导出、视频转录 | ✅ (11种语音) | ❌ |
| **Gemini** | 快速提取、图像翻译、音频导出（30种语音） | ✅ (30种语音) | ✅ |
| **Claude** | 长文章、复杂页面 | ❌ | ❌ |
| **Grok** | 快速推理任务 | ❌ | ❌ |
| **OpenRouter** | 访问多个模型 | ❌ | ❌ |
| **ElevenLabs** | 音频导出（9种语音，高质量） | ✅ (9种语音) | ❌ |
| **Qwen** | 音频导出（49种语音，支持俄语） | ✅ (49种语音) | ❌ |
| **Respeecher** | 音频导出（乌克兰语） | ✅ (14种语音) | ❌ |

**推荐：** 
- **用于提取**：从OpenAI或Gemini开始（快速可靠）
- **用于音频**：OpenAI用于一般用途，ElevenLabs用于高质量，Google Gemini 2.5 TTS用于30种语音，Qwen用于俄语，Respeecher用于乌克兰语
- **用于图像翻译**：需要Gemini API密钥

---

## 🎯 快速开始

1. 点击工具栏中的**ClipAIble**图标
2. 输入您的API密钥 → **保存密钥**
3. 导航至任何文章
4. 点击**另存为PDF**（或选择其他格式）
5. 完成！文件自动下载

**提示：**
- 右键点击任意位置 → **"将文章保存为PDF"**
- 点击**"生成摘要"**创建详细的AI摘要（即使弹出窗口关闭也能工作）
- 在设置中启用**"生成TL;DR"**为文档添加简短摘要

---

## ⚙️ 设置

### 界面

- **主题**：在标题栏选择深色、浅色或自动（跟随系统）
- **语言**：在标题栏选择界面语言（11种语言）
- **自定义模型**：通过模型选择器旁边的"+"按钮添加您自己的AI模型

### 提取模式

| 模式 | 速度 | 最适合 |
|------|------|--------|
| **自动** | ⚡⚡ 即时 | 简单文章，无需API密钥 |
| **AI Selector** | ⚡ 快速 | 大多数网站、博客、新闻 |
| **AI Extract** | 🐢 彻底 | 复杂页面、Notion、SPA |

### AI模型

| 提供商 | 模型 | 备注 |
|--------|------|------|
| OpenAI | GPT-5.2 | 最新，中等推理（默认） |
| OpenAI | GPT-5.2-high | 增强，高推理 |
| OpenAI | GPT-5.1 | 平衡 |
| OpenAI | GPT-5.1 (high) | 最佳质量，高推理 |
| Anthropic | Claude Sonnet 4.5 | 适合长文章 |
| Google | Gemini 3 Pro | 快速提取，图像翻译 |
| Grok | Grok 4.1 Fast Reasoning | 快速推理 |
| OpenRouter | 各种模型 | 访问多个提供商 |

**自定义模型：** 点击模型选择器旁边的**"+"**按钮添加自定义模型（例如，`gpt-4o`、`claude-opus-4.5`）。自定义模型出现在下拉菜单中，可以根据需要隐藏/显示。

### 音频语音

**OpenAI（11种语音）：** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs（9种语音）：** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS（30种语音）：** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash（49种语音）：** 包括 Elias（默认）、Alek（俄语）以及10种语言的语音

**Respeecher（14种语音）：** 4种英语（Samantha, Neve, Gregory, Vincent）+ 10种乌克兰语音

### 样式预设（PDF）

| 预设 | 背景 | 文本 |
|------|------|------|
| 深色 | `#303030` | `#b9b9b9` |
| 浅色 | `#f8f9fa` | `#343a40` |
| 棕褐色 | `#faf4e8` | `#5d4e37` |
| 高对比度 | `#000000` | `#ffffff` |

**自定义颜色：** 使用颜色选择器自定义背景、文本、标题和链接。每个颜色都有单独的重置按钮（↺），或**"全部重置为默认"**以恢复所有样式。

---

## 📊 统计和缓存

点击**📊 统计**查看：
- 总保存次数，本月计数
- 按格式分类（PDF、EPUB、FB2、Markdown、音频）
- 最近历史记录，包含指向原始文章的链接（最近50次保存）
  - 点击链接打开原始文章
  - 点击✕按钮删除单个历史记录条目
  - 显示格式、域名、处理时间和日期
- 离线模式的缓存域名
- **启用/禁用统计**：统计收集的开关
- **清除统计**：重置所有统计的按钮
- **清除缓存**：删除所有缓存选择器的按钮
- 从缓存中删除单个域名

## 📝 摘要生成

生成任何文章或视频的详细AI摘要：

1. 导航至任何文章或YouTube/Vimeo视频
2. 在弹出窗口中点击**"生成摘要"**按钮
3. 摘要在后台生成（您可以关闭弹出窗口）
4. 准备就绪后，摘要出现，带有选项：
   - **复制**到剪贴板
   - **下载**为Markdown文件
   - **展开/折叠**查看完整文本
   - **关闭**隐藏摘要

**功能：**
- 适用于文章和YouTube/Vimeo视频
- 即使弹出窗口关闭也继续生成
- 详细摘要，包含关键思想、概念、示例和结论
- 格式化文本，包含标题、列表和链接
- 自动保存 — 持续存在直到您关闭它

**注意：** 摘要生成与文档导出分开。使用它快速理解内容，而无需保存完整文档。

### 离线模式

ClipAIble按域名缓存AI生成的选择器：
- **第二次访问 = 即时** — 无需API调用
- **自动失效** — 提取失败时清除
- **手动控制** — 删除单个域名
- **独立设置**：
  - **使用缓存的选择器**：如果缓存存在，跳过页面分析（更快）
  - **启用缓存**：提取后将新选择器保存到缓存
  - 两个设置独立工作，实现灵活控制

---

## 💾 导入/导出设置

**⚙️ 设置** → **导入/导出**

- 导出所有设置（API密钥为安全起见已排除）
- 可选：包含统计和缓存
- 导入时选择合并或覆盖选项

---

## 🔧 故障排除

| 问题 | 解决方案 |
|------|----------|
| 内容为空 | 尝试**AI Extract**模式 |
| 无效的API密钥 | 检查密钥格式（sk-...、AIza...、sk-ant-...） |
| 缺少图片 | 某些网站阻止跨域；小图片被过滤 |
| 音频缓慢 | 长文章分成块；观察进度条 |
| 摘要未生成 | 检查API密钥，确保页面内容已加载，重试 |
| 摘要生成超时 | 非常长的文章可能需要45分钟；等待或尝试较短的内容 |

---

## 🏗️ 架构

```
clipaible/
├── manifest.json       # 扩展配置
├── popup/              # 界面（HTML、CSS、JS）
│   ├── popup.js       # 主要编排（2841行）
│   ├── core.js        # 业务逻辑（203行）
│   ├── handlers.js    # 事件处理器（1991行）
│   ├── ui.js          # 界面管理
│   ├── stats.js       # 统计显示
│   └── settings.js    # 设置管理
├── scripts/
│   ├── background.js   # Service worker (2525行，从3705减少)
│   ├── content.js      # YouTube内容脚本
│   ├── locales.js      # UI本地化（11种语言）
│   ├── message-handlers/ # 消息处理器模块（v3.2.1+）
│   │   ├── index.js    # 消息路由器
│   │   ├── utils.js    # 处理器工具
│   │   ├── simple.js   # 简单处理器
│   │   ├── stats.js    # 统计处理器
│   │   ├── cache.js    # 缓存处理器
│   │   ├── settings.js # 设置处理器
│   │   ├── processing.js # 处理处理器
│   │   ├── video.js    # 视频/字幕处理器
│   │   ├── summary.js  # 摘要生成助手
│   │   └── complex.js  # 复杂处理器
│   ├── api/            # AI和TTS提供商
│   │   ├── openai.js   # OpenAI（GPT模型）
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # TTS路由器
│   │   └── index.js    # API路由器
│   ├── extraction/     # 内容提取
│   │   ├── prompts.js  # AI提示
│   │   ├── html-utils.js # HTML工具
│   │   ├── video-subtitles.js # YouTube/Vimeo字幕提取
│   │   └── video-processor.js # AI字幕处理
│   ├── translation/    # 翻译和语言检测
│   ├── generation/     # PDF、EPUB、FB2、MD、音频
│   ├── cache/          # 选择器缓存
│   ├── stats/          # 使用统计
│   ├── settings/       # 设置导入/导出
│   ├── state/          # 处理状态管理
│   └── utils/          # 配置、加密、工具
│       ├── video.js    # 视频平台检测
│       ├── validation.js # 验证工具
│       └── api-error-handler.js # 通用API错误处理
├── print/              # PDF渲染
├── config/             # 样式
├── lib/                # JSZip
├── docs/               # 本地化README文件
└── memory-bank/        # 项目文档
```

---

## 🔐 安全和隐私

- **加密**：通过Web Crypto API使用AES-256-GCM
- **密钥派生**：PBKDF2，100,000次迭代
- **无跟踪**：无分析、无远程日志记录
- **仅本地**：所有数据保留在您的浏览器中

---

## 📋 权限

ClipAIble需要以下权限才能正常工作。所有权限仅用于所述目的：

| 权限 | 原因 |
|------|------|
| `activeTab` | 当您点击扩展图标或使用上下文菜单时，读取当前页面以提取内容。扩展仅访问您当前正在查看的标签页。 |
| `storage` | 在浏览器中本地保存您的设置（API密钥、样式偏好、语言选择）和统计信息。您的数据永远不会离开您的设备。 |
| `scripting` | 将内容提取脚本注入到网页中。此脚本从页面DOM中查找并提取文章内容（文本、图像、标题）。 |
| `downloads` | 将生成的文件（PDF、EPUB、FB2、Markdown、音频）保存到您的计算机。没有此权限，扩展无法下载文件。 |
| `debugger` | **仅用于PDF生成** — 使用Chrome的内置print-to-PDF功能生成具有适当页面布局和样式的高质量PDF。调试器仅在PDF生成期间附加，完成后立即分离。这是在Chrome扩展中生成具有自定义样式的PDF的唯一方法。 |
| `alarms` | 在长时间操作（大文章、翻译）期间保持后台service worker处于活动状态。Chrome Manifest V3会在30秒后暂停service worker，但文章处理可能需要几分钟。使用统一的keep-alive机制（每1分钟警报 + 每2秒保存状态）根据MV3规则。 |
| `contextMenus` | 在网页上的右键上下文菜单中添加"使用ClipAIble保存"选项（PDF/EPUB/FB2/MD/音频）。 |
| `notifications` | 使用上下文菜单"保存"功能时显示桌面通知。如果有错误（例如，缺少API密钥），会通知您。 |
| `unlimitedStorage` | 本地存储选择器缓存和临时打印数据。这可以在不再次调用AI的情况下实现更快的重复提取（离线模式）。 |

### 主机权限

| 权限 | 原因 |
|------|------|
| `<all_urls>` | 从您访问的任何网站提取内容。扩展需要：1) 读取页面HTML以查找文章内容，2) 下载嵌入在文章中的图像，3) 向AI/TTS提供商（OpenAI、Google、Anthropic、ElevenLabs、Qwen、Respeecher）发出API调用。扩展仅访问您明确保存的页面 — 它不会自行浏览网络。 |

**安全说明：** 所有API密钥均使用AES-256-GCM加密，仅本地存储。密钥永远不会导出或传输到任何服务器，除了您配置的AI提供商。

详见 [PERMISSIONS.md](PERMISSIONS.md)。

---

## 🤝 贡献

1. Fork仓库
2. 创建功能分支：`git checkout -b feature/cool-thing`
3. 提交：`git commit -m 'Add cool thing'`
4. 推送：`git push origin feature/cool-thing`
5. 打开Pull Request

---

## 📜 许可证

MIT License — 参见 [LICENSE](LICENSE)

---

<p align="center">
  <b>ClipAIble</b> — 保存。阅读。聆听。随时随地。
</p>


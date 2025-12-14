# ✂️ ClipAIble

> **AI驱动的文章提取器** — 将网页上的任何文章保存为PDF、EPUB、FB2、Markdown、DOCX、HTML、TXT或音频。支持11种语言翻译。适用于任何网站。

![版本](https://img.shields.io/badge/版本-2.9.0-blue)
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
- 📘 **DOCX** — Microsoft Word格式，包含图像和格式
- 🌐 **HTML** — 干净的HTML文件，保留样式
- 📄 **TXT** — 纯文本格式，无格式
- 🎧 **音频 (MP3/WAV)** — 使用AI语音朗读

所有格式都支持**翻译为11种语言** — 甚至翻译图像上的文字！

---

## 🚀 功能

### 🤖 AI驱动的提取
- **两种模式**：AI Selector（快速、可重用）和 AI Extract（彻底）
- **支持多个提供商**：OpenAI GPT（GPT-5.2、GPT-5.2-pro、GPT-5.1）、Google Gemini、Anthropic Claude、Grok、OpenRouter
- **视频支持**：从YouTube/Vimeo视频提取字幕并转换为文章（v2.9.0）
- **智能检测**：找到文章主要内容，自动删除无关内容
- **保留结构**：标题、图片、代码块、表格、脚注

### 🎧 音频导出
- **5个TTS提供商**：OpenAI TTS、ElevenLabs、Google Gemini 2.5 TTS、Qwen3-TTS-Flash、Respeecher
- **100+种语音**：11种OpenAI + 9种ElevenLabs + 30种Google Gemini + 49种Qwen + 14种Respeecher（英语和乌克兰语）
- **速度调节**：0.5x 至 2.0x（仅OpenAI/ElevenLabs）
- **乌克兰语支持**：通过Respeecher提供专用乌克兰语音
- **多语言发音**：每种语言正确的发音
- **智能文本清理**：AI移除URL、代码和非语音内容

### 🌍 翻译
- **11种语言**：EN、RU、UA、DE、FR、ES、IT、PT、ZH、JA、KO
- **智能检测**：如果文章已经是目标语言则跳过翻译
- **图像翻译**：翻译图像上的文字（通过Gemini）
- **本地化元数据**：日期和标签适应所选语言

### 🎨 PDF自定义
- **4种预设**：深色、浅色、棕褐色、高对比度
- **可自定义颜色**：背景、文本、标题、链接
- **11种字体**可供选择
- **页面模式**：单页连续或多页A4格式

### 📄 文档格式
- **DOCX**：Microsoft Word格式，包含嵌入图像和保留的格式
- **HTML**：干净、独立的HTML文件，包含嵌入的样式和图像
- **TXT**：纯文本格式，无格式，非常适合简单文本提取

### ⚡ 智能功能
- **视频支持**：从YouTube/Vimeo视频提取字幕并转换为文章（v2.9.0）
- **音频转录**：当字幕不可用时自动转录（gpt-4o-transcribe）
- **离线模式**：缓存选择器 — 重复访问网站时无需AI
- **统计**：跟踪保存数量，查看历史记录
- **目录**：从标题自动生成
- **摘要**：AI编写的2-3段摘要
- **上下文菜单**：右键 → "将文章保存为PDF"
- **随时取消**：一键停止处理

### 🔒 安全性
- **API密钥加密**使用AES-256-GCM（OpenAI、Claude、Gemini、ElevenLabs、Qwen、Respeecher）
- **密钥永不导出** — 从设置备份中排除
- **所有数据本地存储** — 不向第三方发送任何内容

---

## ⚠️ 已知限制

### 文件格式
- **WAV格式**（Qwen/Respeecher）：文件可能非常大（长文章为10-50MB+）。考虑使用MP3格式以获得更小的文件大小。
- **字符限制**： 
  - Qwen TTS：每个片段600个字符
  - Respeecher TTS：每个片段450个字符
  - 文本会在句子/单词边界处智能自动分割

### 技术约束
- **Keep-alive要求**：Chrome MV3要求keep-alive间隔至少1分钟。长时间处理任务可能需要几分钟。
- **图像的CORS**：如果网站阻止跨域请求，某些图像可能无法加载。扩展将跳过这些图像。
- **取消不是即时的**：取消可能需要几秒钟才能完全停止所有后台进程。
- **大型HTML**：具有非常大的HTML（>500KB）的页面可能需要更长时间处理。

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

> **提示：** Gemini还启用图像文本翻译功能。

### Anthropic Claude

1. 访问 [console.anthropic.com](https://console.anthropic.com/)
2. 注册或登录
3. 导航至**API Keys**
4. 点击**"Create Key"**
5. 复制密钥（以 `sk-ant-...` 开头）
6. 在**Plans & Billing**中添加积分

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
| **OpenAI** | 通用用途、音频导出、视频转录 | ✅ | ❌ |
| **Gemini** | 快速提取、图像翻译、音频导出（30种语音） | ✅ | ✅ |
| **Claude** | 长文章、复杂页面 | ❌ | ❌ |
| **Grok** | 快速推理任务 | ❌ | ❌ |
| **OpenRouter** | 访问多个模型 | ❌ | ❌ |
| **Qwen** | 音频导出（49种语音，支持俄语） | ✅ | ❌ |
| **Respeecher** | 音频导出（乌克兰语） | ✅ | ❌ |

**推荐：** 从OpenAI开始以获取全部功能（提取 + 音频）。使用Respeecher处理乌克兰语文本。

---

## 🎯 快速开始

1. 点击工具栏中的**ClipAIble**图标
2. 输入您的API密钥 → **保存密钥**
3. 导航至任何文章
4. 点击**另存为PDF**（或选择其他格式）
5. 完成！文件自动下载

**提示：** 右键点击任意位置 → **"将文章保存为PDF"**

---

## ⚙️ 设置

### 提取模式

| 模式 | 速度 | 最适合 |
|------|------|--------|
| **AI Selector** | ⚡ 快速 | 大多数网站、博客、新闻 |
| **AI Extract** | 🐢 彻底 | 复杂页面、Notion、SPA |

### AI模型

| 提供商 | 模型 | 备注 |
|--------|------|------|
| OpenAI | GPT-5.2 | 最新，中等推理 |
| OpenAI | GPT-5.2-pro | 增强，中等推理 |
| OpenAI | GPT-5.1 | 平衡 |
| OpenAI | GPT-5.1 (high) | 最佳质量 |
| Anthropic | Claude Sonnet 4.5 | 适合长文章 |
| Google | Gemini 3 Pro | 快速 |
| Grok | Grok 4.1 Fast Reasoning | 快速推理 |

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

---

## 📊 统计和缓存

点击**📊 统计**查看：
- 总保存次数，本月计数
- 按格式分类
- 最近历史记录（含链接）
- 离线模式的缓存域名

### 离线模式

ClipAIble按域名缓存AI生成的选择器：
- **第二次访问 = 即时** — 无需API调用
- **自动失效** — 提取失败时清除
- **手动控制** — 删除单个域名

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

---

## 🏗️ 架构

```
clipaible/
├── manifest.json       # 扩展配置
├── popup/              # 界面（HTML、CSS、JS）
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI、Claude、Gemini、TTS
│   ├── extraction/     # 内容提取
│   ├── translation/    # 翻译和语言检测
│   ├── generation/     # PDF、EPUB、FB2、MD、DOCX、HTML、TXT、音频
│   ├── cache/          # 选择器缓存
│   ├── stats/          # 使用统计
│   └── utils/          # 配置、加密、工具
├── print/              # PDF渲染
├── config/             # 样式
└── lib/                # JSZip
```

---

## 🔐 安全和隐私

- **加密**：通过Web Crypto API使用AES-256-GCM
- **密钥派生**：PBKDF2，100,000次迭代
- **无跟踪**：无分析、无远程日志记录
- **仅本地**：所有数据保留在您的浏览器中

---

## 📋 权限

| 权限 | 原因 |
|------|------|
| `activeTab` | 从当前标签页读取文章 |
| `storage` | 本地保存设置 |
| `scripting` | 注入提取脚本 |
| `downloads` | 保存生成的文件（PDF、EPUB、FB2、Markdown、DOCX、HTML、TXT、音频） |
| `debugger` | 通过Chrome打印API生成PDF |
| `alarms` | 在长时间任务期间保持worker处于活动状态 |
| `contextMenus` | 在网页的右键菜单中添加"使用ClipAIble保存"选项（PDF/EPUB/FB2/MD/DOCX/HTML/TXT/音频） |

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


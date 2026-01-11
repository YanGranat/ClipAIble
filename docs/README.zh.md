# ✂️ ClipAIble

> **AI驱动的文章提取器** — 将网页上的任何文章保存为PDF、EPUB、FB2、Markdown或音频。支持11种语言翻译。适用于任何网站。

![版本](https://img.shields.io/badge/版本-3.3.0-blue)
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
- **两种模式**：自动（无AI，快速）、AI Selector（快速、可重用）
- **自动模式**：无需AI创建文档 — 无需API密钥，即时提取
- **支持多个提供商**：OpenAI GPT（GPT-5.2、GPT-5.2-high、GPT-5.1）、Google Gemini、Anthropic Claude、Grok、DeepSeek、OpenRouter
- **PDF内容提取**（v3.3.0）：使用PDF.js库从PDF文件中提取内容
  - 具有复杂多级分类系统的实验性功能
  - 从PDF文件中提取文本、图像、结构和元数据
  - 支持Web和本地PDF文件
  - 处理多列布局、表格、标题、列表、跨页合并
  - 注意：该功能是实验性的，对于复杂PDF可能有局限性（扫描的PDF、受密码保护的PDF）
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
- **速度调节**：0.25x 至 4.0x（仅OpenAI/ElevenLabs；Google/Qwen/Respeecher使用固定速度）
- **格式支持**：MP3（OpenAI/ElevenLabs）或 WAV（Google/Qwen/Respeecher）
- **多语言发音**：每种语言正确的发音
- **乌克兰语支持**：通过Respeecher提供专用乌克兰语音
- **智能文本清理**：AI移除URL、代码和非语音内容
- **提供商特定功能**：
  - **ElevenLabs**：模型选择、格式选择、高级语音设置
  - **Google Gemini 2.5 TTS**：多种语音可用
  - **Qwen**：包括俄语语音（Alek）
  - **Respeecher**：高级采样参数

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
- **PDF内容提取**（v3.3.0）：从PDF文件中提取内容并转换为文章
  - 使用PDF.js库在offscreen文档中解析
  - 多级分类系统，实现精确提取
  - 支持Web和本地PDF文件
  - 完整的管道集成：翻译、目录、摘要、所有导出格式
  - 注意：实验性功能，对于复杂PDF可能有局限性
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
- **API密钥加密**（OpenAI、Claude、Gemini、Grok、DeepSeek、OpenRouter、ElevenLabs、Qwen、Respeecher）
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
- **Keep-alive要求**：Chrome MV3要求keep-alive间隔至少1分钟。长时间处理任务可能需要几分钟。扩展使用统一的keep-alive机制（每1分钟警报）以防止service worker停止。
- **图像的CORS**：如果网站阻止跨域请求，某些图像可能无法加载。扩展将跳过这些图像。
- **取消不是即时的**：取消可能需要几秒钟才能完全停止所有后台进程。
- **Service Worker恢复**：如果状态是最近的（< 1分钟），操作在service worker重启后自动恢复。扩展重新加载总是重置状态。
- **PDF提取限制**（v3.3.0）： 
  - 扫描的PDF（无文本层）不支持 — OCR尚不可用
  - 受密码保护的PDF必须在提取前解锁
  - 非常大的PDF（>100MB）可能由于内存限制而无法工作
  - 复杂布局（多列、表格）会被提取，但可能需要手动验证

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

### DeepSeek

1. 访问 [platform.deepseek.com](https://platform.deepseek.com/)
2. 注册或登录
3. 导航至**API Keys**或访问 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
4. 点击**"Create API key"**
5. 复制密钥（以 `sk-...` 开头）

> **注意：** DeepSeek提供DeepSeek-V3.2模型：`deepseek-chat`（非思考模式）和`deepseek-reasoner`（思考模式）。API与OpenAI格式兼容。

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
| **DeepSeek** | 高级推理、经济实惠 | ❌ | ❌ |
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

### 样式预设（PDF）

| 预设 | 描述 |
|------|------|
| 深色 | 深色背景，浅色文本 |
| 浅色 | 浅色背景，深色文本 |
| 棕褐色 | 柔和的棕褐色主题 |
| 高对比度 | 最大对比度以提高可读性 |

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
| 内容为空 | 尝试**AI Selector**模式 |
| 无效的API密钥 | 检查密钥格式（sk-...、AIza...、sk-ant-...） |
| 缺少图片 | 某些网站阻止跨域；小图片被过滤 |
| 音频缓慢 | 长文章分成块；观察进度条 |
| 摘要未生成 | 检查API密钥，确保页面内容已加载，重试 |
| 摘要生成超时 | 非常长的文章可能需要45分钟；等待或尝试较短的内容 |
| PDF提取不工作 | 检查PDF是否受密码保护（先解锁）或是否已扫描（OCR尚不支持）。先尝试更简单的PDF。 |
| PDF内容不完整 | 复杂布局（多列、表格）可能需要手动验证。该功能是实验性的。 |

---

---

## 🔐 安全和隐私

- **加密**：通过Web Crypto API使用AES-256-GCM
- **密钥派生**：PBKDF2，100,000次迭代
- **无跟踪**：无分析、无远程日志记录
- **仅本地**：所有数据保留在您的浏览器中

---

## 📋 权限

ClipAIble需要以下权限才能正常工作：

| 权限 | 原因 |
|------|------|
| `activeTab` | 读取当前页面以提取内容 |
| `storage` | 本地保存设置和统计信息 |
| `scripting` | 注入内容提取脚本 |
| `downloads` | 保存生成的文件 |
| `debugger` | 生成高质量PDF |
| `alarms` | 在长时间操作期间保持service worker活动 |
| `contextMenus` | 添加上下文菜单选项 |
| `notifications` | 显示桌面通知 |
| `unlimitedStorage` | 存储选择器缓存 |
| `webNavigation` | 从Chrome PDF查看器获取原始PDF URL |
| `pageCapture` | 保留用于未来的PDF捕获功能 |
| `offscreen` | 创建offscreen文档用于PDF提取和离线TTS |

### 主机权限

| 权限 | 原因 |
|------|------|
| `<all_urls>` | 从任何网站提取内容并向AI/TTS提供商发出API调用 |

**安全说明：** 所有API密钥均加密并仅本地存储。密钥永远不会导出或传输到任何服务器，除了您配置的AI提供商。

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


# ClipAIble

AI 驱动的文章提取器。适用于任何网站。

## 功能

ClipAIble 从网页中提取文章内容并转换为不同格式：
- PDF 文档
- EPUB 文件
- FB2 文件
- Markdown 文本
- 音频文件

**特殊功能：**
- **YouTube/Vimeo 支持**：提取视频字幕并从中创建文章
- **PDF 处理**：适用于在线 PDF 和本地 PDF 文件
- **内容翻译**：将文章翻译成 11 种语言
- **图像翻译**：使用 AI 翻译图像上的文本
- **TLDR 生成**：在文档中创建简短摘要
- **摘要面板**：在处理后在弹出窗口中显示文章摘要

## 安装

从 [Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflolc) 安装。

## 使用方法

1. 点击浏览器工具栏中的 ClipAIble 图标
2. 打开任何文章、YouTube 视频或 PDF
3. 选择所需格式（PDF、EPUB、FB2、Markdown 或 Audio）
4. 点击保存

**替代保存方法：**
- 在任何网页上右键单击并使用上下文菜单选项

**对于本地 PDF 文件**：在 AI 模式下，由于浏览器限制，您将被提示选择 PDF 文件。

## 设置

### 提取模式

- **AI Selector**：推荐用于大多数网站。使用 AI 查找文章内容。
- **Automatic**：基本模式，无需 API 密钥即可工作。
- **AI Extractor**：替代 AI 模式（不推荐用于常规使用）。

### 性能功能

- **选择器缓存**：通过重用 AI 学习的 selectors 来加速以前访问过的网站的处理

### 输出格式

- **PDF**：创建具有 4 个预设样式（深色、浅色、棕褐色、高对比度）和可自定义字体/颜色的格式化文档
- **EPUB**：为 Kindle 等阅读器创建结构化的电子书
- **FB2**：为 PocketBook 和其他阅读器创建结构化的电子书
- **Markdown**：保留包含标题和列表的文章结构
- **Audio**：使用 6 种不同的 TTS 服务将文本转换为语音

### 翻译

内容可以翻译为：英语、俄语、乌克兰语、德语、法语、西班牙语、意大利语、葡萄牙语、中文、日语、韩语。

### 音频

可以使用不同的 TTS 提供商生成音频：
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher（仅限英语和乌克兰语）
- Piper（离线，无需 API 密钥）

## API 密钥（可选）

对于 AI 功能，您可以添加这些提供商的 API 密钥：

### OpenAI
在 [platform.openai.com/api-keys](https://platform.openai.com/api-keys) 获取密钥

### Google Gemini
在 [aistudio.google.com/apikey](https://aistudio.google.com/apikey) 获取密钥

对于 TTS，需要在 Google Cloud Console 中启用 [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)

### Anthropic Claude
在 [console.anthropic.com](https://console.anthropic.com/) 获取密钥

### DeepSeek
在 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 获取密钥

### ElevenLabs
在 [elevenlabs.io](https://elevenlabs.io/) 获取密钥

### Qwen
在 [alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/) 获取密钥

### Respeecher
在 [space.respeecher.com](https://space.respeecher.com/) 获取密钥

## 附加功能

- **统计**：使用历史记录和月度计数器跟踪您保存的文章
- **设置导入/导出**：备份和恢复您的首选项
- **11 种语言界面**：无需重启即可在语言之间切换
- **安全存储**：API 密钥在保存前进行加密

## 权限

扩展需要这些权限才能工作：
- 阅读您访问的网页
- 将文件保存到您的计算机
- 向 AI 提供商发出 API 调用（仅在您使用这些功能时）

**安全**：所有 API 密钥在存储到浏览器之前都会被加密。

---

ClipAIble 提取并转换网页文章。
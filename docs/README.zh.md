# ✂️ ClipAIble

> **AI驱动的文章提取器** — 将网页上的任何文章保存为PDF、EPUB、FB2、Markdown或音频。支持11种语言翻译。适用于任何网站。

![版本](https://img.shields.io/badge/版本-2.7.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-扩展-green)
![许可证](https://img.shields.io/badge/许可证-MIT-brightgreen)

---

## ✨ 什么是 ClipAIble？

ClipAIble 使用人工智能智能地从任何网页提取文章内容 — 移除广告、导航、弹窗和多余元素。然后导出为您喜欢的格式：

- 📄 **PDF** — 美观的样式，支持自定义
- 📚 **EPUB** — 适用于 Kindle、Kobo、Apple Books
- 📖 **FB2** — 适用于 PocketBook、FBReader
- 📝 **Markdown** — 纯文本格式，适合笔记
- 🎧 **音频 (MP3)** — 使用AI语音朗读

所有格式都支持**翻译为11种语言** — 甚至翻译图像上的文字！

---

## 🚀 功能

### 🤖 AI驱动的提取
- **两种模式**：AI Selector（快速、可重用）和 AI Extract（彻底）
- **支持多个提供商**：OpenAI GPT、Google Gemini、Anthropic Claude
- **智能检测**：找到文章主要内容，自动删除无关内容
- **保留结构**：标题、图片、代码块、表格、脚注

### 🎧 音频导出
- **2个TTS提供商**：OpenAI TTS 和 ElevenLabs
- **20+种语音**：11种OpenAI语音 + 9种ElevenLabs语音
- **速度调节**：0.5x 至 2.0x
- **多语言发音**：每种语言正确的发音
- **智能文本清理**：AI移除URL、代码和非语音内容

### 🌍 翻译
- **11种语言**：EN、RU、UK、DE、FR、ES、IT、PT、ZH、JA、KO
- **智能检测**：如果文章已经是目标语言则跳过翻译
- **图像翻译**：翻译图像上的文字（通过Gemini）
- **本地化元数据**：日期和标签适应所选语言

### 🎨 PDF自定义
- **4种预设**：深色、浅色、棕褐色、高对比度
- **可自定义颜色**：背景、文本、标题、链接
- **11种字体**可供选择
- **页面模式**：单页连续或多页A4格式

### ⚡ 智能功能
- **离线模式**：缓存选择器 — 重复访问网站时无需AI
- **统计**：跟踪保存数量，查看历史记录
- **目录**：从标题自动生成
- **摘要**：AI编写的2-3段摘要
- **上下文菜单**：右键 → "将文章保存为PDF"
- **随时取消**：一键停止处理

### 🔒 安全性
- **API密钥加密**使用AES-256-GCM（OpenAI、Claude、Gemini、ElevenLabs）
- **密钥永不导出** — 从设置备份中排除
- **所有数据本地存储** — 不向第三方发送任何内容

---

## 📦 安装

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

### 选择哪个？

| 提供商 | 最适合 | 音频 | 图像翻译 |
|--------|--------|------|----------|
| **OpenAI** | 通用用途、音频导出 | ✅ | ❌ |
| **Gemini** | 快速提取、图像翻译 | ❌ | ✅ |
| **Claude** | 长文章、复杂页面 | ❌ | ❌ |

**推荐：** 从OpenAI开始以获取全部功能（提取 + 音频）。

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
| OpenAI | GPT-5.1 | 平衡 |
| OpenAI | GPT-5.1 (high) | 最佳质量 |
| Anthropic | Claude Sonnet 4.5 | 适合长文章 |
| Google | Gemini 3 Pro | 快速 |

### 音频语音

| 语音 | 风格 |
|------|------|
| nova | 女性，温暖 |
| alloy | 中性 |
| echo | 男性 |
| fable | 富有表现力 |
| onyx | 男性，深沉 |
| shimmer | 女性，清晰 |
| coral | 女性，友好 |
| sage | 中性，平静 |
| ash | 男性，权威 |
| ballad | 戏剧性 |
| verse | 有节奏 |

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
│   ├── generation/     # PDF、EPUB、FB2、MD、音频
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
| `downloads` | 保存生成的文件 |
| `debugger` | 通过Chrome打印API生成PDF |
| `alarms` | 在长时间任务期间保持worker处于活动状态 |
| `contextMenus` | 右键菜单 |

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


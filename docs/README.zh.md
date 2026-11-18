# ClipAIble

将网页文章保存为 PDF、EPUB、FB2、Markdown 或音频。

[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)

## 使用方法

1. 打开文章、支持的视频或 PDF。
2. 点击 Chrome 工具栏中的 ClipAIble 图标。
3. 选择输出格式和提取模式。
4. 点击**保存**。

也可以通过页面右键菜单保存。处理本地 PDF 时，请在 Chrome 扩展程序设置中允许访问文件，或在提示时选择对应文件。需要选择文件时，请保持扩展程序弹出窗口打开。

对于网页文章，**自动**模式使用本地启发式规则和可用的缓存选择器。**AI Selector**向 AI 服务请求 CSS 选择器，然后提取匹配的页面内容。**AI Extract**由 AI 服务整理内容结构。对于 PDF，自动模式提取文本层，AI 模式处理渲染后的页面。

设置中可配置文本与图片翻译、文档样式和目录。弹出窗口还可生成摘要或核心主张。音频可使用已配置的 TTS 服务，也可在下载语音模型后使用 Piper 在本地合成。

请添加所选 AI 和 TTS 功能需要的 API 密钥。导出的设置不包含 API 密钥，可选择加入统计数据和选择器缓存。

## 开发

安装、构建和测试步骤见[英文主指南](../README.md#development)。

[权限](../PERMISSIONS.md) · [隐私政策](../PRIVACY.md) · [技术概述](technical-overview.md)

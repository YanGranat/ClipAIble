# ClipAIble

AI を活用した記事抽出器。どのウェブサイトでも動作します。

**[Chrome Web Store](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc) で利用可能**

## 機能

ClipAIble はウェブページから記事コンテンツを抽出し、様々なフォーマットに変換します：
- PDF ドキュメント
- EPUB ファイル
- FB2 ファイル
- Markdown テキスト
- 音声ファイル

**特別機能：**
- **YouTube/Vimeo サポート**：動画字幕を抽出し、そこから記事を作成
- **PDF 処理**：オンライン PDF とローカル PDF ファイルに対応
- **コンテンツ翻訳**：記事を 11 言語に翻訳
- **画像翻訳**：AI を使用して画像上のテキストを翻訳
- **TLDR 生成**：ドキュメント内に短い要約を作成
- **サマリーパネル**：処理後にポップアップに記事の要約を表示

## 使用方法

1. ブラウザのツールバーにある ClipAIble アイコンをクリック
2. 任意の記事、YouTube 動画、または PDF を開く
3. 必要なフォーマットを選択（PDF、EPUB、FB2、Markdown、または Audio）
4. 保存をクリック

**代替保存方法：**
- 任意のウェブページを右クリックし、コンテキストメニューオプションを使用

**ローカル PDF ファイルの場合**：AI モードでは、ブラウザの制限により PDF ファイルの選択を求められます。

## 設定

### 抽出モード

- **AI Selector**：ほとんどのサイトで推奨されるモード。AI を使用して記事コンテンツを検索します。
- **Automatic**：API キーが不要で動作する基本モード。
- **AI Extractor**：AI を使用した代替モード（定期的な使用には推奨されません）。

### パフォーマンス機能

- **セレクタキャッシュ**：以前に訪問したサイトの処理を高速化するために、AI が学習したセレクタを再利用

### 出力フォーマット

- **PDF**：4 つのプリセットスタイル（ダーク、ライト、セピア、ハイコントラスト）とカスタマイズ可能なフォント/色でフォーマットされたドキュメントを作成
- **EPUB**：Kindle などのリーダー向けに構造化された電子書籍を作成
- **FB2**：PocketBook や他のリーダー向けに構造化された電子書籍を作成
- **Markdown**：タイトルとリストを含む記事構造を保持
- **Audio**：6 つの異なる TTS サービスを使用してテキストを音声に変換

### 翻訳

コンテンツは以下の言語に翻訳できます：英語、ロシア語、ウクライナ語、ドイツ語、フランス語、スペイン語、イタリア語、ポルトガル語、中国語、日本語、韓国語。

### 音声

様々な TTS プロバイダーを使用して音声を生成できます：
- OpenAI TTS
- ElevenLabs
- Google Gemini
- Qwen
- Respeecher（英語とウクライナ語のみ）
- Piper（オフライン、API キーは不要）

## API キー（オプション）

AI 機能のために、これらのプロバイダーの API キーを追加できます：

### OpenAI
[platform.openai.com/api-keys](https://platform.openai.com/api-keys) でキーを取得

### Google Gemini
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) でキーを取得

TTS の場合、Google Cloud Console で [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) を有効にしてください

### Anthropic Claude
[console.anthropic.com](https://console.anthropic.com/) でキーを取得

### DeepSeek
[platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) でキーを取得

### ElevenLabs
[elevenlabs.io](https://elevenlabs.io/) でキーを取得

### Qwen
[alibaba cloud dashscope](https://dashscope-intl.console.aliyun.com/) でキーを取得

### Respeecher
[space.respeecher.com](https://space.respeecher.com/) でキーを取得

## 追加機能

- **統計**：履歴と月間カウンターで保存した記事を追跡
- **設定のインポート/エクスポート**：設定のバックアップと復元
- **11 言語インターフェース**：再起動せずに言語を切り替え
- **安全なストレージ**：API キーは保存前に暗号化されます

## 権限

拡張機能が動作するために必要な権限：
- 訪問するウェブページを読み取る
- ファイルをコンピュータに保存する
- AI プロバイダーに API 呼び出しを行う（これらの機能を使用する場合のみ）

**セキュリティ**：すべての API キーはブラウザに保存される前に暗号化されます。

---

ClipAIble はウェブ記事を抽出・変換します。
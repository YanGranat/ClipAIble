# ✂️ ClipAIble

> **AI駆動の記事抽出ツール** — ウェブ上の任意の記事をPDF、EPUB、FB2、Markdown、または音声として保存。11言語への翻訳に対応。あらゆるウェブサイトで動作。

![バージョン](https://img.shields.io/badge/バージョン-3.2.3-blue)
![Chrome](https://img.shields.io/badge/Chrome-拡張機能-green)
![ライセンス](https://img.shields.io/badge/ライセンス-MIT-brightgreen)

**[⬇️ Chrome Web Storeからインストール](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

---

## ✨ ClipAIbleとは？

ClipAIbleは人工知能を使用して、任意のウェブページから記事コンテンツをインテリジェントに抽出します — 広告、ナビゲーション、ポップアップ、不要な要素を削除。その後、お好みの形式にエクスポート：

- 📄 **PDF** — 美しくカスタマイズ可能なスタイリング
- 📚 **EPUB** — Kindle、Kobo、Apple Booksに対応
- 📖 **FB2** — PocketBook、FBReaderに対応
- 📝 **Markdown** — ノート用のプレーンテキスト
- 🎧 **音声** — AIナレーションで聞く

すべての形式が**11言語への翻訳**をサポート — 画像上のテキストの翻訳も可能！

---

## 🚀 機能

### 🤖 AI駆動の抽出
- **3つのモード**：自動（AIなし、高速）、AI Selector（高速、再利用可能）とAI Extract（徹底的）
- **自動モード**：AIなしでドキュメントを作成 — APIキー不要、即座に抽出
- **複数のプロバイダー**：OpenAI GPT（GPT-5.2、GPT-5.2-high、GPT-5.1）、Google Gemini、Anthropic Claude、Grok、OpenRouter
- **動画サポート**：YouTube/Vimeo動画から字幕を抽出して記事に変換（v3.0.0）
  - 複数の抽出方法とフォールバック
  - 優先順位：手動字幕 > 自動生成 > 翻訳
  - AI処理：タイムスタンプを削除、段落をマージ、エラーを修正
  - 字幕が利用できない場合の音声転写フォールバック
- **インテリジェント検出**：記事の主要内容を見つけ、自動的に不要な要素を削除
- **拡張フォールバック戦略**：信頼性の高いコンテンツ抽出のための6つの異なる戦略
- **構造を保持**：見出し、画像、コードブロック、表、脚注
- **セレクターキャッシュ**：キャッシュの使用と有効化の独立した設定

### 🎧 音声エクスポート
- **5つのTTSプロバイダー**：OpenAI TTS、ElevenLabs、Google Gemini 2.5 TTS、Qwen3-TTS-Flash、Respeecher
- **100以上の音声**：11のOpenAI + 9のElevenLabs + 30のGoogle Gemini + 49のQwen + 14のRespeecher（英語とウクライナ語）
- **速度調整**：0.5xから2.0x（OpenAI/ElevenLabsのみ；Google/Qwen/Respeecherは固定速度）
- **フォーマットサポート**：MP3（OpenAI/ElevenLabs）またはWAV（Google/Qwen/Respeecher）
- **多言語発音**：各言語の正しい発音
- **ウクライナ語サポート**：Respeecher経由で専用のウクライナ語音声（10音声）
- **インテリジェントなテキストクリーンアップ**：AIがURL、コード、非音声コンテンツを削除
- **プロバイダー固有の機能**：
  - **ElevenLabs**：モデル選択（v2、v3、Turbo v2.5）、フォーマット選択、高度な音声設定
  - **Google Gemini 2.5 TTS**：モデル選択（pro/flash）、30音声、24k文字制限
  - **Qwen**：ロシア語音声（Alek）を含む49音声、600文字制限
  - **Respeecher**：高度なサンプリングパラメータ（temperature、repetition_penalty、top_p）

### 🌍 翻訳
- **11言語**：EN、RU、UA、DE、FR、ES、IT、PT、ZH、JA、KO
- **インテリジェント検出**：記事が既にターゲット言語の場合は翻訳をスキップ
- **画像翻訳**：画像上のテキストを翻訳（Gemini経由）
- **ローカライズされたメタデータ**：日付とラベルが選択された言語に適応

### 🎨 PDFカスタマイズ
- **4つのプリセット**：ダーク、ライト、セピア、高コントラスト
- **カスタマイズ可能なカラー**：背景、テキスト、見出し、リンク
- **11のフォント**：デフォルト（Segoe UI）、Arial、Georgia、Times New Roman、Verdana、Tahoma、Trebuchet MS、Palatino Linotype、Garamond、Courier New、Comic Sans MS
- **フォントサイズ**：調整可能（デフォルト：31px）
- **ページモード**：単一連続ページまたは複数ページA4形式


### ⚡ インテリジェント機能
- **動画サポート**：YouTube/Vimeo動画から字幕を抽出して記事に変換（v3.0.0）
  - 直接字幕抽出（YouTube/VimeoのAPIキー不要）
  - AI処理：タイムスタンプを削除、段落をマージ、エラーを修正
  - 音声転写フォールバック：字幕が利用できない場合の自動転写（gpt-4o-transcribeモデルを使用するOpenAI APIキーが必要）
  - 完全なパイプライン統合：翻訳、目次、要約、すべてのエクスポート形式
- **要約生成**：任意の記事や動画の詳細なAI要約を作成
  - **"要約を生成"**ボタンをクリックして完全な要約を作成
  - 通常の記事とYouTube/Vimeo動画で動作
  - ポップアップが閉じられても生成を継続（バックグラウンドで動作）
  - クリップボードにコピーまたはMarkdownファイルとしてダウンロード
  - フォーマットされたテキストで展開/折りたたみ表示
  - 主要なアイデア、概念、例、結論を含む詳細な要約
- **要約（TL;DR）**：AIが書いた2-4文の短い要約、ドキュメントに含まれる
  - オプション機能：設定で有効化してPDF/EPUB/FB2/Markdownに短い要約を追加
  - エクスポートされたドキュメントの冒頭に表示
  - 詳細な要約とは異なる（これは短い概要）
- **オフラインモード**：セレクターのキャッシュ — 繰り返しサイトにAI不要
  - 独立した設定：キャッシュされたセレクターの使用とキャッシュの有効化を個別に設定
  - 抽出失敗時の自動無効化
  - ドメインごとの手動キャッシュ管理
- **統計**：保存数を追跡、履歴を表示
- **目次**：見出しから自動生成
- **コンテキストメニュー**：右クリック → 「記事をPDF/EPUB/FB2/Markdown/音声として保存」
- **いつでもキャンセル**：ワンクリックで処理を停止
- **設定のインポート/エクスポート**：すべての設定のバックアップと復元（セキュリティのためAPIキーは除外）

### 🔒 セキュリティ
- **APIキー暗号化** AES-256-GCM（OpenAI、Claude、Gemini、ElevenLabs、Qwen、Respeecher）
- **キーはエクスポートされない** — 設定バックアップから除外
- **すべてのデータはローカルに保存** — 第三者に送信されない

---

## ⚠️ 既知の制限事項

### ファイル形式
- **WAV形式**（Google/Qwen/Respeecher）：ファイルが非常に大きくなる可能性があります（長い記事で10-50MB+）。MP3形式（OpenAI/ElevenLabs）はより小さなファイルサイズを提供します。
- **リクエストあたりの文字数制限**： 
  - OpenAI TTS：4096文字
  - ElevenLabs：5000文字
  - Google Gemini 2.5 TTS：24000文字
  - Qwen TTS：600文字
  - Respeecher TTS：450文字
  - テキストは文/単語の境界で自動的にインテリジェントに分割されます

### 技術的制約
- **Keep-alive要件**：Chrome MV3では、keep-alive間隔が少なくとも1分である必要があります。長時間の処理タスクには数分かかる場合があります。拡張機能は統一されたkeep-aliveメカニズム（1分ごとにアラーム + 2秒ごとに状態保存）を使用して、service workerの停止を防ぎます。
- **画像のCORS**：ウェブサイトがクロスオリジンリクエストをブロックしている場合、一部の画像が読み込まれない可能性があります。拡張機能はこれらの画像をスキップします。
- **キャンセルは即座ではない**：キャンセルには、すべてのバックグラウンドプロセスを完全に停止するのに数秒かかる場合があります。
- **Service Workerの回復**：操作はservice workerの再起動後、自動的に再開されます（2時間以内）。

### ブラウザの互換性
- **Chrome/Edge/Brave/Arc**：完全にサポート
- **Firefox**：サポートされていません（異なる拡張機能APIを使用）
- **Safari**：サポートされていません（異なる拡張機能APIを使用）

---

## 📦 インストール

### オプション1：Chrome Web Storeからインストール（推奨）

**[⬇️ Chrome Web StoreからClipAIbleをインストール](https://chromewebstore.google.com/detail/clipaible/khcklmlkddcaflkoonkkefjhdldcfolc)**

### オプション2：手動インストール（開発者モード）

1. このリポジトリを**クローン**
2. Chromeを開く → `chrome://extensions/`
3. **開発者モード**を有効化
4. **パッケージ化されていない拡張機能を読み込む**をクリック → フォルダを選択

### 要件

- Chrome、Edge、Brave、またはArcブラウザ
- 少なくとも1つのプロバイダーのAPIキー（以下を参照）

---

## 🔑 APIキーの取得

### OpenAI（GPTモデル + 音声）

1. [platform.openai.com](https://platform.openai.com/)にアクセス
2. 登録またはログイン
3. **API Keys**（左メニュー）に移動、または直接 [platform.openai.com/api-keys](https://platform.openai.com/api-keys) にアクセス
4. **"Create new secret key"**をクリック
5. キーをコピー（`sk-...`で始まる）
6. **Settings → Billing**で支払い方法を追加（API使用に必要）

> **注意：** OpenAIキーは音声エクスポート（TTS）に必要です。他の形式は任意のプロバイダーで動作します。

### Google Gemini

1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. Googleアカウントでログイン
3. **"Get API key"**をクリック、または直接 [aistudio.google.com/apikey](https://aistudio.google.com/apikey) にアクセス
4. **"Create API key"**をクリック
5. キーをコピー（`AIza...`で始まる）

> **ヒント：** Geminiは画像テキスト翻訳機能とGoogle Gemini 2.5 TTS（30音声）も有効にします。TTSには、同じGemini APIキーを使用するか、専用のGoogle TTS APIキーを設定できます。Google Cloud ConsoleでGenerative Language APIを有効にする必要があります。

### Anthropic Claude

1. [console.anthropic.com](https://console.anthropic.com/)にアクセス
2. 登録またはログイン
3. **API Keys**に移動
4. **"Create Key"**をクリック
5. キーをコピー（`sk-ant-...`で始まる）
6. **Plans & Billing**でクレジットを追加

### ElevenLabs（音声）

1. [ElevenLabs](https://elevenlabs.io/)にアクセス
2. 登録またはログイン
3. **Profile** → **API Keys**に移動
4. APIキーを作成
5. キーをコピー

> **注意：** ElevenLabsは高品質なTTSで9つのプレミアム音声を提供します。速度調整（0.25-4.0x）とフォーマット選択（MP3高品質デフォルト：mp3_44100_192）をサポートします。モデル：Multilingual v2、v3（デフォルト）、Turbo v2.5。高度な音声設定（stability、similarity、style、speaker boost）が利用可能です。

### Google Gemini 2.5 TTS（音声）

1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. Googleアカウントでログイン
3. **"Get API key"**をクリック、または直接 [aistudio.google.com/apikey](https://aistudio.google.com/apikey) にアクセス
4. **"Create API key"**をクリック
5. キーをコピー（`AIza...`で始まる）
6. [Google Cloud Console](https://console.cloud.google.com/)で**Generative Language API**を有効化
7. （オプション）モデルに必要な場合は課金を有効化

> **注意：** Google Gemini 2.5 TTSは30音声を提供します。同じGemini APIキーを使用するか、専用のGoogle TTS APIキーを設定できます。24kHzで固定WAV形式。モデル：`gemini-2.5-pro-preview-tts`（プライマリ）または `gemini-2.5-flash-preview-tts`（より高速）。

### Qwen3-TTS-Flash（音声）

1. [Alibaba Cloud Model Studio](https://dashscope-intl.console.aliyun.com/)にアクセス
2. 登録またはログイン
3. **API Keys**または**Model Studio**に移動
4. APIキーを作成
5. キーをコピー（`sk-...`で始まる）

> **注意：** Qwen3-TTS-Flashは49の音声を提供し、専用のロシア語音声（Alek）を含みます。24kHzの固定WAV形式。

### Respeecher（音声 - 英語とウクライナ語）

1. [Respeecher Space](https://space.respeecher.com/)にアクセス
2. 登録またはログイン
3. **API Keys**に移動
4. APIキーを作成
5. キーをコピー

> **注意：** Respeecherは英語とウクライナ語をサポートし、専用のウクライナ語音声を提供します。22.05kHzの固定WAV形式。

### どれを選ぶ？

| プロバイダー | 最適な用途 | 音声 | 画像翻訳 |
|-------------|-----------|------|--------|
| **OpenAI** | 一般的な使用、音声エクスポート、動画転写 | ✅ (11音声) | ❌ |
| **Gemini** | 高速抽出、画像翻訳、音声エクスポート（30音声） | ✅ (30音声) | ✅ |
| **Claude** | 長い記事、複雑なページ | ❌ | ❌ |
| **Grok** | 高速推論タスク | ❌ | ❌ |
| **OpenRouter** | 複数のモデルへのアクセス | ❌ | ❌ |
| **ElevenLabs** | 音声エクスポート（9音声、高品質） | ✅ (9音声) | ❌ |
| **Qwen** | 音声エクスポート（49音声、ロシア語サポート） | ✅ (49音声) | ❌ |
| **Respeecher** | 音声エクスポート（ウクライナ語） | ✅ (14音声) | ❌ |

**推奨：** 
- **抽出用**：OpenAIまたはGeminiから始めます（高速で信頼性が高い）
- **音声用**：一般的な用途にはOpenAI、高品質にはElevenLabs、30音声にはGoogle Gemini 2.5 TTS、ロシア語にはQwen、ウクライナ語にはRespeecher
- **画像翻訳用**：Gemini APIキーが必要です

---

## 🎯 クイックスタート

1. ツールバーの**ClipAIble**アイコンをクリック
2. APIキーを入力 → **キーを保存**
3. 任意の記事に移動
4. **PDFとして保存**をクリック（または他の形式を選択）
5. 完了！ファイルが自動的にダウンロードされます

**ヒント：**
- 任意の場所で右クリック → **「記事をPDFとして保存」**
- **"要約を生成"**をクリックして詳細なAI要約を作成（ポップアップが閉じられても動作）
- 設定で**"TL;DRを生成"**を有効化してドキュメントに短い要約を追加

---

## ⚙️ 設定

### インターフェース

- **テーマ**：ヘッダーでダーク、ライト、または自動（システムに従う）を選択
- **言語**：ヘッダーでインターフェース言語（11言語）を選択
- **カスタムモデル**：モデルセレクターの横の"+"ボタンで独自のAIモデルを追加

### 抽出モード

| モード | 速度 | 最適な用途 |
|--------|------|-----------|
| **自動** | ⚡⚡ 即座 | シンプルな記事、APIキー不要 |
| **AI Selector** | ⚡ 高速 | ほとんどのサイト、ブログ、ニュース |
| **AI Extract** | 🐢 徹底的 | 複雑なページ、Notion、SPA |

### AIモデル

| プロバイダー | モデル | 備考 |
|-------------|--------|------|
| OpenAI | GPT-5.2 | 最新、中程度の推論（デフォルト） |
| OpenAI | GPT-5.2-high | 強化、高推論 |
| OpenAI | GPT-5.1 | バランス型 |
| OpenAI | GPT-5.1 (high) | 最高品質、高推論 |
| Anthropic | Claude Sonnet 4.5 | 長い記事に最適 |
| Google | Gemini 3 Pro | 高速抽出、画像翻訳 |
| Grok | Grok 4.1 Fast Reasoning | 高速推論 |
| OpenRouter | 各種モデル | 複数のプロバイダーへのアクセス |

**カスタムモデル：** モデルセレクターの横の**"+"**ボタンをクリックしてカスタムモデルを追加します（例：`gpt-4o`、`claude-opus-4.5`）。カスタムモデルはドロップダウンメニューに表示され、必要に応じて非表示/表示できます。

### 音声音声

**OpenAI（11音声）：** nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash, ballad, verse

**ElevenLabs（9音声）：** Rachel, Domi, Bella, Antoni, Elli, Josh, Arnold, Adam, Sam

**Google Gemini 2.5 TTS（30音声）：** Callirrhoe, Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalhague, Laomedeia, Achernar, Alnilam, Chedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat

**Qwen3-TTS-Flash（49音声）：** Elias（デフォルト）、Alek（ロシア語）を含む、10言語の音声

**Respeecher（14音声）：** 4英語（Samantha, Neve, Gregory, Vincent）+ 10ウクライナ語音声

### スタイルプリセット（PDF）

| プリセット | 背景 | テキスト |
|------------|------|---------|
| ダーク | `#303030` | `#b9b9b9` |
| ライト | `#f8f9fa` | `#343a40` |
| セピア | `#faf4e8` | `#5d4e37` |
| 高コントラスト | `#000000` | `#ffffff` |

**カスタムカラー：** カラーセレクターで背景、テキスト、見出し、リンクをカスタマイズします。各色に個別のリセットボタン（↺）、または**"すべてをデフォルトにリセット"**ですべてのスタイルを復元します。

---

## 📊 統計とキャッシュ

**📊 統計**をクリックして表示：
- 合計保存数、今月のカウント
- 形式別の内訳（PDF、EPUB、FB2、Markdown、音声）
- 元の記事へのリンク付きの最近の履歴（最後の50保存）
  - リンクをクリックして元の記事を開く
  - ✕ボタンをクリックして個別の履歴エントリを削除
  - 形式、ドメイン、処理時間、日付を表示
- オフラインモード用のキャッシュされたドメイン
- **統計を有効/無効化**：統計収集のトグル
- **統計をクリア**：すべての統計をリセットするボタン
- **キャッシュをクリア**：すべてのキャッシュされたセレクターを削除するボタン
- キャッシュからの個別ドメインの削除

## 📝 要約生成

任意の記事や動画の詳細なAI要約を作成：

1. 任意の記事またはYouTube/Vimeo動画に移動
2. ポップアップで**"要約を生成"**ボタンをクリック
3. 要約がバックグラウンドで生成されます（ポップアップを閉じることができます）
4. 準備ができたら、要約がオプション付きで表示されます：
   - **コピー**をクリップボードに
   - **ダウンロード**をMarkdownファイルとして
   - **展開/折りたたみ**で完全なテキストを表示
   - **閉じる**で要約を非表示

**機能：**
- 記事とYouTube/Vimeo動画で動作
- ポップアップが閉じられても生成を継続
- 主要なアイデア、概念、例、結論を含む詳細な要約
- 見出し、リスト、リンクを含むフォーマットされたテキスト
- 自動保存 — 閉じるまで保持されます

**注意：** 要約生成はドキュメントエクスポートとは別です。完全なドキュメントを保存せずにコンテンツをすばやく理解するために使用します。

### オフラインモード

ClipAIbleはドメインごとにAI生成セレクターをキャッシュ：
- **2回目の訪問 = 即座** — API呼び出しなし
- **自動無効化** — 抽出失敗時にクリア
- **手動制御** — 個別のドメインを削除
- **独立した設定**：
  - **キャッシュされたセレクターを使用**：キャッシュが存在する場合はページ分析をスキップ（より高速）
  - **キャッシュを有効化**：抽出後に新しいセレクターをキャッシュに保存
  - 両方の設定は柔軟な制御のために独立して動作します

---

## 💾 設定のインポート/エクスポート

**⚙️ 設定** → **インポート/エクスポート**

- すべての設定をエクスポート（セキュリティのためAPIキーは除外）
- オプション：統計とキャッシュを含める
- マージまたは上書きオプションでインポート

---

## 🔧 トラブルシューティング

| 問題 | 解決策 |
|------|--------|
| コンテンツが空 | **AI Extract**モードを試す |
| 無効なAPIキー | キー形式を確認（sk-...、AIza...、sk-ant-...） |
| 画像が欠落 | 一部のサイトはクロスオリジンをブロック；小さな画像はフィルタリング |
| 音声が遅い | 長い記事はチャンクに分割；プログレスバーを監視 |
| 要約が生成されない | APIキーを確認し、ページコンテンツが読み込まれていることを確認し、再試行 |
| 要約生成タイムアウト | 非常に長い記事は最大45分かかる場合があります；待つか、より短いコンテンツで試す |

---

## 🏗️ アーキテクチャ

```
clipaible/
├── manifest.json       # 拡張機能設定
├── popup/              # UI（HTML、CSS、JS）
│   ├── popup.js       # メインオーケストレーション（2841行）
│   ├── core.js        # ビジネスロジック（203行）
│   ├── handlers.js    # イベントハンドラー（1991行）
│   ├── ui.js          # UI管理
│   ├── stats.js       # 統計表示
│   └── settings.js    # 設定管理
├── scripts/
│   ├── background.js   # Service worker (2525行、3705から削減)
│   ├── content.js      # YouTube用コンテンツスクリプト
│   ├── locales.js      # UIローカライゼーション（11言語）
│   ├── message-handlers/ # メッセージハンドラーモジュール（v3.2.1+）
│   │   ├── index.js    # メッセージルーター
│   │   ├── utils.js    # ハンドラーユーティリティ
│   │   ├── simple.js   # シンプルハンドラー
│   │   ├── stats.js    # 統計ハンドラー
│   │   ├── cache.js    # キャッシュハンドラー
│   │   ├── settings.js # 設定ハンドラー
│   │   ├── processing.js # 処理ハンドラー
│   │   ├── video.js    # 動画/字幕ハンドラー
│   │   ├── summary.js  # 要約生成ヘルパー
│   │   └── complex.js  # 複雑なハンドラー
│   ├── api/            # AI & TTSプロバイダー
│   │   ├── openai.js   # OpenAI（GPTモデル）
│   │   ├── claude.js   # Anthropic Claude
│   │   ├── gemini.js   # Google Gemini
│   │   ├── grok.js     # Grok
│   │   ├── openrouter.js # OpenRouter
│   │   ├── elevenlabs.js # ElevenLabs TTS
│   │   ├── google-tts.js # Google Gemini 2.5 TTS
│   │   ├── qwen.js     # Qwen3-TTS-Flash
│   │   ├── respeecher.js # Respeecher TTS
│   │   ├── tts.js      # TTSルーター
│   │   └── index.js    # APIルーター
│   ├── extraction/     # コンテンツ抽出
│   │   ├── prompts.js  # AIプロンプト
│   │   ├── html-utils.js # HTMLユーティリティ
│   │   ├── video-subtitles.js # YouTube/Vimeo字幕抽出
│   │   └── video-processor.js # AI字幕処理
│   ├── translation/    # 翻訳と言語検出
│   ├── generation/     # PDF、EPUB、FB2、MD、音声
│   ├── cache/          # セレクターキャッシュ
│   ├── stats/          # 使用統計
│   ├── settings/       # 設定のインポート/エクスポート
│   ├── state/          # 処理状態管理
│   └── utils/          # 設定、暗号化、ヘルパー
│       ├── video.js    # 動画プラットフォーム検出
│       ├── validation.js # 検証ユーティリティ
│       └── api-error-handler.js # 共通APIエラーハンドリング
├── print/              # PDFレンダリング
├── config/             # スタイル
├── lib/                # JSZip
├── docs/               # ローカライズされたREADMEファイル
└── memory-bank/        # プロジェクトドキュメント
```

---

## 🔐 セキュリティとプライバシー

- **暗号化**：Web Crypto API経由のAES-256-GCM
- **キー導出**：PBKDF2、100,000イテレーション
- **追跡なし**：分析なし、リモートロギングなし
- **ローカルのみ**：すべてのデータはブラウザに残ります

---

## 📋 権限

ClipAIbleは機能するために以下の権限が必要です。すべての権限は記載された目的にのみ使用されます：

| 権限 | 理由 |
|------|------|
| `activeTab` | 拡張機能アイコンをクリックするか、コンテキストメニューを使用するときに、現在のページを読み取ってコンテンツを抽出します。拡張機能は、現在表示しているタブにのみアクセスします。 |
| `storage` | 設定（APIキー、スタイル設定、言語選択）と統計をブラウザにローカルに保存します。データはデバイスから離れることはありません。 |
| `scripting` | コンテンツ抽出スクリプトをウェブページに注入します。このスクリプトは、ページのDOMから記事のコンテンツ（テキスト、画像、見出し）を見つけて抽出します。 |
| `downloads` | 生成されたファイル（PDF、EPUB、FB2、Markdown、音声）をコンピューターに保存します。この権限がないと、拡張機能はファイルをダウンロードできません。 |
| `debugger` | **PDF生成のみ** — Chromeの組み込みprint-to-PDF機能を使用して、適切なページレイアウトとスタイルで高品質なPDFを生成します。デバッガーはPDF生成中にのみアタッチされ、完了後すぐにデタッチされます。これは、Chrome拡張機能でカスタムスタイルのPDFを生成する唯一の方法です。 |
| `alarms` | 長時間の操作（大きな記事、翻訳）中にバックグラウンドのservice workerをアクティブに保ちます。Chrome Manifest V3は30秒後にservice workerを一時停止しますが、記事の処理には数分かかる場合があります。統一されたkeep-aliveメカニズム（1分ごとにアラーム + 2秒ごとに状態保存）をMV3ルールに従って使用します。 |
| `contextMenus` | ウェブページの右クリックコンテキストメニューに「ClipAIbleで保存」オプション（PDF/EPUB/FB2/MD/音声）を追加します。 |
| `notifications` | コンテキストメニューの「保存」機能を使用するときにデスクトップ通知を表示します。エラーがある場合（例：APIキーがない場合）に通知します。 |
| `unlimitedStorage` | セレクターキャッシュと一時的な印刷データをローカルに保存します。これにより、AIを再度呼び出すことなく、より高速な繰り返し抽出が可能になります（オフラインモード）。 |

### ホスト権限

| 権限 | 理由 |
|------|------|
| `<all_urls>` | 訪問する任意のウェブサイトからコンテンツを抽出します。拡張機能は以下を実行する必要があります：1) 記事のコンテンツを見つけるためにページのHTMLを読み取る、2) 記事に埋め込まれた画像をダウンロードする、3) AI/TTSプロバイダー（OpenAI、Google、Anthropic、ElevenLabs、Qwen、Respeecher）にAPI呼び出しを行う。拡張機能は、明示的に保存するページにのみアクセスします — 独自にウェブを閲覧することはありません。 |

**セキュリティに関する注意：** すべてのAPIキーはAES-256-GCMを使用して暗号化され、ローカルにのみ保存されます。キーは、設定したAIプロバイダーを除き、サーバーにエクスポートまたは送信されることはありません。

詳細は [PERMISSIONS.md](PERMISSIONS.md) を参照。

---

## 🤝 貢献

1. リポジトリをフォーク
2. 機能ブランチを作成：`git checkout -b feature/cool-thing`
3. コミット：`git commit -m 'Add cool thing'`
4. プッシュ：`git push origin feature/cool-thing`
5. Pull Requestを開く

---

## 📜 ライセンス

MIT License — [LICENSE](LICENSE) を参照

---

<p align="center">
  <b>ClipAIble</b> — 保存。読む。聞く。どこでも。
</p>


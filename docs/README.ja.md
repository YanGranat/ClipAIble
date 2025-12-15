# ✂️ ClipAIble

> **AI駆動の記事抽出ツール** — ウェブ上の任意の記事をPDF、EPUB、FB2、Markdown、または音声として保存。11言語への翻訳に対応。あらゆるウェブサイトで動作。

![バージョン](https://img.shields.io/badge/バージョン-2.9.0-blue)
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
- 🎧 **音声（MP3/WAV）** — AIナレーションで聞く

すべての形式が**11言語への翻訳**をサポート — 画像上のテキストの翻訳も可能！

---

## 🚀 機能

### 🤖 AI駆動の抽出
- **2つのモード**：AI Selector（高速、再利用可能）とAI Extract（徹底的）
- **複数のプロバイダー**：OpenAI GPT（GPT-5.2、GPT-5.2-pro、GPT-5.1）、Google Gemini、Anthropic Claude、Grok、OpenRouter
- **動画サポート**：YouTube/Vimeo動画から字幕を抽出して記事に変換（v2.9.0）
- **インテリジェント検出**：記事の主要内容を見つけ、自動的に不要な要素を削除
- **構造を保持**：見出し、画像、コードブロック、表、脚注

### 🎧 音声エクスポート
- **5つのTTSプロバイダー**：OpenAI TTS、ElevenLabs、Google Gemini 2.5 TTS、Qwen3-TTS-Flash、Respeecher
- **100以上の音声**：11のOpenAI + 9のElevenLabs + 30のGoogle Gemini + 49のQwen + 14のRespeecher（英語とウクライナ語）
- **速度調整**：0.5xから2.0x（OpenAI/ElevenLabsのみ）
- **ウクライナ語サポート**：Respeecher経由で専用のウクライナ語音声
- **多言語発音**：各言語の正しい発音
- **インテリジェントなテキストクリーンアップ**：AIがURL、コード、非音声コンテンツを削除

### 🌍 翻訳
- **11言語**：EN、RU、UA、DE、FR、ES、IT、PT、ZH、JA、KO
- **インテリジェント検出**：記事が既にターゲット言語の場合は翻訳をスキップ
- **画像翻訳**：画像上のテキストを翻訳（Gemini経由）
- **ローカライズされたメタデータ**：日付とラベルが選択された言語に適応

### 🎨 PDFカスタマイズ
- **4つのプリセット**：ダーク、ライト、セピア、高コントラスト
- **カスタマイズ可能なカラー**：背景、テキスト、見出し、リンク
- **11のフォント**から選択
- **ページモード**：単一連続ページまたは複数ページA4形式


### ⚡ インテリジェント機能
- **動画サポート**：YouTube/Vimeo動画から字幕を抽出して記事に変換（v2.9.0）
- **音声転写**：字幕が利用できない場合の自動転写（gpt-4o-transcribe）
- **オフラインモード**：セレクターのキャッシュ — 繰り返しサイトにAI不要
- **統計**：保存数を追跡、履歴を表示
- **目次**：見出しから自動生成
- **要約**：AIが書いた2-3段落の要約
- **コンテキストメニュー**：右クリック → 「記事をPDFとして保存」
- **いつでもキャンセル**：ワンクリックで処理を停止

### 🔒 セキュリティ
- **APIキー暗号化** AES-256-GCM（OpenAI、Claude、Gemini、ElevenLabs、Qwen、Respeecher）
- **キーはエクスポートされない** — 設定バックアップから除外
- **すべてのデータはローカルに保存** — 第三者に送信されない

---

## ⚠️ 既知の制限事項

### ファイル形式
- **WAV形式**（Qwen/Respeecher）：ファイルが非常に大きくなる可能性があります（長い記事で10-50MB+）。より小さなファイルサイズにはMP3形式の使用を検討してください。
- **文字数制限**： 
  - Qwen TTS：セグメントあたり600文字
  - Respeecher TTS：セグメントあたり450文字
  - テキストは文/単語の境界で自動的にインテリジェントに分割されます

### 技術的制約
- **Keep-alive要件**：Chrome MV3では、keep-alive間隔が少なくとも1分である必要があります。長時間の処理タスクには数分かかる場合があります。
- **画像のCORS**：ウェブサイトがクロスオリジンリクエストをブロックしている場合、一部の画像が読み込まれない可能性があります。拡張機能はこれらの画像をスキップします。
- **キャンセルは即座ではない**：キャンセルには、すべてのバックグラウンドプロセスを完全に停止するのに数秒かかる場合があります。

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

> **ヒント：** Geminiは画像テキスト翻訳機能も有効にします。

### Anthropic Claude

1. [console.anthropic.com](https://console.anthropic.com/)にアクセス
2. 登録またはログイン
3. **API Keys**に移動
4. **"Create Key"**をクリック
5. キーをコピー（`sk-ant-...`で始まる）
6. **Plans & Billing**でクレジットを追加

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
| **OpenAI** | 一般的な使用、音声エクスポート、動画転写 | ✅ | ❌ |
| **Gemini** | 高速抽出、画像翻訳、音声エクスポート（30音声） | ✅ | ✅ |
| **Claude** | 長い記事、複雑なページ | ❌ | ❌ |
| **Grok** | 高速推論タスク | ❌ | ❌ |
| **OpenRouter** | 複数のモデルへのアクセス | ❌ | ❌ |
| **Qwen** | 音声エクスポート（49音声、ロシア語サポート） | ✅ | ❌ |
| **Respeecher** | 音声エクスポート（ウクライナ語） | ✅ | ❌ |

**推奨：** 全機能（抽出 + 音声）を取得するにはOpenAIから始めましょう。ウクライナ語テキストにはRespeecherを使用してください。

---

## 🎯 クイックスタート

1. ツールバーの**ClipAIble**アイコンをクリック
2. APIキーを入力 → **キーを保存**
3. 任意の記事に移動
4. **PDFとして保存**をクリック（または他の形式を選択）
5. 完了！ファイルが自動的にダウンロードされます

**ヒント：** 任意の場所で右クリック → **「記事をPDFとして保存」**

---

## ⚙️ 設定

### 抽出モード

| モード | 速度 | 最適な用途 |
|--------|------|-----------|
| **AI Selector** | ⚡ 高速 | ほとんどのサイト、ブログ、ニュース |
| **AI Extract** | 🐢 徹底的 | 複雑なページ、Notion、SPA |

### AIモデル

| プロバイダー | モデル | 備考 |
|-------------|--------|------|
| OpenAI | GPT-5.2 | 最新、中程度の推論 |
| OpenAI | GPT-5.2-pro | 強化、中程度の推論 |
| OpenAI | GPT-5.1 | バランス型 |
| OpenAI | GPT-5.1 (high) | 最高品質 |
| Anthropic | Claude Sonnet 4.5 | 長い記事に最適 |
| Google | Gemini 3 Pro | 高速 |
| Grok | Grok 4.1 Fast Reasoning | 高速推論 |

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

---

## 📊 統計とキャッシュ

**📊 統計**をクリックして表示：
- 合計保存数、今月のカウント
- 形式別の内訳
- リンク付きの最近の履歴
- オフラインモード用のキャッシュされたドメイン

### オフラインモード

ClipAIbleはドメインごとにAI生成セレクターをキャッシュ：
- **2回目の訪問 = 即座** — API呼び出しなし
- **自動無効化** — 抽出失敗時にクリア
- **手動制御** — 個別のドメインを削除

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

---

## 🏗️ アーキテクチャ

```
clipaible/
├── manifest.json       # 拡張機能設定
├── popup/              # UI（HTML、CSS、JS）
├── scripts/
│   ├── background.js   # Service worker
│   ├── api/            # OpenAI、Claude、Gemini、TTS
│   ├── extraction/     # コンテンツ抽出
│   ├── translation/    # 翻訳と言語検出
│   ├── generation/     # PDF、EPUB、FB2、MD、音声
│   ├── cache/          # セレクターキャッシュ
│   ├── stats/          # 使用統計
│   └── utils/          # 設定、暗号化、ヘルパー
├── print/              # PDFレンダリング
├── config/             # スタイル
└── lib/                # JSZip
```

---

## 🔐 セキュリティとプライバシー

- **暗号化**：Web Crypto API経由のAES-256-GCM
- **キー導出**：PBKDF2、100,000イテレーション
- **追跡なし**：分析なし、リモートロギングなし
- **ローカルのみ**：すべてのデータはブラウザに残ります

---

## 📋 権限

| 権限 | 理由 |
|------|------|
| `activeTab` | 現在のタブから記事を読み取る |
| `storage` | 設定をローカルに保存 |
| `scripting` | 抽出スクリプトを注入 |
| `downloads` | 生成されたファイルを保存（PDF、EPUB、FB2、Markdown、音声） |
| `debugger` | Chrome印刷API経由でPDFを生成 |
| `alarms` | 長時間タスク中にworkerをアクティブな状態に保つ |
| `contextMenus` | ウェブページの右クリックメニューに「ClipAIbleで保存」オプション（PDF/EPUB/FB2/MD/音声）を追加 |

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


# Local LLM Vision - アーキテクチャ設計

## ディレクトリ構成

```
local-llm-vision/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                  # 1画面エントリポイント
│  │  ├─ layout.tsx                # ルートレイアウト
│  │  └─ api/
│  │     └─ vision/
│  │        ├─ analyze/
│  │        │  └─ route.ts         # 画像認識API（通常モード手動）
│  │        ├─ ocr/
│  │        │  └─ route.ts         # リアルタイムOCR API（通常モード自動）
│  │        └─ card/
│  │           └─ route.ts         # 名刺データ抽出 API（名刺モード）
│  ├─ components/
│  │  └─ VisionTester.tsx          # メインUIコンポーネント（モード切替・各種ループ・保存リスト）
│  ├─ lib/
│  │  ├─ ollama.ts                 # Ollama API呼び出しロジック
│  │  ├─ image.ts                  # 画像リサイズ・base64変換ユーティリティ
│  │  └─ csv.ts                    # CSVカラム定義・エスケープ・URL正規化・ダウンロード処理
│  └─ types/
│     └─ vision.ts                 # 型定義（リクエスト/レスポンス・BusinessCardData・Ollama Chat 型）
├─ .env.local                      # 環境変数
├─ package.json
└─ README.md
```

## 各ファイルの責務

### `src/app/page.tsx`
- VisionTesterコンポーネントをレンダリングするだけのシンプルなページ

### `src/components/VisionTester.tsx`
- UI 全体を担うクライアントコンポーネント (`'use client'`)
- モード切替・カメラ制御・自動スキャンループ（OCR / 名刺）を管理
- 名刺結果パネルの編集、保存済みリストの編集・削除、CSV ダウンロードを担う
- `beforeunload` で保存データの離脱警告を出す
- 共通の編集フォームを `CardFieldsEditor` として内部に切り出し、結果パネル / 保存済み編集で再利用

### `src/app/api/vision/analyze/route.ts`
- `POST /api/vision/analyze` エンドポイント
- base64 画像を受け取り Ollama 経由で gemma4 に送信
- 通常の画像認識（詳細プロンプト）

### `src/app/api/vision/ocr/route.ts`
- `POST /api/vision/ocr` エンドポイント
- OCR 専用（文字抽出のみ）プロンプト

### `src/app/api/vision/card/route.ts`
- `POST /api/vision/card` エンドポイント
- 名刺画像から `BusinessCardData`（12 項目）を JSON 抽出
- 出力の前後にコードブロックや余分テキストが混ざってもパースできるように `parseCardJson()` で耐性を持たせる

### `src/lib/ollama.ts`
- Ollama Chat API (`POST /api/chat`) をラップ
- `generateWithImage(prompt, base64): Promise<string>`（画像 1 枚＋プロンプトを送り、`message.content` を返す）
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL` 環境変数を参照
- タイムアウト 60 秒（`AbortSignal.timeout`）。`ECONNREFUSED` / `fetch failed` / `Failed to fetch` / `cause.code === 'ECONNREFUSED'` のいずれかを Ollama 未起動と判定して日本語メッセージを返す
- HTTP 404 は「gemma4 モデル未取得」として日本語メッセージを返す

### `src/lib/image.ts`
- `fileToBase64(file)`
- `resizeAndConvertToBase64(file, maxWidth, quality)`
- `captureFrameFromVideo(videoEl, maxWidth, quality)`

### `src/lib/csv.ts`
- `CSV_COLUMNS`: 名刺結果パネル `CARD_FIELDS` と 1:1 で対応する 12 カラムの定義
- `cardsToCsv(cards)`: RFC 4180 エスケープ + CRLF 改行で組み立て。データが 0 件でもヘッダー行を出力
- `normalizeHttpsUrl(value)`: 空文字はそのまま、`http://` は `https://` に置換、スキーム未指定は `https://` を補う
- `buildCsvFilename(date?)`: `business_cards_YYYYMMDD_HHMMSS.csv`
- `downloadCsv(filename, csv)`: UTF-8 BOM を付けて Blob ダウンロードを発火

### `src/types/vision.ts`
- API のリクエスト・レスポンス型
- `BusinessCardData`（12 項目）
- Ollama Chat 系: `OllamaChatMessage` / `OllamaChatRequest` / `OllamaChatResponse`

## 環境変数

```env
# .env.local
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4
```

## CORS を避けるためのプロキシ構成

ブラウザから直接 `localhost:11434` を呼ぶと CORS 問題が起きるため、Next.js API Route をプロキシとして介在させる。

```
React (ブラウザ) → /api/vision/{analyze,ocr,card} (Next.js) → localhost:11434 (Ollama)
```

サーバーサイド（Next.js API Route）からの fetch は CORS の制限を受けない。

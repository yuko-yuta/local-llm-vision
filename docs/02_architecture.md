# Gemma4 画像認識Webアプリ - アーキテクチャ設計

## ディレクトリ構成

```
gemma4-vision-app/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                  # 1画面エントリポイント
│  │  ├─ layout.tsx                # ルートレイアウト
│  │  └─ api/
│  │     └─ vision/
│  │        ├─ analyze/
│  │        │  └─ route.ts         # 画像認識API
│  │        └─ ocr/
│  │           └─ route.ts         # リアルタイムOCR API
│  ├─ components/
│  │  └─ VisionTester.tsx          # メインUIコンポーネント
│  ├─ lib/
│  │  ├─ ollama.ts                 # Ollama API呼び出しロジック
│  │  └─ image.ts                  # 画像リサイズ・base64変換ユーティリティ
│  └─ types/
│     └─ vision.ts                 # 型定義
├─ .env.local                      # 環境変数
├─ package.json
└─ README.md
```

## 各ファイルの責務

### `src/app/page.tsx`
- VisionTesterコンポーネントをレンダリングするだけのシンプルなページ

### `src/components/VisionTester.tsx`
- UI全体を担うクライアントコンポーネント (`'use client'`)
- 状態管理、カメラ制御、定期OCRループを管理
- ボタン操作のイベントハンドラを実装

### `src/app/api/vision/analyze/route.ts`
- `POST /api/vision/analyze` エンドポイント
- base64画像を受け取りOllamaの `ollama.ts` 経由でgemma4に送信
- 通常の画像認識（詳細プロンプト）

### `src/app/api/vision/ocr/route.ts`
- `POST /api/vision/ocr` エンドポイント
- base64画像を受け取りOllamaの `ollama.ts` 経由でgemma4に送信
- OCR専用（文字抽出のみ）プロンプト

### `src/lib/ollama.ts`
- Ollama APIへのHTTPリクエストをラップした関数群
- `generateWithImage(model, prompt, base64image): Promise<string>`

### `src/lib/image.ts`
- `resizeImageToBase64(file, maxWidth, quality): Promise<string>`
- `captureFrameAsBase64(videoEl, maxWidth, quality): Promise<string>`

### `src/types/vision.ts`
- リクエスト・レスポンスの型定義

## 環境変数

```env
# .env.local
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4
```

## CORSを避けるためのプロキシ構成

ブラウザから直接 `localhost:11434` を呼ぶとCORS問題が起きるため、Next.js API Routeをプロキシとして介在させる。

```
React (ブラウザ) → /api/vision/* (Next.js) → localhost:11434 (Ollama)
```

サーバーサイド（Next.js API Route）からのfetchはCORSの制限を受けない。

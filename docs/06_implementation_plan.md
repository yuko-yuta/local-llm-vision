# Gemma4 画像認識Webアプリ - 実装計画

## フェーズ構成

| フェーズ | 内容 | 優先度 |
|---|---|---|
| Phase 1 | プロジェクトセットアップ | 必須 |
| Phase 2 | バックエンド（API Route）実装 | 必須 |
| Phase 3 | フロントエンド（UI）実装 | 必須 |
| Phase 4 | リアルタイムOCR実装 | 必須 |
| Phase 5 | エラーハンドリング強化 | 必須 |
| Phase 6 | 動作確認・調整 | 必須 |

---

## Phase 1: プロジェクトセットアップ

### タスク

- [ ] Next.js プロジェクト作成
  ```bash
  npx create-next-app@latest gemma4-vision-app \
    --typescript --tailwind --app --src-dir --no-eslint
  ```
- [ ] `.env.local` 作成
  ```env
  OLLAMA_BASE_URL=http://localhost:11434
  OLLAMA_MODEL=gemma4
  ```
- [ ] ディレクトリ構成を設計書通りに作成
  - `src/lib/`
  - `src/types/`
  - `src/app/api/vision/analyze/`
  - `src/app/api/vision/ocr/`

### 完了条件

- `npm run dev` で開発サーバーが起動する
- `localhost:3000` にアクセスできる

---

## Phase 2: バックエンド実装

### タスク順序

#### 2-1. 型定義 (`src/types/vision.ts`)

```typescript
export interface AnalyzeRequest {
  imageBase64: string
  mode?: 'general'
}

export interface AnalyzeResponse {
  result: string
}

export interface OcrRequest {
  imageBase64: string
}

export interface OcrResponse {
  text: string
}

export interface OllamaGenerateRequest {
  model: string
  prompt: string
  images: string[]
  stream: boolean
}

export interface OllamaGenerateResponse {
  response: string
  done: boolean
}
```

#### 2-2. Ollamaクライアント (`src/lib/ollama.ts`)

- `generateWithImage(prompt: string, base64: string): Promise<string>` 実装
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL` を環境変数から読む
- fetch失敗時のエラーメッセージ分岐（ECONNREFUSED / 404 / その他）
- タイムアウト: 30秒

#### 2-3. 画像認識API (`src/app/api/vision/analyze/route.ts`)

- `POST` ハンドラ実装
- リクエストバリデーション（`imageBase64` 必須チェック）
- `data:...;base64,` プレフィックスを除去してOllamaに渡す
- 通常認識プロンプト使用

#### 2-4. OCR API (`src/app/api/vision/ocr/route.ts`)

- `POST` ハンドラ実装
- OCR専用プロンプト使用
- レスポンスの前後空白を `trim()` する

### 完了条件

- `curl` でAPIエンドポイントを叩いて認識結果が返ってくる
- Ollama未起動時に適切なエラーメッセージが返る

---

## Phase 3: フロントエンドUI実装

### タスク順序

#### 3-1. ユーティリティ (`src/lib/image.ts`)

- `fileToBase64(file: File): Promise<string>` 実装
- `resizeAndConvertToBase64(file: File, maxWidth: number, quality: number): Promise<string>` 実装
- `captureFrameFromVideo(videoEl: HTMLVideoElement, maxWidth: number, quality: number): string` 実装
  - `canvas.toDataURL('image/jpeg', quality)` を使用

#### 3-2. メインコンポーネント (`src/components/VisionTester.tsx`)

実装順:

1. **状態定義** - 全StateをuseStateで宣言
2. **画像アップロード機能**
   - `<input type="file">` の onChange ハンドラ
   - ファイル選択 → base64変換 → プレビュー表示
3. **カメラ起動/停止機能**
   - `navigator.mediaDevices.getUserMedia()` の呼び出し
   - `<video>` タグの `srcObject` にストリームをセット
   - カメラ停止時: `stream.getTracks().forEach(t => t.stop())`
4. **撮影して認識機能**
   - canvas に videoタグの現在フレームを描画
   - base64化 → `/api/vision/analyze` に POST
5. **アップロード画像認識機能**
   - `selectedImage` を `/api/vision/analyze` に POST

#### 3-3. ページ (`src/app/page.tsx`)

- VisionTesterコンポーネントをインポートしてレンダリング

### 完了条件

- 画像を選択してプレビューが表示できる
- 「認識する」ボタンで結果が表示できる
- カメラが起動して映像が表示できる
- 「撮影して認識」で結果が表示できる

---

## Phase 4: リアルタイムOCR実装

### タスク

#### 4-1. OCRループの実装

`VisionTester.tsx` に追加:

```typescript
const ocrIntervalRef = useRef<NodeJS.Timeout | null>(null)
const isOcrRunningRef = useRef(false)  // 二重送信防止

const startRealtimeOcr = () => {
  ocrIntervalRef.current = setInterval(async () => {
    if (isOcrRunningRef.current || !videoRef.current) return
    isOcrRunningRef.current = true
    try {
      const base64 = captureFrameFromVideo(videoRef.current, 640, 0.7)
      const res = await fetch('/api/vision/ocr', { ... })
      const data = await res.json()
      if (data.text && data.text !== realtimeText) {
        setRealtimeText(data.text)
      }
    } finally {
      isOcrRunningRef.current = false
    }
  }, 2000)
}

const stopRealtimeOcr = () => {
  if (ocrIntervalRef.current) {
    clearInterval(ocrIntervalRef.current)
    ocrIntervalRef.current = null
  }
}
```

#### 4-2. カメラ起動/停止時にOCRを連動

- カメラ起動 → `startRealtimeOcr()` 呼び出し
- カメラ停止 → `stopRealtimeOcr()` 呼び出し

#### 4-3. クリーンアップ

`useEffect` の cleanup でOCRループとカメラストリームを停止

```typescript
useEffect(() => {
  return () => {
    stopRealtimeOcr()
    cameraStream?.getTracks().forEach(t => t.stop())
  }
}, [cameraStream])
```

### 完了条件

- カメラ起動中に2秒ごとにOCR結果が更新される
- カメラ停止後にOCRが止まる
- 前回と同じ文字列では画面が更新されない
- 二重リクエストが発生しない

---

## Phase 5: エラーハンドリング強化

### タスク

- [ ] カメラ権限拒否時のエラー表示 (`NotAllowedError`)
- [ ] Ollama未起動時のメッセージ
- [ ] gemma4未取得時のメッセージ（レスポンス内容でパターンマッチ）
- [ ] 認識ボタン二重クリック防止（`isAnalyzing` フラグ）
- [ ] OCRタイムアウト（fetch の AbortController, 15秒）

### 完了条件

- 各エラーケースで適切なメッセージがステータス欄に表示される

---

## Phase 6: 動作確認・調整

### チェックリスト

- [ ] Ollama が起動していることを確認 (`ollama serve`)
- [ ] gemma4モデルが取得済みであることを確認 (`ollama list`)
- [ ] 画像アップロード → 認識 → 結果表示の一連フローが動く
- [ ] カメラ起動 → 撮影 → 認識 → 結果表示の一連フローが動く
- [ ] リアルタイムOCRが2秒ごとに更新される
- [ ] カメラ停止後にOCRが止まる
- [ ] エラー表示が正しく出る（Ollama未起動テスト）
- [ ] ローディング中のUI確認
- [ ] モバイルブラウザ（Chrome Android）での動作確認

---

## 実装上の注意点

### base64プレフィックスの扱い

- フロントエンドでは `data:image/jpeg;base64,XXXX` 形式で扱う
- OllamaのAPIに渡す際はプレフィックスを除去する
  ```typescript
  const pure = base64.replace(/^data:image\/[a-z]+;base64,/, '')
  ```

### 二重リクエスト防止

- 通常認識: `isAnalyzing` stateで制御
- リアルタイムOCR: `useRef` で制御（stateだと非同期のタイミングで漏れる場合あり）

### メモリリーク防止

- `useEffect` のcleanupでsetIntervalをclearIntervalする
- カメラストリームはコンポーネントアンマウント時に停止する

### 画像サイズの最適化

- アップロード画像: 最大幅1024px、JPEG品質0.8に縮小してから送信
- OCRキャプチャ: 最大幅640px、JPEG品質0.7（速度優先）

---

## 推奨実装順序まとめ

```
Phase 1 (セットアップ) 
  → Phase 2-1 (型定義)
  → Phase 2-2 (Ollamaクライアント)
  → Phase 2-3/2-4 (APIルート)
  → Phase 3-1 (画像ユーティリティ)
  → Phase 3-2/3-3 (UIコンポーネント・ページ)
  → Phase 4 (リアルタイムOCR)
  → Phase 5 (エラーハンドリング)
  → Phase 6 (動作確認)
```

依存関係が少ない順に実装し、各フェーズ完了後に簡単な動作確認をすること。

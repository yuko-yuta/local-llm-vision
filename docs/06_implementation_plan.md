# Local LLM Vision - 実装計画

> Phase 1〜6 は初期計画（通常認識モードのみ）。Phase 7〜9 は後から追加された名刺読み取り機能。Phase 1〜8 は実装完了済み。

## フェーズ構成

| フェーズ | 内容 | 優先度 | 状態 |
|---|---|---|---|
| Phase 1 | プロジェクトセットアップ | 必須 | ✅ 完了 |
| Phase 2 | バックエンド（API Route）実装 | 必須 | ✅ 完了 |
| Phase 3 | フロントエンド（UI）実装 | 必須 | ✅ 完了 |
| Phase 4 | リアルタイムOCR実装 | 必須 | ✅ 完了 |
| Phase 5 | エラーハンドリング強化 | 必須 | ✅ 完了 |
| Phase 6 | 動作確認・調整 | 必須 | ✅ 完了 |
| Phase 7 | 名刺読み取りモード | 追加機能 | ✅ 完了 |
| Phase 8 | 保存リスト + インライン編集 + CSV | 追加機能 | ✅ 完了 |
| Phase 9 | 各種 UX 改善 / モバイル耐性 | 追加機能 | 部分対応 |

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
  → Phase 7 (名刺モード)
  → Phase 8 (保存・編集・CSV)
  → Phase 9 (UX改善)
```

依存関係が少ない順に実装し、各フェーズ完了後に簡単な動作確認をすること。

---

## Phase 7: 名刺読み取りモード

### タスク

#### 7-1. 型・プロンプト追加

- `src/types/vision.ts` に `BusinessCardData`（12 項目）と `CardRequest` / `CardResponse` を追加
- Ollama 呼び出しを `/api/generate` から `/api/chat` に変更（gemma4 vision の現行 API）
- `OllamaChatMessage` / `OllamaChatRequest` / `OllamaChatResponse` 型を追加

#### 7-2. API 実装

- `src/app/api/vision/card/route.ts` を新設
- `CARD_PROMPT`（JSON 形式指定 + 抽出ルール + 住所の省略禁止ルール）を定義
- `parseCardJson()`: コードフェンスや前後の余分テキストを除去し、最長一致で `{...}` を抽出してパース

#### 7-3. UI モード切替

- `appMode: 'general' | 'card'` を導入し、画面上部にタブを追加
- 名刺モードでは `<video>` と結果パネルを横並び（モバイルは縦積み）
- スキャン状態インジケータ（自動スキャン中 / 待機中）を映像左下に重ねる

#### 7-4. 自動スキャンループ

- `startCardLoop()` を 3 秒間隔・800px / 0.85 で実装
- フロント側タイムアウト 60 秒、サーバー側 60 秒
- `hasCardDataRef` で「編集中の cardData がある間は新規スキャン結果を破棄」する制御
- 連続 3 回失敗で停止

### 完了条件

- カメラに名刺をかざすと 12 項目のフィールドが順次抽出される
- 抽出済みの状態で次の名刺を映しても画面が壊れない
- 連続エラー時にメッセージが出てループが停止する

---

## Phase 8: 保存リスト + インライン編集 + CSV

### タスク

#### 8-1. 結果パネルの編集化

- 各フィールドを `<input>` / `<textarea>` (住所のみ) で編集可能に
- `handleCardFieldChange(key, value)` で `cardData` をマージ更新
- 「破棄」「リストに保存」ボタンを下部に配置

#### 8-2. 保存リスト

- `savedCards: SavedCard[]`（id + data）を `useState` で保持。永続化なし
- 「リストに保存」で `companyUrl` を `normalizeHttpsUrl()` で `https://` 始まりへ正規化してから push
- 行ごとに「削除」ボタン
- 件数表示と「CSV ダウンロード」ボタン

#### 8-3. 保存済みのインライン編集

- 行ごとに「編集」ボタン。クリックで `editingSavedCardId` / `editingDraft` を設定
- 編集モードでは結果パネルと同じ `CardFieldsEditor` を行内に展開
- 「キャンセル」「変更を保存」ボタン。保存時に `companyUrl` を再正規化
- 編集中は他行の編集・削除ボタンを `disabled`

#### 8-4. CSV ダウンロード

- `src/lib/csv.ts` を新設
- `CSV_COLUMNS`: 結果パネル `CARD_FIELDS` と 1:1 で対応する 12 カラム
- `cardsToCsv()`: RFC 4180 エスケープ（ダブルクォート・カンマ・改行のみクォート）、CRLF 改行、データ 0 件でもヘッダー出力
- `downloadCsv()`: UTF-8 BOM を付けて Blob → `a[download]` クリック
- `buildCsvFilename()`: `business_cards_YYYYMMDD_HHMMSS.csv`

#### 8-5. 離脱警告

- `savedCards.length >= 1` のとき `beforeunload` リスナを張る
- リロード / タブ閉じの確認ダイアログ

### 完了条件

- 結果パネルの編集 → 保存 → 削除がすべて期待通り動く
- 保存済み行を編集して保存できる
- CSV を Excel で開いて文字化けしない（UTF-8 BOM 確認）
- 0 件状態で CSV ダウンロードするとヘッダーのみの CSV が落ちる
- 保存件がある状態でリロードしようとすると確認ダイアログが出る

---

## Phase 9: 各種 UX 改善 / モバイル耐性

### タスク

- [ ] `AbortSignal.timeout` の互換ラッパー（iOS Safari 17.3 以前向け）
- [ ] カメラの `focusMode: 'continuous'` を対応端末で適用
- [ ] iOS Safari でタブのタップが妨げられないよう、`overflow-hidden` を親に使わず各ボタンに `rounded`
- [ ] エラー / ステータスメッセージの自動消去（保存通知は数秒後に消す）
- [ ] `getCapabilities` の存在チェックでブラウザ互換を確保

### 完了条件

- iOS Safari / Android Chrome 双方で問題なく動作する
- 編集中 / スキャン中 / 自動スキャン待機の状態が常時視覚的に分かる

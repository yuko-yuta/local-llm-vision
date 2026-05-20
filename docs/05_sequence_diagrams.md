# Local LLM Vision - シーケンス図

Ollama 呼び出しはすべて `POST /api/chat` で行い、`messages[].images` に base64 画像を載せて `data.message.content` を読む。

## 1. 通常モード: 手動撮影 → 認識

```
ユーザー          React UI           Next.js API        Ollama          gemma4
  │                │                    │                 │               │
  │ 「カメラ起動」    │                    │                 │               │
  │────────────────>│                    │                 │               │
  │                │ getUserMedia()      │                 │               │
  │                │ video.srcObject = s │                 │               │
  │                │ OCRループ開始 (2秒)  │                 │               │
  │                │                    │                 │               │
  │ 「撮影して認識」  │                    │                 │               │
  │────────────────>│                    │                 │               │
  │                │ captureFrameFromVideo (1024/0.8)      │               │
  │                │ POST /api/vision/analyze              │               │
  │                │────────────────────>│                 │               │
  │                │                    │ POST /api/chat   │               │
  │                │                    │ (analyze prompt) │               │
  │                │                    │────────────────>│               │
  │                │                    │                 │───────────────>│
  │                │                    │                 │<──────────────│
  │                │                    │<────────────────│               │
  │                │                    │ message.content  │               │
  │                │<────────────────────│                 │               │
  │                │ {result: "..."}     │                 │               │
  │<───────────────│ analyzeResult 表示  │                 │               │
```

## 2. 通常モード: リアルタイム OCR ループ

```
React UI (setInterval 2秒)        Next.js API        Ollama
  │                                    │               │
  │ [カメラ起動時に loop 開始]            │               │
  │                                    │               │
  │ isScanRunningRef === false         │               │
  │ video.readyState >= 2              │               │
  │ captureFrameFromVideo (640/0.7)     │               │
  │ POST /api/vision/ocr               │               │
  │────────────────────────────────────>│               │
  │ isScanRunningRef = true            │ POST /api/chat │
  │ (OCR プロンプト)                    │───────────────>│
  │                                    │<──────────────│
  │<────────────────────────────────────│ {text: "..."}  │
  │ isScanRunningRef = false           │               │
  │                                    │               │
  │ 前回結果と異なる場合のみ realtimeText 更新            │
  │                                    │               │
  │ 失敗時は errorCountRef++           │               │
  │ 連続 3 回 (OCR_MAX_CONSECUTIVE_ERRORS) でループ停止 │
  │                                    │               │
  │ [カメラ停止 / モード切替で loop 終了]                  │
```

## 3. 名刺モード: 自動スキャンループ

```
React UI (setInterval 3秒)        Next.js API        Ollama
  │                                    │               │
  │ [カメラ起動 + 名刺モードで loop 開始]                 │
  │                                    │               │
  │ isScanRunningRef === false         │               │
  │ video.readyState >= 2              │               │
  │ captureFrameFromVideo (800/0.85)    │               │
  │ POST /api/vision/card              │               │
  │────────────────────────────────────>│               │
  │ isAutoScanning = true              │ POST /api/chat │
  │ isScanRunningRef = true            │ (CARD_PROMPT)  │
  │                                    │───────────────>│
  │                                    │<──────────────│
  │                                    │ JSON 抽出      │
  │<────────────────────────────────────│ {card: {...}}  │
  │ isAutoScanning = false             │               │
  │                                    │               │
  │ hasCardDataRef === false の場合    │               │
  │   かつ 前回と JSON が異なれば setCardData             │
  │   hasCardDataRef = true            │               │
  │ hasCardDataRef === true の場合 (編集中)              │
  │   結果を捨てる ─ 編集データの上書きを防ぐ              │
  │                                    │               │
  │ [カメラ停止 / モード切替 / カメラ未準備で loop 終了]    │
```

## 4. 名刺モード: 保存 → 編集 → CSV ダウンロード

```
ユーザー        React UI                    React State
  │              │                              │
  │ 結果パネルの各 input を編集                    │
  │─────────────>│ handleCardFieldChange         │
  │              │──────────────────────────────>│ cardData にマージ
  │              │                              │
  │ 「リストに保存」│                              │
  │─────────────>│ normalizeHttpsUrl(companyUrl) │
  │              │ savedCards.push               │
  │              │ cardData = null               │
  │              │ hasCardDataRef = false        │
  │              │ → 自動スキャンが再開            │
  │              │                              │
  │ 保存済み行「編集」│                            │
  │─────────────>│ editingSavedCardId = id       │
  │              │ editingDraft = { ...data }    │
  │              │ 他の行の編集/削除ボタンを無効化   │
  │              │                              │
  │ 各 input を編集 │                            │
  │─────────────>│ handleEditedFieldChange       │
  │              │                              │
  │ 「変更を保存」  │                              │
  │─────────────>│ normalizeHttpsUrl(...)        │
  │              │ savedCards = prev.map(...)    │
  │              │ editingSavedCardId = null     │
  │              │                              │
  │ 「CSV ダウンロード」│                          │
  │─────────────>│ cardsToCsv(savedCards)        │
  │              │ downloadCsv(filename, csv)    │
  │              │ (Blob を a[download] でトリガ)  │
  │              │                              │
  │ ページ離脱     │                              │
  │─────────────>│ savedCards.length > 0 で       │
  │              │   beforeunload 確認ダイアログ    │
```

## 5. エラーハンドリングフロー

```
React UI              Next.js API         Ollama
  │                       │                 │
  │ POST /api/vision/*    │                 │
  │───────────────────────>│                 │
  │                       │ POST /api/chat   │
  │                       │─────────────────>│
  │                       │                 │
  │                       │  [Ollama 未起動]
  │                       │  fetch error → cause.code === 'ECONNREFUSED'
  │                       │                 │
  │                       │ 500 {error: "Ollamaが起動していません..."}
  │<───────────────────────│                 │
  │ errorMessage にセット   │                 │
  │ 連続 3 回失敗 → 対応する loop 自動停止                 │
  │                       │                 │
  │                       │  [Ollama 404]    │
  │                       │  → 500 {error: "gemma4モデルが見つかりません..."}
```

# Local LLM Vision - API設計

## 1. 画像認識 API

### エンドポイント

```
POST /api/vision/analyze
```

### リクエスト

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "mode": "general"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| imageBase64 | string | ○ | base64 エンコードされた画像（`data:image/...;base64,` プレフィックスあり） |
| mode | string | - | 将来の拡張用。現在は `general` 固定 |

### レスポンス（成功）

```json
{
  "result": "【画像の概要】\n公園で犬が走っています。\n\n【認識した物体】\n- 犬（ゴールデンレトリバー）\n- 芝生\n\n【認識した文字】\n特になし\n\n【補足】\n晴天で影が伸びています。"
}
```

### レスポンス（エラー）

```json
{
  "error": "Ollamaが起動していません。ollama serve を確認してください。"
}
```

HTTPステータス: 400 / 500

---

## 2. リアルタイム OCR API

### エンドポイント

```
POST /api/vision/ocr
```

### リクエスト

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

### レスポンス（成功）

```json
{ "text": "OPEN 10:00-20:00" }
```

文字がない場合: `{ "text": "" }`

### レスポンス（エラー）

```json
{ "error": "画像認識に失敗しました。" }
```

---

## 3. 名刺データ抽出 API

### エンドポイント

```
POST /api/vision/card
```

### リクエスト

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

### レスポンス（成功）

```json
{
  "card": {
    "name": "山田 太郎",
    "nameAlphabet": "Taro Yamada",
    "nameKana": "ヤマダ タロウ",
    "company": "株式会社サンプル",
    "department": "営業本部 第1営業部",
    "title": "部長",
    "companyUrl": "https://example.com",
    "address": "〒100-0001 東京都千代田区...",
    "email": "taro@example.com",
    "tel": "03-1234-5678",
    "fax": "03-1234-5679",
    "mobile": "090-1234-5678"
  }
}
```

`BusinessCardData` の全 12 フィールドは常に文字列で返り、抽出できなかった項目は空文字。

### 設計メモ

- レスポンスは UI 側でフィールドごとに編集可能
- 会社URL の `https://` 正規化はフロントエンドの保存時に行う（API は抽出結果をそのまま返す）
- パーサ (`parseCardJson`) は前後のコードフェンス / 余計なテキストを除去し、`{...}` を最長一致で取り出す

### レスポンス（エラー）

```json
{ "error": "名刺の読み取りに失敗しました。" }
```

HTTPステータス: 400 / 500

---

## 4. Ollama API 仕様（Chat API）

### エンドポイント

```
POST http://localhost:11434/api/chat
```

### リクエスト例

```json
{
  "model": "gemma4",
  "messages": [
    {
      "role": "user",
      "content": "プロンプト文",
      "images": ["base64エンコードされた画像（プレフィックスなし）"]
    }
  ],
  "stream": false
}
```

### レスポンス例

```json
{
  "model": "gemma4",
  "created_at": "2026-05-20T10:00:00Z",
  "message": {
    "role": "assistant",
    "content": "認識結果テキスト"
  },
  "done": true
}
```

### 注意事項

- `images` フィールドには `data:image/...;base64,` プレフィックスを除いた純粋な base64 を渡す
- `stream: false` で同期的なレスポンスを受け取る
- タイムアウト: サーバー側 `ollama.ts` で 60 秒固定。フロント側は OCR ループ 15 秒 / 名刺ループ 60 秒
- レスポンスは `data.message.content` から取り出す（旧 `/api/generate` の `response` ではない）

---

## 5. エラーハンドリング方針

| ケース | HTTPステータス | エラーメッセージ |
|---|---|---|
| Ollama 未起動（接続不可） | 500 | `Ollamaが起動していません。ollama serve を確認してください。` |
| gemma4 未取得 (Ollama 404) | 500 | `gemma4モデルが見つかりません。ollama pull gemma4 を実行してください。` |
| リクエストボディ不正 / `imageBase64` 欠落 | 400 | `imageBase64は必須です。` / `リクエストの形式が不正です。` |
| タイムアウト（クライアント側） | - | フロント側で「リアルタイムOCRがタイムアウトしました...」「自動スキャンがタイムアウトしました...」を表示 |
| 連続エラー（OCR / 名刺ループ） | - | 同一ループで 3 回連続失敗するとループを停止し、エラーメッセージを出してカメラ再起動を促す |
| その他エラー | 500 | `画像認識に失敗しました。(HTTP xxx)` 等 |

Ollama 未起動の検出条件は次のいずれか:

- `Error.message` が `ECONNREFUSED` / `fetch failed` / `Failed to fetch` を含む
- `Error.cause.code === 'ECONNREFUSED'`
- `Error.cause.message` が `ECONNREFUSED` を含む

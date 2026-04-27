# Gemma4 画像認識Webアプリ - API設計

## 1. 画像認識API

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
| imageBase64 | string | ○ | base64エンコードされた画像（data:image/...;base64,プレフィックスあり） |
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

HTTPステータス: 500

### Ollamaへの送信内容

```json
{
  "model": "gemma4",
  "prompt": "この画像を日本語で分析してください。\n\n以下の形式で回答してください。\n\n【画像の概要】\n画像全体に何が写っているか\n\n【認識した物体】\n箇条書きで記載\n\n【認識した文字】\n画像内に文字がある場合のみ記載\n\n【補足】\n気づいた点があれば記載",
  "images": ["base64文字列（プレフィックスなし）"],
  "stream": false
}
```

---

## 2. リアルタイムOCR API

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

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| imageBase64 | string | ○ | base64エンコードされた画像 |

### レスポンス（成功）

```json
{
  "text": "OPEN 10:00-20:00"
}
```

文字がない場合:

```json
{
  "text": ""
}
```

### レスポンス（エラー）

```json
{
  "error": "画像認識に失敗しました。"
}
```

### Ollamaへの送信内容

```json
{
  "model": "gemma4",
  "prompt": "この画像内に写っている文字だけを抽出してください。\n\nルール:\n- 文字がない場合は空文字を返してください\n- 説明文は不要です\n- 推測しすぎないでください\n- 読み取れる文字のみ返してください",
  "images": ["base64文字列（プレフィックスなし）"],
  "stream": false
}
```

---

## 3. Ollama API仕様

### エンドポイント

```
POST http://localhost:11434/api/generate
```

### リクエスト例

```json
{
  "model": "gemma4",
  "prompt": "プロンプト文",
  "images": ["base64エンコードされた画像（プレフィックスなし）"],
  "stream": false
}
```

### レスポンス例

```json
{
  "model": "gemma4",
  "created_at": "2026-04-27T10:00:00Z",
  "response": "認識結果テキスト",
  "done": true
}
```

### 注意事項

- `images` フィールドには `data:image/...;base64,` プレフィックスを除いた純粋なbase64文字列を渡す
- `stream: false` で同期的なレスポンスを受け取る
- タイムアウトは30秒を目安に設定（gemma4の推論速度に依存）

---

## 4. エラーハンドリング方針

| ケース | HTTPステータス | エラーメッセージ |
|---|---|---|
| Ollama未起動 (ECONNREFUSED) | 500 | `Ollamaが起動していません。ollama serve を確認してください。` |
| gemma4未取得 (404) | 500 | `gemma4モデルが見つかりません。ollama pull gemma4 を実行してください。` |
| リクエストボディ不正 | 400 | `imageBase64は必須です。` |
| タイムアウト | 504 | `リアルタイム文字認識がタイムアウトしました。` |
| その他エラー | 500 | `画像認識に失敗しました。` |
